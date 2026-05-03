/**
 * IPC handler — `app:get-theme` / `app:set-theme` /
 *               `app:get-permission-capabilities` (v0.8.0 D1).
 *
 * 검증:
 *  - 채널 등록
 *  - get-theme 미지정 → 'system' 기본값
 *  - set-theme 영속 + 다음 get 에 반영
 *  - 알 수 없는 theme 값 거절
 *  - get-permission-capabilities — 4개 level 모두 string[] 로 반환
 *  - workspace_write 가 LOCAL_READ + LOCAL_WRITE 등을 포함
 *  - custom 은 빈 배열
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { join } from 'node:path';
import { mkdtempSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';

type Handler = (evt: unknown, ...args: unknown[]) => unknown | Promise<unknown>;

const handlers = new Map<string, Handler>();

const themeUserDataRef = vi.hoisted(() => ({ current: '' }));

vi.mock('electron', () => {
  return {
    app: {
      getVersion: () => '0.0.1-test',
      getPath: (_name: string): string => themeUserDataRef.current,
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

describe('IPC app:get-theme + app:set-theme + app:get-permission-capabilities (v0.8.0 D1)', () => {
  let tmpUserData = '';
  const stubApp = {
    getVersion: () => '0.0.1-test',
    getPath: (_n: string) => themeUserDataRef.current,
    isPackaged: false,
  } as unknown as Parameters<typeof registerIpcHandlers>[0];

  beforeEach(() => {
    handlers.clear();
    tmpUserData = mkdtempSync(join(tmpdir(), 'dreampia-ipc-theme-'));
    themeUserDataRef.current = tmpUserData;
    __resetSettingsCache();
    registerIpcHandlers(stubApp);
  });

  afterEach(() => {
    if (tmpUserData.length > 0 && existsSync(tmpUserData)) {
      rmSync(tmpUserData, { recursive: true, force: true });
    }
  });

  it('registers all three channels', () => {
    expect(handlers.has('app:get-theme')).toBe(true);
    expect(handlers.has('app:set-theme')).toBe(true);
    expect(handlers.has('app:get-permission-capabilities')).toBe(true);
  });

  it('app:get-theme returns "system" when settings missing', async () => {
    const result = await call<Result<'light' | 'dark' | 'system'>>('app:get-theme');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value).toBe('system');
  });

  it('app:set-theme persists and subsequent get returns it', async () => {
    const setResult = await call<Result<void>>('app:set-theme', 'dark');
    expect(setResult.ok).toBe(true);

    __resetSettingsCache(); // simulate next process
    const getResult = await call<Result<'light' | 'dark' | 'system'>>('app:get-theme');
    expect(getResult.ok).toBe(true);
    if (!getResult.ok) return;
    expect(getResult.value).toBe('dark');
  });

  it('app:set-theme rejects invalid string', async () => {
    const result = await call<Result<void>>('app:set-theme', 'sepia');
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toMatch(/theme must be one of/);
  });

  it('app:set-theme rejects non-string', async () => {
    const result = await call<Result<void>>('app:set-theme', 42);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toMatch(/theme must be one of/);
  });

  it('app:get-permission-capabilities returns all 4 levels as string arrays', async () => {
    const result = await call<
      Result<Record<'read_only' | 'workspace_write' | 'full_access' | 'custom', string[]>>
    >('app:get-permission-capabilities');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(Array.isArray(result.value.read_only)).toBe(true);
    expect(Array.isArray(result.value.workspace_write)).toBe(true);
    expect(Array.isArray(result.value.full_access)).toBe(true);
    expect(Array.isArray(result.value.custom)).toBe(true);
  });

  it('workspace_write capabilities include LOCAL_READ + LOCAL_WRITE', async () => {
    const result = await call<
      Result<Record<'read_only' | 'workspace_write' | 'full_access' | 'custom', string[]>>
    >('app:get-permission-capabilities');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.workspace_write).toContain('LOCAL_READ');
    expect(result.value.workspace_write).toContain('LOCAL_WRITE');
  });

  it('custom level returns empty array', async () => {
    const result = await call<
      Result<Record<'read_only' | 'workspace_write' | 'full_access' | 'custom', string[]>>
    >('app:get-permission-capabilities');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.custom).toEqual([]);
  });
});
