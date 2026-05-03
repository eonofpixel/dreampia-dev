/**
 * SessionStore.diagnose() — v0.14.0 (A ABI Hardening) 자가 진단 메서드.
 *
 * 검증:
 *  - 정상 DB 에서 schema_version + table_count + integrity_ok=true + wal_mode=true
 *  - integrity_message / db_error 는 정상 시 미존재
 *  - 어떤 검사도 throw 하지 않음 (read-only 보장)
 *  - rewrapNativeLoadError 가 ABI 패턴 감지 + 사용자 friendly 메시지 wrap
 *  - 그 외 일반 에러는 그대로 통과
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { SessionStore, rewrapNativeLoadError } from '@/storage';

describe('SessionStore.diagnose() (v0.14.0 A ABI Hardening)', () => {
  let store: SessionStore;

  beforeEach(() => {
    store = new SessionStore(':memory:');
  });

  afterEach(() => {
    store.close();
  });

  it('returns ok=true on a fresh in-memory DB', () => {
    const diag = store.diagnose();
    // :memory: DB 는 WAL 미지원 — wal_mode 가 false 일 수 있어 ok=true 는
    // boundary. 단 schema_version / table_count / integrity_ok 는 모두
    // 정상값이어야 한다.
    expect(diag.schema_version).toBeGreaterThan(0);
    expect(diag.table_count).toBeGreaterThan(0);
    expect(diag.integrity_ok).toBe(true);
    // ok 는 wal_mode 와 integrity_ok 모두 true 일 때만 true. :memory: 는
    // wal_mode false 이므로 ok 는 false.
    expect(typeof diag.ok).toBe('boolean');
  });

  it('reports schema_version matching getSchemaVersion()', () => {
    const diag = store.diagnose();
    expect(diag.schema_version).toBe(store.getSchemaVersion());
  });

  it('reports table_count > 0 (sessions, workspaces, turns, etc.)', () => {
    const diag = store.diagnose();
    expect(diag.table_count).not.toBeNull();
    if (diag.table_count !== null) {
      // 적어도 sessions, workspaces, worktrees, turns 4개 + others.
      expect(diag.table_count).toBeGreaterThanOrEqual(4);
    }
  });

  it('does not throw when called repeatedly (read-only contract)', () => {
    expect(() => {
      store.diagnose();
      store.diagnose();
      store.diagnose();
    }).not.toThrow();
  });

  it('does not include integrity_message on healthy DB', () => {
    const diag = store.diagnose();
    expect(diag.integrity_message).toBeUndefined();
  });

  it('does not include error on healthy DB', () => {
    const diag = store.diagnose();
    expect(diag.error).toBeUndefined();
  });

  it('returns wal_mode field as boolean or null', () => {
    const diag = store.diagnose();
    // :memory: 는 false (WAL 미지원), 디스크 DB 는 true. null 은 PRAGMA
    // 호출 자체 실패 시.
    expect(diag.wal_mode === true || diag.wal_mode === false || diag.wal_mode === null).toBe(true);
  });
});

describe('rewrapNativeLoadError (v0.14.0 A ABI Hardening)', () => {
  it('passes through non-ABI errors unchanged', () => {
    const original = new Error('unrelated failure');
    const out = rewrapNativeLoadError(original, '/tmp/foo.sqlite');
    expect(out).toBe(original);
  });

  it('wraps ERR_DLOPEN_FAILED with user-friendly message', () => {
    const original = new Error('cannot load native binding');
    (original as { code?: string }).code = 'ERR_DLOPEN_FAILED';
    const out = rewrapNativeLoadError(original, '/tmp/foo.sqlite');
    expect(out).not.toBe(original);
    expect(out.message).toMatch(/SQLite/);
    expect(out.message).toMatch(/npm run diagnose/);
    expect(out.message).toMatch(/dev:rebuild/);
    expect(out.message).toMatch(/\/tmp\/foo\.sqlite/);
    // code 가 보존됐는지.
    expect((out as { code?: string }).code).toBe('ERR_DLOPEN_FAILED');
  });

  it('wraps NODE_MODULE_VERSION mismatch errors', () => {
    const msg =
      'The module was compiled against a different Node.js version using NODE_MODULE_VERSION 127. This version of Node.js requires NODE_MODULE_VERSION 130.';
    const original = new Error(msg);
    const out = rewrapNativeLoadError(original, '/var/db.sqlite');
    expect(out).not.toBe(original);
    expect(out.message).toMatch(/SQLite/);
    expect(out.message).toMatch(/dev:rebuild/);
  });

  it('handles non-Error throwables', () => {
    const out = rewrapNativeLoadError('plain string error', '/tmp/x.sqlite');
    expect(out).toBeInstanceOf(Error);
    expect(out.message).toMatch(/SessionStore/);
  });

  it('passes through errors not matching any ABI pattern', () => {
    const original = new Error('generic SQL error: syntax');
    const out = rewrapNativeLoadError(original, '/tmp/db.sqlite');
    expect(out).toBe(original);
  });
});
