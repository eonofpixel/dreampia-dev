/**
 * IPC handler tests — usage/* namespace (v0.4.0).
 *
 * UsageStore 자체의 단위 테스트는 storage/UsageStore.test.ts. 여기선
 * ipcMain.handle 로 등록되는 channel 들이 Result<T> wrapping / Zod 검증 /
 * 에러 직렬화를 올바르게 수행하는지 검증.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import type {
  DailyUsageRow,
  UsageEvent,
  UsageRangeFilter,
  UsageStore,
  UsageSummary,
} from '../../src/storage';

type Handler = (evt: unknown, ...args: unknown[]) => unknown | Promise<unknown>;
const handlers = new Map<string, Handler>();

vi.mock('electron', () => {
  return {
    app: { getVersion: () => '0.4.0-test' },
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

import { registerIpcHandlers } from '../../src/main/ipc';
import type { Result } from '../../src/main/types';

const evt = {} as unknown;
const stubApp = { getVersion: () => '0.4.0-test' } as unknown as Parameters<
  typeof registerIpcHandlers
>[0];

async function call<T>(channel: string, ...args: unknown[]): Promise<T> {
  const handler = handlers.get(channel);
  if (handler === undefined) {
    throw new Error(`no handler registered for ${channel}`);
  }
  return (await handler(evt, ...args)) as T;
}

// ────────────────────────────────────────────────────────────
// Stub UsageStore — minimal interface, tracks calls + returns canned data.
// ────────────────────────────────────────────────────────────

function makeStubStore(): {
  store: UsageStore;
  calls: {
    getSummary: UsageRangeFilter[];
    getDailyTotals: Array<{ days: number; provider?: string }>;
    getBySession: string[];
  };
  setSummary: (s: UsageSummary[]) => void;
  setDaily: (d: DailyUsageRow[]) => void;
  setBySession: (e: UsageEvent[]) => void;
  setThrowOn: (method: 'getSummary' | 'getDailyTotals' | 'getBySession') => void;
} {
  const calls = {
    getSummary: [] as UsageRangeFilter[],
    getDailyTotals: [] as Array<{ days: number; provider?: string }>,
    getBySession: [] as string[],
  };
  let summaryResult: UsageSummary[] = [];
  let dailyResult: DailyUsageRow[] = [];
  let bySessionResult: UsageEvent[] = [];
  let throwOn: 'getSummary' | 'getDailyTotals' | 'getBySession' | null = null;

  const stub = {
    recordEvent: () => {
      throw new Error('not implemented in stub');
    },
    getSummary: (filter: UsageRangeFilter) => {
      calls.getSummary.push(filter);
      if (throwOn === 'getSummary') throw new Error('mock store rejection');
      return summaryResult;
    },
    getDailyTotals: (days: number, provider?: string) => {
      const c: { days: number; provider?: string } = { days };
      if (provider !== undefined) c.provider = provider;
      calls.getDailyTotals.push(c);
      if (throwOn === 'getDailyTotals') throw new Error('mock daily rejection');
      return dailyResult;
    },
    getBySession: (sessionId: string) => {
      calls.getBySession.push(sessionId);
      if (throwOn === 'getBySession') throw new Error('mock bySession rejection');
      return bySessionResult;
    },
  } as unknown as UsageStore;

  return {
    store: stub,
    calls,
    setSummary: (s) => {
      summaryResult = s;
    },
    setDaily: (d) => {
      dailyResult = d;
    },
    setBySession: (e) => {
      bySessionResult = e;
    },
    setThrowOn: (m) => {
      throwOn = m;
    },
  };
}

function sampleSummary(overrides: Partial<UsageSummary> = {}): UsageSummary {
  return {
    provider: 'claude',
    model: 'claude-3-5-sonnet',
    total_input: 100,
    total_output: 50,
    total_cache_creation: 0,
    total_cache_read: 0,
    total_reasoning: 0,
    total_cost_usd: 0.001,
    event_count: 1,
    ...overrides,
  };
}

function sampleEvent(overrides: Partial<UsageEvent> = {}): UsageEvent {
  return {
    id: 'uuid-1',
    session_id: 's1',
    turn_id: 't1',
    provider: 'claude',
    model: 'claude-3-5-sonnet',
    input_tokens: 100,
    output_tokens: 50,
    cache_creation_input_tokens: 0,
    cache_read_input_tokens: 0,
    reasoning_output_tokens: 0,
    total_cost_usd: 0.001,
    recorded_at: '2026-05-03T10:00:00.000Z',
    unknown_pricing: false,
    ...overrides,
  };
}

// ────────────────────────────────────────────────────────────
// Tests
// ────────────────────────────────────────────────────────────

describe('IPC usage handlers', () => {
  let stub: ReturnType<typeof makeStubStore>;

  beforeEach(() => {
    handlers.clear();
    stub = makeStubStore();
    registerIpcHandlers(
      stubApp,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      stub.store
    );
  });

  it('registers all 3 usage channels', () => {
    expect(handlers.has('usage/summary')).toBe(true);
    expect(handlers.has('usage/daily')).toBe(true);
    expect(handlers.has('usage/by-session')).toBe(true);
  });

  // ─── usage/summary ─────────────────────────────────

  describe('usage/summary', () => {
    it('returns summary array', async () => {
      stub.setSummary([sampleSummary()]);
      const result = await call<Result<UsageSummary[]>>('usage/summary', {});
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.value).toHaveLength(1);
      expect(result.value[0]?.model).toBe('claude-3-5-sonnet');
    });

    it('passes filter args through to store', async () => {
      await call<Result<UsageSummary[]>>('usage/summary', {
        from: '2026-05-01T00:00:00.000Z',
        to: '2026-05-04T00:00:00.000Z',
        provider: 'claude',
        model: 'claude-3-5-sonnet',
        session_id: 's1',
      });
      const lastCall = stub.calls.getSummary[0];
      expect(lastCall?.from).toBe('2026-05-01T00:00:00.000Z');
      expect(lastCall?.to).toBe('2026-05-04T00:00:00.000Z');
      expect(lastCall?.provider).toBe('claude');
      expect(lastCall?.model).toBe('claude-3-5-sonnet');
      expect(lastCall?.session_id).toBe('s1');
    });

    it('accepts undefined args (treats as empty filter)', async () => {
      const result = await call<Result<UsageSummary[]>>('usage/summary');
      expect(result.ok).toBe(true);
      expect(stub.calls.getSummary).toHaveLength(1);
    });

    it('rejects unknown provider', async () => {
      const result = await call<Result<UsageSummary[]>>('usage/summary', {
        provider: 'gemini',
      });
      expect(result.ok).toBe(false);
    });

    it('rejects extra unknown fields (strict schema)', async () => {
      const result = await call<Result<UsageSummary[]>>('usage/summary', {
        provider: 'claude',
        unknown_field: 'oops',
      });
      expect(result.ok).toBe(false);
    });

    it('surfaces store throw as Result.error', async () => {
      stub.setThrowOn('getSummary');
      const result = await call<Result<UsageSummary[]>>('usage/summary', {});
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.error).toMatch(/mock store rejection/);
    });
  });

  // ─── usage/daily ──────────────────────────────────

  describe('usage/daily', () => {
    it('returns daily rows', async () => {
      stub.setDaily([
        {
          date: '2026-05-03',
          provider: 'claude',
          total_cost_usd: 0.5,
          total_tokens: 1000,
        },
      ]);
      const result = await call<Result<DailyUsageRow[]>>('usage/daily', { days: 7 });
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.value[0]?.date).toBe('2026-05-03');
    });

    it('passes days + provider through', async () => {
      await call<Result<DailyUsageRow[]>>('usage/daily', { days: 30, provider: 'codex' });
      expect(stub.calls.getDailyTotals[0]?.days).toBe(30);
      expect(stub.calls.getDailyTotals[0]?.provider).toBe('codex');
    });

    it('rejects days <= 0', async () => {
      const result = await call<Result<DailyUsageRow[]>>('usage/daily', { days: 0 });
      expect(result.ok).toBe(false);
    });

    it('rejects days > 365', async () => {
      const result = await call<Result<DailyUsageRow[]>>('usage/daily', { days: 1000 });
      expect(result.ok).toBe(false);
    });

    it('rejects non-integer days', async () => {
      const result = await call<Result<DailyUsageRow[]>>('usage/daily', { days: 7.5 });
      expect(result.ok).toBe(false);
    });

    it('rejects missing days', async () => {
      const result = await call<Result<DailyUsageRow[]>>('usage/daily', {});
      expect(result.ok).toBe(false);
    });
  });

  // ─── usage/by-session ─────────────────────────────

  describe('usage/by-session', () => {
    it('returns events for a session', async () => {
      stub.setBySession([sampleEvent()]);
      const result = await call<Result<UsageEvent[]>>('usage/by-session', 's1');
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.value).toHaveLength(1);
      expect(result.value[0]?.session_id).toBe('s1');
      expect(stub.calls.getBySession).toEqual(['s1']);
    });

    it('rejects non-string session_id', async () => {
      const result = await call<Result<UsageEvent[]>>('usage/by-session', 123);
      expect(result.ok).toBe(false);
    });

    it('rejects empty string session_id', async () => {
      const result = await call<Result<UsageEvent[]>>('usage/by-session', '');
      expect(result.ok).toBe(false);
    });

    it('surfaces store throw as Result.error', async () => {
      stub.setThrowOn('getBySession');
      const result = await call<Result<UsageEvent[]>>('usage/by-session', 's1');
      expect(result.ok).toBe(false);
    });
  });

  // ─── No usage handlers when store omitted ──────

  describe('without UsageStore', () => {
    beforeEach(() => {
      handlers.clear();
      registerIpcHandlers(stubApp);
    });

    it('does not register usage/* channels', () => {
      expect(handlers.has('usage/summary')).toBe(false);
      expect(handlers.has('usage/daily')).toBe(false);
      expect(handlers.has('usage/by-session')).toBe(false);
    });
  });
});
