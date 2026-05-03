/**
 * IPC handler — `session/update-permission` (v0.8.0 H Permission Dropdown).
 *
 * 검증:
 *  - 채널 등록
 *  - default_level 변경 round-trip + 반환된 Session 의 default_level 일치
 *  - strict mode — unknown 필드 거절
 *  - invalid enum 거절
 *  - 존재하지 않는 session 에러
 *  - non-string sessionId 거절
 *  - 빈 patch (default_level 미지정) 시 그대로 반환 (no-op)
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { mkdtempSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';

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

import { registerIpcHandlers } from '../../src/main/ipc';
import { __resetSettingsCache } from '../../src/main/settings';
import { SessionStore } from '../../src/storage';
import { SessionSchema, type Session } from '../../src/types';
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

describe('IPC session/update-permission (v0.8.0 H)', () => {
  let store: SessionStore;
  let tmpUserData = '';
  const stubApp = {
    getVersion: () => '0.0.1-test',
    getPath: (_n: string) => sessionUserDataRef.current,
  } as unknown as Parameters<typeof registerIpcHandlers>[0];

  beforeEach(() => {
    handlers.clear();
    tmpUserData = mkdtempSync(join(tmpdir(), 'dreampia-ipc-perm-'));
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

  it('registers session/update-permission channel', () => {
    expect(handlers.has('session/update-permission')).toBe(true);
  });

  it('updates default_level and returns the updated session', async () => {
    const fixture = loadFixture('01-empty.json');
    await call('session/create', fixture);

    const result = await call<Result<Session>>(
      'session/update-permission',
      fixture.id,
      { default_level: 'full_access' }
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.permission.default_level).toBe('full_access');
    // store 에서도 동일.
    expect(store.getSession(fixture.id)?.permission.default_level).toBe('full_access');
  });

  it('rejects unknown patch fields (strict mode)', async () => {
    const fixture = loadFixture('01-empty.json');
    await call('session/create', fixture);
    const result = await call<Result<Session>>(
      'session/update-permission',
      fixture.id,
      { random_field: 42 }
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toMatch(/Validation error/);
  });

  it('rejects invalid permission enum', async () => {
    const fixture = loadFixture('01-empty.json');
    await call('session/create', fixture);
    const result = await call<Result<Session>>(
      'session/update-permission',
      fixture.id,
      { default_level: 'admin' }
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toMatch(/Validation error/);
  });

  it('errors when session does not exist', async () => {
    const result = await call<Result<Session>>(
      'session/update-permission',
      '019d0099-0000-7000-8000-0000000000bb',
      { default_level: 'read_only' }
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.toLowerCase()).toContain('not found');
  });

  it('rejects non-string session id', async () => {
    const result = await call<Result<Session>>(
      'session/update-permission',
      null,
      { default_level: 'read_only' }
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toMatch(/string/);
  });
});
