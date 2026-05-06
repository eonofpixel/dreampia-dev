/**
 * v1.7.23 — Automation handler registry + LLM prompt handler.
 *
 * 검증:
 *  - HandlerRegistry: register / get / list / unregister.
 *  - registerBuiltinHandlers — idempotent, llm-prompt + noop-log 등록.
 *  - llmPromptHandler — config validation (prompt 누락 → ok=false).
 *  - llmPromptHandler — Mock provider 와 통합 (DREAMPIA_TEST=1) → text 누적.
 *  - AutomationManager.runOnce — handler_name + output 이 audit 에 포함.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

import {
  HandlerRegistry,
  noopLogHandler,
  truncateOutput,
  NOOP_LOG_HANDLER_NAME,
} from '../../src/main/automation/handlers/HandlerRegistry';
import {
  llmPromptHandler,
  LLM_PROMPT_HANDLER_NAME,
} from '../../src/main/automation/handlers/llmPromptHandler';
import {
  registerBuiltinHandlers,
  resetBuiltinHandlersForTesting,
  handlerRegistry,
} from '../../src/main/automation/handlers';
import {
  AutomationManager,
  type AutomationAuditEvent,
} from '../../src/main/automation/AutomationManager';

describe('v1.7.23 — HandlerRegistry', () => {
  it('register / get / has / list', () => {
    const reg = new HandlerRegistry();
    const fake = vi.fn(async () => ({ ok: true, output: 'hi' }));
    reg.register('fake-1', fake);
    expect(reg.has('fake-1')).toBe(true);
    expect(reg.get('fake-1')).toBe(fake);
    expect(reg.list()).toEqual(['fake-1']);
  });

  it('register 빈 이름 → throw', () => {
    const reg = new HandlerRegistry();
    expect(() => reg.register('', noopLogHandler)).toThrow(/required/);
  });

  it('unregister — true / 미존재 false', () => {
    const reg = new HandlerRegistry();
    reg.register('x', noopLogHandler);
    expect(reg.unregister('x')).toBe(true);
    expect(reg.unregister('x')).toBe(false);
  });

  it('list — sorted', () => {
    const reg = new HandlerRegistry();
    reg.register('zebra', noopLogHandler);
    reg.register('apple', noopLogHandler);
    reg.register('mango', noopLogHandler);
    expect(reg.list()).toEqual(['apple', 'mango', 'zebra']);
  });
});

describe('v1.7.23 — truncateOutput', () => {
  it('짧은 text — 그대로', () => {
    expect(truncateOutput('hello', 10)).toBe('hello');
  });

  it('긴 text — truncated 표시', () => {
    const long = 'a'.repeat(2500);
    const out = truncateOutput(long, 100);
    expect(out.startsWith('a'.repeat(100))).toBe(true);
    expect(out).toContain('truncated');
  });
});

describe('v1.7.23 — registerBuiltinHandlers', () => {
  beforeEach(() => {
    resetBuiltinHandlersForTesting();
  });

  it('builtin handler 들이 등록됨', () => {
    registerBuiltinHandlers();
    expect(handlerRegistry.has(NOOP_LOG_HANDLER_NAME)).toBe(true);
    expect(handlerRegistry.has(LLM_PROMPT_HANDLER_NAME)).toBe(true);
  });

  it('idempotent — 두 번 호출 시 같은 결과', () => {
    registerBuiltinHandlers();
    const list1 = handlerRegistry.list();
    registerBuiltinHandlers();
    const list2 = handlerRegistry.list();
    expect(list2).toEqual(list1);
  });
});

describe('v1.7.23 — noopLogHandler', () => {
  it('항상 ok=true + output=noop', async () => {
    const r = await noopLogHandler({ rule_name: 'test', config: {} });
    expect(r.ok).toBe(true);
    expect(r.output).toBe('noop');
  });
});

describe('v1.7.23 — llmPromptHandler', () => {
  it('prompt 누락 → ok=false', async () => {
    const r = await llmPromptHandler({ rule_name: 'test', config: {} });
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/prompt required/);
  });

  it('prompt 빈 문자열 → ok=false', async () => {
    const r = await llmPromptHandler({
      rule_name: 'test',
      config: { prompt: '   ' },
    });
    expect(r.ok).toBe(false);
  });

  it('DREAMPIA_TEST=1 — Mock provider 가 응답', async () => {
    const orig = process.env.DREAMPIA_TEST;
    process.env.DREAMPIA_TEST = '1';
    try {
      const r = await llmPromptHandler({
        rule_name: 'test',
        config: { prompt: 'hello world' },
      });
      // MockProvider 가 정상 응답 — ok=true. output 은 비어있을 수 있음
      // (Mock 의 응답 패턴에 의존 X — ok 만 확실히).
      expect(r.ok).toBe(true);
    } finally {
      if (orig === undefined) delete process.env.DREAMPIA_TEST;
      else process.env.DREAMPIA_TEST = orig;
    }
  });
});

describe('v1.7.23 — AutomationManager runOnce 가 HandlerResult 처리', () => {
  it('handler 가 HandlerResult 반환 → audit 에 output 포함', async () => {
    const events: AutomationAuditEvent[] = [];
    const mgr = new AutomationManager({
      auditSink: (e) => events.push(e),
    });
    mgr.register({
      name: 'rule-with-handler',
      kind: 'interval',
      interval_ms: 60_000,
      handler_name: 'fake-handler',
      handler: async () => ({ ok: true, output: 'job done' }),
    });
    await mgr.fire('rule-with-handler');
    expect(events.length).toBe(1);
    const ev = events[0]!;
    expect(ev.event).toBe('automation.fired');
    expect(ev.handler_name).toBe('fake-handler');
    expect(ev.output).toBe('job done');
  });

  it('handler 가 ok=false 반환 → automation.error 분기', async () => {
    const events: AutomationAuditEvent[] = [];
    const mgr = new AutomationManager({
      auditSink: (e) => events.push(e),
    });
    mgr.register({
      name: 'failing',
      kind: 'interval',
      interval_ms: 60_000,
      handler_name: 'fake-bad',
      handler: async () => ({ ok: false, error: 'boom' }),
    });
    await mgr.fire('failing');
    expect(events.length).toBe(1);
    const ev = events[0]!;
    expect(ev.event).toBe('automation.error');
    expect(ev.error).toBe('boom');
    expect(ev.handler_name).toBe('fake-bad');
  });

  it('handler 가 void 반환 → output 미포함, 종전 호환', async () => {
    const events: AutomationAuditEvent[] = [];
    const mgr = new AutomationManager({
      auditSink: (e) => events.push(e),
    });
    mgr.register({
      name: 'voidish',
      kind: 'interval',
      interval_ms: 60_000,
      handler: async (): Promise<void> => {
        // noop
      },
    });
    await mgr.fire('voidish');
    expect(events.length).toBe(1);
    const ev = events[0]!;
    expect(ev.event).toBe('automation.fired');
    expect(ev.output).toBeUndefined();
    expect(ev.handler_name).toBeUndefined();
  });
});
