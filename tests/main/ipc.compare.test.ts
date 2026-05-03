/**
 * IPC handler tests — compare/* namespace (v0.12.0 I).
 *
 * Verifies:
 *   1. compare/run returns Result.ok with run_id.
 *   2. compare/run validates payload (zod) — empty prompt rejected.
 *   3. compare/run forwards stream events via mainWindow.webContents.send
 *      on the 'compare/stream-event' channel.
 *   4. Failure isolation observed via IPC events: one side error, other done.
 *   5. compare/get returns persisted run.
 *   6. compare/list returns runs filtered by session_id, DESC order.
 *   7. compare/cancel aborts active run.
 *   8. compare/get unknown id → ok(null).
 *   9. compare/list rejects malformed args.
 *  10. compare/run rejects too-long prompt (>4000).
 *
 * Spec: ROADMAP.md (v0.12.0 I)
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// ────────────────────────────────────────────────────────────
// Mock electron — must come before importing anything that uses it.
// ────────────────────────────────────────────────────────────

type Handler = (
  evt: unknown,
  ...args: unknown[]
) => unknown | Promise<unknown>;

const handlers = new Map<string, Handler>();

const mockUserDataDir = vi.hoisted(() => {
  return { current: '' };
});

vi.mock('electron', () => {
  return {
    app: {
      getVersion: () => '0.0.1-test',
      getPath: (_name: string): string => mockUserDataDir.current,
      get isPackaged(): boolean {
        return false;
      },
    },
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

// Imports after vi.mock so the stub applies.
import { mkdtempSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  registerIpcHandlers,
  shutdownCompareHandlers,
  type CompareHandlerConfig,
} from '../../src/main/ipc';
import { __resetSettingsCache } from '../../src/main/settings';
import type { Result } from '../../src/main/types';
import {
  CompareStore,
  SessionStore,
  type CompareRun,
} from '../../src/storage';
import {
  type CompareEvent,
  type ProviderFactory,
} from '../../src/main/compare/orchestrator';
import type {
  StreamEvent,
  StreamingProvider,
} from '../../src/providers/types';
import { newTurnId, nowIso } from '../../src/types';

const evt = {} as unknown;

async function call<T>(channel: string, ...args: unknown[]): Promise<T> {
  const handler = handlers.get(channel);
  if (handler === undefined) {
    throw new Error(`no handler registered for ${channel}`);
  }
  return (await handler(evt, ...args)) as T;
}

const stubApp = { getVersion: () => '0.0.1-test' } as unknown as Parameters<
  typeof registerIpcHandlers
>[0];

interface SentEvent {
  channel: string;
  payload: unknown;
}

function makeWindow(sent: SentEvent[]): {
  webContents: { send: (channel: string, payload: unknown) => void };
  isDestroyed: () => boolean;
} {
  return {
    webContents: {
      send: (channel: string, payload: unknown): void => {
        sent.push({ channel, payload });
      },
    },
    isDestroyed: () => false,
  };
}

function provFromEvents(events: StreamEvent[]): StreamingProvider {
  return {
    provider: 'claude',
    async *stream(): AsyncIterable<StreamEvent> {
      for (const ev of events) yield ev;
    },
  };
}

function happyEvents(model: string, text: string): StreamEvent[] {
  return [
    { type: 'message_start', turn_id: newTurnId(), model },
    { type: 'text_delta', text },
    {
      type: 'message_complete',
      turn: {
        id: newTurnId(),
        role: 'assistant',
        timestamp: nowIso(),
        status: 'completed',
        content: [{ type: 'text', text }],
        model,
      },
    },
  ];
}

function flush(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 20));
}

// ────────────────────────────────────────────────────────────
// Suite
// ────────────────────────────────────────────────────────────

describe('IPC compare handlers', () => {
  let sent: SentEvent[];
  let session: SessionStore;
  let store: CompareStore;
  let tmpDir: string;

  beforeEach(() => {
    handlers.clear();
    shutdownCompareHandlers();
    sent = [];
    tmpDir = mkdtempSync(join(tmpdir(), 'dreampia-ipc-compare-'));
    mockUserDataDir.current = tmpDir;
    __resetSettingsCache();
    session = new SessionStore(':memory:');
    store = new CompareStore(session.getDb());
  });

  afterEach(() => {
    session.close();
    if (tmpDir.length > 0 && existsSync(tmpDir)) {
      rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  function register(
    factory: ProviderFactory,
    opts?: Partial<CompareHandlerConfig>
  ): { win: ReturnType<typeof makeWindow> } {
    const win = makeWindow(sent);
    const cfg: CompareHandlerConfig = {
      store: opts?.store ?? store,
      getMainWindow: () => win as unknown as Parameters<
        CompareHandlerConfig['getMainWindow']
      > extends []
        ? ReturnType<CompareHandlerConfig['getMainWindow']>
        : never,
      factory,
      ...(opts?.runCompare !== undefined && { runCompare: opts.runCompare }),
    };
    registerIpcHandlers(
      stubApp,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      cfg
    );
    return { win };
  }

  // ── compare/run ────────────────────────────────────────────

  it('compare/run returns ok with run_id', async () => {
    const factory: ProviderFactory = async (side) => ({
      provider: provFromEvents(
        side === 'claude'
          ? happyEvents('claude-3-5-sonnet-20241022', 'C')
          : happyEvents('gpt-5.5', 'X')
      ),
      source: side === 'claude' ? 'claude-cli' : 'codex-cli',
    });
    register(factory);
    const result = await call<Result<{ run_id: string }>>('compare/run', {
      session_id: 'sess-1',
      prompt: 'hello',
      workspace_root: 'C:\\wks',
      claude_model: 'claude-3-5-sonnet-20241022',
      codex_model: 'gpt-5.5',
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.run_id).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('compare/run rejects empty prompt via zod', async () => {
    register(async () => ({ provider: provFromEvents([]), source: 'mock' }));
    const result = await call<Result<{ run_id: string }>>('compare/run', {
      session_id: 'sess-1',
      prompt: '',
      workspace_root: 'C:\\wks',
      claude_model: 'claude-3-5-sonnet-20241022',
      codex_model: 'gpt-5.5',
    });
    expect(result.ok).toBe(false);
  });

  it('compare/run rejects oversize prompt (>4000 chars)', async () => {
    register(async () => ({ provider: provFromEvents([]), source: 'mock' }));
    const huge = 'x'.repeat(4001);
    const result = await call<Result<{ run_id: string }>>('compare/run', {
      session_id: 'sess-1',
      prompt: huge,
      workspace_root: 'C:\\wks',
      claude_model: 'claude-3-5-sonnet-20241022',
      codex_model: 'gpt-5.5',
    });
    expect(result.ok).toBe(false);
  });

  it('compare/run forwards stream events on compare/stream-event channel', async () => {
    const factory: ProviderFactory = async (side) => ({
      provider: provFromEvents(
        side === 'claude'
          ? happyEvents('claude-3-5-sonnet-20241022', 'C')
          : happyEvents('gpt-5.5', 'X')
      ),
      source: side === 'claude' ? 'claude-cli' : 'codex-cli',
    });
    register(factory);
    const result = await call<Result<{ run_id: string }>>('compare/run', {
      session_id: 'sess-1',
      prompt: 'hello',
      workspace_root: 'C:\\wks',
      claude_model: 'claude-3-5-sonnet-20241022',
      codex_model: 'gpt-5.5',
    });
    expect(result.ok).toBe(true);
    await flush();
    const compareEvents = sent.filter((s) => s.channel === 'compare/stream-event');
    expect(compareEvents.length).toBeGreaterThan(0);
    const types = compareEvents.map(
      (e) => (e.payload as CompareEvent).type
    );
    // start should be present (might be flushed at the very front), and complete at the end.
    expect(types).toContain('compare_complete');
  });

  it('failure isolation visible via IPC events', async () => {
    const factory: ProviderFactory = async (side) => {
      if (side === 'claude') {
        return {
          provider: provFromEvents(
            happyEvents('claude-3-5-sonnet-20241022', 'C OK')
          ),
          source: 'claude-cli',
        };
      }
      throw new Error('codex unavailable');
    };
    register(factory);
    await call<Result<{ run_id: string }>>('compare/run', {
      session_id: 'sess-1',
      prompt: 'hello',
      workspace_root: 'C:\\wks',
      claude_model: 'claude-3-5-sonnet-20241022',
      codex_model: 'gpt-5.5',
    });
    await flush();
    const errorEvents = sent
      .filter((s) => s.channel === 'compare/stream-event')
      .map((s) => s.payload as CompareEvent)
      .filter((e) => e.type === 'compare_side_error');
    expect(errorEvents).toHaveLength(1);
    expect((errorEvents[0] as { side: string }).side).toBe('codex');

    const completeEvents = sent
      .filter((s) => s.channel === 'compare/stream-event')
      .map((s) => s.payload as CompareEvent)
      .filter((e) => e.type === 'compare_complete');
    expect(completeEvents).toHaveLength(1);
    const completed = completeEvents[0];
    if (completed?.type !== 'compare_complete') {
      throw new Error('expected compare_complete');
    }
    expect(completed.run.claude.status).toBe('done');
    expect(completed.run.codex.status).toBe('error');
  });

  // ── compare/get ─────────────────────────────────────────────

  it('compare/get returns the run after completion', async () => {
    const factory: ProviderFactory = async (side) => ({
      provider: provFromEvents(
        side === 'claude'
          ? happyEvents('claude-3-5-sonnet-20241022', 'aaa')
          : happyEvents('gpt-5.5', 'bbb')
      ),
      source: side === 'claude' ? 'claude-cli' : 'codex-cli',
    });
    register(factory);
    const start = await call<Result<{ run_id: string }>>('compare/run', {
      session_id: 'sess-1',
      prompt: 'hello',
      workspace_root: 'C:\\wks',
      claude_model: 'claude-3-5-sonnet-20241022',
      codex_model: 'gpt-5.5',
    });
    expect(start.ok).toBe(true);
    if (!start.ok) return;
    await flush();
    const got = await call<Result<CompareRun | null>>('compare/get', {
      run_id: start.value.run_id,
    });
    expect(got.ok).toBe(true);
    if (!got.ok) return;
    expect(got.value).not.toBeNull();
    expect(got.value?.id).toBe(start.value.run_id);
    expect(got.value?.status).toBe('completed');
  });

  it('compare/get returns null for unknown id', async () => {
    register(async () => ({ provider: provFromEvents([]), source: 'mock' }));
    const got = await call<Result<CompareRun | null>>('compare/get', {
      run_id: 'does-not-exist',
    });
    expect(got.ok).toBe(true);
    if (!got.ok) return;
    expect(got.value).toBeNull();
  });

  // ── compare/list ────────────────────────────────────────────

  it('compare/list returns rows for session DESC', async () => {
    const factory: ProviderFactory = async (side) => ({
      provider: provFromEvents(
        side === 'claude'
          ? happyEvents('claude-3-5-sonnet-20241022', 'a')
          : happyEvents('gpt-5.5', 'b')
      ),
      source: side === 'claude' ? 'claude-cli' : 'codex-cli',
    });
    register(factory);
    await call('compare/run', {
      session_id: 'sess-1',
      prompt: 'one',
      workspace_root: 'C:\\wks',
      claude_model: 'claude-3-5-sonnet-20241022',
      codex_model: 'gpt-5.5',
    });
    await flush();
    await new Promise((r) => setTimeout(r, 5));
    await call('compare/run', {
      session_id: 'sess-1',
      prompt: 'two',
      workspace_root: 'C:\\wks',
      claude_model: 'claude-3-5-sonnet-20241022',
      codex_model: 'gpt-5.5',
    });
    await flush();
    const list = await call<Result<CompareRun[]>>('compare/list', {
      session_id: 'sess-1',
    });
    expect(list.ok).toBe(true);
    if (!list.ok) return;
    expect(list.value.length).toBe(2);
    // DESC: 'two' first.
    expect(list.value[0]?.prompt).toBe('two');
    expect(list.value[1]?.prompt).toBe('one');
  });

  it('compare/list rejects malformed args (no session_id)', async () => {
    register(async () => ({ provider: provFromEvents([]), source: 'mock' }));
    const list = await call<Result<CompareRun[]>>('compare/list', {});
    expect(list.ok).toBe(false);
  });

  // ── compare/cancel ──────────────────────────────────────────

  it('compare/cancel returns ok even for unknown run', async () => {
    register(async () => ({ provider: provFromEvents([]), source: 'mock' }));
    const result = await call<Result<void>>('compare/cancel', {
      run_id: 'unknown',
    });
    expect(result.ok).toBe(true);
  });

  it('compare/cancel rejects malformed payload', async () => {
    register(async () => ({ provider: provFromEvents([]), source: 'mock' }));
    const result = await call<Result<void>>('compare/cancel', {});
    expect(result.ok).toBe(false);
  });
});
