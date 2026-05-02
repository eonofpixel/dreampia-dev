/**
 * LeaderElection — multi-window leader election unit tests (SS-5).
 *
 * Spec: docs/session/multi-window.md
 *
 * Tests use `:memory:` SessionStore + the underlying DB handle. We construct
 * two LeaderElection instances on the same DB connection (different
 * window_ids) to simulate two windows. Stale-lock takeover is tested by
 * directly rewriting `heartbeat_at` to an old timestamp — no real timers.
 *
 * The auto-heartbeat interval is NOT exercised here (timing-dependent);
 * `heartbeat()` is called manually instead.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { LeaderElection, SessionStore } from '@/storage';
import { SessionSchema, type Session } from '@/types/session';
import type { SessionId } from '@/types/common';

// ────────────────────────────────────────────────────────────
// Fixtures
// ────────────────────────────────────────────────────────────

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURES_DIR = join(__dirname, '..', 'fixtures', 'sessions');

function loadFixture(name: string): Session {
  const raw = JSON.parse(readFileSync(join(FIXTURES_DIR, name), 'utf-8'));
  return SessionSchema.parse(raw);
}

/** Force a lock's heartbeat to a given timestamp (test helper). */
function setHeartbeatRaw(
  store: SessionStore,
  sessionId: SessionId,
  iso: string
): void {
  store
    .getDb()
    .prepare(`UPDATE session_locks SET heartbeat_at = ? WHERE session_id = ?`)
    .run(iso, sessionId);
}

/** Read raw lock row. */
function getRawLock(
  store: SessionStore,
  sessionId: SessionId
): Record<string, unknown> | undefined {
  return store
    .getDb()
    .prepare(`SELECT * FROM session_locks WHERE session_id = ?`)
    .get(sessionId) as Record<string, unknown> | undefined;
}

// ────────────────────────────────────────────────────────────
// Suite
// ────────────────────────────────────────────────────────────

