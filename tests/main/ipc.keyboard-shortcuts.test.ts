/**
 * IPC handler — `app:get-keyboard-shortcuts` / `app:set-keyboard-shortcuts`
 *               (v0.10.0 G F-025).
 *
 * 검증:
 *  - 채널 등록
 *  - 미설정 → 빈 object
 *  - set 영속 + 다음 get 에 반영
 *  - 잘못된 입력 거절 (array / null / number)
 *  - 빈 / non-string 값 silent drop
 *  - 빈 object 로 reset (모든 override 제거)
 *  - 길이 상한 (>64) drop
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { join } from 'node:path';
import { mkdtempSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';

type Handler = (evt: unknown, ...args: unknown[]) => unknown | Promise<unknown>;

const handlers = new Map<string, Handler>();

const userDataRef = vi.hoisted(() => ({ current: '' }));

vi.mock('electron', () => {
  return {
    app: {
      getVersion: () => '0.0.1-test',
      getPath: (_name: string): string => userDataRef.current,
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
    dialog: {
      showOpenDialog: vi.fn(async () => ({ canceled: true, filePaths: [] })),
    },
  };
});

import { registerIpcHandlers } from '../../src/main/ipc';
import { __resetSettingsCache } from '../../src/main/settings';
import type { Result } from '../../src/main/types';

const evt = {} as unknown;

async function call<T>(channel: string, ...args: unknown[]): Promise<T> {
  const handler = handlers.get(channel);
  if (handler === undefined) {
    throw new Error(`no handler registered for ${channel}`);
  }
  return (await handler(evt, ...args)) as T;
}

describe('IPC app:get-keyboard-shortcuts / app:set-keyboard-shortcuts (v0.10.0 G F-025)', () => {
  let tmpUserData = '';
  const stubApp = {
    getVersion: () => '0.0.1-test',
    getPath: (_n: string) => userDataRef.current,
    isPackaged: false,
  } as unknown as Parameters<typeof registerIpcHandlers>[0];

  beforeEach(() => {
    handlers.clear();
    tmpUserData = mkdtempSync(join(tmpdir(), 'dreampia-ipc-keyboard-'));
    userDataRef.current = tmpUserData;
    __resetSettingsCache();
    registerIpcHandlers(stubApp);
  });

  afterEach(() => {
    if (tmpUserData.length > 0 && existsSync(tmpUserData)) {
      rmSync(tmpUserData, { recursive: true, force: true });
    }
  });

  it('registers both channels', () => {
    expect(handlers.has('app:get-keyboard-shortcuts')).toBe(true);
    expect(handlers.has('app:set-keyboard-shortcuts')).toBe(true);
  });

  it('returns empty object when no overrides set', async () => {
    const r = await call<Result<Record<string, string>>>(
      'app:get-keyboard-shortcuts'
    );
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value).toEqual({});
  });

  it('persists valid overrides', async () => {
    const r1 = await call<Result<void>>('app:set-keyboard-shortcuts', {
      'search.focus': 'Mod+J',
      'usage.open': 'Mod+Y',
    });
    expect(r1.ok).toBe(true);
    const r2 = await call<Result<Record<string, string>>>(
      'app:get-keyboard-shortcuts'
    );
    expect(r2.ok).toBe(true);
    if (r2.ok) {
      expect(r2.value).toEqual({
        'search.focus': 'Mod+J',
        'usage.open': 'Mod+Y',
      });
    }
  });

  it('rejects array input', async () => {
    const r = await call<Result<void>>('app:set-keyboard-shortcuts', ['x']);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/plain object/);
  });

  it('rejects null input', async () => {
    const r = await call<Result<void>>('app:set-keyboard-shortcuts', null);
    expect(r.ok).toBe(false);
  });

  it('silently drops non-string values', async () => {
    const r1 = await call<Result<void>>('app:set-keyboard-shortcuts', {
      'search.focus': 'Mod+J',
      'usage.open': 42,
      'chat.new': null,
    });
    expect(r1.ok).toBe(true);
    const r2 = await call<Result<Record<string, string>>>(
      'app:get-keyboard-shortcuts'
    );
    if (r2.ok) {
      expect(r2.value).toEqual({ 'search.focus': 'Mod+J' });
    }
  });

  it('silently drops empty string values', async () => {
    const r1 = await call<Result<void>>('app:set-keyboard-shortcuts', {
      'search.focus': '',
      'usage.open': 'Mod+Y',
    });
    expect(r1.ok).toBe(true);
    const r2 = await call<Result<Record<string, string>>>(
      'app:get-keyboard-shortcuts'
    );
    if (r2.ok) {
      expect(r2.value).toEqual({ 'usage.open': 'Mod+Y' });
    }
  });

  it('reset via empty object', async () => {
    await call<Result<void>>('app:set-keyboard-shortcuts', {
      'search.focus': 'Mod+J',
    });
    const r1 = await call<Result<void>>('app:set-keyboard-shortcuts', {});
    expect(r1.ok).toBe(true);
    const r2 = await call<Result<Record<string, string>>>(
      'app:get-keyboard-shortcuts'
    );
    if (r2.ok) {
      expect(r2.value).toEqual({});
    }
  });

  it('drops keys / values longer than 64 chars', async () => {
    const long = 'Mod+' + 'A'.repeat(70);
    const longKey = 'a'.repeat(70);
    const r1 = await call<Result<void>>('app:set-keyboard-shortcuts', {
      'search.focus': long, // value too long
      [longKey]: 'Mod+K', // key too long
      'usage.open': 'Mod+Y', // valid
    });
    expect(r1.ok).toBe(true);
    const r2 = await call<Result<Record<string, string>>>(
      'app:get-keyboard-shortcuts'
    );
    if (r2.ok) {
      expect(r2.value).toEqual({ 'usage.open': 'Mod+Y' });
    }
  });

  it('round-trip preserves shape across multiple writes', async () => {
    await call<Result<void>>('app:set-keyboard-shortcuts', {
      'search.focus': 'Mod+J',
    });
    await call<Result<void>>('app:set-keyboard-shortcuts', {
      'search.focus': 'Mod+J',
      'chat.new': 'Mod+T',
    });
    const r = await call<Result<Record<string, string>>>(
      'app:get-keyboard-shortcuts'
    );
    if (r.ok) {
      expect(r.value).toEqual({
        'search.focus': 'Mod+J',
        'chat.new': 'Mod+T',
      });
    }
  });
});
