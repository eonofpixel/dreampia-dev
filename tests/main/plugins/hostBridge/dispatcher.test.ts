/**
 * dispatcher + abortRegistry + rateLimit tests (v2.3.0 US-400/401/402/404/405).
 *
 * Coverage:
 *   - revoke-mid-call → GRANT_EPOCH_STALE response (G5 sync invalidation)
 *   - half-write transactional via abortRegistry → AbortError observable in handler
 *   - rate-limit honored (US-402)
 *   - fail-closed validation: malformed envelope, invalid params, unknown method
 *   - capability check denies UNAUTHORIZED before handler runs (AC-4.4)
 *   - audit-event emission on each path (success / failed / aborted / unauthorized / stale)
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { z } from 'zod';
import {
  HostBridgeDispatcher,
  type DispatcherAuditEvent,
  type DispatcherDeps,
} from '../../../../src/main/plugins/hostBridge/dispatcher';
import { HostAbortRegistry } from '../../../../src/main/plugins/hostBridge/abortRegistry';
import { RateLimiter } from '../../../../src/main/plugins/hostBridge/rateLimit';

interface TestHarness {
  dispatcher: HostBridgeDispatcher;
  abortRegistry: HostAbortRegistry;
  audits: DispatcherAuditEvent[];
  granted: Set<string>;
  epochs: Map<string, number>;
}

function harness(): TestHarness {
  const audits: DispatcherAuditEvent[] = [];
  const abortRegistry = new HostAbortRegistry();
  const granted = new Set<string>(['plugin-a/host.fs.read', 'plugin-a/host.fs.write']);
  const epochs = new Map<string, number>([['plugin-a', 1]]);

  const deps: DispatcherDeps = {
    epochProvider: (plugin_id) => epochs.get(plugin_id) ?? 0,
    isGranted: (plugin_id, capability) => granted.has(`${plugin_id}/${capability}`),
    abortRegistry,
    auditSink: (e) => {
      audits.push(e);
    },
  };
  const dispatcher = new HostBridgeDispatcher(deps);

  // Register a couple of test handlers.
  dispatcher.register('host.fs.read', {
    capability: 'host.fs.read',
    paramsSchema: z.object({ path: z.string() }).strict(),
    handler: (params) => Promise.resolve({ contents: `read:${params.path}` }),
  });

  dispatcher.register('host.fs.write', {
    capability: 'host.fs.write',
    paramsSchema: z.object({ path: z.string(), data: z.string() }).strict(),
    handler: (params, ctx) => {
      // Simulate work that observes the abort signal.
      return new Promise((resolve, reject) => {
        const t = setTimeout(() => resolve({ written: params.data.length }), 50);
        ctx.signal.addEventListener('abort', () => {
          clearTimeout(t);
          reject(new Error('AbortError'));
        });
      });
    },
  });

  return { dispatcher, abortRegistry, audits, granted, epochs };
}

let h: TestHarness;
beforeEach(() => {
  h = harness();
});

describe('v2.3.0 US-400/405 — dispatcher fail-closed validation', () => {
  it('malformed envelope → MALFORMED_ENVELOPE error + audit', async () => {
    const r = await h.dispatcher.dispatch('plugin-a', { type: 'wrong', call_id: 'x' });
    expect(r.type).toBe('plugin-rpc-error');
    if (r.type === 'plugin-rpc-error') expect(r.error.code).toBe('MALFORMED_ENVELOPE');
    expect(h.audits.find((e) => e.kind === 'rpc.malformed')).toBeDefined();
  });

  it('unknown method → METHOD_NOT_FOUND', async () => {
    const r = await h.dispatcher.dispatch('plugin-a', {
      type: 'plugin-rpc',
      call_id: 'c1',
      method: 'host.fs.bogus',
      params: {},
    });
    expect(r.type).toBe('plugin-rpc-error');
    if (r.type === 'plugin-rpc-error') expect(r.error.code).toBe('METHOD_NOT_FOUND');
  });

  it('invalid params (zod fail-closed) → INVALID_PARAMS', async () => {
    const r = await h.dispatcher.dispatch('plugin-a', {
      type: 'plugin-rpc',
      call_id: 'c1',
      method: 'host.fs.read',
      params: { wrong: 'shape' },
    });
    expect(r.type).toBe('plugin-rpc-error');
    if (r.type === 'plugin-rpc-error') expect(r.error.code).toBe('INVALID_PARAMS');
  });

  it('unauthorized capability → UNAUTHORIZED + audit (AC-4.4 per-call check)', async () => {
    h.granted.delete('plugin-a/host.fs.read');
    const r = await h.dispatcher.dispatch('plugin-a', {
      type: 'plugin-rpc',
      call_id: 'c1',
      method: 'host.fs.read',
      params: { path: '/etc/passwd' },
    });
    expect(r.type).toBe('plugin-rpc-error');
    if (r.type === 'plugin-rpc-error') expect(r.error.code).toBe('UNAUTHORIZED');
    expect(h.audits.find((e) => e.kind === 'rpc.unauthorized')).toBeDefined();
  });
});

describe('v2.3.0 US-400/405 — dispatcher success path', () => {
  it('valid request → result + audit success', async () => {
    const r = await h.dispatcher.dispatch('plugin-a', {
      type: 'plugin-rpc',
      call_id: 'c1',
      method: 'host.fs.read',
      params: { path: '/etc/hosts' },
    });
    expect(r.type).toBe('plugin-rpc-result');
    if (r.type === 'plugin-rpc-result') {
      expect(r.result).toEqual({ contents: 'read:/etc/hosts' });
    }
    expect(h.audits.find((e) => e.kind === 'rpc.dispatched')).toBeDefined();
    expect(h.audits.find((e) => e.kind === 'rpc.success')).toBeDefined();
  });
});

describe('v2.3.0 US-403/404/405 — G5 revoke-mid-call', () => {
  it('grant_epoch advances during RPC → GRANT_EPOCH_STALE error', async () => {
    // Trigger a slow handler then bump epoch before it completes.
    const promise = h.dispatcher.dispatch('plugin-a', {
      type: 'plugin-rpc',
      call_id: 'c1',
      method: 'host.fs.write',
      params: { path: '/tmp/x', data: 'hello' },
    });
    // Bump epoch before the 50ms timer in handler resolves.
    setTimeout(() => h.epochs.set('plugin-a', 2), 10);
    const r = await promise;
    expect(r.type).toBe('plugin-rpc-error');
    if (r.type === 'plugin-rpc-error') expect(r.error.code).toBe('GRANT_EPOCH_STALE');
    expect(h.audits.find((e) => e.kind === 'rpc.stale_epoch')).toBeDefined();
  });

  it('abortRegistry.abortAllForPlugin → handler observes abort and rejects', async () => {
    const promise = h.dispatcher.dispatch('plugin-a', {
      type: 'plugin-rpc',
      call_id: 'c1',
      method: 'host.fs.write',
      params: { path: '/tmp/x', data: 'hello' },
    });
    // Abort midway via registry — simulates revoke wired through pool.notifyRevoke.
    setTimeout(() => h.abortRegistry.abortAllForPlugin('plugin-a', 'revoked-mid-test'), 10);
    const r = await promise;
    expect(r.type).toBe('plugin-rpc-error');
    if (r.type === 'plugin-rpc-error') {
      expect(['ABORTED', 'HANDLER_ERROR']).toContain(r.error.code);
    }
  });
});

describe('v2.3.0 US-404 — HostAbortRegistry', () => {
  it('abortAllForPlugin aborts every in-flight RPC for that plugin', () => {
    const reg = new HostAbortRegistry();
    const a = reg.create('p1', 'c1');
    const b = reg.create('p1', 'c2');
    const c = reg.create('p2', 'c3');
    expect(reg.inflightForPlugin('p1')).toBe(2);
    reg.abortAllForPlugin('p1');
    expect(a.signal.aborted).toBe(true);
    expect(b.signal.aborted).toBe(true);
    expect(c.signal.aborted).toBe(false);
    expect(reg.inflightForPlugin('p1')).toBe(0);
  });

  it('abortAllForPid aborts every RPC bound to that pid', () => {
    const reg = new HostAbortRegistry();
    const a = reg.create('p1', 'c1', 1234);
    const b = reg.create('p2', 'c2', 1234);
    const c = reg.create('p3', 'c3', 9999);
    reg.abortAllForPid(1234);
    expect(a.signal.aborted).toBe(true);
    expect(b.signal.aborted).toBe(true);
    expect(c.signal.aborted).toBe(false);
  });

  it('explicit abort() cleans up registry entry', () => {
    const reg = new HostAbortRegistry();
    const a = reg.create('p1', 'c1');
    expect(reg.inflightCount()).toBe(1);
    a.abort();
    expect(reg.inflightCount()).toBe(0);
    expect(a.signal.aborted).toBe(true);
  });

  it('reused call_id aborts the prior controller (defensive cleanup)', () => {
    const reg = new HostAbortRegistry();
    const a = reg.create('p1', 'c1');
    const b = reg.create('p1', 'c1'); // re-create same call_id
    expect(a.signal.aborted).toBe(true);
    expect(b.signal.aborted).toBe(false);
    expect(reg.inflightCount()).toBe(1);
  });
});

describe('v2.3.0 US-402 — RateLimiter', () => {
  it('default host.fs.* config: 100 req/s burst 200', () => {
    const limiter = new RateLimiter();
    expect(limiter.tokensRemaining('p1', 'host.fs.read')).toBe(200);
  });

  it('default host.audit.* config: 10 req/s burst 20', () => {
    const limiter = new RateLimiter();
    expect(limiter.tokensRemaining('p1', 'host.audit.write')).toBe(20);
  });

  it('consume drains burst then blocks until refill', () => {
    let now = 1000;
    const limiter = new RateLimiter({ now: () => now });
    // burst = 20 for host.audit.*. Consume all 20.
    for (let i = 0; i < 20; i += 1) {
      expect(limiter.consume('p1', 'host.audit.write')).toBe(true);
    }
    expect(limiter.consume('p1', 'host.audit.write')).toBe(false);
    // Advance 1s — refill 10 tokens.
    now += 1000;
    expect(limiter.consume('p1', 'host.audit.write')).toBe(true);
  });

  it('per-plugin override is honored', () => {
    const limiter = new RateLimiter({
      overrides: { 'p1': { 'host.fs': { refill_per_second: 1, burst: 1 } } },
    });
    expect(limiter.consume('p1', 'host.fs.read')).toBe(true);
    expect(limiter.consume('p1', 'host.fs.read')).toBe(false);
    // Other plugin still on default.
    expect(limiter.consume('p2', 'host.fs.read')).toBe(true);
  });
});
