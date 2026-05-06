/**
 * IPC handler — `app:get-direct-api-keys` / `app:set-direct-api-key` (v1.5.0).
 *
 * 검증:
 *  - 채널 등록
 *  - get 미설정 → present=false, preview=null
 *  - set + reload → present=true, preview=마지막 4글자
 *  - 빈 문자열 set → 삭제 (present=false)
 *  - 4글자 이하 키 → preview='****' (raw 노출 X)
 *  - invalid provider 거절
 *  - non-string key 거절
 *  - 길이 상한 초과 (1024+) 거절
 *  - 양 provider 독립적으로 저장됨
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { join } from 'node:path';
import { mkdtempSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';

type Handler = (evt: unknown, ...args: unknown[]) => unknown | Promise<unknown>;

const handlers = new Map<string, Handler>();

const directApiUserDataRef = vi.hoisted(() => ({ current: '' }));

vi.mock('electron', () => {
  return {
    app: {
      getVersion: () => '0.0.1-test',
      getPath: (_name: string): string => directApiUserDataRef.current,
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

interface DirectApiKeysShape {
  anthropic: { present: boolean; preview: string | null };
  openai: { present: boolean; preview: string | null };
}

const evt = {} as unknown;

async function call<T>(channel: string, ...args: unknown[]): Promise<T> {
  const handler = handlers.get(channel);
  if (handler === undefined) {
    throw new Error(`no handler registered for ${channel}`);
  }
  return (await handler(evt, ...args)) as T;
}

describe('IPC app:get-direct-api-keys + app:set-direct-api-key (v1.5.0)', () => {
  let tmpUserData = '';
  const stubApp = {
    getVersion: () => '0.0.1-test',
    getPath: (_n: string) => directApiUserDataRef.current,
    isPackaged: false,
  } as unknown as Parameters<typeof registerIpcHandlers>[0];

  beforeEach(() => {
    handlers.clear();
    tmpUserData = mkdtempSync(join(tmpdir(), 'dreampia-ipc-direct-api-'));
    directApiUserDataRef.current = tmpUserData;
    __resetSettingsCache();
    registerIpcHandlers(stubApp);
  });

  afterEach(() => {
    if (tmpUserData.length > 0 && existsSync(tmpUserData)) {
      rmSync(tmpUserData, { recursive: true, force: true });
    }
  });

  it('registers both channels', () => {
    expect(handlers.has('app:get-direct-api-keys')).toBe(true);
    expect(handlers.has('app:set-direct-api-key')).toBe(true);
  });

  it('get returns present=false / preview=null when settings missing', async () => {
    const result = await call<Result<DirectApiKeysShape>>('app:get-direct-api-keys');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.anthropic.present).toBe(false);
    expect(result.value.anthropic.preview).toBeNull();
    expect(result.value.openai.present).toBe(false);
    expect(result.value.openai.preview).toBeNull();
  });

  it('set anthropic + reload returns present=true with last 4 chars preview', async () => {
    const setResult = await call<Result<void>>(
      'app:set-direct-api-key',
      'anthropic',
      'sk-ant-api-XYZW1234'
    );
    expect(setResult.ok).toBe(true);

    __resetSettingsCache();
    const getResult = await call<Result<DirectApiKeysShape>>('app:get-direct-api-keys');
    expect(getResult.ok).toBe(true);
    if (!getResult.ok) return;
    expect(getResult.value.anthropic.present).toBe(true);
    expect(getResult.value.anthropic.preview).toBe('1234');
    // openai 는 영향 받지 않아야 함
    expect(getResult.value.openai.present).toBe(false);
  });

  it('set openai independently from anthropic', async () => {
    await call<Result<void>>('app:set-direct-api-key', 'anthropic', 'sk-ant-AAAAaaaa');
    await call<Result<void>>('app:set-direct-api-key', 'openai', 'sk-BBBBbbbb');

    __resetSettingsCache();
    const getResult = await call<Result<DirectApiKeysShape>>('app:get-direct-api-keys');
    expect(getResult.ok).toBe(true);
    if (!getResult.ok) return;
    expect(getResult.value.anthropic.preview).toBe('aaaa');
    expect(getResult.value.openai.preview).toBe('bbbb');
  });

  it('empty string clears the key', async () => {
    await call<Result<void>>('app:set-direct-api-key', 'anthropic', 'sk-ant-Q1234567');
    __resetSettingsCache();
    let r = await call<Result<DirectApiKeysShape>>('app:get-direct-api-keys');
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.anthropic.present).toBe(true);

    const clearResult = await call<Result<void>>('app:set-direct-api-key', 'anthropic', '');
    expect(clearResult.ok).toBe(true);

    __resetSettingsCache();
    r = await call<Result<DirectApiKeysShape>>('app:get-direct-api-keys');
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.anthropic.present).toBe(false);
    expect(r.value.anthropic.preview).toBeNull();
  });

  it('whitespace-only key is treated as empty (clears)', async () => {
    await call<Result<void>>('app:set-direct-api-key', 'anthropic', 'sk-ant-Q1234567');
    __resetSettingsCache();
    const setResult = await call<Result<void>>('app:set-direct-api-key', 'anthropic', '   ');
    expect(setResult.ok).toBe(true);
    __resetSettingsCache();
    const r = await call<Result<DirectApiKeysShape>>('app:get-direct-api-keys');
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.anthropic.present).toBe(false);
  });

  it('short key (<=4 chars) returns "****" preview (no raw exposure)', async () => {
    // 정상 사용 시나리오는 아니지만 보안 안전망 검증
    await call<Result<void>>('app:set-direct-api-key', 'anthropic', 'sk');
    __resetSettingsCache();
    const r = await call<Result<DirectApiKeysShape>>('app:get-direct-api-keys');
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.anthropic.present).toBe(true);
    expect(r.value.anthropic.preview).toBe('****');
  });

  it('rejects unknown provider', async () => {
    const r = await call<Result<void>>('app:set-direct-api-key', 'azure', 'sk-azure');
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error).toMatch(/provider must be/);
  });

  it('rejects non-string key', async () => {
    const r = await call<Result<void>>('app:set-direct-api-key', 'anthropic', 42);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error).toMatch(/key must be a string/);
  });

  it('rejects key over 1024 chars', async () => {
    const huge = 'a'.repeat(1025);
    const r = await call<Result<void>>('app:set-direct-api-key', 'anthropic', huge);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error).toMatch(/key too long/);
  });

  it('preview never includes more than 4 chars (security invariant)', async () => {
    await call<Result<void>>('app:set-direct-api-key', 'anthropic', 'sk-ant-very-long-secret-XYZW1234');
    __resetSettingsCache();
    const r = await call<Result<DirectApiKeysShape>>('app:get-direct-api-keys');
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.anthropic.preview!.length).toBeLessThanOrEqual(4);
  });
});
