/**
 * AutomationManager unit tests (v1.3.7).
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  AutomationManager,
  type AutomationAuditEvent,
} from '../../src/main/automation/AutomationManager';

let audit: AutomationAuditEvent[];
beforeEach(() => {
  audit = [];
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
});

function makeManager(): AutomationManager {
  return new AutomationManager({
    auditSink: (e): void => {
      audit.push(e);
    },
  });
}

describe('v1.3.7 — AutomationManager', () => {
  it('register / list / unregister', () => {
    const m = makeManager();
    m.register({ name: 'a', kind: 'interval', interval_ms: 1000, handler: () => {} });
    expect(m.list().length).toBe(1);
    expect(m.unregister('a')).toBe(true);
    expect(m.list().length).toBe(0);
  });

  it('register interval kind 가 ms 검증', () => {
    const m = makeManager();
    expect(() =>
      m.register({ name: 'x', kind: 'interval', handler: () => {} })
    ).toThrow(/interval_ms/);
  });

  it('fire — handler 호출 + audit fired', async () => {
    const m = makeManager();
    const fn = vi.fn();
    m.register({ name: 'r', kind: 'interval', interval_ms: 1000, handler: fn });
    await m.fire('r');
    expect(fn).toHaveBeenCalledTimes(1);
    expect(audit.some((e) => e.event === 'automation.fired')).toBe(true);
  });

  it('handler throw → audit error + 다음 fire 정상', async () => {
    const m = makeManager();
    let count = 0;
    m.register({
      name: 'r',
      kind: 'interval',
      interval_ms: 1000,
      handler: () => {
        count += 1;
        if (count === 1) throw new Error('boom');
      },
    });
    await m.fire('r');
    await m.fire('r');
    expect(count).toBe(2);
    expect(audit.filter((e) => e.event === 'automation.error').length).toBe(1);
    expect(audit.filter((e) => e.event === 'automation.fired').length).toBe(1);
  });

  it('start() — 등록된 interval 자동 fire', async () => {
    const m = makeManager();
    const fn = vi.fn();
    m.register({ name: 'r', kind: 'interval', interval_ms: 1000, handler: fn });
    m.start();
    await vi.advanceTimersByTimeAsync(2_500);
    expect(fn.mock.calls.length).toBeGreaterThanOrEqual(2);
    m.stop();
  });

  it('stop() — interval 중단', async () => {
    const m = makeManager();
    const fn = vi.fn();
    m.register({ name: 'r', kind: 'interval', interval_ms: 500, handler: fn });
    m.start();
    await vi.advanceTimersByTimeAsync(1_500);
    const beforeStop = fn.mock.calls.length;
    m.stop();
    await vi.advanceTimersByTimeAsync(2_000);
    expect(fn.mock.calls.length).toBe(beforeStop);
  });

  it('webhook kind — register 가능 (HTTP listener stub 후속)', () => {
    const m = makeManager();
    m.register({
      name: 'wh',
      kind: 'webhook',
      webhook_path: '/hooks/x',
      handler: () => {},
    });
    expect(m.list().length).toBe(1);
  });
});

describe('v1.7.3 — AutomationManager cron kind', () => {
  // cron tests don't need fake timers (croner manages its own timers and we
  // don't time-travel into them). useRealTimers 안에서 동작.
  beforeEach(() => {
    vi.useRealTimers();
    audit = [];
  });

  it('register cron 가 cron_expr 검증 (빈 값 throw)', () => {
    const m = makeManager();
    expect(() =>
      m.register({
        name: 'c1',
        kind: 'cron',
        cron_expr: '',
        handler: () => {},
      })
    ).toThrow(/cron_expr/);
  });

  it('register cron 가 invalid expression throw', () => {
    const m = makeManager();
    expect(() =>
      m.register({
        name: 'c2',
        kind: 'cron',
        cron_expr: 'not a cron',
        handler: () => {},
      })
    ).toThrow();
  });

  it('register cron 가 valid expression 통과', () => {
    const m = makeManager();
    m.register({
      name: 'c3',
      kind: 'cron',
      cron_expr: '0 9 * * 1-5',
      handler: () => {},
    });
    expect(m.list().length).toBe(1);
    expect(m.list()[0]!.kind).toBe('cron');
  });

  it('register cron 가 valid IANA timezone 통과', () => {
    const m = makeManager();
    m.register({
      name: 'c4',
      kind: 'cron',
      cron_expr: '0 9 * * *',
      cron_tz: 'Asia/Seoul',
      handler: () => {},
    });
    expect(m.list()[0]!.cron_tz).toBe('Asia/Seoul');
  });

  it('start() / stop() — cron job lifecycle 안전', () => {
    const m = makeManager();
    m.register({
      name: 'c6',
      kind: 'cron',
      cron_expr: '0 0 1 1 *',
      handler: () => {},
    });
    m.start();
    m.stop();
    expect(m.list().length).toBe(1);
  });

  it('unregister 가 cron job 도 stop', () => {
    const m = makeManager();
    m.register({
      name: 'c7',
      kind: 'cron',
      cron_expr: '0 0 1 1 *',
      handler: () => {},
    });
    m.start();
    expect(m.unregister('c7')).toBe(true);
    expect(m.list().length).toBe(0);
  });

  it('AutomationManager.getNextRun — valid expr 의 ISO timestamp 반환', () => {
    const next = AutomationManager.getNextRun('* * * * *');
    expect(next).not.toBeNull();
    expect(next).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
  });

  it('AutomationManager.getNextRun — invalid expr → null', () => {
    expect(AutomationManager.getNextRun('not a cron')).toBeNull();
  });

  it("'cron' kind 가 list() 에 보존", () => {
    const m = makeManager();
    m.register({
      name: 'c10',
      kind: 'cron',
      cron_expr: '*/5 * * * *',
      handler: vi.fn(),
    });
    const rules = m.list();
    expect(rules[0]!.kind).toBe('cron');
    expect(rules[0]!.cron_expr).toBe('*/5 * * * *');
  });
});
