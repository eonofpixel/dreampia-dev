/**
 * ToolQueue — basic enqueue / capacity / priority tests with mock tools.
 *
 * Spec: docs/tools/queue.md
 *
 * 사용 패턴:
 *  - Mock tool: { delayMs, fail?, output? } 입력으로 결정적 동작
 *  - Mock session: workspace_write level 로 LOCAL_READ/EXECUTE 허용
 *  - getSession 은 inline Map lookup (decoupled)
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';

import { ToolRegistry } from '../../src/tools/Registry';
import { ToolQueue } from '../../src/tools/Queue';
import type { Tool, ToolCall } from '../../src/tools/types';
import type { Capability } from '../../src/permission';
import type { Session, ToolCallId, TurnId } from '../../src/types';

// ────────────────────────────────────────────────────────────
// Fixtures helpers
// ────────────────────────────────────────────────────────────

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURES_DIR = join(__dirname, '..', 'fixtures', 'sessions');

function loadSession(): Session {
  const raw = readFileSync(join(FIXTURES_DIR, '02-single-turn.json'), 'utf-8');
  return JSON.parse(raw) as Session;
}

let counter = 1;
function nextCallId(): ToolCallId {
  // UUIDv7-shaped to satisfy any schema parsing if needed
  const id = `019d0001-0000-7000-8000-${counter.toString(16).padStart(12, '0')}`;
  counter += 1;
  return id as ToolCallId;
}

function makeCall(overrides: Partial<ToolCall> = {}): ToolCall {
  const session = loadSession();
  return {
    id: nextCallId(),
    tool_id: 'mock.simple',
    session_id: session.id,
    turn_id: 'turn-1' as TurnId,
    input: {},
    origin: 'ai',
    created_at: new Date().toISOString(),
    ...overrides,
  };
}

// ────────────────────────────────────────────────────────────
// MockTool — { delayMs, fail?, output? }
// ────────────────────────────────────────────────────────────

interface MockInput {
  delayMs?: number;
  fail?: string;
  output?: number;
}

function makeMockTool(
  id: string = 'mock.simple',
  caps: Capability[] = ['LOCAL_READ']
): Tool<MockInput, { result: number }> {
  return {
    id,
    version: '1.0.0',
    source: 'builtin',
    input_schema: z.object({
      delayMs: z.number().int().nonnegative().optional(),
      fail: z.string().optional(),
      output: z.number().optional(),
    }),
    output_schema: z.object({ result: z.number() }),
    required_capabilities: () => caps,
    execute: async (input, ctx) => {
      if (input.delayMs && input.delayMs > 0) {
        await new Promise<void>((resolve, reject) => {
          const t = setTimeout(() => resolve(), input.delayMs);
          ctx.signal.addEventListener('abort', () => {
            clearTimeout(t);
            // mimic AbortError shape
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
      if (input.fail) {
        throw new Error(input.fail);
      }
      return { result: input.output ?? 42 };
    },
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

describe('ToolQueue — basic enqueue paths', () => {
  it('returns TOOL_NOT_FOUND failed when tool not registered', async () => {
    const session = loadSession();
    const reg = new ToolRegistry();
    const q = new ToolQueue(reg, () => session);

    const result = await q.enqueue(makeCall({ tool_id: 'not.registered' }));
    expect(result.status).toBe('failed');
    expect(result.error?.code).toBe('TOOL_NOT_FOUND');
  });

  it('returns INVALID_INPUT when Zod validation fails', async () => {
    const session = loadSession();
    const reg = new ToolRegistry();
    reg.register(makeMockTool());
    const q = new ToolQueue(reg, () => session);

    // delayMs must be number, give string instead
    const result = await q.enqueue(
      makeCall({ input: { delayMs: 'oops' } as unknown })
    );
    expect(result.status).toBe('failed');
    expect(result.error?.code).toBe('INVALID_INPUT');
  });

  it('returns SESSION_NOT_FOUND when getSession returns undefined', async () => {
    const reg = new ToolRegistry();
    reg.register(makeMockTool());
    // getSession always returns undefined
    const q = new ToolQueue(reg, () => undefined);

    const result = await q.enqueue(makeCall({ input: { output: 7 } }));
    expect(result.status).toBe('failed');
    expect(result.error?.code).toBe('SESSION_NOT_FOUND');
  });

  it('successful execution returns success status with output', async () => {
    const session = loadSession();
    const reg = new ToolRegistry();
    reg.register(makeMockTool());
    const q = new ToolQueue(reg, () => session);

    const result = await q.enqueue(makeCall({ input: { output: 99 } }));
    expect(result.status).toBe('success');
    expect(result.output).toEqual({ result: 99 });
    expect(result.attempt_count).toBe(1);
    expect(result.duration_ms).toBeGreaterThanOrEqual(0);
  });

  it('execute() throwing yields EXECUTION_ERROR failed result', async () => {
    const session = loadSession();
    const reg = new ToolRegistry();
    reg.register(makeMockTool());
    const q = new ToolQueue(reg, () => session);

    const result = await q.enqueue(
      makeCall({ input: { fail: 'kaboom' } })
    );
    expect(result.status).toBe('failed');
    expect(result.error?.code).toBe('EXECUTION_ERROR');
    expect(result.error?.message).toContain('kaboom');
  });
});

describe('ToolQueue — capacity limits', () => {
  it('max_concurrent limit causes 4th call to wait until 1st completes', async () => {
    const session = loadSession();
    const reg = new ToolRegistry();
    reg.register(makeMockTool());
    // Allow 3 concurrent global, 3 per session (so we test the global cap)
    const q = new ToolQueue(reg, () => session, {
      max_concurrent: 3,
      max_concurrent_per_session: 3,
    });

    const calls = [
      makeCall({ input: { delayMs: 100, output: 1 } }),
      makeCall({ input: { delayMs: 100, output: 2 } }),
      makeCall({ input: { delayMs: 100, output: 3 } }),
      makeCall({ input: { delayMs: 50, output: 4 } }),
    ];

    const promises = calls.map((c) => q.enqueue(c));
    // Wait a tick for active to populate
    await new Promise((r) => setTimeout(r, 5));
    const stats = q.getStats();
    expect(stats.active).toBe(3); // 4th must be queued
    expect(stats.pending + stats.active).toBeLessThanOrEqual(4);

    const results = await Promise.all(promises);
    expect(results.every((r) => r.status === 'success')).toBe(true);
  });

  it('max_concurrent_per_session=1 serializes same-session calls', async () => {
    const session = loadSession();
    const reg = new ToolRegistry();
    reg.register(makeMockTool());
    const q = new ToolQueue(reg, () => session, {
      max_concurrent: 5,
      max_concurrent_per_session: 1,
    });

    const start = Date.now();
    const c1 = makeCall({ input: { delayMs: 50, output: 1 } });
    const c2 = makeCall({ input: { delayMs: 50, output: 2 } });
    const [r1, r2] = await Promise.all([q.enqueue(c1), q.enqueue(c2)]);
    const elapsed = Date.now() - start;

    expect(r1.status).toBe('success');
    expect(r2.status).toBe('success');
    // Serialized: at least 100ms (2 * 50ms), allow ample margin
    expect(elapsed).toBeGreaterThanOrEqual(90);
  });
});

describe('ToolQueue — pending priority + stats', () => {
  it('getActive reflects in-flight calls', async () => {
    const session = loadSession();
    const reg = new ToolRegistry();
    reg.register(makeMockTool());
    const q = new ToolQueue(reg, () => session, {
      max_concurrent: 2,
      max_concurrent_per_session: 2,
    });

    const p1 = q.enqueue(makeCall({ input: { delayMs: 50, output: 1 } }));
    const p2 = q.enqueue(makeCall({ input: { delayMs: 50, output: 2 } }));
    await new Promise((r) => setTimeout(r, 5));
    const active = q.getActive();
    expect(active.length).toBe(2);
    await Promise.all([p1, p2]);
  });

  it('timeout: tool that never resolves gets TIMEOUT status', async () => {
    const session = loadSession();
    const reg = new ToolRegistry();
    reg.register(makeMockTool());
    const q = new ToolQueue(reg, () => session);

    const result = await q.enqueue(
      makeCall({
        input: { delayMs: 5000 },
        timeout_ms: 30,
      })
    );
    expect(result.status).toBe('timeout');
    expect(result.error?.code).toBe('TIMEOUT');
  });
});
