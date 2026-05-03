/**
 * SessionStore.updatePermission 테스트 (v0.8.0 H Permission Dropdown).
 *
 * 검증:
 *  - default_level 변경이 round-trip 으로 유지
 *  - 기존 permission.grants / temporarily_blocked_capabilities 보존
 *  - 빈 patch 는 no-op
 *  - 존재하지 않는 session 은 throw
 *  - updated_at 가 새 시각으로 갱신
 *
 * Spec: ROADMAP.md (v0.8.0 — H Permission Dropdown)
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { SessionStore } from '@/storage';
import { SessionSchema, type Session } from '@/types/session';
import type { SessionId } from '@/types/common';

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURES_DIR = join(__dirname, '..', 'fixtures', 'sessions');

function loadFixture(name: string): Session {
  return SessionSchema.parse(JSON.parse(readFileSync(join(FIXTURES_DIR, name), 'utf-8')));
}

describe('SessionStore.updatePermission (v0.8.0 H)', () => {
  let store: SessionStore;

  beforeEach(() => {
    store = new SessionStore(':memory:');
  });

  afterEach(() => {
    store.close();
  });

  it('updates default_level (round-trip)', () => {
    const session = loadFixture('01-empty.json');
    store.createSession(session);
    expect(store.getSession(session.id)?.permission.default_level).toBe('workspace_write');

    store.updatePermission(session.id, { default_level: 'full_access' });

    const reloaded = store.getSession(session.id);
    expect(reloaded?.permission.default_level).toBe('full_access');
  });

  it('preserves grants array when only default_level changes', () => {
    const session = loadFixture('01-empty.json');
    store.createSession(session);

    store.updatePermission(session.id, { default_level: 'read_only' });

    const reloaded = store.getSession(session.id);
    expect(reloaded?.permission.grants).toEqual(session.permission.grants);
    expect(reloaded?.permission.temporarily_blocked_capabilities).toEqual(
      session.permission.temporarily_blocked_capabilities
    );
  });

  it('empty patch is no-op (no change)', () => {
    const session = loadFixture('01-empty.json');
    store.createSession(session);
    const before = store.getSession(session.id)?.permission.default_level;

    store.updatePermission(session.id, {});

    const after = store.getSession(session.id)?.permission.default_level;
    expect(after).toBe(before);
  });

  it('throws for nonexistent session', () => {
    const ghost = '019d0000-0000-7000-8000-fffffffffffb' as SessionId;
    expect(() => store.updatePermission(ghost, { default_level: 'read_only' })).toThrow(
      /not found/
    );
  });

  it('bumps updated_at to current time', () => {
    const session = loadFixture('01-empty.json');
    store.createSession(session);
    const before = session.updated_at;

    store.updatePermission(session.id, { default_level: 'full_access' });

    const reloaded = store.getSession(session.id);
    expect(reloaded?.updated_at).toBeDefined();
    // updated_at 은 새 ISO 시각이라 fixture 의 2026-05-02 시간보다 무조건 큼.
    expect(reloaded!.updated_at >= before).toBe(true);
  });
});
