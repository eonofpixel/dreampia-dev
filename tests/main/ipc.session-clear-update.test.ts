/**
 * IPC handler tests — `session/clear-turns` + `session/update-conversation` (v0.5.0 F-018).
 *
 * 새 명령:
 *   - session/clear-turns: 현재 세션의 모든 turn 삭제 (session 자체는 유지)
 *   - session/update-conversation: current_model / current_effort / current_mode 갱신
 *
 * 검증:
 *   - 채널 등록 여부
 *   - 정상 동작 (round-trip)
 *   - 잘못된 sessionId / patch 거절
 *   - 존재하지 않는 session 에러 메시지 형식
 *
 * Spec: docs/ux/patterns/F-018-slash-commands.md
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

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

import { mkdtempSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
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

describe('IPC session/clear-turns + session/update-conversation (v0.5.0 F-018)', () => {
  let store: SessionStore;
  let tmpUserData = '';
  const stubApp = {
    getVersion: () => '0.0.1-test',
    getPath: (_n: string) => sessionUserDataRef.current,
  } as unknown as Parameters<typeof registerIpcHandlers>[0];

  beforeEach(() => {
    handlers.clear();
    tmpUserData = mkdtempSync(join(tmpdir(), 'dreampia-ipc-clear-update-'));
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

  it('registers both new channels', () => {
    expect(handlers.has('session/clear-turns')).toBe(true);
    expect(handlers.has('session/update-conversation')).toBe(true);
  });

  // ── session/clear-turns ────────────────────────────────────

  describe('session/clear-turns', () => {
    it('removes all turns but keeps the session', async () => {
      const fixture = loadFixture('02-single-turn.json');
      await call('session/create', fixture);
      expect(store.getSession(fixture.id)?.conversation.turns).toHaveLength(2);

      const result = await call<Result<void>>('session/clear-turns', fixture.id);
      expect(result.ok).toBe(true);

      const reloaded = store.getSession(fixture.id);
      expect(reloaded).not.toBeNull();
      expect(reloaded?.conversation.turns).toHaveLength(0);
    });

    it('preserves current_model / current_effort after clear', async () => {
      const fixture = loadFixture('02-single-turn.json');
      await call('session/create', fixture);
      const originalModel = fixture.conversation.current_model;
      const originalEffort = fixture.conversation.current_effort;

      await call('session/clear-turns', fixture.id);

      const reloaded = store.getSession(fixture.id);
      expect(reloaded?.conversation.current_model).toBe(originalModel);
      expect(reloaded?.conversation.current_effort).toBe(originalEffort);
    });

    it('rejects non-string session id', async () => {
      const result = await call<Result<void>>('session/clear-turns', 42);
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.error).toMatch(/string/);
    });

    it('errors when session does not exist', async () => {
      const result = await call<Result<void>>(
        'session/clear-turns',
        '019d0099-0000-7000-8000-0000000000ee'
      );
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.error.toLowerCase()).toContain('not found');
    });
  });

  // ── session/update-conversation ────────────────────────────

  describe('session/update-conversation', () => {
    it('updates current_model and returns the updated session', async () => {
      const fixture = loadFixture('01-empty.json');
      await call('session/create', fixture);

      const result = await call<Result<Session>>(
        'session/update-conversation',
        fixture.id,
        { current_model: 'claude-3-5-sonnet-20241022' }
      );
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.value.conversation.current_model).toBe(
        'claude-3-5-sonnet-20241022'
      );
      // store 에서도 동일.
      expect(store.getSession(fixture.id)?.conversation.current_model).toBe(
        'claude-3-5-sonnet-20241022'
      );
    });

    it('updates current_effort + current_mode together', async () => {
      const fixture = loadFixture('01-empty.json');
      await call('session/create', fixture);

      const result = await call<Result<Session>>(
        'session/update-conversation',
        fixture.id,
        { current_effort: 'maximum', current_mode: 'plan' }
      );
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.value.conversation.current_effort).toBe('maximum');
      expect(result.value.conversation.current_mode).toBe('plan');
    });

    it('rejects unknown patch fields (strict mode)', async () => {
      const fixture = loadFixture('01-empty.json');
      await call('session/create', fixture);

      const result = await call<Result<Session>>(
        'session/update-conversation',
        fixture.id,
        { random_field: 42 }
      );
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.error).toMatch(/Validation error/);
    });

    it('rejects invalid effort enum', async () => {
      const fixture = loadFixture('01-empty.json');
      await call('session/create', fixture);

      const result = await call<Result<Session>>(
        'session/update-conversation',
        fixture.id,
        { current_effort: 'super-saiyan' }
      );
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.error).toMatch(/Validation error/);
    });

    it('errors when session does not exist', async () => {
      const result = await call<Result<Session>>(
        'session/update-conversation',
        '019d0099-0000-7000-8000-0000000000aa',
        { current_model: 'gpt-4o' }
      );
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.error.toLowerCase()).toContain('not found');
    });

    it('rejects non-string session id', async () => {
      const result = await call<Result<Session>>(
        'session/update-conversation',
        null,
        { current_model: 'gpt-4o' }
      );
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.error).toMatch(/string/);
    });
  });
});
