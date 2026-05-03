/**
 * IPC handler tests — `session/search` (v0.7.0 F-026 Chat Search).
 *
 * Covers:
 *   - Channel registration
 *   - Happy path: results returned wrapped in Result.ok
 *   - Empty / too-long / non-string `q` rejection (Zod)
 *   - Invalid `limit` rejection (negative / over 100)
 *   - Snippet contains the search term
 *   - Korean query
 *
 * Spec: docs/findings/round5-ipc-telemetry.md (Result wrapping)
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

type Handler = (evt: unknown, ...args: unknown[]) => unknown | Promise<unknown>;

const handlers = new Map<string, Handler>();

const sessionUserDataRef = vi.hoisted(() => ({ current: '' }));

vi.mock('electron', () => {
  return {
    app: {
      getVersion: () => '0.0.1-test',
      getPath: (_name: string): string => sessionUserDataRef.current,
    },
    ipcMain: {
      handle: (channel: string, handler: Handler): void => {
        handlers.set(channel, handler);
      },
      removeHandler: (channel: string): void => {
        handlers.delete(channel);
      },
    },
    dialog: {
      showOpenDialog: vi.fn(async () => ({ canceled: true, filePaths: [] })),
    },
  };
});

import { mkdtempSync, rmSync, existsSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { registerIpcHandlers } from '../../src/main/ipc';
import { __resetSettingsCache } from '../../src/main/settings';
import { SessionStore, type TurnSearchResult } from '../../src/storage';
import { SessionSchema, type Session, type Turn } from '../../src/types';
import type { Result } from '../../src/main/types';

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

function makeUserTurn(id: string, text: string, ts: string): Turn {
  return {
    id: id as Turn['id'],
    role: 'user',
    timestamp: ts,
    status: 'completed',
    content: [{ type: 'text', text }],
  };
}

describe('IPC session/search (v0.7.0 F-026)', () => {
  let store: SessionStore;
  let tmpUserData = '';
  const stubApp = {
    getVersion: () => '0.0.1-test',
    getPath: (_n: string) => sessionUserDataRef.current,
  } as unknown as Parameters<typeof registerIpcHandlers>[0];

  beforeEach(() => {
    handlers.clear();
    tmpUserData = mkdtempSync(join(tmpdir(), 'dreampia-ipc-search-'));
    sessionUserDataRef.current = tmpUserData;
    __resetSettingsCache();
    store = new SessionStore(':memory:');
    registerIpcHandlers(stubApp, store);
  });

  afterEach(() => {
    store.close();
    if (tmpUserData.length > 0 && existsSync(tmpUserData)) {
      rmSync(tmpUserData, { recursive: true, force: true });
    }
  });

  it('registers session/search channel', () => {
    expect(handlers.has('session/search')).toBe(true);
  });

  it('returns matching turns wrapped in Result.ok', async () => {
    const fixture = loadFixture('01-empty.json');
    await call('session/create', fixture);
    store.appendTurn(
      fixture.id,
      makeUserTurn(
        '019d0001-0000-7000-8000-000000000901',
        'a unique zebra appears here',
        '2026-05-02T01:00:00.000Z'
      )
    );

    const result = await call<Result<TurnSearchResult[]>>('session/search', {
      q: 'zebra',
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.length).toBe(1);
    expect(result.value[0]?.session_id).toBe(fixture.id);
    expect(result.value[0]?.snippet.toLowerCase()).toContain('zebra');
  });

  it('returns empty array when nothing matches', async () => {
    const fixture = loadFixture('01-empty.json');
    await call('session/create', fixture);
    store.appendTurn(
      fixture.id,
      makeUserTurn(
        '019d0001-0000-7000-8000-000000000902',
        'hello world',
        '2026-05-02T01:00:00.000Z'
      )
    );

    const result = await call<Result<TurnSearchResult[]>>('session/search', {
      q: 'somethingthatcannotmatch',
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value).toEqual([]);
  });

  it('rejects empty q (Zod min(1))', async () => {
    const result = await call<Result<TurnSearchResult[]>>('session/search', {
      q: '',
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toMatch(/Validation error/);
  });

  it('rejects q over 200 chars', async () => {
    const result = await call<Result<TurnSearchResult[]>>('session/search', {
      q: 'a'.repeat(201),
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toMatch(/Validation error/);
  });

  it('rejects unknown extra fields (strict mode)', async () => {
    const result = await call<Result<TurnSearchResult[]>>('session/search', {
      q: 'hello',
      extraStuff: true,
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toMatch(/Validation error/);
  });

  it('rejects negative limit', async () => {
    const result = await call<Result<TurnSearchResult[]>>('session/search', {
      q: 'hello',
      limit: -1,
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toMatch(/Validation error/);
  });

  it('rejects limit > 100', async () => {
    const result = await call<Result<TurnSearchResult[]>>('session/search', {
      q: 'hello',
      limit: 200,
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toMatch(/Validation error/);
  });

  it('Korean query works', async () => {
    const fixture = loadFixture('01-empty.json');
    await call('session/create', fixture);
    store.appendTurn(
      fixture.id,
      makeUserTurn(
        '019d0001-0000-7000-8000-000000000903',
        '안녕하세요 친구',
        '2026-05-02T01:00:00.000Z'
      )
    );

    const result = await call<Result<TurnSearchResult[]>>('session/search', {
      q: '안녕하세요',
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.length).toBe(1);
  });
});
