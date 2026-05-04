/**
 * ToolQueue — v1.0.11 SEC-3 + SEC-4 contract tests.
 *
 * Verifies:
 *   1. ctx.record_side_effect() 가 ToolResult.side_effects 에 포함된다.
 *   2. audit_sink 가 모든 결정 (success/failed/cancelled/timeout/permission denied) 마다 호출.
 *   3. tool_use.* event 의 target_json 은 side_effects[] JSON.
 *   4. permission.denied 는 별도 event — capability + ResolvedTarget JSON.
 *   5. audit_sink 가 throw 해도 tool 결과는 그대로 반환 (격리).
 *
 * Spec: docs/v1.x-roadmap.md (SEC-3, SEC-4), docs/tools/queue.md
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';

import { ToolRegistry } from '../../src/tools/Registry';
import { ToolQueue, type ToolAuditEvent } from '../../src/tools/Queue';
import type { Tool, ToolCall, SideEffect } from '../../src/tools/types';
import type { Capability } from '../../src/permission';
import type { Session, ToolCallId, TurnId } from '../../src/types';

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURES_DIR = join(__dirname, '..', 'fixtures', 'sessions');

function loadSession(): Session {
  const raw = readFileSync(join(FIXTURES_DIR, '02-single-turn.json'), 'utf-8');
  return JSON.parse(raw) as Session;
}

let counter = 1;
function nextCallId(): ToolCallId {
  const id = `019d0011-0000-7000-8000-${counter.toString(16).padStart(12, '0')}`;
  counter += 1;
  return id as ToolCallId;
}

function makeCall(overrides: Partial<ToolCall> = {}): ToolCall {
  const session = loadSession();
  return {
    id: nextCallId(),
    tool_id: 'mock.audit',
    session_id: session.id,
    turn_id: 'turn-audit' as TurnId,
    input: {},
    origin: 'ai',
    created_at: new Date().toISOString(),
    ...overrides,
  };
}

interface MockInput {
  effects?: SideEffect[];
  fail?: string;
  output?: number;
}

/**
 * Mock tool — input.effects 를 ctx.record_side_effect 로 emit.
 * input.fail 시 throw. output 없으면 42.
 */
function makeAuditMockTool(
  id: string = 'mock.audit',
  caps: Capability[] = ['LOCAL_READ']
): Tool<MockInput, { result: number }> {
  return {
    id,
    version: '1.0.0',
    source: 'builtin',
    input_schema: z.object({
      effects: z.array(z.unknown()).optional(),
      fail: z.string().optional(),
      output: z.number().optional(),
    }) as unknown as z.ZodSchema<MockInput>,
    output_schema: z.object({ result: z.number() }),
    required_capabilities: () => caps,
    execute: async (input, ctx) => {
      for (const e of input.effects ?? []) {
        ctx.record_side_effect(e);
      }
      if (input.fail !== undefined) throw new Error(input.fail);
      return { result: input.output ?? 42 };
    },
    display: {
      name: 'AuditMock',
      summary: () => 'audit-mock',
      summary_result: () => 'done',
    },
  };
}

describe('ToolQueue — SEC-4 side_effects propagation', () => {
  it('ctx.record_side_effect() entries flow into ToolResult.side_effects on success', async () => {
    const session = loadSession();
    const reg = new ToolRegistry();
    reg.register(makeAuditMockTool());
    const q = new ToolQueue(reg, () => session);

    const fx: SideEffect[] = [
      { kind: 'process', op: 'spawn', cmd: 'echo hi', pid: 12345 },
      { kind: 'process', op: 'exit', exit_code: 0 },
    ];
    const result = await q.enqueue(makeCall({ input: { effects: fx, output: 7 } }));
    expect(result.status).toBe('success');
    expect(result.side_effects.length).toBe(2);
    expect(result.side_effects[0]).toMatchObject({ kind: 'process', op: 'spawn', pid: 12345 });
    expect(result.side_effects[1]).toMatchObject({ kind: 'process', op: 'exit', exit_code: 0 });
  });

  it('side_effects are preserved when execute throws (failed result)', async () => {
    const session = loadSession();
    const reg = new ToolRegistry();
    reg.register(makeAuditMockTool());
    const q = new ToolQueue(reg, () => session);

    const fx: SideEffect[] = [{ kind: 'process', op: 'spawn', cmd: 'fail-cmd' }];
    const result = await q.enqueue(
      makeCall({ input: { effects: fx, fail: 'boom' } })
    );
    expect(result.status).toBe('failed');
    expect(result.error?.code).toBe('EXECUTION_ERROR');
    expect(result.side_effects.length).toBe(1);
    expect(result.side_effects[0]).toMatchObject({ kind: 'process', op: 'spawn' });
  });

  it('empty side_effects array when tool emits none', async () => {
    const session = loadSession();
    const reg = new ToolRegistry();
    reg.register(makeAuditMockTool());
    const q = new ToolQueue(reg, () => session);

    const result = await q.enqueue(makeCall({ input: { output: 1 } }));
    expect(result.side_effects).toEqual([]);
  });
});

