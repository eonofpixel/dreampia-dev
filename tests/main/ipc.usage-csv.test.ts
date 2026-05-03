/**
 * IPC handler tests — usage/export-csv + usage/get-limits + usage/set-limits (v0.9.0).
 *
 * UsageStore 자체 export 테스트는 storage/UsageStore.csv.test.ts. 여기선
 * IPC 경계의 Result wrapping / Zod validation / settings.json round-trip 검증.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { UsageRangeFilter, UsageStore } from '../../src/storage';

type Handler = (evt: unknown, ...args: unknown[]) => unknown | Promise<unknown>;
const handlers = new Map<string, Handler>();
const userDataRef = vi.hoisted(() => ({ current: '' }));

vi.mock('electron', () => {
  return {
    app: {
      getVersion: () => '0.9.0-test',
      getPath: (_name: string) => userDataRef.current,
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
  };
});

import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { mkdtempSync, rmSync } from 'node:fs';
import { registerIpcHandlers } from '../../src/main/ipc';
import { __resetSettingsCache } from '../../src/main/settings';
import type { Result } from '../../src/main/types';

const evt = {} as unknown;
const stubApp = { getVersion: () => '0.9.0-test' } as unknown as Parameters<
  typeof registerIpcHandlers
>[0];

async function call<T>(channel: string, ...args: unknown[]): Promise<T> {
  const handler = handlers.get(channel);
  if (handler === undefined) {
    throw new Error(`no handler registered for ${channel}`);
  }
  return (await handler(evt, ...args)) as T;
}

interface StubUsageStore {
  store: UsageStore;
  exportCalls: UsageRangeFilter[];
  csvOut: string;
  setCsv: (csv: string) => void;
  setThrow: (msg: string | null) => void;
}

function makeStubStore(): StubUsageStore {
  const exportCalls: UsageRangeFilter[] = [];
  let csvOut = '';
  let throwMsg: string | null = null;
  const stub = {
    recordEvent: () => {
      throw new Error('not implemented in stub');
    },
    getSummary: () => [],
    getDailyTotals: () => [],
    getBySession: () => [],
    exportCsv: (filter: UsageRangeFilter) => {
      exportCalls.push(filter);
      if (throwMsg !== null) throw new Error(throwMsg);
      return csvOut;
    },
  } as unknown as UsageStore;
  return {
    store: stub,
    exportCalls,
    get csvOut(): string {
      return csvOut;
    },
    setCsv: (csv) => {
      csvOut = csv;
    },
    setThrow: (msg) => {
      throwMsg = msg;
    },
  };
}

describe('IPC usage/export-csv (v0.9.0)', () => {
  let tempDir: string;

  beforeEach(() => {
    handlers.clear();
    tempDir = mkdtempSync(join(tmpdir(), 'dreampia-usage-csv-'));
    userDataRef.current = tempDir;
    __resetSettingsCache();
  });

  afterEach(() => {
    __resetSettingsCache();
    try {
      rmSync(tempDir, { recursive: true, force: true });
    } catch {
      // ignore
    }
  });

  it('returns CSV string wrapped in Result.ok', async () => {
    const stub = makeStubStore();
    stub.setCsv('header\nrow1\n');
    registerIpcHandlers(stubApp, undefined, undefined, undefined, undefined, undefined, undefined, stub.store);
    const result = await call<Result<string>>('usage/export-csv', {});
    expect(result).toEqual({ ok: true, value: 'header\nrow1\n' });
  });

  it('forwards range filter (from/to/provider) to UsageStore.exportCsv', async () => {
    const stub = makeStubStore();
    stub.setCsv('csv');
    registerIpcHandlers(stubApp, undefined, undefined, undefined, undefined, undefined, undefined, stub.store);
    await call('usage/export-csv', {
      from: '2026-05-01T00:00:00.000Z',
      to: '2026-06-01T00:00:00.000Z',
      provider: 'claude',
    });
    expect(stub.exportCalls).toHaveLength(1);
    expect(stub.exportCalls[0]).toEqual({
      from: '2026-05-01T00:00:00.000Z',
      to: '2026-06-01T00:00:00.000Z',
      provider: 'claude',
    });
  });

  it('rejects invalid provider with Zod error in Result.error', async () => {
    const stub = makeStubStore();
    registerIpcHandlers(stubApp, undefined, undefined, undefined, undefined, undefined, undefined, stub.store);
    const result = await call<Result<string>>('usage/export-csv', {
      provider: 'invalid-provider',
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toMatch(/Validation error/i);
    }
  });
});

describe('IPC usage/get-limits + usage/set-limits (v0.9.0)', () => {
  let tempDir: string;

  beforeEach(() => {
    handlers.clear();
    tempDir = mkdtempSync(join(tmpdir(), 'dreampia-usage-limits-'));
    userDataRef.current = tempDir;
    __resetSettingsCache();
  });

  afterEach(() => {
    __resetSettingsCache();
    try {
      rmSync(tempDir, { recursive: true, force: true });
    } catch {
      // ignore
    }
  });

  it('get-limits returns default threshold 0.8 with no cost limit', async () => {
    const stub = makeStubStore();
    registerIpcHandlers(stubApp, undefined, undefined, undefined, undefined, undefined, undefined, stub.store);
    const result = await call<Result<{ cost_limit_usd?: number; alert_threshold: number }>>(
      'usage/get-limits'
    );
    expect(result).toEqual({ ok: true, value: { alert_threshold: 0.8 } });
  });

  it('set-limits persists cost_limit_usd and alert_threshold round-trips', async () => {
    const stub = makeStubStore();
    registerIpcHandlers(stubApp, undefined, undefined, undefined, undefined, undefined, undefined, stub.store);
    const setResult = await call<Result<void>>('usage/set-limits', {
      cost_limit_usd: 25.5,
      alert_threshold: 0.9,
    });
    expect(setResult.ok).toBe(true);
    __resetSettingsCache();
    const getResult = await call<Result<{ cost_limit_usd?: number; alert_threshold: number }>>(
      'usage/get-limits'
    );
    expect(getResult).toEqual({
      ok: true,
      value: { cost_limit_usd: 25.5, alert_threshold: 0.9 },
    });
  });

  it('set-limits with null cost_limit_usd removes the limit', async () => {
    const stub = makeStubStore();
    registerIpcHandlers(stubApp, undefined, undefined, undefined, undefined, undefined, undefined, stub.store);
    await call('usage/set-limits', { cost_limit_usd: 10 });
    await call('usage/set-limits', { cost_limit_usd: null });
    __resetSettingsCache();
    const getResult = await call<Result<{ cost_limit_usd?: number; alert_threshold: number }>>(
      'usage/get-limits'
    );
    expect(getResult.ok).toBe(true);
    if (getResult.ok) {
      expect(getResult.value.cost_limit_usd).toBeUndefined();
    }
  });

  it('rejects negative cost_limit_usd', async () => {
    const stub = makeStubStore();
    registerIpcHandlers(stubApp, undefined, undefined, undefined, undefined, undefined, undefined, stub.store);
    const result = await call<Result<void>>('usage/set-limits', { cost_limit_usd: -5 });
    expect(result.ok).toBe(false);
  });

  it('rejects threshold > 1', async () => {
    const stub = makeStubStore();
    registerIpcHandlers(stubApp, undefined, undefined, undefined, undefined, undefined, undefined, stub.store);
    const result = await call<Result<void>>('usage/set-limits', { alert_threshold: 1.5 });
    expect(result.ok).toBe(false);
  });

  it('rejects strict-mode: unknown fields rejected', async () => {
    const stub = makeStubStore();
    registerIpcHandlers(stubApp, undefined, undefined, undefined, undefined, undefined, undefined, stub.store);
    const result = await call<Result<void>>('usage/set-limits', { unknown_field: 'x' });
    expect(result.ok).toBe(false);
  });
});
