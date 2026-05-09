/**
 * eventBus + topicPublishers tests (v2.3.0 US-503/504/505).
 *
 * AC-5.1..5.6 coverage:
 *   - bounded queue + drop-oldest on overflow (1500-event flood)
 *   - priority lane: revoke event delivered before queued events drain
 *   - per-topic FIFO (monotonic seq)
 *   - subscription_id randomness + revoke-list rejection
 *   - removeAllForPid (worker exit cleanup)
 *   - removeForCapability prefix matching
 *   - topicPublishers canonical topic names
 */

import { describe, it, expect } from 'vitest';
import {
  HostEventBus,
  type EventEnvelope,
  type EventBusAuditEvent,
} from '../../../src/main/plugins/eventBus';
import {
  TOPIC_AUDIT_LOG,
  TOPIC_WORKSPACE_FILE_CHANGE,
  TOPIC_SESSION_PATH_CHANGE,
  publishAuditLog,
  publishWorkspaceFileChange,
  publishSessionPathChange,
} from '../../../src/main/plugins/topicPublishers';

interface BusHarness {
  bus: HostEventBus;
  delivered: Array<{ plugin_id: string; env: EventEnvelope }>;
  audits: EventBusAuditEvent[];
}

function makeBus(opts: { queueCap?: number } = {}): BusHarness {
  const delivered: Array<{ plugin_id: string; env: EventEnvelope }> = [];
  const audits: EventBusAuditEvent[] = [];
  const bus = new HostEventBus({
    queueCap: opts.queueCap ?? 1000,
    onDeliver: (plugin_id, env) => delivered.push({ plugin_id, env }),
    auditSink: (e) => audits.push(e),
  });
  return { bus, delivered, audits };
}

describe('v2.3.0 US-503 — bounded queue + drop-oldest (AC-5.2)', () => {
  it('1500-event flood: queue caps at 1000, drop-oldest applied', () => {
    const h = makeBus({ queueCap: 1000 });
    const sub_id = h.bus.newSubscriptionId();
    h.bus.add('p1', 1234, sub_id, TOPIC_AUDIT_LOG);
    for (let i = 0; i < 1500; i += 1) {
      publishAuditLog(h.bus, {
        timestamp: '2026-05-09T00:00:00.000Z',
        event: 'tool_use.success',
        capability: 'host.fs.read',
        decision_reason: `flood-${i}`,
      });
    }
    expect(h.bus.queueLength(sub_id)).toBe(1000);
    const drops = h.audits.filter((e) => e.kind === 'event.dropped');
    expect(drops.length).toBe(500);
  });

  it('per-topic FIFO: seq is monotonic per topic', () => {
    const h = makeBus();
    const sub_id = h.bus.newSubscriptionId();
    h.bus.add('p1', 1234, sub_id, TOPIC_WORKSPACE_FILE_CHANGE);
    for (let i = 0; i < 5; i += 1) {
      publishWorkspaceFileChange(h.bus, {
        workspace_id: 'ws1',
        rel_path: `f${i}.txt`,
        kind: 'created',
        at: '2026-05-09T00:00:00.000Z',
      });
    }
    const delivered = h.delivered.filter((d) => d.env.topic === TOPIC_WORKSPACE_FILE_CHANGE);
    expect(delivered.length).toBe(5);
    const seqs = delivered.map((d) => d.env.seq);
    expect(seqs).toEqual([1, 2, 3, 4, 5]);
  });
});

describe('v2.3.0 US-503/G5 — priority lane (AC-5.4)', () => {
  it('publishPriority delivers synchronously with priority=true and bypasses queue', () => {
    const h = makeBus({ queueCap: 100 });
    const sub_id = h.bus.newSubscriptionId();
    h.bus.add('p1', 1234, sub_id, TOPIC_AUDIT_LOG);
    // Fill normal queue first
    for (let i = 0; i < 100; i += 1) {
      publishAuditLog(h.bus, {
        timestamp: '2026-05-09T00:00:00.000Z',
        event: 'tool_use.success',
        capability: 'host.fs.read',
        decision_reason: `normal-${i}`,
      });
    }
    const beforeDeliveries = h.delivered.length;
    // Priority publish
    h.bus.publishPriority('p1', TOPIC_AUDIT_LOG, { kind: 'revoke-notice' });
    const priorityDeliveries = h.delivered.slice(beforeDeliveries);
    expect(priorityDeliveries.length).toBe(1);
    expect(priorityDeliveries[0]!.env.priority).toBe(true);
    expect(h.audits.find((e) => e.kind === 'event.priority_delivered')).toBeDefined();
  });
});

