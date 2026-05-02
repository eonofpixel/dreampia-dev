/**
 * Queue cancellation 시나리오:
 *  - cancelCall: active 면 abort, pending 이면 즉시 cancelled 응답
 *  - cancelTurn: 같은 turn 의 모든 active + pending 취소
 *  - timeout: 자동 abort + TIMEOUT status
 *  - tool.cancel hook 호출 검증
 *
 * Spec: docs/tools/queue.md (Cancellation 섹션)
 */

import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';

import { ToolRegistry } from '../../src/tools/Registry';
import { ToolQueue } from '../../src/tools/Queue';
import type { Tool, ToolCall } from '../../src/tools/types';
import type { Capability } from '../../src/permission';
import type {
  Session,
  ToolCallId,
  TurnId,
} from '../../src/types';

// ────────────────────────────────────────────────────────────
// Fixtures + helpers
// ────────────────────────────────────────────────────────────

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURES_DIR = join(__dirname, '..', 'fixtures', 'sessions');

function loadSession(): Session {
  const raw = readFileSync(join(FIXTURES_DIR, '02-single-turn.json'), 'utf-8');
  return JSON.parse(raw) as Session;
}

let counter = 1;
function nextCallId(): ToolCallId {
  const id = `019d0001-0000-7000-8000-${counter.toString(16).padStart(12, '0')}`;
  counter += 1;
  return id as ToolCallId;
}

function makeCall(
  session: Session,
  input: unknown,
  overrides: Partial<ToolCall> = {}
): ToolCall {
  return {
    id: nextCallId(),
    tool_id: 'mock.simple',
    session_id: session.id,
    turn_id: 'turn-1' as TurnId,
    input,
    origin: 'ai',
    created_at: new Date().toISOString(),
    ...overrides,
  };
}

interface MockInput {
  delayMs?: number;
}

function makeMockTool(
  cancelHook?: () => void
): Tool<MockInput, { result: number }> {
  return {
    id: 'mock.simple',
    version: '1.0.0',
    source: 'builtin',
    input_schema: z.object({
      delayMs: z.number().int().nonnegative().optional(),
    }),
    output_schema: z.object({ result: z.number() }),
    required_capabilities: (): Capability[] => ['LOCAL_READ'],
    execute: async (input, ctx) => {
      if (input.delayMs && input.delayMs > 0) {
        await new Promise<void>((resolve, reject) => {
          const t = setTimeout(() => resolve(), input.delayMs);
          ctx.signal.addEventListener('abort', () => {
            clearTimeout(t);
            const err = new Error(
              typeof ctx.signal.reason === 'string'
                ? ctx.signal.reason
                : 'aborted'
            );
            err.name = 'AbortError';
            reject(err);
          });
        });
      }
      return { result: 1 };
    },
    ...(cancelHook && { cancel: async () => cancelHook() }),
    display: {
      name: 'Mock',
      summary: () => 'mock',
      summary_result: () => 'done',
    },
  };
}

// ────────────────────────────────────────────────────────────
// Tests
// ────────────────────────────────────────────────────────────

describe('Queue cancellation — abort signal', () => {
  it('cancelCall during execute → CANCELLED status', async () => {
    const session = loadSession();
    const reg = new ToolRegistry();
    reg.register(makeMockTool());
    const q = new ToolQueue(reg, () => session);

    const call = makeCall(session, { delayMs: 1000 });
    const promise = q.enqueue(call);
    // 즉시 cancel
    await new Promise((r) => setTimeout(r, 10));
    const cancelled = q.cancelCall(call.id, 'user_cancelled');
    expect(cancelled).toBe(true);

    const result = await promise;
    expect(result.status).toBe('cancelled');
    expect(result.error?.code).toBe('ABORTED');
  });

  it('cancelCall on non-existent id returns false', async () => {
    const session = loadSession();
    const reg = new ToolRegistry();
    const q = new ToolQueue(reg, () => session);

    const cancelled = q.cancelCall(
      '019d0001-0000-7000-8000-deadbeefdead' as ToolCallId
    );
    expect(cancelled).toBe(false);
  });
});

describe('Queue cancellation — timeout', () => {
  it('per-call timeout → TIMEOUT status (not CANCELLED)', async () => {
    const session = loadSession();
    const reg = new ToolRegistry();
    reg.register(makeMockTool());
    const q = new ToolQueue(reg, () => session);

    const result = await q.enqueue(
      makeCall(session, { delayMs: 5000 }, { timeout_ms: 30 })
    );
    expect(result.status).toBe('timeout');
    expect(result.error?.code).toBe('TIMEOUT');
  });
});

describe('Queue cancellation — cancelTurn', () => {
  it('cancels all active + pending of same turn', async () => {
    const session = loadSession();
    const reg = new ToolRegistry();
    reg.register(makeMockTool());
    // session=1 means call 2 must wait
    const q = new ToolQueue(reg, () => session, {
      max_concurrent_per_session: 1,
    });

    const turnA: TurnId = 'turn-A' as TurnId;
    const turnB: TurnId = 'turn-B' as TurnId;
    const c1 = makeCall(session, { delayMs: 500 }, { turn_id: turnA });
    const c2 = makeCall(session, { delayMs: 500 }, { turn_id: turnA });
    const c3 = makeCall(session, { delayMs: 500 }, { turn_id: turnB });

    const p1 = q.enqueue(c1);
    const p2 = q.enqueue(c2);
    const p3 = q.enqueue(c3);

    await new Promise((r) => setTimeout(r, 20));
    // c1 active, c2/c3 pending (per-session=1, both targets same session)
    const cancelledCount = q.cancelTurn(turnA, 'user_cancelled');
    expect(cancelledCount).toBeGreaterThanOrEqual(2);

    const [r1, r2, r3] = await Promise.all([p1, p2, p3]);
    expect(r1.status).toBe('cancelled');
    expect(r2.status).toBe('cancelled');
    // c3 (turnB) should still complete
    expect(r3.status).toBe('success');
  });

  it('cancelling different turn does not affect target turn', async () => {
    const session = loadSession();
    const reg = new ToolRegistry();
    reg.register(makeMockTool());
    const q = new ToolQueue(reg, () => session);

    const turnA: TurnId = 'turn-A' as TurnId;
    const turnB: TurnId = 'turn-B' as TurnId;
    const c1 = makeCall(session, { delayMs: 50 }, { turn_id: turnA });

    const p1 = q.enqueue(c1);
    // Cancel an unrelated turn
    const count = q.cancelTurn(turnB, 'irrelevant');
    expect(count).toBe(0);
    const r1 = await p1;
    expect(r1.status).toBe('success');
  });
});

describe('Queue cancellation — tool.cancel cleanup hook', () => {
  it('tool.cancel called when cancelCall aborts an active execution', async () => {
    const session = loadSession();
    const reg = new ToolRegistry();
    const cancelSpy = vi.fn();
    reg.register(makeMockTool(cancelSpy));
    const q = new ToolQueue(reg, () => session);

    const call = makeCall(session, { delayMs: 1000 });
    const promise = q.enqueue(call);
    await new Promise((r) => setTimeout(r, 10));
    q.cancelCall(call.id);

    const result = await promise;
    expect(result.status).toBe('cancelled');
    // cancel hook is fire-and-forget; allow microtasks to flush
    await new Promise((r) => setTimeout(r, 20));
    expect(cancelSpy).toHaveBeenCalledTimes(1);
  });
});
