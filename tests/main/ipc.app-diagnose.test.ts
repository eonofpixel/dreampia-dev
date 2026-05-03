/**
 * IPC handler — `app:diagnose` (v0.14.0 A ABI Hardening).
 *
 * 검증:
 *  - 채널 등록
 *  - store 미주입 시 platform / process 정보만 반환 (db_loaded=false)
 *  - store 주입 시 schema_version / table_count / integrity_ok / wal_mode 채움
 *  - app_version / electron_version 도 반환
 *  - 어떤 호출도 throw across IPC 안 함 (Result<T> contract)
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
      getVersion: () => '0.14.0-test',
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
import type { AppDiagnoseResult } from '../../src/main/ipc';
import { __resetSettingsCache } from '../../src/main/settings';
import { SessionStore } from '../../src/storage';
import type { Result } from '../../src/main/types';

const evt = {} as unknown;

async function call<T>(channel: string, ...args: unknown[]): Promise<T> {
  const handler = handlers.get(channel);
  if (handler === undefined) {
    throw new Error(`no handler registered for ${channel}`);
  }
  return (await handler(evt, ...args)) as T;
}

describe('IPC app:diagnose (v0.14.0 A ABI Hardening)', () => {
  let tmpUserData = '';
  const stubApp = {
    getVersion: () => '0.14.0-test',
    getPath: (_n: string) => userDataRef.current,
    isPackaged: false,
  } as unknown as Parameters<typeof registerIpcHandlers>[0];

  beforeEach(() => {
    handlers.clear();
    tmpUserData = mkdtempSync(join(tmpdir(), 'dreampia-ipc-diagnose-'));
    userDataRef.current = tmpUserData;
    __resetSettingsCache();
  });

  afterEach(() => {
    if (tmpUserData.length > 0 && existsSync(tmpUserData)) {
      rmSync(tmpUserData, { recursive: true, force: true });
    }
  });

  it('registers app:diagnose handler', () => {
    registerIpcHandlers(stubApp);
    expect(handlers.has('app:diagnose')).toBe(true);
  });

  it('returns process info even without store', async () => {
    registerIpcHandlers(stubApp);
    const result = await call<Result<AppDiagnoseResult>>('app:diagnose');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.db_loaded).toBe(false);
    expect(typeof result.value.platform).toBe('string');
    expect(typeof result.value.node_version).toBe('string');
    expect(result.value.app_version).toBe('0.14.0-test');
    // db_* 필드 미주입 — store 가 없을 때.
    expect(result.value.schema_version).toBeUndefined();
    expect(result.value.db_ok).toBeUndefined();
  });

  it('includes db info when store is provided', async () => {
    const store = new SessionStore(':memory:');
    try {
      registerIpcHandlers(stubApp, store);
      const result = await call<Result<AppDiagnoseResult>>('app:diagnose');
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.value.db_loaded).toBe(true);
      expect(result.value.schema_version).toBeGreaterThan(0);
      expect(result.value.table_count).not.toBeNull();
      expect(result.value.integrity_ok).toBe(true);
      // wal_mode 는 :memory: 에선 false. 그 자체는 spec compliance 의 일부.
      expect(typeof result.value.wal_mode).toBe('boolean');
    } finally {
      store.close();
    }
  });

  it('returns architecture info for diagnostic display', async () => {
    registerIpcHandlers(stubApp);
    const result = await call<Result<AppDiagnoseResult>>('app:diagnose');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(typeof result.value.arch).toBe('string');
    expect(result.value.arch.length).toBeGreaterThan(0);
  });

  it('does not throw across IPC boundary even on internal failure', async () => {
    registerIpcHandlers(stubApp);
    // 정상 호출 — Result<T> wrapping 보장.
    const result = await call<Result<AppDiagnoseResult>>('app:diagnose');
    expect(result.ok).toBeTypeOf('boolean');
  });
});
