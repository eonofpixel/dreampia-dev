/**
 * v1.7.27 — Automation rule enable/disable toggle.
 *
 * 검증:
 *  - enabled=false 로 register 한 rule 의 fire 호출 시 audit emit 안 됨 (skip).
 *  - setEnabled(name, true) 후 fire 시 audit emit 정상.
 *  - setEnabled(nonexistent, x) → false 반환.
 *  - summarizeRule 이 enabled=false 를 보존 (round-trip).
 */

import { describe, it, expect } from 'vitest';
import {
  AutomationManager,
  type AutomationAuditEvent,
  summarizeRule,
} from '../../src/main/automation/AutomationManager';

describe('v1.7.27 — Automation enable/disable', () => {
  it('enabled=false rule 은 fire 시 audit 가 안 일어남 (skip)', async () => {
    const events: AutomationAuditEvent[] = [];
    const mgr = new AutomationManager({ auditSink: (e) => events.push(e) });
    mgr.register({
      name: 'r1',
      kind: 'interval',
      interval_ms: 60_000,
      enabled: false,
      handler: async () => ({ ok: true, output: 'noop' }),
      handler_name: 'noop-log',
    });
    await mgr.fire('r1');
    expect(events.length).toBe(0);
  });

  it('setEnabled(name, true) 후 fire 정상 동작', async () => {
    const events: AutomationAuditEvent[] = [];
    const mgr = new AutomationManager({ auditSink: (e) => events.push(e) });
    mgr.register({
      name: 'r2',
      kind: 'interval',
      interval_ms: 60_000,
      enabled: false,
      handler: async () => ({ ok: true, output: 'noop' }),
      handler_name: 'noop-log',
    });
    expect(mgr.setEnabled('r2', true)).toBe(true);
    await mgr.fire('r2');
    expect(events.length).toBe(1);
    expect(events[0]?.event).toBe('automation.fired');
  });

  it('setEnabled(존재하지 않는 rule, x) → false 반환', () => {
    const mgr = new AutomationManager();
    expect(mgr.setEnabled('nope', true)).toBe(false);
    expect(mgr.setEnabled('nope', false)).toBe(false);
  });

  it('summarizeRule — enabled=false 보존 (settings round-trip)', () => {
    const summary = summarizeRule({
      name: 'r3',
      kind: 'interval',
      interval_ms: 1000,
      enabled: false,
      handler: () => undefined,
      handler_name: 'noop-log',
    });
    expect(summary.enabled).toBe(false);
  });

  it('setEnabled(true → false) 후 fire 시 다시 skip', async () => {
    const events: AutomationAuditEvent[] = [];
    const mgr = new AutomationManager({ auditSink: (e) => events.push(e) });
    mgr.register({
      name: 'r4',
      kind: 'interval',
      interval_ms: 60_000,
      handler: async () => ({ ok: true }),
      handler_name: 'noop-log',
    });
    await mgr.fire('r4');
    expect(events.length).toBe(1);

    mgr.setEnabled('r4', false);
    await mgr.fire('r4');
    expect(events.length).toBe(1); // increment 없음
  });
});