describe('LeaderElection', () => {
  let store: SessionStore;
  let session: Session;

  beforeEach(() => {
    store = new SessionStore(':memory:');
    // Persist a session so we have a valid FK target for the lock row.
    session = loadFixture('01-empty.json');
    store.createSession(session);
  });

  afterEach(() => {
    store.close();
  });

  // ── acquire/release basics ──────────────────────────────────

  it('acquireLeadership on a fresh session creates the lock and returns true', () => {
    const a = new LeaderElection(store.getDb(), { window_id: 'wA' });
    expect(a.acquireLeadership(session.id)).toBe(true);
    a.shutdown();
  });

  it('second window cannot acquire while first holds a fresh lock', () => {
    const a = new LeaderElection(store.getDb(), { window_id: 'wA' });
    const b = new LeaderElection(store.getDb(), { window_id: 'wB' });

    expect(a.acquireLeadership(session.id)).toBe(true);
    expect(b.acquireLeadership(session.id)).toBe(false);

    // wA still owns it
    expect(a.isLeader(session.id)).toBe(true);
    expect(b.isLeader(session.id)).toBe(false);
    a.shutdown();
    b.shutdown();
  });

  it('same window calling acquire twice returns true (refresh)', () => {
    const a = new LeaderElection(store.getDb(), { window_id: 'wA' });
    expect(a.acquireLeadership(session.id)).toBe(true);
    const beforeRow = getRawLock(store, session.id);
    expect(beforeRow).toBeDefined();

    // Force the heartbeat 1ms into the past so a refresh changes it
    setHeartbeatRaw(store, session.id, '2026-01-01T00:00:00.000Z');

    expect(a.acquireLeadership(session.id)).toBe(true);
    const afterRow = getRawLock(store, session.id);
    // Heartbeat should be NEWER than the forced 2026-01-01 value
    expect((afterRow?.['heartbeat_at'] as string) > '2026-01-01T00:00:00.000Z')
      .toBe(true);
    a.shutdown();
  });

  it('stale lock can be taken over by another window', () => {
    // ttl_seconds: 1 keeps the math obvious; we then forcibly age the row
    // beyond that window so the takeover branch fires.
    const a = new LeaderElection(store.getDb(), {
      window_id: 'wA',
      ttl_seconds: 1,
    });
    const b = new LeaderElection(store.getDb(), {
      window_id: 'wB',
      ttl_seconds: 1,
    });

    expect(a.acquireLeadership(session.id)).toBe(true);
    // Age the lock to 1 hour ago — clearly stale.
    const past = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    setHeartbeatRaw(store, session.id, past);

    expect(b.acquireLeadership(session.id)).toBe(true);
    expect(b.isLeader(session.id)).toBe(true);
    expect(a.isLeader(session.id)).toBe(false);
    a.shutdown();
    b.shutdown();
  });

  it('release removes the lock so another window can acquire', () => {
    const a = new LeaderElection(store.getDb(), { window_id: 'wA' });
    const b = new LeaderElection(store.getDb(), { window_id: 'wB' });

    expect(a.acquireLeadership(session.id)).toBe(true);
    a.releaseLeadership(session.id);
    expect(getRawLock(store, session.id)).toBeUndefined();

    expect(b.acquireLeadership(session.id)).toBe(true);
    expect(b.isLeader(session.id)).toBe(true);
    a.shutdown();
    b.shutdown();
  });

  it('release by non-owner does not clear another window’s lock', () => {
    const a = new LeaderElection(store.getDb(), { window_id: 'wA' });
    const b = new LeaderElection(store.getDb(), { window_id: 'wB' });

    expect(a.acquireLeadership(session.id)).toBe(true);
    // wB tries to release wA's lock — should be a no-op.
    b.releaseLeadership(session.id);
    expect(getRawLock(store, session.id)).toBeDefined();
    expect(a.isLeader(session.id)).toBe(true);
    a.shutdown();
    b.shutdown();
  });

  // ── heartbeat ───────────────────────────────────────────────

  it('heartbeat() updates heartbeat_at when we still hold the lock', () => {
    const a = new LeaderElection(store.getDb(), { window_id: 'wA' });
    expect(a.acquireLeadership(session.id)).toBe(true);
    setHeartbeatRaw(store, session.id, '2026-01-01T00:00:00.000Z');

    expect(a.heartbeat(session.id)).toBe(true);
    const row = getRawLock(store, session.id);
    expect((row?.['heartbeat_at'] as string) > '2026-01-01T00:00:00.000Z')
      .toBe(true);
    a.shutdown();
  });

  it('heartbeat() returns false when another window owns the lock', () => {
    const a = new LeaderElection(store.getDb(), { window_id: 'wA' });
    const b = new LeaderElection(store.getDb(), { window_id: 'wB' });

    expect(a.acquireLeadership(session.id)).toBe(true);
    expect(b.heartbeat(session.id)).toBe(false);
    a.shutdown();
    b.shutdown();
  });

  // ── getLeader / isLeader ────────────────────────────────────

  it('getLeader returns null when no lock exists', () => {
    const a = new LeaderElection(store.getDb(), { window_id: 'wA' });
    expect(a.getLeader(session.id)).toBeNull();
    a.shutdown();
  });

  it('getLeader returns the lock row when held', () => {
    const a = new LeaderElection(store.getDb(), { window_id: 'wA' });
    expect(a.acquireLeadership(session.id)).toBe(true);
    const lock = a.getLeader(session.id);
    expect(lock).not.toBeNull();
    expect(lock?.leader_window_id).toBe('wA');
    expect(lock?.leader_pid).toBe(process.pid);
    expect(lock?.ttl_seconds).toBe(30);
    expect(typeof lock?.acquired_at).toBe('string');
    expect(typeof lock?.heartbeat_at).toBe('string');
    a.shutdown();
  });

  it('isLeader true for the owner, false for non-owner and unowned sessions', () => {
    const a = new LeaderElection(store.getDb(), { window_id: 'wA' });
    const b = new LeaderElection(store.getDb(), { window_id: 'wB' });

    expect(a.isLeader(session.id)).toBe(false);
    expect(a.acquireLeadership(session.id)).toBe(true);
    expect(a.isLeader(session.id)).toBe(true);
    expect(b.isLeader(session.id)).toBe(false);

    a.shutdown();
    b.shutdown();
  });

  // ── shutdown ────────────────────────────────────────────────

  it('shutdown releases all locks held by this window', () => {
    // A second session is needed so we can hold two locks at once.
    // 05-with-browser has its own workspace, no conflict with 01-empty.
    const second = loadFixture('05-with-browser.json');
    store.createSession(second);

    const a = new LeaderElection(store.getDb(), { window_id: 'wA' });
    expect(a.acquireLeadership(session.id)).toBe(true);
    expect(a.acquireLeadership(second.id)).toBe(true);

    a.shutdown();

    expect(getRawLock(store, session.id)).toBeUndefined();
    expect(getRawLock(store, second.id)).toBeUndefined();
  });

  it('shutdown does not touch locks held by other windows', () => {
    const a = new LeaderElection(store.getDb(), { window_id: 'wA' });
    const b = new LeaderElection(store.getDb(), { window_id: 'wB' });

    expect(a.acquireLeadership(session.id)).toBe(true);
    b.shutdown();
    expect(getRawLock(store, session.id)).toBeDefined();
    expect(a.isLeader(session.id)).toBe(true);
    a.shutdown();
  });

  // ── ON DELETE CASCADE ───────────────────────────────────────

  it('CASCADE: deleting the session removes its lock automatically', () => {
    const a = new LeaderElection(store.getDb(), { window_id: 'wA' });
    expect(a.acquireLeadership(session.id)).toBe(true);
    expect(getRawLock(store, session.id)).toBeDefined();

    // No double-delete: deleteSession does not explicitly target session_locks,
    // so the FK ON DELETE CASCADE is what removes the row.
    expect(() => store.deleteSession(session.id)).not.toThrow();
    expect(getRawLock(store, session.id)).toBeUndefined();
    a.shutdown();
  });

  // ── multi-session ───────────────────────────────────────────

  it('one window can hold leadership of two sessions concurrently', () => {
    const second = loadFixture('05-with-browser.json');
    store.createSession(second);

    const a = new LeaderElection(store.getDb(), { window_id: 'wA' });
    expect(a.acquireLeadership(session.id)).toBe(true);
    expect(a.acquireLeadership(second.id)).toBe(true);
    expect(a.isLeader(session.id)).toBe(true);
    expect(a.isLeader(second.id)).toBe(true);
    a.shutdown();
  });

  // ── edge: ttl_seconds = 0 ───────────────────────────────────

  it('ttl_seconds of 0 makes the lock immediately stale (anyone can take over)', () => {
    const a = new LeaderElection(store.getDb(), {
      window_id: 'wA',
      ttl_seconds: 0,
    });
    const b = new LeaderElection(store.getDb(), {
      window_id: 'wB',
      ttl_seconds: 0,
    });

    expect(a.acquireLeadership(session.id)).toBe(true);

    // Force heartbeat to a past timestamp so wB definitely sees it as stale.
    // (Even with ttl=0, a heartbeat written in the same millisecond as the
    // expiry computation could tie. Past timestamp makes the comparison
    // strictly less-than.)
    setHeartbeatRaw(store, session.id, '2000-01-01T00:00:00.000Z');

    expect(b.acquireLeadership(session.id)).toBe(true);
    expect(b.isLeader(session.id)).toBe(true);
    a.shutdown();
    b.shutdown();
  });

  // ── invariant INV-2 (acquired_at vs heartbeat_at) ───────────

  it('INV-2: heartbeat_at >= acquired_at after acquisition', () => {
    const a = new LeaderElection(store.getDb(), { window_id: 'wA' });
    expect(a.acquireLeadership(session.id)).toBe(true);
    const lock = a.getLeader(session.id);
    expect(lock).not.toBeNull();
    expect(lock!.heartbeat_at >= lock!.acquired_at).toBe(true);
    a.shutdown();
  });
});
