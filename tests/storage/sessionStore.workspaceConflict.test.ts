/**
 * v1.4.10 — Workspace UNIQUE(root) 충돌 graceful 처리.
 *
 * 검증:
 *  - 같은 root 의 workspace 가 다른 id 로 이미 존재 (legacy FNV vs sha256
 *    derived) → createSession 이 fatal 대신 기존 id 채택.
 *  - 반환된 Session 의 workspace_id 가 input 과 다르면 caller 가 detection
 *    가능 (input 과 다른 값이 effective).
 *  - 같은 root + 같은 id → 종전 동작 그대로 (UPDATE).
 *  - 다른 root → 정상 새 row INSERT.
 *  - 두 세션 모두 list 에서 보여 FK 가 effective id 로 들어감.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { SessionStore } from '../../src/storage';
import { SessionSchema, type Session } from '../../src/types/session';

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURE_PATH = join(__dirname, '..', 'fixtures', 'sessions', '01-empty.json');

function loadBaseFixture(): Session {
  return SessionSchema.parse(JSON.parse(readFileSync(FIXTURE_PATH, 'utf-8')));
}

function withOverrides(
  base: Session,
  overrides: { id?: string; workspace_id?: string; root?: string; name?: string }
): Session {
  const draft = {
    ...base,
    ...(overrides.id !== undefined ? { id: overrides.id } : {}),
    ...(overrides.workspace_id !== undefined
      ? { workspace_id: overrides.workspace_id }
      : {}),
    workspace: {
      ...base.workspace,
      ...(overrides.root !== undefined ? { root: overrides.root } : {}),
      ...(overrides.name !== undefined ? { name: overrides.name } : {}),
    },
  };
  return SessionSchema.parse(draft);
}

describe('v1.4.10 — workspace root collision graceful fallback', () => {
  let store: SessionStore;
  let base: Session;

  beforeEach(() => {
    store = new SessionStore(':memory:');
    base = loadBaseFixture();
  });

  afterEach(() => {
    store.close();
  });

  it('legacy id 가 같은 root 로 먼저 차지 → 새 sha256 id session 은 legacy id 채택', () => {
    const legacy = withOverrides(base, {
      id: '019d0000-0000-7000-8000-000000000010',
      workspace_id: 'legacy-fnv-xxx',
      root: 'C:\\Dev\\proj-x',
    });
    store.createSession(legacy);

    const fresh = withOverrides(base, {
      id: '019d0000-0000-7000-8000-000000000020',
      workspace_id: 'ws-sha256-aaa',
      root: 'C:\\Dev\\proj-x',
    });
    const effective = store.createSession(fresh);

    expect(effective.workspace_id).toBe('legacy-fnv-xxx');
    // 원본 input 은 mutate 되지 않음 (immutable spread).
    expect(fresh.workspace_id).toBe('ws-sha256-aaa');
  });

  it('같은 id → 기존 ON CONFLICT(id) DO UPDATE 경로 (no mutation)', () => {
    const a = withOverrides(base, {
      id: '019d0000-0000-7000-8000-00000000aa01',
      workspace_id: 'ws-sha256-aaa',
      root: 'C:\\Dev\\proj-shared',
    });
    store.createSession(a);

    const b = withOverrides(base, {
      id: '019d0000-0000-7000-8000-00000000aa02',
      workspace_id: 'ws-sha256-aaa',
      root: 'C:\\Dev\\proj-shared',
    });
    const eff = store.createSession(b);
    expect(eff.workspace_id).toBe('ws-sha256-aaa');
  });

  it('다른 root → 정상 새 row INSERT (no fallback)', () => {
    const a = withOverrides(base, {
      id: '019d0000-0000-7000-8000-00000000bb01',
      workspace_id: 'ws-A',
      root: 'C:\\Dev\\proj-A',
    });
    store.createSession(a);

    const b = withOverrides(base, {
      id: '019d0000-0000-7000-8000-00000000bb02',
      workspace_id: 'ws-B',
      root: 'C:\\Dev\\proj-B',
    });
    const eff = store.createSession(b);
    expect(eff.workspace_id).toBe('ws-B');
  });

  it('두 세션 모두 list 에서 보임 (FK 유효) — collision 후에도 둘 다 검색 가능', () => {
    const legacy = withOverrides(base, {
      id: '019d0000-0000-7000-8000-00000000cc01',
      workspace_id: 'fnv-id',
      root: 'C:\\Dev\\proj-cc',
    });
    store.createSession(legacy);

    const fresh = withOverrides(base, {
      id: '019d0000-0000-7000-8000-00000000cc02',
      workspace_id: 'sha-id',
      root: 'C:\\Dev\\proj-cc',
    });
    const eff = store.createSession(fresh);
    expect(eff.workspace_id).toBe('fnv-id');

    const list = store.listSessions();
    const ids = list.map((s) => s.id as string);
    expect(ids).toContain('019d0000-0000-7000-8000-00000000cc01');
    expect(ids).toContain('019d0000-0000-7000-8000-00000000cc02');
  });
});
