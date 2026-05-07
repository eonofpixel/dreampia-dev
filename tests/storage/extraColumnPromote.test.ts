/**
 * v1.8.1 — _extra column promote (B-3 2단계).
 * v1.8.3 — column 만 source of truth (read fallback 제거).
 * v1.8.4 — column 만 write (_extra 측 직렬화/갱신 중단).
 *
 * 검증:
 *  - 새 세션 INSERT 시 sessions.permission_default_level / plan_active
 *    column 에 값. v1.8.4 부터는 _extra 측에는 값 부재.
 *  - 기존 metadata_json._extra 만 있는 legacy row 도 backfill SQL 로
 *    column 에 값이 복사됨 (마이그레이션 015 호환).
 *  - assembleSession (loadSession) 이 column 만 read.
 *  - updatePermission(default_level) 이 column 만 갱신 — metadata_json
 *    무영향 (v1.8.4 dead-write 제거).
 *  - 마이그레이션 후 LATEST_SCHEMA_VERSION === 15.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { LATEST_SCHEMA_VERSION, SessionStore } from '../../src/storage';
import { SessionSchema, type Session } from '../../src/types/session';
import type { SessionId } from '../../src/types/common';

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURE_PATH = join(__dirname, '..', 'fixtures', 'sessions', '01-empty.json');

function loadBase(): Session {
  return SessionSchema.parse(JSON.parse(readFileSync(FIXTURE_PATH, 'utf-8')));
}

function withPermission(
  base: Session,
  level: 'read_only' | 'workspace_write' | 'full_access' | 'custom',
  planActive: boolean,
  id?: string,
  workspaceId?: string
): Session {
  // INV-7: plan.active=true 면 temporarily_blocked_capabilities 가 LOCAL_WRITE 포함 필수.
  const blocked = planActive ? ['LOCAL_WRITE', 'LOCAL_EXECUTE'] : [];
  return SessionSchema.parse({
    ...base,
    ...(id !== undefined ? { id } : {}),
    ...(workspaceId !== undefined ? { workspace_id: workspaceId } : {}),
    permission: {
      ...base.permission,
      default_level: level,
      temporarily_blocked_capabilities: blocked,
    },
    plan: { ...base.plan, active: planActive },
  });
}

describe('v1.8.1 — _extra column promote', () => {
  let store: SessionStore;
  let base: Session;

  beforeEach(() => {
    store = new SessionStore(':memory:');
    base = loadBase();
  });

  afterEach(() => {
    store.close();
  });

  it('migration registry — LATEST_SCHEMA_VERSION === 15', () => {
    expect(LATEST_SCHEMA_VERSION).toBe(15);
    expect(store.getSchemaVersion()).toBe(15);
  });

  it('v1.8.4 — INSERT 시 column 만 채워지고 _extra 측 두 필드 부재', () => {
    const s = withPermission(
      base,
      'full_access',
      true,
      '019d0000-0000-7000-8000-00000000aa01',
      'ws-promote-1'
    );
    store.createSession(s);

    const row = store.getDb()
      .prepare(
        'SELECT permission_default_level, plan_active, metadata_json FROM sessions WHERE id = ?'
      )
      .get(s.id) as {
      permission_default_level: string | null;
      plan_active: number;
      metadata_json: string;
    };

    expect(row.permission_default_level).toBe('full_access');
    expect(row.plan_active).toBe(1);

    // v1.8.4 — _extra 측 두 promoted 필드는 더이상 직렬화 X.
    const meta = JSON.parse(row.metadata_json) as {
      _extra: {
        permission: Record<string, unknown>;
        plan: Record<string, unknown>;
      };
    };
    expect(meta._extra.permission.default_level).toBeUndefined();
    expect(meta._extra.plan.active).toBeUndefined();
    // 다른 필드는 유지.
    expect(meta._extra.plan.browser_tool_enabled).toBeDefined();
    expect(meta._extra.permission.temporarily_blocked_capabilities).toBeDefined();
  });

  it('column 우선 read — default_level column 변경 시 우선 적용', () => {
    const s = withPermission(
      base,
      'read_only',
      false,
      '019d0000-0000-7000-8000-00000000bb01',
      'ws-promote-2'
    );
    store.createSession(s);

    // column 만 변경 (metadata 는 그대로 — column 우선 검증).
    // plan_active 는 INV-7 위반 회피하기 위해 그대로.
    store.getDb()
      .prepare('UPDATE sessions SET permission_default_level = ? WHERE id = ?')
      .run('full_access', s.id);

    const loaded = store.getSession(s.id as SessionId);
    expect(loaded).not.toBeNull();
    expect(loaded?.permission.default_level).toBe('full_access');
  });

  it('v1.8.3 — column 만 source of truth (plan_active 0 이면 false 반환, _extra true 무시)', () => {
    const s = withPermission(
      base,
      'workspace_write',
      true,
      '019d0000-0000-7000-8000-00000000bb02',
      'ws-promote-2b'
    );
    store.createSession(s);
    // column 만 0 으로 강제. v1.8.1 까지는 _extra fallback 으로 true,
    // v1.8.3 부터는 column 만 source of truth → false.
    store.getDb()
      .prepare('UPDATE sessions SET plan_active = 0 WHERE id = ?')
      .run(s.id);

    const loaded = store.getSession(s.id as SessionId);
    expect(loaded?.plan.active).toBe(false);
  });

  it('v1.8.3 — column NULL 시 defensive default (workspace_write), _extra 무시', () => {
    // v1.8.1 까지는 column NULL → _extra fallback. v1.8.3 부터는 column 이
    // 단일 source of truth — NULL 은 정상 시나리오 아니지만 defensive
    // default 'workspace_write' 사용.
    const s = withPermission(
      base,
      'full_access',
      false,
      '019d0000-0000-7000-8000-00000000cc01',
      'ws-promote-3'
    );
    store.createSession(s);
    // _extra 는 'full_access' 그대로 두고 column 만 NULL 로.
    store.getDb()
      .prepare('UPDATE sessions SET permission_default_level = NULL WHERE id = ?')
      .run(s.id);

    const loaded = store.getSession(s.id as SessionId);
    // _extra 의 'full_access' 가 아니라 defensive default 'workspace_write'.
    expect(loaded?.permission.default_level).toBe('workspace_write');
  });

  it('v1.8.4 — updatePermission 은 column 만 갱신, metadata_json 무영향', () => {
    const s = withPermission(
      base,
      'workspace_write',
      false,
      '019d0000-0000-7000-8000-00000000dd01',
      'ws-promote-4'
    );
    store.createSession(s);
    // INSERT 직후 metadata_json 스냅샷 — updatePermission 후 변경 X 검증용.
    const beforeRow = store.getDb()
      .prepare('SELECT metadata_json FROM sessions WHERE id = ?')
      .get(s.id) as { metadata_json: string };

    store.updatePermission(s.id as SessionId, { default_level: 'full_access' });

    const row = store.getDb()
      .prepare('SELECT permission_default_level, metadata_json FROM sessions WHERE id = ?')
      .get(s.id) as { permission_default_level: string; metadata_json: string };
    expect(row.permission_default_level).toBe('full_access');

    // v1.8.4 — metadata_json 은 INSERT 직후와 동일 (updatePermission 이
    // 더이상 _extra 갱신 X). 직전 v1.8.1 dual-write 패턴 폐기.
    expect(row.metadata_json).toBe(beforeRow.metadata_json);

    // round-trip — column 갱신만으로 정상 read.
    const loaded = store.getSession(s.id as SessionId);
    expect(loaded?.permission.default_level).toBe('full_access');
  });

  it('backfill SQL — legacy _extra row (pre-v1.8.4) 가 column 으로 옮겨짐', () => {
    // v1.8.4 의 createSession 은 _extra 측 두 promoted 필드를 더이상
    // 직렬화 X — 마이그레이션 015 의 legacy 호환 검증을 위해 raw UPDATE
    // 로 _extra 측에 값을 강제 주입 (pre-v1.8.4 row 시뮬레이션).
    const s = withPermission(
      base,
      'read_only',
      true,
      '019d0000-0000-7000-8000-00000000ee01',
      'ws-backfill'
    );
    store.createSession(s);

    // metadata_json 에 legacy _extra 필드 강제 주입 + column 은 NULL/0
    // 으로 되돌리기 → pre-v1.8.4 row 상태.
    const baseMeta = store.getDb()
      .prepare('SELECT metadata_json FROM sessions WHERE id = ?')
      .get(s.id) as { metadata_json: string };
    const meta = JSON.parse(baseMeta.metadata_json) as {
      _extra: {
        permission: Record<string, unknown>;
        plan: Record<string, unknown>;
      };
    };
    meta._extra.permission.default_level = 'read_only';
    meta._extra.plan.active = true;
    store.getDb()
      .prepare(
        `UPDATE sessions
         SET metadata_json = ?, permission_default_level = NULL, plan_active = 0
         WHERE id = ?`
      )
      .run(JSON.stringify(meta), s.id);

    // 015 backfill SQL 을 다시 실행해 column 채워지는지 확인.
    store.getDb().exec(
      `UPDATE sessions
       SET permission_default_level = json_extract(metadata_json, '$._extra.permission.default_level'),
           plan_active = CASE
             WHEN json_extract(metadata_json, '$._extra.plan.active') IN (1, 'true', true) THEN 1
             ELSE 0
           END
       WHERE metadata_json IS NOT NULL`
    );

    const row = store.getDb()
      .prepare('SELECT permission_default_level, plan_active FROM sessions WHERE id = ?')
      .get(s.id) as { permission_default_level: string; plan_active: number };
    expect(row.permission_default_level).toBe('read_only');
    expect(row.plan_active).toBe(1);
  });
});
