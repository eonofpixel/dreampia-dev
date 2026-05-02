/**
 * IPC handler tests — ai/* namespace (P1-4).
 *
 * Spec: docs/session/cross-ai-sync.md
 *
 * Pattern mirrors ipc.browser.test.ts: mock electron, capture each
 * ipcMain.handle, invoke handlers directly. AI handlers receive a config
 * with injected getDefaultProvider / detectCli / getMainWindow stubs so
 * tests don't spawn child processes.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

// ────────────────────────────────────────────────────────────
// Mock electron — must come before importing anything that uses it
// ────────────────────────────────────────────────────────────

type Handler = (
  evt: unknown,
  ...args: unknown[]
) => unknown | Promise<unknown>;

const handlers = new Map<string, Handler>();

vi.mock('electron', () => {
  return {
    app: { getVersion: () => '0.0.1-test' },
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

// Imports MUST come after vi.mock so they pick up the stub.
import {
  registerIpcHandlers,
  shutdownAiHandlers,
  type AiHandlerConfig,
} from '../../src/main/ipc';
import type { Result } from '../../src/main/types';
import type {
  StreamEvent,
  StreamingProvider,
} from '../../src/providers/types';
import type { AutoProviderResult } from '../../src/providers/auto';
import type { CliDetectionResult } from '../../src/providers';
import type { ToolCallId, Turn } from '../../src/types';
import { newTurnId, nowIso } from '../../src/types';
import type { ToolQueue, ToolResult } from '../../src/tools';

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

// ── helpers ───────────────────────────────────────────────────

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

/** Provider that yields a fixed list of events. */
function provFromEvents(events: StreamEvent[]): StreamingProvider {
  return {
    provider: 'claude',
    async *stream(): AsyncIterable<StreamEvent> {
      for (const ev of events) yield ev;
    },
  };
}

/** Build a single user-text turn for handler input. */
function userTurn(text: string): Turn {
  return {
    id: newTurnId(),
    role: 'user',
    timestamp: nowIso(),
    status: 'completed',
    content: [{ type: 'text', text }],
  };
}

function flushMicrotasks(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 5));
}

// ────────────────────────────────────────────────────────────
// Suite
// ────────────────────────────────────────────────────────────

