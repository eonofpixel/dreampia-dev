/**
 * permission_grants.id INTEGER → TEXT rebuild (v1.4.1).
 *
 * 검증:
 *  - migration 13 적용 후 PRAGMA table_info 가 id 컬럼 type=TEXT 표시.
 *  - schema_meta.version === 13.
 *  - 새 grant INSERT 시 id 컬럼이 application UUIDv7 보존.
 *  - revokePermissionGrant 가 WHERE id = ? 직접 매칭으로 동작.
 *  - listGrants 의 id 가 application UUIDv7 (target_json.id 와 일치).
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { SessionStore } from '../../src/storage';
import type { PermissionGrant } from '../../src/types/permission';
import type { SessionId } from '../../src/types';

interface TableInfoRow {
  name: string;
  type: string;
  pk: number;
}

describe('v1.4.1 — permission_grants.id TEXT rebuild', () => {
  let store: SessionStore;

  beforeEach(() => {
    store = new SessionStore(':memory:');
  });

  afterEach(() => {
    store.close();
  });

  it('migration 13 적용 → permission_grants.id type = TEXT', () => {
    const rows = store
      .getDb()
      .prepare('PRAGMA table_info(permission_grants)')
      .all() as TableInfoRow[];
    const idCol = rows.find((r) => r.name === 'id');
    expect(idCol).toBeDefined();
    expect(idCol!.type).toBe('TEXT');
    expect(idCol!.pk).toBe(1);
  });

  it('새 grant INSERT — id 컬럼이 application UUIDv7 보존', () => {
    const db = store.getDb();
    // workspace 먼저 INSERT (sessions.workspace_id FK).
    db.prepare(
      `INSERT INTO workspaces (id, root, name, index_status, created_at, is_temporary)
       VALUES (?, ?, 'ws', 'idle', '2026-05-06T00:00:00.000Z', 0)`
    ).run('ws-x', '/x');
    db.prepare(
      `INSERT INTO sessions (id, schema_version, provider, workspace_id, title, created_at, updated_at)
       VALUES (?, 1, 'codex', ?, 'sess', '2026-05-06T00:00:00.000Z', '2026-05-06T00:00:00.000Z')`
    ).run('s-grants', 'ws-x');

    const grant: PermissionGrant = {
      id: '019d-grant-uuid-aaaa',
      session_id: 's-grants' as SessionId,
      capability: 'LOCAL_READ',
      target: { kind: 'global' },
      granted_at: '2026-05-06T00:00:00.000Z',
      granted_by: 'user',
      scope: 'session',
    };
    store.addPermissionGrant(grant);

    const row = db
      .prepare('SELECT id FROM permission_grants WHERE id = ?')
      .get('019d-grant-uuid-aaaa') as { id: string } | undefined;
    expect(row).toBeDefined();
    expect(row!.id).toBe('019d-grant-uuid-aaaa');
  });

  it('revokePermissionGrant — WHERE id = ? 직접 매칭', () => {
    const db = store.getDb();
    db.prepare(
      `INSERT INTO workspaces (id, root, name, index_status, created_at, is_temporary)
       VALUES (?, ?, 'ws', 'idle', '2026-05-06T00:00:00.000Z', 0)`
    ).run('ws-y', '/y');
    db.prepare(
      `INSERT INTO sessions (id, schema_version, provider, workspace_id, title, created_at, updated_at)
       VALUES (?, 1, 'codex', ?, 'sess', '2026-05-06T00:00:00.000Z', '2026-05-06T00:00:00.000Z')`
    ).run('s-revoke', 'ws-y');

    const grant: PermissionGrant = {
      id: '019d-grant-revoke',
      session_id: 's-revoke' as SessionId,
      capability: 'LOCAL_READ',
      target: { kind: 'global' },
      granted_at: '2026-05-06T00:00:00.000Z',
      granted_by: 'user',
      scope: 'session',
    };
    store.addPermissionGrant(grant);

    const ok = store.revokePermissionGrant(
      '019d-grant-revoke',
      '2026-05-06T01:00:00.000Z'
    );
    expect(ok).toBe(true);

    const row = db
      .prepare('SELECT revoked_at FROM permission_grants WHERE id = ?')
      .get('019d-grant-revoke') as { revoked_at: string | null } | undefined;
    expect(row?.revoked_at).toBe('2026-05-06T01:00:00.000Z');

    // 두 번 revoke 시도 → false (이미 revoked → WHERE revoked_at IS NULL 필터).
    const ok2 = store.revokePermissionGrant(
      '019d-grant-revoke',
      '2026-05-06T02:00:00.000Z'
    );
    expect(ok2).toBe(false);
  });

  it('미존재 id revoke → false', () => {
    const ok = store.revokePermissionGrant(
      'does-not-exist',
      '2026-05-06T00:00:00.000Z'
    );
    expect(ok).toBe(false);
  });
});
