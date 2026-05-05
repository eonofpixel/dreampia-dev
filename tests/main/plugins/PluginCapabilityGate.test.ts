/**
 * PluginCapabilityGate unit tests (v1.1.23).
 *
 * 검증:
 *  - confirmer 없으면 모두 거절 + audit 'cap_no_confirmer'.
 *  - 'once' / 'session' / 'always' 응답 → granted (in-memory cache).
 *  - 'deny' 응답 → false + 거절 set 에 추가 (재요청 X).
 *  - 같은 capability 두 번째 요청 → confirmer 재호출 X (캐시).
 *  - 다른 plugin 의 같은 capability 는 별도 요청.
 *  - confirmer throw → false + audit 'cap_denied'.
 *  - clearAll — 캐시 reset.
 */

import { describe, it, expect } from 'vitest';
import {
  PluginCapabilityGate,
  type PluginCapabilityAuditEvent,
} from '../../../src/main/plugins/PluginCapabilityGate';
import type {
  PermissionConfirmer,
  PermissionRequest,
  PermissionResponse,
} from '../../../src/tools';

function makeConfirmer(decisions: PermissionResponse['decision'][]): {
  confirmer: PermissionConfirmer;
  received: PermissionRequest[];
} {
  let i = 0;
  const received: PermissionRequest[] = [];
  return {
    received,
    confirmer: {
      confirm: async (req) => {
        received.push(req);
        const decision = decisions[i] ?? 'deny';
        i += 1;
        return { request_id: req.request_id, decision };
      },
    },
  };
}

describe('v1.1.23 — PluginCapabilityGate', () => {
  it('confirmer 없으면 모든 capability 거절', async () => {
    const audit: PluginCapabilityAuditEvent[] = [];
    const gate = new PluginCapabilityGate({
      auditSink: (e) => audit.push(e),
    });
    const result = await gate.ensureGranted('cost-limit', ['NETWORK_REMOTE']);
    expect(result).toBe(false);
    expect(audit.some((e) => e.event === 'plugin.cap_no_confirmer')).toBe(true);
  });

  it("'once' 응답 → granted + audit cap_granted", async () => {
    const { confirmer, received } = makeConfirmer(['once']);
    const audit: PluginCapabilityAuditEvent[] = [];
    const gate = new PluginCapabilityGate({
      confirmer,
      auditSink: (e) => audit.push(e),
    });
    expect(await gate.ensureGranted('p', ['CAP_A'])).toBe(true);
    expect(received.length).toBe(1);
    expect(gate.isGranted('p', 'CAP_A')).toBe(true);
    expect(audit.some((e) => e.event === 'plugin.cap_granted')).toBe(true);
  });

  it("'session' / 'always' 도 granted", async () => {
    const { confirmer } = makeConfirmer(['session', 'always']);
    const gate = new PluginCapabilityGate({ confirmer });
    expect(await gate.ensureGranted('p1', ['A'])).toBe(true);
    expect(await gate.ensureGranted('p2', ['B'])).toBe(true);
    expect(gate.isGranted('p1', 'A')).toBe(true);
    expect(gate.isGranted('p2', 'B')).toBe(true);
  });

  it("'deny' → false + 같은 cap 재요청 X (denied set)", async () => {
    const { confirmer, received } = makeConfirmer(['deny']);
    const gate = new PluginCapabilityGate({ confirmer });
    expect(await gate.ensureGranted('p', ['CAP_X'])).toBe(false);
    expect(await gate.ensureGranted('p', ['CAP_X'])).toBe(false);
    expect(received.length).toBe(1);
  });

  it('같은 plugin/cap 두 번째 요청 → confirmer 재호출 X (캐시)', async () => {
    const { confirmer, received } = makeConfirmer(['always']);
    const gate = new PluginCapabilityGate({ confirmer });
    await gate.ensureGranted('p', ['CAP_Y']);
    await gate.ensureGranted('p', ['CAP_Y']);
    expect(received.length).toBe(1);
  });

  it('다른 plugin 의 같은 cap 은 별도 요청', async () => {
    const { confirmer, received } = makeConfirmer(['once', 'once']);
    const gate = new PluginCapabilityGate({ confirmer });
    await gate.ensureGranted('plugA', ['CAP_Z']);
    await gate.ensureGranted('plugB', ['CAP_Z']);
    expect(received.length).toBe(2);
  });

  it('confirmer throw → false + audit cap_denied', async () => {
    const audit: PluginCapabilityAuditEvent[] = [];
    const confirmer: PermissionConfirmer = {
      confirm: async () => {
        throw new Error('IPC down');
      },
    };
    const gate = new PluginCapabilityGate({
      confirmer,
      auditSink: (e) => audit.push(e),
    });
    expect(await gate.ensureGranted('p', ['C'])).toBe(false);
    expect(audit.some((e) => e.event === 'plugin.cap_denied')).toBe(true);
  });

  it('여러 capability 중 하나라도 deny → 전체 false', async () => {
    const { confirmer } = makeConfirmer(['once', 'deny']);
    const gate = new PluginCapabilityGate({ confirmer });
    expect(await gate.ensureGranted('p', ['A', 'B'])).toBe(false);
    expect(gate.isGranted('p', 'A')).toBe(true);
    expect(gate.isGranted('p', 'B')).toBe(false);
  });

  it('clearAll — 캐시 reset', async () => {
    const { confirmer, received } = makeConfirmer(['once', 'once']);
    const gate = new PluginCapabilityGate({ confirmer });
    await gate.ensureGranted('p', ['A']);
    expect(received.length).toBe(1);
    gate.clearAll();
    await gate.ensureGranted('p', ['A']);
    expect(received.length).toBe(2);
  });
});
