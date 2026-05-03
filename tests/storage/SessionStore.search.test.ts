/**
 * Tests for v0.7.0 (F-026) chat search — `SessionStore.searchTurns`.
 *
 * Covers:
 *   - FTS5 happy path (English + Korean)
 *   - Empty query returns []
 *   - No match returns []
 *   - clearTurns / deleteSession clean up FTS5 entries
 *   - Multi-turn ranking
 *   - Limit respected
 *   - LIKE fallback path (forced via test-only escape hatch)
 *   - Snippet contains the matched term
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { SessionStore } from '@/storage';
import { SessionSchema, type Session } from '@/types/session';
import type { Turn } from '@/types/conversation';

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURES_DIR = join(__dirname, '..', 'fixtures', 'sessions');

function loadFixture(name: string): Session {
  const raw = JSON.parse(readFileSync(join(FIXTURES_DIR, name), 'utf-8'));
  return SessionSchema.parse(raw);
}

function makeUserTurn(id: string, text: string, ts: string): Turn {
  return {
    id: id as Turn['id'],
    role: 'user',
    timestamp: ts,
    status: 'completed',
    content: [{ type: 'text', text }],
  };
}

describe('SessionStore.searchTurns (v0.7.0 F-026)', () => {
  let store: SessionStore;
  let sessionId: Session['id'];

  beforeEach(() => {
    store = new SessionStore(':memory:');
    const fixture = loadFixture('01-empty.json');
    store.createSession(fixture);
    sessionId = fixture.id;
  });

  afterEach(() => {
    store.close();
  });

  // ── Basic FTS5 path ────────────────────────────────────────

  it('returns [] for empty query', () => {
    expect(store.searchTurns('')).toEqual([]);
    expect(store.searchTurns('   ')).toEqual([]);
  });

  it('returns [] when nothing matches', () => {
    store.appendTurn(
      sessionId,
      makeUserTurn(
        '019d0001-0000-7000-8000-000000000001',
        'just some words',
        '2026-05-02T01:00:00.000Z'
      )
    );
    expect(store.searchTurns('thisdoesnotexist')).toEqual([]);
  });

  it('finds a single matching turn', () => {
    store.appendTurn(
      sessionId,
      makeUserTurn(
        '019d0001-0000-7000-8000-000000000002',
        'hello world from search',
        '2026-05-02T01:00:00.000Z'
      )
    );
    const results = store.searchTurns('hello');
    expect(results.length).toBe(1);
    expect(results[0]?.session_id).toBe(sessionId);
    expect(results[0]?.role).toBe('user');
  });

  it('snippet contains the search term', () => {
    store.appendTurn(
      sessionId,
      makeUserTurn(
        '019d0001-0000-7000-8000-000000000003',
        'we found a banana in the kitchen',
        '2026-05-02T01:00:00.000Z'
      )
    );
    const results = store.searchTurns('banana');
    expect(results.length).toBe(1);
    expect(results[0]?.snippet.toLowerCase()).toContain('banana');
  });

  it('returns multiple results when multiple turns match', () => {
    store.appendTurn(
      sessionId,
      makeUserTurn(
        '019d0001-0000-7000-8000-000000000010',
        'apple is a fruit',
        '2026-05-02T01:00:00.000Z'
      )
    );
    store.appendTurn(
      sessionId,
      makeUserTurn(
        '019d0001-0000-7000-8000-000000000011',
        'apple ships macbooks',
        '2026-05-02T01:01:00.000Z'
      )
    );
    store.appendTurn(
      sessionId,
      makeUserTurn(
        '019d0001-0000-7000-8000-000000000012',
        'banana yellow',
        '2026-05-02T01:02:00.000Z'
      )
    );
    const results = store.searchTurns('apple');
    expect(results.length).toBe(2);
  });

  it('respects the limit parameter', () => {
    for (let i = 0; i < 5; i++) {
      store.appendTurn(
        sessionId,
        makeUserTurn(
          `019d0001-0000-7000-8000-0000000001${i.toString().padStart(2, '0')}`,
          `keyword instance number ${i}`,
          `2026-05-02T01:00:0${i}.000Z`
        )
      );
    }
    expect(store.searchTurns('keyword', 2).length).toBe(2);
    expect(store.searchTurns('keyword', 5).length).toBe(5);
  });

  it('handles Korean text', () => {
    store.appendTurn(
      sessionId,
      makeUserTurn(
        '019d0001-0000-7000-8000-000000000020',
        '안녕하세요 반갑습니다 한국어 검색 테스트',
        '2026-05-02T01:00:00.000Z'
      )
    );
    const results = store.searchTurns('안녕하세요');
    expect(results.length).toBe(1);
  });

  it('multi-word query (phrase) matches when both words present in order', () => {
    store.appendTurn(
      sessionId,
      makeUserTurn(
        '019d0001-0000-7000-8000-000000000030',
        'the quick brown fox jumps',
        '2026-05-02T01:00:00.000Z'
      )
    );
    const results = store.searchTurns('brown fox');
    expect(results.length).toBe(1);
  });

  // ── Sync invariants ────────────────────────────────────────

  it('clearTurns also clears FTS entries', () => {
    store.appendTurn(
      sessionId,
      makeUserTurn(
        '019d0001-0000-7000-8000-000000000040',
        'unique-marker-keyword',
        '2026-05-02T01:00:00.000Z'
      )
    );
    expect(store.searchTurns('unique-marker-keyword').length).toBe(1);

    store.clearTurns(sessionId);
    expect(store.searchTurns('unique-marker-keyword')).toEqual([]);
  });

  it('deleteSession also clears FTS entries', () => {
    store.appendTurn(
      sessionId,
      makeUserTurn(
        '019d0001-0000-7000-8000-000000000050',
        'sentinel-after-delete',
        '2026-05-02T01:00:00.000Z'
      )
    );
    expect(store.searchTurns('sentinel-after-delete').length).toBe(1);

    store.deleteSession(sessionId);
    expect(store.searchTurns('sentinel-after-delete')).toEqual([]);
  });

  it('createSession bulk-indexes all turns of the session', () => {
    // Create a fresh session that ALREADY contains turns at construction.
    const seeded: Session = {
      ...loadFixture('01-empty.json'),
      id: '019d0000-0000-7000-8000-0000000000a1' as Session['id'],
      conversation: {
        ...loadFixture('01-empty.json').conversation,
        turns: [
          makeUserTurn(
            '019d0001-0000-7000-8000-000000000060',
            'pre-seeded greeting hello there',
            '2026-05-02T01:00:00.000Z'
          ),
        ],
      },
    };
    store.createSession(seeded);
    const results = store.searchTurns('greeting');
    expect(results.length).toBe(1);
    expect(results[0]?.session_id).toBe(seeded.id);
  });

  // ── LIKE fallback (forced) ─────────────────────────────────

  it('LIKE fallback works when FTS5 is forced off', () => {
    store.appendTurn(
      sessionId,
      makeUserTurn(
        '019d0001-0000-7000-8000-000000000070',
        'fallback path keyword tomato',
        '2026-05-02T01:00:00.000Z'
      )
    );
    // Force the test-only escape hatch.
    (store as unknown as { __forceLikeFallbackForTests: () => void }).__forceLikeFallbackForTests();

    const results = store.searchTurns('tomato');
    expect(results.length).toBe(1);
    // LIKE path always returns rank=0.
    expect(results[0]?.rank).toBe(0);
  });
});
