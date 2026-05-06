/**
 * v1.7.26 — Automation audit log DB persistence.
 *
 * 검증:
 *  - AutomationManager.fire 가 auditSink 호출 → AuditLogStore.recordEvent 트리거.
 *  - target_json 의 round-trip JSON.parse 로 rule_name + handler_name 복원.
 *  - rule_name 필터 적용 시 다른 rule 의 row 제외.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  AutomationManager,
  type AutomationAuditEvent,
} from '../../src/main/automation/AutomationManager';
import { AuditLogStore, SessionStore } from '../../src/storage';

function buildAuditSink(audit: AuditLogStore): (e: AutomationAuditEvent) => void {
  return (event) => {
    audit.recordEvent({
      timestamp: event.timestamp,
      session_id: 'automation',
      event: event.event,
      capability: 'AUTOMATION',
      target_json: JSON.stringify({
        rule_name: event.rule_name,
        handler_name: event.handler_name,
        duration_ms: event.duration_ms,
        output: event.output,
      }),
      decision_reason: event.event === 'automation.fired' ? 'fired' : 'error',
      outcome: event.event === 'automation.fired' ? 'ok' : 'failed',
      error: event.error,
    });
  };
}

describe('v1.7.26 — Automation audit log persistence', () => {
  let store: SessionStore;
  let audit: AuditLogStore;

  beforeEach(() => {
    store = new SessionStore(':memory:');
    audit = new AuditLogStore(store.getDb());
  });

  afterEach(() => {
    store.close();
  });

  it('automation.fired event 가 audit_log 테이블에 기록됨', async () => {
    const mgr = new AutomationManager({ auditSink: buildAuditSink(audit) });
    mgr.register({
      name: 'r1',
      kind: 'interval',
      interval_ms: 60_000,
      handler: async () => ({ ok: true, output: 'noop' }),
      handler_name: 'noop-log',
    });
    await mgr.fire('r1');

    const rows = audit.getRecent(50, { capability: 'AUTOMATION' });
    expect(rows.length).toBeGreaterThan(0);
    const fired = rows.find((r) => r.event === 'automation.fired');
    expect(fired).toBeDefined();
  });

  it('target_json round-trip — rule_name/handler_name 복원', async () => {
    const mgr = new AutomationManager({ auditSink: buildAuditSink(audit) });
    mgr.register({
      name: 'rule-X',
      kind: 'interval',
      interval_ms: 10_000,
      handler: async () => ({ ok: true, output: 'x' }),
      handler_name: 'noop-log',
    });
    await mgr.fire('rule-X');

    const rows = audit.getRecent(50, { capability: 'AUTOMATION' });
    const fired = rows.find((r) => r.event === 'automation.fired');
    expect(fired).toBeDefined();
    const parsed = JSON.parse(fired!.target_json) as {
      rule_name?: string;
      handler_name?: string;
    };
    expect(parsed.rule_name).toBe('rule-X');
    expect(parsed.handler_name).toBe('noop-log');
  });

  it('rule_name 필터 — 다른 rule 의 row 제외', async () => {
    const mgr = new AutomationManager({ auditSink: buildAuditSink(audit) });
    mgr.register({
      name: 'alpha',
      kind: 'interval',
      interval_ms: 10_000,
      handler: async () => ({ ok: true }),
      handler_name: 'noop-log',
    });
    mgr.register({
      name: 'beta',
      kind: 'interval',
      interval_ms: 10_000,
      handler: async () => ({ ok: true }),
      handler_name: 'noop-log',
    });
    await mgr.fire('alpha');
    await mgr.fire('beta');

    const all = audit.getRecent(50, { capability: 'AUTOMATION' });
    const alphaOnly = all.filter((r) => {
      try {
        const parsed = JSON.parse(r.target_json) as { rule_name?: string };
        return parsed.rule_name === 'alpha';
      } catch {
        return false;
      }
    });
    expect(alphaOnly.length).toBeGreaterThan(0);
    expect(
      alphaOnly.every((r) => {
        const parsed = JSON.parse(r.target_json) as { rule_name?: string };
        return parsed.rule_name === 'alpha';
      })
    ).toBe(true);
    // beta row 도 존재함을 확인해 필터 분리가 의미가 있음을 보장.
    const betaCount = all.filter((r) => {
      try {
        const parsed = JSON.parse(r.target_json) as { rule_name?: string };
        return parsed.rule_name === 'beta';
      } catch {
        return false;
      }
    }).length;
    expect(betaCount).toBeGreaterThan(0);
  });
});
