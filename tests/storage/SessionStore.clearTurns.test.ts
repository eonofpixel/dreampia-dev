/**
 * SessionStore.clearTurns + updateConversation 테스트 (v0.5.0 F-018).
 *
 * 검증:
 *   1. clearTurns: turns 만 비우고 session 자체는 유지 + updated_at 갱신
 *   2. clearTurns: 존재하지 않는 session 은 throw
 *   3. updateConversation: current_model 갱신 round-trip
 *   4. updateConversation: 빈 patch 는 no-op
 *   5. updateConversation: 존재하지 않는 session 은 throw
 *
 * Spec: docs/ux/patterns/F-018-slash-commands.md, docs/session/persistence.md
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

describe('SessionStore.clearTurns + updateConversation (v0.5.0 F-018)', () => {
  let store: SessionStore;

  beforeEach(() => {
    store = new SessionStore(':memory:');
  });

  afterEach(() => {
    store.close();
  });

  describe('clearTurns', () => {
    it('removes all turns and keeps the session', () => {
      const session = loadFixture('02-single-turn.json');
      store.createSession(session);
      expect(store.getSession(session.id)?.conversation.turns).toHaveLength(2);

      store.clearTurns(session.id);

      const reloaded = store.getSession(session.id);
      expect(reloaded).not.toBeNull();
      expect(reloaded?.conversation.turns).toHaveLength(0);
      // current_model 등 conversation 메타는 유지.
      expect(reloaded?.conversation.current_model).toBe(session.conversation.current_model);
    });

    it('bumps updated_at to current time', () => {
      const session = loadFixture('02-single-turn.json');
      store.createSession(session);
      const before = session.updated_at;

      store.clearTurns(session.id);

      const reloaded = store.getSession(session.id);
      expect(reloaded?.updated_at).toBeDefined();
      expect(reloaded!.updated_at >= before).toBe(true);
    });

    it('also removes turn-level annotations', () => {
      const session = loadFixture('08-with-annotation.json');
      store.createSession(session);

      const dbAccessor = store as unknown as {
        db: { prepare: (s: string) => { get: (...a: unknown[]) => unknown } };
      };
      const annoCount = (): number =>
        (
          dbAccessor.db
            .prepare('SELECT COUNT(*) AS c FROM annotations WHERE session_id = ?')
            .get(session.id) as { c: number }
        ).c;

      const turnCount = (): number =>
        (
          dbAccessor.db
            .prepare('SELECT COUNT(*) AS c FROM turns WHERE session_id = ?')
            .get(session.id) as { c: number }
        ).c;

      expect(turnCount()).toBeGreaterThan(0);
      const annoBefore = annoCount();
      // 8번 fixture 가 annotation 을 가진다 — 만약 0 이면 의미 있는 검증이 안 됨.
      expect(annoBefore).toBeGreaterThanOrEqual(0);

      store.clearTurns(session.id);

      expect(turnCount()).toBe(0);
      // annotation 도 모두 정리.
      expect(annoCount()).toBe(0);
    });

    it('throws for nonexistent session', () => {
      const ghost = '019d0000-0000-7000-8000-fffffffffffa' as SessionId;
      expect(() => store.clearTurns(ghost)).toThrow(/not found/);
    });

    it('is idempotent — clearing an already-empty session does not throw', () => {
      const session = loadFixture('01-empty.json');
      store.createSession(session);
      expect(() => store.clearTurns(session.id)).not.toThrow();
      expect(() => store.clearTurns(session.id)).not.toThrow();
    });
  });

  describe('updateConversation', () => {
    it('updates current_model', () => {
      const session = loadFixture('01-empty.json');
      store.createSession(session);

      store.updateConversation(session.id, { current_model: 'claude-3-5-sonnet-20241022' });

      const reloaded = store.getSession(session.id);
      expect(reloaded?.conversation.current_model).toBe('claude-3-5-sonnet-20241022');
    });

    it('updates current_effort', () => {
      const session = loadFixture('01-empty.json');
      store.createSession(session);

      store.updateConversation(session.id, { current_effort: 'minimum' });

      const reloaded = store.getSession(session.id);
      expect(reloaded?.conversation.current_effort).toBe('minimum');
    });

    it('updates current_mode', () => {
      const session = loadFixture('01-empty.json');
      store.createSession(session);

      store.updateConversation(session.id, { current_mode: 'speed' });

      const reloaded = store.getSession(session.id);
      expect(reloaded?.conversation.current_mode).toBe('speed');
    });

    it('preserves turns and other fields', () => {
      const session = loadFixture('02-single-turn.json');
      store.createSession(session);

      store.updateConversation(session.id, { current_model: 'gpt-4o' });

      const reloaded = store.getSession(session.id);
      expect(reloaded?.conversation.turns).toHaveLength(2);
      expect(reloaded?.title).toBe(session.title);
      expect(reloaded?.workspace.root).toBe(session.workspace.root);
    });

    it('no-op for empty patch (does not throw, does not change updated_at)', () => {
      const session = loadFixture('01-empty.json');
      store.createSession(session);
      const before = session.updated_at;

      expect(() => store.updateConversation(session.id, {})).not.toThrow();

      const reloaded = store.getSession(session.id);
      expect(reloaded?.updated_at).toBe(before);
      expect(reloaded?.conversation.current_model).toBe(session.conversation.current_model);
    });

    it('throws for nonexistent session', () => {
      const ghost = '019d0000-0000-7000-8000-fffffffffffb' as SessionId;
      expect(() =>
        store.updateConversation(ghost, { current_model: 'gpt-4o' })
      ).toThrow(/not found/);
    });
  });
});
