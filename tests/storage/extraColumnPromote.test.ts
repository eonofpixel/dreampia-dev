/**
 * v1.8.1 — _extra column promote (B-3 2단계).
 *
 * 검증:
 *  - 새 세션 INSERT 시 sessions.permission_default_level / plan_active
 *    columns 가 dual-write 됨.
 *  - 기존 metadata_json._extra 만 있는 row 도 backfill SQL 로 column 에
 *    값이 복사됨.
 *  - assembleSession (loadSession) 이 column 우선 → JSON fallback.
 *  - updatePermission(default_level) 이 column 도 갱신.
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

  it('dual-write — INSERT 시 column 과 metadata_json 양쪽에 값', () => {
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

    const meta = JSON.parse(row.metadata_json) as {
      _extra: {
        permission: { default_level: string };
        plan: { active: boolean };
      };
    };
    expect(meta._extra.permission.default_level).toBe('full_access');
    expect(meta._extra.plan.active).toBe(true);
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

  it('updatePermission — column 도 갱신', () => {
    const s = withPermission(
      base,
      'workspace_write',
      false,
      '019d0000-0000-7000-8000-00000000dd01',
      'ws-promote-4'
    );
    store.createSession(s);
    store.updatePermission(s.id as SessionId, { default_level: 'full_access' });

    const row = store.getDb()
      .prepare('SELECT permission_default_level, metadata_json FROM sessions WHERE id = ?')
      .get(s.id) as { permission_default_level: string; metadata_json: string };
    expect(row.permission_default_level).toBe('full_access');

    const meta = JSON.parse(row.metadata_json) as {
      _extra: { permission: { default_level: string } };
    };
    expect(meta._extra.permission.default_level).toBe('full_access');

    // round-trip 검증.
    const loaded = store.getSession(s.id as SessionId);
    expect(loaded?.permission.default_level).toBe('full_access');
  });

  it('backfill SQL — pre-existing _extra row 가 column 으로 옮겨짐', () => {
    // SessionStore 는 항상 column 도 같이 INSERT 하지만, 마이그레이션 015 의
    // backfill 단계 검증을 위해 raw INSERT 로 metadata_json 만 채우고
    // column 은 NULL/0 으로 두기.
    const s = withPermission(
      base,
      'read_only',
      true,
      '019d0000-0000-7000-8000-00000000ee01',
      'ws-backfill'
    );
    // 일단 정상 INSERT (column 도 채워짐).
    store.createSession(s);
    // 강제 NULL 로 되돌려 legacy 상태 재현.
    store.getDb()
      .prepare(
        'UPDATE sessions SET permission_default_level = NULL, plan_active = 0 WHERE id = ?'
      )
      .run(s.id);
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
