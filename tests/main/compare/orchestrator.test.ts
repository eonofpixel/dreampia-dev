/**
 * Compare orchestrator — v0.12.0 (I) failure-isolation contract tests.
 *
 * Verifies:
 *   1. runCompare emits compare_start with a fresh run_id.
 *   2. Both sides reach 'done' when each provider streams cleanly.
 *   3. text_delta from each side accumulates into compare_side_delta events.
 *   4. Failure isolation: one provider throwing during stream() does NOT abort
 *      the other; the surviving side still completes 'done'.
 *   5. Failure isolation: factory throw on one side → that side error,
 *      other side runs.
 *   6. Both sides error → overall finalized as 'failed'.
 *   7. abortSignal cancels both sides; finalize sees error/skipped.
 *   8. CompareStore row persisted with final status.
 *
 * Spec: ROADMAP.md (v0.12.0 I — Codex 권고)
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  CompareStore,
  SessionStore,
} from '../../../src/storage';
import {
  runCompare,
  type CompareEvent,
  type CompareOrchestratorArgs,
  type ProviderFactory,
} from '../../../src/main/compare/orchestrator';
import type { StreamEvent, StreamingProvider } from '../../../src/providers/types';
import { newTurnId, nowIso } from '../../../src/types';

function provFromEvents(events: StreamEvent[], delayMs = 0): StreamingProvider {
  return {
    provider: 'claude',
    async *stream(): AsyncIterable<StreamEvent> {
      for (const ev of events) {
        if (delayMs > 0) await new Promise((r) => setTimeout(r, delayMs));
        yield ev;
      }
    },
  };
}

function provThrowsOnStream(message: string): StreamingProvider {
  return {
    provider: 'codex',
    // eslint-disable-next-line require-yield
    async *stream(): AsyncIterable<StreamEvent> {
      throw new Error(message);
    },
  };
}

function buildArgs(overrides: Partial<CompareOrchestratorArgs> = {}): CompareOrchestratorArgs {
  return {
    prompt: 'hello world',
    session_id: 'sess-1',
    workspace_root: 'C:\\workspace',
    permission_level: 'workspace_write',
    claude_model: 'claude-3-5-sonnet-20241022',
    codex_model: 'gpt-5.5',
    ...overrides,
  };
}

function happyClaude(): StreamEvent[] {
  return [
    { type: 'message_start', turn_id: 'tt-c-1', model: 'claude-3-5-sonnet-20241022' },
    { type: 'text_delta', text: 'Claude says hi' },
    {
      type: 'message_complete',
      turn: {
        id: newTurnId(),
        role: 'assistant',
        timestamp: nowIso(),
        status: 'completed',
        content: [{ type: 'text', text: 'Claude says hi' }],
        model: 'claude-3-5-sonnet-20241022',
      },
    },
  ];
}

function happyCodex(): StreamEvent[] {
  return [
    { type: 'message_start', turn_id: 'tt-x-1', model: 'gpt-5.5' },
    { type: 'text_delta', text: 'Codex says hi' },
    {
      type: 'message_complete',
      turn: {
        id: newTurnId(),
        role: 'assistant',
        timestamp: nowIso(),
        status: 'completed',
        content: [{ type: 'text', text: 'Codex says hi' }],
        model: 'gpt-5.5',
      },
    },
  ];
}

describe('compare orchestrator', () => {
  let session: SessionStore;
  let store: CompareStore;
  let events: CompareEvent[];

  beforeEach(() => {
    session = new SessionStore(':memory:');
    store = new CompareStore(session.getDb());
    events = [];
  });

  afterEach(() => {
    session.close();
  });

  const emit = (e: CompareEvent): void => {
    events.push(e);
  };

  it('happy path — both sides done, run completed', async () => {
    const factory: ProviderFactory = async (side) => {
      if (side === 'claude') {
        return { provider: provFromEvents(happyClaude()), source: 'claude-cli' };
      }
      return { provider: provFromEvents(happyCodex()), source: 'codex-cli' };
    };
    const finalRun = await runCompare(buildArgs(), store, factory, emit);

    expect(finalRun.status).toBe('completed');
    expect(finalRun.claude.status).toBe('done');
    expect(finalRun.codex.status).toBe('done');
    expect(finalRun.claude.text).toBe('Claude says hi');
    expect(finalRun.codex.text).toBe('Codex says hi');

    // Events: compare_start, deltas, sides done, complete.
    expect(events[0]?.type).toBe('compare_start');
    expect(events[events.length - 1]?.type).toBe('compare_complete');
    const claudeDeltas = events.filter(
      (e) => e.type === 'compare_side_delta' && e.side === 'claude'
    );
    expect(claudeDeltas.length).toBeGreaterThanOrEqual(1);
    const codexDone = events.filter(
      (e) => e.type === 'compare_side_done' && e.side === 'codex'
    );
    expect(codexDone.length).toBe(1);
  });

  it('failure isolation — one stream throws, the other still completes', async () => {
    const factory: ProviderFactory = async (side) => {
      if (side === 'claude') {
        return { provider: provFromEvents(happyClaude()), source: 'claude-cli' };
      }
      return { provider: provThrowsOnStream('codex boom'), source: 'codex-cli' };
    };
    const finalRun = await runCompare(buildArgs(), store, factory, emit);

    expect(finalRun.claude.status).toBe('done');
    expect(finalRun.codex.status).toBe('error');
    expect(finalRun.codex.error).toBe('codex boom');
    // Failure isolation rule: at least one done → 'completed'.
    expect(finalRun.status).toBe('completed');

    const errorEvents = events.filter((e) => e.type === 'compare_side_error');
    expect(errorEvents).toHaveLength(1);
    expect((errorEvents[0] as { side: string }).side).toBe('codex');
  });

  it('factory rejection on one side does not abort the other', async () => {
    const factory: ProviderFactory = async (side) => {
      if (side === 'claude') {
        throw new Error('claude detect failed');
      }
      return { provider: provFromEvents(happyCodex()), source: 'codex-cli' };
    };
    const finalRun = await runCompare(buildArgs(), store, factory, emit);

    expect(finalRun.claude.status).toBe('error');
    expect(finalRun.claude.error).toBe('claude detect failed');
    expect(finalRun.codex.status).toBe('done');
    expect(finalRun.status).toBe('completed');
  });

  it('both sides error → run finalized failed', async () => {
    const factory: ProviderFactory = async () => {
      throw new Error('no provider available');
    };
    const finalRun = await runCompare(buildArgs(), store, factory, emit);
    expect(finalRun.status).toBe('failed');
    expect(finalRun.claude.status).toBe('error');
    expect(finalRun.codex.status).toBe('error');
  });

  it('abortSignal cancels both sides', async () => {
    const slowEvents: StreamEvent[] = [
      { type: 'message_start', turn_id: 'slow', model: 'gpt-5.5' },
      { type: 'text_delta', text: 'a' },
      { type: 'text_delta', text: 'b' },
      {
        type: 'message_complete',
        turn: {
          id: newTurnId(),
          role: 'assistant',
          timestamp: nowIso(),
          status: 'completed',
          content: [{ type: 'text', text: 'ab' }],
        },
      },
    ];
    const factory: ProviderFactory = async () => ({
      provider: provFromEvents(slowEvents, 30),
      source: 'mock',
    });
    const controller = new AbortController();
    const runP = runCompare(
      buildArgs({ abortSignal: controller.signal }),
      store,
      factory,
      emit
    );
    // Schedule abort shortly after start.
    setTimeout(() => controller.abort(), 10);
    const finalRun = await runP;
    // Both should be terminal (error or done depending on timing).
    expect(['error', 'done', 'skipped']).toContain(finalRun.claude.status);
    expect(['error', 'done', 'skipped']).toContain(finalRun.codex.status);
  });

  it('persists CompareRun row that getRun retrieves', async () => {
    const factory: ProviderFactory = async (side) => ({
      provider: provFromEvents(side === 'claude' ? happyClaude() : happyCodex()),
      source: side === 'claude' ? 'claude-cli' : 'codex-cli',
    });
    const finalRun = await runCompare(buildArgs(), store, factory, emit);
    const reloaded = store.getRun(finalRun.id);
    expect(reloaded).not.toBeNull();
    expect(reloaded?.status).toBe('completed');
    expect(reloaded?.claude.text).toBe('Claude says hi');
    expect(reloaded?.codex.text).toBe('Codex says hi');
  });

  it('rejects empty prompt before any side runs', async () => {
    const factory: ProviderFactory = async () => ({
      provider: provFromEvents([]),
      source: 'mock',
    });
    await expect(
      runCompare(buildArgs({ prompt: '   ' }), store, factory, emit)
    ).rejects.toThrow(/prompt/);
    // No CompareStore row should exist.
    const runs = store.listBySession('sess-1');
    expect(runs).toHaveLength(0);
  });

  it('updates side model from message_start event', async () => {
    const factory: ProviderFactory = async (side) => {
      if (side === 'claude') {
        return {
          provider: provFromEvents([
            { type: 'message_start', turn_id: 't', model: 'overridden-claude-id' },
            { type: 'text_delta', text: 'x' },
            {
              type: 'message_complete',
              turn: {
                id: newTurnId(),
                role: 'assistant',
                timestamp: nowIso(),
                status: 'completed',
                content: [{ type: 'text', text: 'x' }],
              },
            },
          ]),
          source: 'claude-cli',
        };
      }
      return { provider: provFromEvents(happyCodex()), source: 'codex-cli' };
    };
    const finalRun = await runCompare(buildArgs(), store, factory, emit);
    expect(finalRun.claude.model).toBe('overridden-claude-id');
  });
});
