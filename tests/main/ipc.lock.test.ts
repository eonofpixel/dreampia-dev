/**
 * IPC handler tests — `lock/*` namespace (SS-5).
 *
 * Mirrors the pattern from ipc.session.test.ts: mock `electron`, capture
 * each `ipcMain.handle` registration into a Map, and invoke handlers
 * directly with synthetic `IpcMainInvokeEvent` objects.
 *
 * Spec: docs/session/multi-window.md, docs/findings/round5-ipc-telemetry.md
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

// ────────────────────────────────────────────────────────────
// Mock electron — must come before importing anything that uses it
// ────────────────────────────────────────────────────────────

type Handler = (
  evt: unknown,
  ...args: unknown[]
) => unknown | Promise<unknown>;

const handlers = new Map<string, Handler>();

vi.mock('electron', () => {
  return {
    app: { getVersion: () => '0.0.1-test' },
    ipcMain: {
      handle: (channel: string, handler: Handler): void => {
        handlers.set(channel, handler);
      },
      removeHandler: (channel: string): void => {
        handlers.delete(channel);
      },
    },
  };
});

// Imports MUST come after vi.mock so they pick up the stub.
import { registerIpcHandlers } from '../../src/main/ipc';
import { LeaderElection, SessionStore, type SessionLock } from '../../src/storage';
import { SessionSchema, type Session } from '../../src/types';
import type { Result } from '../../src/main/types';

// ────────────────────────────────────────────────────────────
// Fixtures
// ────────────────────────────────────────────────────────────

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURES_DIR = join(__dirname, '..', 'fixtures', 'sessions');

function loadFixture(name: string): Session {
  const raw = JSON.parse(readFileSync(join(FIXTURES_DIR, name), 'utf-8'));
  return SessionSchema.parse(raw);
}

const evt = {} as unknown;

async function call<T>(channel: string, ...args: unknown[]): Promise<T> {
  const handler = handlers.get(channel);
  if (handler === undefined) {
    throw new Error(`no handler registered for ${channel}`);
  }
  return (await handler(evt, ...args)) as T;
}

// ────────────────────────────────────────────────────────────
// Suite
// ────────────────────────────────────────────────────────────

describe('IPC lock handlers', () => {
  let store: SessionStore;
  let election: LeaderElection;
  let session: Session;
  const stubApp = { getVersion: () => '0.0.1-test' } as unknown as Parameters<
    typeof registerIpcHandlers
  >[0];

  beforeEach(() => {
    handlers.clear();
    store = new SessionStore(':memory:');
    election = new LeaderElection(store.getDb(), { window_id: 'ipc-test-w1' });
    session = loadFixture('01-empty.json');
    store.createSession(session);
    registerIpcHandlers(stubApp, store, election);
  });

  afterEach(() => {
    election.shutdown();
    store.close();
  });

  // ── registration ────────────────────────────────────────────

  it('registers all expected lock channels', () => {
    expect(handlers.has('lock/acquire')).toBe(true);
    expect(handlers.has('lock/release')).toBe(true);
    expect(handlers.has('lock/get')).toBe(true);
    expect(handlers.has('lock/heartbeat')).toBe(true);
    expect(handlers.has('lock/is-leader')).toBe(true);
  });

  it('does NOT register lock/* when election is omitted', () => {
    handlers.clear();
    registerIpcHandlers(stubApp, store); // no election
    expect(handlers.has('session/list')).toBe(true);
    expect(handlers.has('lock/acquire')).toBe(false);
    expect(handlers.has('lock/release')).toBe(false);
    expect(handlers.has('lock/get')).toBe(false);
    expect(handlers.has('lock/heartbeat')).toBe(false);
    expect(handlers.has('lock/is-leader')).toBe(false);
  });

  // ── lock/acquire ────────────────────────────────────────────

  describe('lock/acquire', () => {
    it('acquires on a fresh session and returns leader info', async () => {
      const result = await call<
        Result<{ acquired: boolean; leader: SessionLock | null }>
      >('lock/acquire', session.id);
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.value.acquired).toBe(true);
      expect(result.value.leader).not.toBeNull();
      expect(result.value.leader?.leader_window_id).toBe('ipc-test-w1');
    });

    it('rejects non-string sessionId', async () => {
      const result = await call<
        Result<{ acquired: boolean; leader: SessionLock | null }>
      >('lock/acquire', 42);
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.error).toMatch(/string/);
    });

    it('returns acquired:false when another window holds a fresh lock', async () => {
      // Pre-seed with a different window_id via a separate election instance.
      const other = new LeaderElection(store.getDb(), { window_id: 'wOther' });
      expect(other.acquireLeadership(session.id)).toBe(true);
      try {
        const result = await call<
          Result<{ acquired: boolean; leader: SessionLock | null }>
        >('lock/acquire', session.id);
        expect(result.ok).toBe(true);
        if (!result.ok) return;
        expect(result.value.acquired).toBe(false);
        expect(result.value.leader?.leader_window_id).toBe('wOther');
      } finally {
        other.shutdown();
      }
    });
  });

  // ── lock/release ────────────────────────────────────────────

  describe('lock/release', () => {
    it('releases a held lock', async () => {
      await call<Result<{ acquired: boolean; leader: SessionLock | null }>>(
        'lock/acquire',
        session.id
      );
      const release = await call<Result<void>>('lock/release', session.id);
      expect(release.ok).toBe(true);
      const after = await call<Result<SessionLock | null>>(
        'lock/get',
        session.id
      );
      expect(after.ok).toBe(true);
      if (!after.ok) return;
      expect(after.value).toBeNull();
    });

    it('rejects non-string sessionId', async () => {
      const result = await call<Result<void>>('lock/release', null);
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.error).toMatch(/string/);
    });
  });

  // ── lock/get ────────────────────────────────────────────────

  describe('lock/get', () => {
    it('returns null when no lock exists', async () => {
      const result = await call<Result<SessionLock | null>>(
        'lock/get',
        session.id
      );
      expect(result).toEqual({ ok: true, value: null });
    });

    it('returns the lock row after acquire', async () => {
      await call('lock/acquire', session.id);
      const result = await call<Result<SessionLock | null>>(
        'lock/get',
        session.id
      );
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.value?.leader_window_id).toBe('ipc-test-w1');
      expect(typeof result.value?.acquired_at).toBe('string');
    });
  });

  // ── lock/heartbeat ──────────────────────────────────────────

  describe('lock/heartbeat', () => {
    it('returns true when we still hold the lock', async () => {
      await call('lock/acquire', session.id);
      const result = await call<Result<boolean>>(
        'lock/heartbeat',
        session.id
      );
      expect(result).toEqual({ ok: true, value: true });
    });

    it('returns false when we do not hold the lock', async () => {
      const result = await call<Result<boolean>>(
        'lock/heartbeat',
        session.id
      );
      expect(result).toEqual({ ok: true, value: false });
    });
  });

  // ── lock/is-leader ──────────────────────────────────────────

  describe('lock/is-leader', () => {
    it('returns true after acquire', async () => {
      await call('lock/acquire', session.id);
      const result = await call<Result<boolean>>(
        'lock/is-leader',
        session.id
      );
      expect(result).toEqual({ ok: true, value: true });
    });

    it('returns false when no lock exists', async () => {
      const result = await call<Result<boolean>>(
        'lock/is-leader',
        session.id
      );
      expect(result).toEqual({ ok: true, value: false });
    });
  });
});
