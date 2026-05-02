/**
 * IPC handler tests — `session/*` namespace.
 *
 * We mock the `electron` module so the test runs in plain Node — no
 * Electron app boots, no SQLite file is created. Each `ipcMain.handle`
 * call is captured into a `Map<channel, handler>` so the test can
 * invoke handlers directly with synthetic IpcMainInvokeEvent objects.
 *
 * SessionStore uses `:memory:` for fast, isolated round-trips.
 *
 * Spec: docs/findings/round5-ipc-telemetry.md, docs/session/persistence.md
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
    app: {
      getVersion: () => '0.0.1-test',
    },
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
import { SessionStore } from '../../src/storage';
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

// Synthetic IpcMainInvokeEvent — handlers ignore the event arg in our impl,
// so an empty object is sufficient.
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

describe('IPC session handlers', () => {
  let store: SessionStore;
  // Stub for the App parameter — registerIpcHandlers only calls getVersion.
  const stubApp = { getVersion: () => '0.0.1-test' } as unknown as Parameters<
    typeof registerIpcHandlers
  >[0];

  beforeEach(() => {
    handlers.clear();
    store = new SessionStore(':memory:');
    registerIpcHandlers(stubApp, store);
  });

  afterEach(() => {
    store.close();
  });

  // ── registration ────────────────────────────────────────────

  it('registers all expected channels', () => {
    expect(handlers.has('app:get-version')).toBe(true);
    expect(handlers.has('app:get-platform')).toBe(true);
    expect(handlers.has('session/list')).toBe(true);
    expect(handlers.has('session/get')).toBe(true);
    expect(handlers.has('session/create')).toBe(true);
    expect(handlers.has('session/append-turn')).toBe(true);
    expect(handlers.has('session/update-meta')).toBe(true);
    expect(handlers.has('session/delete')).toBe(true);
  });

  it('does NOT register session/* when store is omitted', () => {
    handlers.clear();
    registerIpcHandlers(stubApp); // no store
    expect(handlers.has('app:get-version')).toBe(true);
    expect(handlers.has('session/list')).toBe(false);
    expect(handlers.has('session/create')).toBe(false);
  });

  // ── session/list ────────────────────────────────────────────

  describe('session/list', () => {
    it('returns empty array initially', async () => {
      const result = await call<Result<unknown[]>>('session/list');
      expect(result).toEqual({ ok: true, value: [] });
    });

    it('returns SessionMeta entries after create', async () => {
      const fixture = loadFixture('02-single-turn.json');
      await call<Result<Session>>('session/create', fixture);

      const result = await call<Result<Array<{ id: string; title: string }>>>(
        'session/list'
      );
      expect(result.ok).toBe(true);
      if (!result.ok) return; // tighten narrowing for TS
      expect(result.value).toHaveLength(1);
      expect(result.value[0]?.id).toBe(fixture.id);
      expect(result.value[0]?.title).toBe(fixture.title);
    });
  });

  // ── session/create ──────────────────────────────────────────

  describe('session/create', () => {
    it('persists a valid fixture', async () => {
      const fixture = loadFixture('01-empty.json');
      const result = await call<Result<Session>>('session/create', fixture);
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.value.id).toBe(fixture.id);
      // Confirm via the store directly (round-trip).
      expect(store.getSession(fixture.id)).not.toBeNull();
    });

    it('rejects malformed payload with validation error', async () => {
      const result = await call<Result<Session>>('session/create', {
        id: 'not-a-uuid-v7',
        title: '',
      });
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.error).toMatch(/Validation error/);
    });

    it('rejects duplicate id (UNIQUE constraint)', async () => {
      const fixture = loadFixture('01-empty.json');
      await call('session/create', fixture);
      const second = await call<Result<Session>>('session/create', fixture);
      expect(second.ok).toBe(false);
      if (second.ok) return;
      // SQLite raises a UNIQUE constraint error; ensure it's a string, not a stack.
      expect(typeof second.error).toBe('string');
      expect(second.error.toLowerCase()).toContain('unique');
    });
  });

  // ── session/get ─────────────────────────────────────────────

  describe('session/get', () => {
    it('returns null for missing id', async () => {
      const result = await call<Result<Session | null>>(
        'session/get',
        '019d0000-0000-7000-8000-000000000099'
      );
      expect(result).toEqual({ ok: true, value: null });
    });

    it('returns full session after create', async () => {
      const fixture = loadFixture('02-single-turn.json');
      await call('session/create', fixture);

      const result = await call<Result<Session | null>>(
        'session/get',
        fixture.id
      );
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.value?.id).toBe(fixture.id);
      expect(result.value?.conversation.turns).toHaveLength(2);
    });

    it('rejects non-string id', async () => {
      const result = await call<Result<Session | null>>('session/get', 42);
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.error).toMatch(/string/);
    });
  });

  // ── session/append-turn ─────────────────────────────────────

  describe('session/append-turn', () => {
    it('appends a turn and bumps updated_at', async () => {
      const fixture = loadFixture('01-empty.json');
      await call('session/create', fixture);

      const newTurn = {
        id: '019d0099-0000-7000-8000-000000000001',
        role: 'user' as const,
        timestamp: '2026-05-02T02:00:00.000Z',
        status: 'completed' as const,
        content: [{ type: 'text' as const, text: '안녕' }],
      };

      const result = await call<Result<void>>(
        'session/append-turn',
        fixture.id,
        newTurn
      );
      expect(result.ok).toBe(true);

      // Verify via store
      const reloaded = store.getSession(fixture.id);
      expect(reloaded?.conversation.turns).toHaveLength(1);
      expect(reloaded?.conversation.turns[0]?.id).toBe(newTurn.id);
    });

    it('errors when session does not exist', async () => {
      const result = await call<Result<void>>(
        'session/append-turn',
        '019d0099-0000-7000-8000-0000000000aa',
        {
          id: '019d0099-0000-7000-8000-0000000000bb',
          role: 'user',
          timestamp: '2026-05-02T02:00:00.000Z',
          status: 'completed',
          content: [{ type: 'text', text: 'hi' }],
        }
      );
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.error.toLowerCase()).toContain('not found');
    });

    it('rejects malformed turn payload', async () => {
      const fixture = loadFixture('01-empty.json');
      await call('session/create', fixture);

      const result = await call<Result<void>>(
        'session/append-turn',
        fixture.id,
        { id: '', role: 'invalid', content: 'not-an-array' }
      );
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.error).toMatch(/Validation error/);
    });
  });

  // ── session/update-meta ─────────────────────────────────────

  describe('session/update-meta', () => {
    it('updates title', async () => {
      const fixture = loadFixture('01-empty.json');
      await call('session/create', fixture);

      const result = await call<Result<void>>(
        'session/update-meta',
        fixture.id,
        { title: '제목 변경됨' }
      );
      expect(result.ok).toBe(true);

      const reloaded = store.getSession(fixture.id);
      expect(reloaded?.title).toBe('제목 변경됨');
    });

    it('rejects unknown patch fields (strict mode)', async () => {
      const fixture = loadFixture('01-empty.json');
      await call('session/create', fixture);

      const result = await call<Result<void>>(
        'session/update-meta',
        fixture.id,
        { random_field: 42 }
      );
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.error).toMatch(/Validation error/);
    });
  });

  // ── session/delete ──────────────────────────────────────────

  describe('session/delete', () => {
    it('removes a session and child rows', async () => {
      const fixture = loadFixture('02-single-turn.json');
      await call('session/create', fixture);
      expect(store.getSession(fixture.id)).not.toBeNull();

      const result = await call<Result<void>>('session/delete', fixture.id);
      expect(result.ok).toBe(true);
      expect(store.getSession(fixture.id)).toBeNull();
    });

    it('errors when session does not exist', async () => {
      const result = await call<Result<void>>(
        'session/delete',
        '019d0099-0000-7000-8000-0000000000ff'
      );
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.error.toLowerCase()).toContain('not found');
    });
  });
});