describe('v2.3.0 US-503 — subscription_id randomness + revoke-list rejection (AC-5.3)', () => {
  it('newSubscriptionId returns 64-char hex (32 bytes)', () => {
    const h = makeBus();
    const id = h.bus.newSubscriptionId();
    expect(id).toMatch(/^[0-9a-f]{64}$/);
  });

  it('two consecutive ids are different (not deterministic)', () => {
    const h = makeBus();
    const a = h.bus.newSubscriptionId();
    const b = h.bus.newSubscriptionId();
    expect(a).not.toBe(b);
  });

  it('revoked id is added to revokedIds; subsequent add() throws', () => {
    const h = makeBus();
    const id = h.bus.newSubscriptionId();
    h.bus.add('p1', 1234, id, TOPIC_AUDIT_LOG);
    h.bus.removeOne(id);
    expect(h.bus.revokedIdsCount()).toBe(1);
    expect(() => h.bus.add('p1', 1234, id, TOPIC_AUDIT_LOG)).toThrow(/previously revoked/);
  });

  it('newSubscriptionId never returns a previously-revoked id', () => {
    // Mock random to return the same buffer twice; the 2nd call should detect
    // collision and recurse.
    const buf = Buffer.alloc(32, 0xab);
    const buf2 = Buffer.alloc(32, 0xcd);
    let calls = 0;
    const bus = new HostEventBus({
      onDeliver: () => {},
      randomBytesFn: () => {
        calls += 1;
        // First two calls return buf (same id), third returns buf2.
        return calls < 3 ? buf : buf2;
      },
    });
    const a = bus.newSubscriptionId();
    bus.add('p1', 1234, a, TOPIC_AUDIT_LOG);
    bus.removeOne(a);
    const b = bus.newSubscriptionId();
    expect(b).not.toBe(a);
    expect(b).toBe(buf2.toString('hex'));
  });
});

describe('v2.3.0 US-503 — removeAllForPid (AC-5.6 cleanup)', () => {
  it('worker exit removes every subscription bound to that pid', () => {
    const h = makeBus();
    const a = h.bus.newSubscriptionId();
    const b = h.bus.newSubscriptionId();
    const c = h.bus.newSubscriptionId();
    h.bus.add('p1', 1234, a, TOPIC_AUDIT_LOG);
    h.bus.add('p1', 1234, b, TOPIC_WORKSPACE_FILE_CHANGE);
    h.bus.add('p2', 5678, c, TOPIC_AUDIT_LOG);
    h.bus.removeAllForPid(1234);
    expect(h.bus.listForPlugin('p1').length).toBe(0);
    expect(h.bus.listForPlugin('p2').length).toBe(1);
  });
});

describe('v2.3.0 US-503 — removeForCapability prefix matching', () => {
  it('host.audit.write removes audit.* topic subscriptions', () => {
    const h = makeBus();
    const a = h.bus.newSubscriptionId();
    const b = h.bus.newSubscriptionId();
    h.bus.add('p1', 1234, a, TOPIC_AUDIT_LOG);
    h.bus.add('p1', 1234, b, TOPIC_WORKSPACE_FILE_CHANGE);
    h.bus.removeForCapability('p1', 'host.audit.write');
    const remaining = h.bus.listForPlugin('p1');
    expect(remaining.length).toBe(1);
    expect(remaining[0]!.topic).toBe(TOPIC_WORKSPACE_FILE_CHANGE);
  });

  it('host.workspace.* removes workspace.* topics', () => {
    const h = makeBus();
    const a = h.bus.newSubscriptionId();
    const b = h.bus.newSubscriptionId();
    h.bus.add('p1', 1234, a, TOPIC_WORKSPACE_FILE_CHANGE);
    h.bus.add('p1', 1234, b, TOPIC_AUDIT_LOG);
    h.bus.removeForCapability('p1', 'host.workspace.write');
    const remaining = h.bus.listForPlugin('p1');
    expect(remaining.length).toBe(1);
    expect(remaining[0]!.topic).toBe(TOPIC_AUDIT_LOG);
  });
});

describe('v2.3.0 US-504 — topicPublishers canonical names', () => {
  it('publishAuditLog routes to TOPIC_AUDIT_LOG', () => {
    const h = makeBus();
    const id = h.bus.newSubscriptionId();
    h.bus.add('p1', 1234, id, TOPIC_AUDIT_LOG);
    publishAuditLog(h.bus, {
      timestamp: '2026-05-09T00:00:00.000Z',
      event: 'tool_use.success',
      capability: 'host.fs.read',
      decision_reason: 'ok',
    });
    expect(h.delivered[0]?.env.topic).toBe(TOPIC_AUDIT_LOG);
  });

  it('publishWorkspaceFileChange routes to TOPIC_WORKSPACE_FILE_CHANGE', () => {
    const h = makeBus();
    const id = h.bus.newSubscriptionId();
    h.bus.add('p1', 1234, id, TOPIC_WORKSPACE_FILE_CHANGE);
    publishWorkspaceFileChange(h.bus, {
      workspace_id: 'ws1',
      rel_path: 'a.txt',
      kind: 'created',
      at: '2026-05-09T00:00:00.000Z',
    });
    expect(h.delivered[0]?.env.topic).toBe(TOPIC_WORKSPACE_FILE_CHANGE);
  });

  it('publishSessionPathChange routes to TOPIC_SESSION_PATH_CHANGE', () => {
    const h = makeBus();
    const id = h.bus.newSubscriptionId();
    h.bus.add('p1', 1234, id, TOPIC_SESSION_PATH_CHANGE);
    publishSessionPathChange(h.bus, {
      session_id: 's1',
      new_workspace_id: 'ws1',
      at: '2026-05-09T00:00:00.000Z',
    });
    expect(h.delivered[0]?.env.topic).toBe(TOPIC_SESSION_PATH_CHANGE);
  });
});
