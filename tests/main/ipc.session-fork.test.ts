/**
 * IPC handler — `session/fork` (v1.6.3).
 *
 * 검증:
 *  - 채널 등록.
 *  - 정상 fork → 새 session id 반환 + parent_session_id 설정.
 *  - title 옵션 전달 / truncateAt 전달.
 *  - 빈 parentId / non-string → fail.
 *  - options 가 array → fail.
 *  - parent 미존재 → fail.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { readFileSync, mkdtempSync, rmSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';

type Handler = (evt: unknown, ...args: unknown[]) => unknown | Promise<unknown>;
const handlers = new Map<string, Handler>();

const forkUserDataRef = vi.hoisted(() => ({ current: '' }));

vi.mock('electron', () => ({
  app: {
    getVersion: () => '0.0.1-test',
    getPath: () => forkUserDataRef.current,
    isPackaged: false,
  },
  ipcMain: {
    handle: (channel: string, handler: Handler): void => {
      handlers.set(channel, handler);
    },
    removeHandler: (channel: string): void => {
      handlers.delete(channel);
    },
  },
  dialog: { showOpenDialog: vi.fn() },
}));

import { registerIpcHandlers } from '../../src/main/ipc';
import { __resetSettingsCache } from '../../src/main/settings';
import { SessionStore } from '../../src/storage';
import { SessionSchema, type Session } from '../../src/types';
import { resetAutomationManagerForTesting } from '../../src/main/automation/AutomationManager';
import type { Result } from '../../src/main/types';

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURES_DIR = join(__dirname, '..', 'fixtures', 'sessions');

function loadFixture(name: string): Session {
  const raw = JSON.parse(readFileSync(join(FIXTURES_DIR, name), 'utf-8'));
  return SessionSchema.parse(raw);
}

const evt = {} as unknown;

async function call<T>(channel: string, ...args: unknown[]): Promise<T> {
  const h = handlers.get(channel);
  if (h === undefined) throw new Error(`no handler: ${channel}`);
  return (await h(evt, ...args)) as T;
}

describe('IPC session/fork (v1.6.3)', () => {
  let store: SessionStore;
  let tmpDir = '';
  const stubApp = {
    getVersion: () => '0.0.1-test',
    getPath: () => forkUserDataRef.current,
    isPackaged: false,
  } as unknown as Parameters<typeof registerIpcHandlers>[0];

  beforeEach(() => {
    handlers.clear();
    resetAutomationManagerForTesting();
    tmpDir = mkdtempSync(join(tmpdir(), 'dreampia-fork-ipc-'));
    forkUserDataRef.current = tmpDir;
    __resetSettingsCache();
    store = new SessionStore(':memory:');
    registerIpcHandlers(stubApp, store);
  });

  afterEach(() => {
    store.close();
    resetAutomationManagerForTesting();
    if (tmpDir.length > 0 && existsSync(tmpDir)) {
      rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it('channel registered', () => {
    expect(handlers.has('session/fork')).toBe(true);
  });

  it('정상 fork → 새 id + parent_session_id 설정', async () => {
    const parent = loadFixture('02-single-turn.json');
    store.createSession(parent);
    const r = await call<Result<{ id: string }>>('session/fork', parent.id);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.id).not.toBe(parent.id);
    const child = store.getSession(r.value.id as Session['id']);
    expect(child).not.toBeNull();
    expect(child!.parent_session_id).toBe(parent.id);
  });

  it('title 옵션 전달', async () => {
    const parent = loadFixture('02-single-turn.json');
    store.createSession(parent);
    const r = await call<Result<{ id: string }>>('session/fork', parent.id, {
      title: '새 가지',
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(store.getSession(r.value.id as Session['id'])!.title).toBe('새 가지');
  });

  it('빈 parentId → fail', async () => {
    const r = await call<Result<{ id: string }>>('session/fork', '');
    expect(r.ok).toBe(false);
  });

  it('non-string parentId → fail', async () => {
    const r = await call<Result<{ id: string }>>('session/fork', 42);
    expect(r.ok).toBe(false);
  });

  it('options 가 array → fail', async () => {
    const parent = loadFixture('02-single-turn.json');
    store.createSession(parent);
    const r = await call<Result<{ id: string }>>(
      'session/fork',
      parent.id,
      ['bad']
    );
    expect(r.ok).toBe(false);
  });

  it('parent 미존재 → fail', async () => {
    // 형식만 맞는 가짜 UUIDv7.
    const r = await call<Result<{ id: string }>>(
      'session/fork',
      '019d-zzzz-aaaa-bbbb-cccc-dddd-eeee'
    );
    expect(r.ok).toBe(false);
  });
});