describe('ToolQueue — SEC-3 audit_sink invocation', () => {
  it('emits tool_use.success with side_effects in target_json', async () => {
    const session = loadSession();
    const reg = new ToolRegistry();
    reg.register(makeAuditMockTool());
    const events: ToolAuditEvent[] = [];
    const q = new ToolQueue(reg, () => session, {
      audit_sink: (e) => events.push(e),
    });

    const fx: SideEffect[] = [{ kind: 'file', op: 'write', path: '/tmp/x' as never, bytes: 16 }];
    await q.enqueue(makeCall({ input: { effects: fx, output: 1 } }));

    expect(events.length).toBe(1);
    const ev = events[0]!;
    expect(ev.event).toBe('tool_use.success');
    expect(ev.tool_id).toBe('mock.audit');
    expect(ev.capability).toBe('LOCAL_READ');
    const parsed = JSON.parse(ev.target_json) as SideEffect[];
    expect(parsed.length).toBe(1);
    expect(parsed[0]).toMatchObject({ kind: 'file', op: 'write' });
    expect(ev.outcome).toBe('success');
    expect(ev.decision_reason).toBe('success');
  });

  it('emits tool_use.failed when execute throws', async () => {
    const session = loadSession();
    const reg = new ToolRegistry();
    reg.register(makeAuditMockTool());
    const events: ToolAuditEvent[] = [];
    const q = new ToolQueue(reg, () => session, {
      audit_sink: (e) => events.push(e),
    });

    await q.enqueue(makeCall({ input: { fail: 'kaboom' } }));
    expect(events.length).toBe(1);
    const ev = events[0]!;
    expect(ev.event).toBe('tool_use.failed');
    expect(ev.decision_reason).toBe('EXECUTION_ERROR');
    expect(ev.error).toContain('kaboom');
  });

  it('emits tool_use.failed for TOOL_NOT_FOUND', async () => {
    const session = loadSession();
    const reg = new ToolRegistry();
    const events: ToolAuditEvent[] = [];
    const q = new ToolQueue(reg, () => session, {
      audit_sink: (e) => events.push(e),
    });

    await q.enqueue(makeCall({ tool_id: 'not.registered' }));
    expect(events.length).toBe(1);
    expect(events[0]?.event).toBe('tool_use.failed');
    expect(events[0]?.decision_reason).toBe('TOOL_NOT_FOUND');
  });

  it('emits permission.denied when capability denied + tool_use.failed for the same call', async () => {
    const session = loadSession();
    // Fixture default_level = workspace_write. workspace_write 의 set 은
    // LEVEL_CAPABILITIES 에서 SYSTEM_AUTOMATION 을 포함하지 않음 (full_access
    // 만 포함). 부모 매칭도 없어 정직하게 차단됨.
    const reg = new ToolRegistry();
    const denyCap: Capability = 'SYSTEM_AUTOMATION';
    reg.register(makeAuditMockTool('mock.denied', [denyCap]));
    const events: ToolAuditEvent[] = [];
    const q = new ToolQueue(reg, () => session, {
      audit_sink: (e) => events.push(e),
    });

    await q.enqueue(makeCall({ tool_id: 'mock.denied', input: {} }));
    // 정확히 2개: permission.denied + tool_use.failed (Queue 가 차단 후 결과 build)
    expect(events.length).toBe(2);
    const denied = events.find((e) => e.event === 'permission.denied');
    expect(denied).toBeDefined();
    expect(denied?.capability).toBe(denyCap);
    const failed = events.find((e) => e.event === 'tool_use.failed');
    expect(failed).toBeDefined();
    expect(failed?.decision_reason).toBe('PERMISSION_DENIED');
  });

  it('audit_sink throwing does not break tool result', async () => {
    const session = loadSession();
    const reg = new ToolRegistry();
    reg.register(makeAuditMockTool());
    const q = new ToolQueue(reg, () => session, {
      audit_sink: () => {
        throw new Error('sink error');
      },
    });

    const result = await q.enqueue(makeCall({ input: { output: 5 } }));
    expect(result.status).toBe('success');
    expect(result.output).toEqual({ result: 5 });
  });
});