describe('IPC ai handlers', () => {
  let sent: SentEvent[];
  let provider: StreamingProvider;

  beforeEach(() => {
    handlers.clear();
    shutdownAiHandlers();
    sent = [];
  });

  function register(opts?: Partial<AiHandlerConfig>): {
    win: ReturnType<typeof makeWindow>;
  } {
    const win = makeWindow(sent);
    const cfg: AiHandlerConfig = {
      getMainWindow: () => win as unknown as Parameters<
        AiHandlerConfig['getMainWindow']
      > extends []
        ? ReturnType<AiHandlerConfig['getMainWindow']>
        : never,
      detectCli: opts?.detectCli ?? (async (): Promise<CliDetectionResult> => ({
        claude: { path: '/fake/claude', version: '1.0.0' },
        codex: null,
      })),
      getDefaultProvider:
        opts?.getDefaultProvider ??
        (async (): Promise<AutoProviderResult> => ({
          provider,
          source: 'claude-cli',
          detected: { claude: null, codex: null },
        })),
      // ★ Codex 2차 fix 후 누락 — opts.toolQueue 가 cfg 로 전파 안 되어
      // 'executes provider tool calls through ToolQueue' 테스트 fail.
      toolQueue: opts?.toolQueue,
    };
    registerIpcHandlers(stubApp, undefined, undefined, undefined, cfg);
    return { win };
  }

  // ── ai/detect-cli ─────────────────────────────────────────

  it('ai/detect-cli returns ok with detected info', async () => {
    register();
    const result = await call<Result<CliDetectionResult>>('ai/detect-cli');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.claude?.path).toBe('/fake/claude');
  });

  it('ai/detect-cli surfaces errors as Result.error', async () => {
    register({
      detectCli: async () => {
        throw new Error('detect boom');
      },
    });
    const result = await call<Result<CliDetectionResult>>('ai/detect-cli');
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toMatch(/detect boom/);
  });

  // ── ai/start-stream ────────────────────────────────────────

  it('ai/start-stream returns stream_id + source', async () => {
    provider = provFromEvents([
      { type: 'message_start', turn_id: 'tt-1', model: 'claude-test' },
      {
        type: 'message_complete',
        turn: {
          id: newTurnId(),
          role: 'assistant',
          timestamp: nowIso(),
          status: 'completed',
          content: [{ type: 'text', text: 'ok' }],
          model: 'claude-test',
        },
      },
    ]);
    register();
    const result = await call<
      Result<{ stream_id: string; source: string }>
    >('ai/start-stream', {
      stream_id: 'sid-1',
      model: 'claude-test',
      turns: [userTurn('hi')],
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.stream_id).toBe('sid-1');
    expect(result.value.source).toBe('claude-cli');
  });

  it('passes workspace_root through to provider selection', async () => {
    provider = provFromEvents([]);
    let capturedCwd: string | undefined;
    register({
      getDefaultProvider: async (_model, _signal, cwd): Promise<AutoProviderResult> => {
        capturedCwd = cwd;
        return {
          provider,
          source: 'claude-cli',
          detected: { claude: null, codex: null },
        };
      },
    });
    const result = await call<Result<{ stream_id: string; source: string }>>(
      'ai/start-stream',
      {
        stream_id: 'sid-cwd',
        model: 'claude-test',
        turns: [userTurn('hi')],
        workspace_root: 'C:\\Dev\\workspace',
      }
    );
    expect(result.ok).toBe(true);
    expect(capturedCwd).toBe('C:\\Dev\\workspace');
  });

  it('emits stream events via mainWindow.webContents.send', async () => {
    provider = provFromEvents([
      { type: 'message_start', turn_id: 'tt-1', model: 'claude-test' },
      { type: 'text_delta', text: 'hello' },
      {
        type: 'message_complete',
        turn: {
          id: newTurnId(),
          role: 'assistant',
          timestamp: nowIso(),
          status: 'completed',
          content: [{ type: 'text', text: 'hello' }],
          model: 'claude-test',
        },
      },
    ]);
    register();
    await call('ai/start-stream', {
      stream_id: 'sid-A',
      model: 'claude-test',
      turns: [userTurn('hi')],
    });
    // 비동기 pump — microtask 들어간 후 검사
    await flushMicrotasks();
    const events = sent.filter((s) => s.channel === 'ai/stream-event');
    expect(events.length).toBeGreaterThanOrEqual(2);
    const ends = sent.filter((s) => s.channel === 'ai/stream-end');
    expect(ends.length).toBe(1);
  });

  it('executes provider tool calls through ToolQueue and emits tool_result', async () => {
    const callId = '019d0003-0000-7000-8000-000000000001';
    provider = provFromEvents([
      { type: 'message_start', turn_id: '019d0003-0000-7000-8000-000000000002', model: 'claude-test' },
      {
        type: 'tool_call_complete',
        tool_call: { id: callId as ToolCallId, tool_id: 'shell.run', input: { cmd: 'echo hi' } },
      },
      {
        type: 'message_complete',
        turn: {
          id: newTurnId(),
          role: 'assistant',
          timestamp: nowIso(),
          status: 'completed',
          content: [{ type: 'text', text: 'done' }],
          tool_calls: [
            { id: callId as ToolCallId, tool_id: 'shell.run', input: { cmd: 'echo hi' } },
          ],
          model: 'claude-test',
        },
      },
    ]);
    const toolResult: ToolResult = {
      call_id: callId as ToolResult['call_id'],
      tool_id: 'shell.run',
      status: 'success',
      output: { stdout: 'hi', stderr: '', exit_code: 0, duration_ms: 1 },
      started_at: nowIso(),
      completed_at: nowIso(),
      duration_ms: 1,
      attempt_count: 1,
      side_effects: [],
      log_tail: [],
    };
    const queue = {
      enqueue: vi.fn(async () => toolResult),
    } as unknown as ToolQueue;

    register({ toolQueue: queue });
    await call('ai/start-stream', {
      stream_id: 'sid-tool',
      model: 'claude-test',
      turns: [userTurn('hi')],
      session_id: '019d0003-0000-7000-8000-000000000003',
    });
    await flushMicrotasks();

    expect(queue.enqueue).toHaveBeenCalledWith(
      expect.objectContaining({
        id: callId,
        tool_id: 'shell.run',
        session_id: '019d0003-0000-7000-8000-000000000003',
      })
    );
    const toolEvents = sent.filter(
      (s) =>
        s.channel === 'ai/stream-event' &&
        (s.payload as { event: { type: string } }).event.type === 'tool_result'
    );
    expect(toolEvents).toHaveLength(1);
  });

  it('rejects malformed start-stream payload via zod', async () => {
    register();
    const result = await call<Result<unknown>>('ai/start-stream', {
      // missing model + turns
      stream_id: 'sid-x',
    });
    expect(result.ok).toBe(false);
  });

  it('rejects duplicate stream_id', async () => {
    // Provider 가 즉시 끝나지 않게 — 영원히 yield 하다 abort 로 끝남.
    provider = {
      provider: 'claude',
      async *stream(): AsyncIterable<StreamEvent> {
        yield { type: 'message_start', turn_id: 'tt', model: 'claude-test' };
        // 멈춤
        await new Promise<void>(() => {});
      },
    };
    register();
    const first = await call<Result<unknown>>('ai/start-stream', {
      stream_id: 'sid-dup',
      model: 'claude-test',
      turns: [userTurn('hi')],
    });
    expect(first.ok).toBe(true);
    const second = await call<Result<unknown>>('ai/start-stream', {
      stream_id: 'sid-dup',
      model: 'claude-test',
      turns: [userTurn('hi')],
    });
    expect(second.ok).toBe(false);
    // cleanup
    await call('ai/stop-stream', 'sid-dup');
  });

  it('ai/stop-stream cancels active stream', async () => {
    // Provider that pumps deltas while not aborted, then ends on abort.
    let pleaseAbort = false;
    provider = {
      provider: 'claude',
      async *stream(input) {
        yield { type: 'message_start', turn_id: 't', model: input.model };
        while (!pleaseAbort) {
          await new Promise((r) => setTimeout(r, 5));
        }
        // Done — generator returns naturally.
      },
    };
    register();
    const start = await call<Result<{ stream_id: string }>>(
      'ai/start-stream',
      {
        stream_id: 'sid-stop',
        model: 'claude-test',
        turns: [userTurn('hi')],
      }
    );
    expect(start.ok).toBe(true);
    const stop = await call<Result<void>>('ai/stop-stream', 'sid-stop');
    expect(stop.ok).toBe(true);
    pleaseAbort = true;
    await flushMicrotasks();
    // stream-end must fire so renderer doesn't hang.
    const ends = sent.filter((s) => s.channel === 'ai/stream-end');
    expect(ends.length).toBe(1);
  });

  it('isolates concurrent streams by stream_id', async () => {
    // Provider that yields one delta then completes immediately.
    provider = provFromEvents([
      { type: 'message_start', turn_id: 't', model: 'claude-test' },
      { type: 'text_delta', text: 'A' },
      {
        type: 'message_complete',
        turn: {
          id: newTurnId(),
          role: 'assistant',
          timestamp: nowIso(),
          status: 'completed',
          content: [{ type: 'text', text: 'A' }],
          model: 'claude-test',
        },
      },
    ]);
    register();
    await call('ai/start-stream', {
      stream_id: 'sid-1',
      model: 'claude-test',
      turns: [userTurn('hi')],
    });
    await call('ai/start-stream', {
      stream_id: 'sid-2',
      model: 'claude-test',
      turns: [userTurn('hi')],
    });
    await flushMicrotasks();
    const ids = new Set(
      sent
        .filter((s) => s.channel === 'ai/stream-event')
        .map((s) => (s.payload as { stream_id: string }).stream_id)
    );
    expect(ids.has('sid-1')).toBe(true);
    expect(ids.has('sid-2')).toBe(true);
  });

  it('emits error event when provider throws', async () => {
    provider = {
      provider: 'claude',
      async *stream(): AsyncIterable<StreamEvent> {
        yield { type: 'message_start', turn_id: 't', model: 'claude-test' };
        throw new Error('boom');
      },
    };
    register();
    await call('ai/start-stream', {
      stream_id: 'sid-err',
      model: 'claude-test',
      turns: [userTurn('hi')],
    });
    await flushMicrotasks();
    const errEvts = sent.filter(
      (s) =>
        s.channel === 'ai/stream-event' &&
        (s.payload as { event: { type: string } }).event.type === 'error'
    );
    expect(errEvts.length).toBe(1);
    const ends = sent.filter((s) => s.channel === 'ai/stream-end');
    expect(ends.length).toBe(1);
  });
});
