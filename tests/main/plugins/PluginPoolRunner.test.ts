/**
 * PluginPoolRunner tests (v2.4.0 Task 1).
 *
 * Coverage:
 *   - runHook spawns worker via pool, sends host-rpc 'run-hook'
 *   - Worker plugin-rpc-result reflects payload mutation back to ctx.payload
 *   - Audit emits plugin.hook_ok on success
 *   - Worker plugin-rpc-error → audit emits plugin.hook_error
 *   - HOOK_TIMEOUT error code → audit emits plugin.hook_timeout
 *   - Capability gate denial → hook skipped + plugin.hook_blocked audit
 *   - Multiple runHook calls for the same plugin reuse the same worker (pool.spawn idempotent)
 *   - Different plugins spawn independent workers
 *   - shutdown() drains the pool
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { PluginPoolRunner } from '../../../src/main/plugins/PluginPoolRunner';
import type {
  PoolSpawnFn,
  PoolWorkerHandle,
} from '../../../src/main/plugins/PluginWorkerPool';
import type {
  GrantLedger,
  SubscriptionRegistry,
  AbortRegistry,
  PluginToHostMessage,
  HostPriorityMessage,
} from '../../../src/main/plugins/poolInterfaces';
import type { LoadedPlugin } from '../../../src/main/plugins/PluginManager';
import type { PluginHookAuditEvent } from '../../../src/main/plugins/PluginHookRunner';

// ────────────────────────────────────────────────────────────
// Mocks
// ────────────────────────────────────────────────────────────

interface MockHandle extends PoolWorkerHandle {
  posted: Array<
    | HostPriorityMessage
    | { type: 'host-rpc'; call_id: string; method: string; params: unknown }
  >;
  fireMessage: (msg: PluginToHostMessage) => void;
  fireExit: (code: number | null) => void;
}

function createHandle(pid: number): MockHandle {
  let messageListener: ((m: PluginToHostMessage) => void) | null = null;
  let exitListener: ((code: number | null) => void) | null = null;
  const handle: MockHandle = {
    pid,
    posted: [],
    fireMessage: (m) => messageListener?.(m),
    fireExit: (code) => exitListener?.(code),
    postMessage: (m) => {
      handle.posted.push(m);
    },
    on: (_event, listener) => {
      messageListener = listener;
    },
    onExit: (listener) => {
      exitListener = listener;
    },
    kill: () => {
      // noop in tests
    },
  };
  return handle;
}

function makeGrantLedger(): GrantLedger {
  const epochs = new Map<string, number>();
  return {
    bumpEpoch: (id) => {
      const next = (epochs.get(id) ?? 0) + 1;
      epochs.set(id, next);
      return next;
    },
    currentEpoch: (id) => epochs.get(id) ?? 0,
    isStaleAt: (id, snap) => snap < (epochs.get(id) ?? 0),
  };
}

function makeSubscriptionRegistry(): SubscriptionRegistry {
  return {
    add: () => {},
    removeOne: () => {},
    removeAllForPid: () => {},
    removeForCapability: () => {},
    listForPlugin: () => [],
  };
}

function makeAbortRegistry(): AbortRegistry {
  return {
    create: () => {
      const c = new AbortController();
      return { signal: c.signal, abort: (reason) => c.abort(reason) };
    },
    abortAllForPlugin: () => {},
    abortAllForPid: () => {},
  };
}

function makePlugin(name: string): LoadedPlugin {
  return {
    dir: `/fake/plugins/${name}`,
    manifest: {
      name,
      version: '1.0.0',
      hooks: { pre_turn: 'hooks/pre.js' },
      capabilities: ['host.fs.read'],
    },
    trusted: true,
  };
}

interface Harness {
  spawned: MockHandle[];
  audits: PluginHookAuditEvent[];
  runner: PluginPoolRunner;
}

let h: Harness;

beforeEach(() => {
  const spawned: MockHandle[] = [];
  let nextPid = 10000;
  const spawnFn: PoolSpawnFn = () => {
    const handle = createHandle(nextPid++);
    spawned.push(handle);
    return handle;
  };
  const audits: PluginHookAuditEvent[] = [];
  const runner = new PluginPoolRunner({
    auditSink: (e) => audits.push(e),
    poolDeps: {
      grantLedger: makeGrantLedger(),
      subscriptionRegistry: makeSubscriptionRegistry(),
      abortRegistry: makeAbortRegistry(),
    },
    spawnFn,
    workerEntryPath: '/fake/entry.js',
  });
  h = { spawned, audits, runner };
});

afterEach(async () => {
  await h.runner.shutdown();
});

// ────────────────────────────────────────────────────────────
// Tests
// ────────────────────────────────────────────────────────────

describe('v2.4.0 Task 1 — PluginPoolRunner.runHook', () => {
  it('happy path: spawn + host-rpc + plugin-rpc-result reflects payload', async () => {
    const plugin = makePlugin('p1');
    const ctx = { kind: 'pre_turn' as const, payload: { from: 'caller' } };
    const promise = h.runner.runHook([plugin], 'pre_turn', ctx);

    // Wait a tick for spawn + post.
    await new Promise((r) => setImmediate(r));
    expect(h.spawned).toHaveLength(1);
    const handle = h.spawned[0]!;
    const rpc = handle.posted.find((m) => m.type === 'host-rpc');
    expect(rpc).toBeDefined();
    if (rpc !== undefined && 'call_id' in rpc) {
      expect(rpc.method).toBe('run-hook');
      handle.fireMessage({
        type: 'plugin-rpc-result',
        call_id: rpc.call_id,
        result: { payload: { mutated: true } },
      });
    }
    await promise;
    expect(ctx.payload).toEqual({ mutated: true });
    expect(h.audits).toHaveLength(1);
    expect(h.audits[0]?.event).toBe('plugin.hook_ok');
    expect(h.audits[0]?.plugin_name).toBe('p1');
  });

  it('plugin-rpc-error → audit hook_error', async () => {
    const plugin = makePlugin('p1');
    const ctx = { kind: 'pre_turn' as const, payload: {} };
    const promise = h.runner.runHook([plugin], 'pre_turn', ctx);
    await new Promise((r) => setImmediate(r));
    const rpc = h.spawned[0]?.posted.find((m) => m.type === 'host-rpc');
    if (rpc !== undefined && 'call_id' in rpc) {
      h.spawned[0]!.fireMessage({
        type: 'plugin-rpc-error',
        call_id: rpc.call_id,
        error: { code: 'HOOK_ERROR', message: 'plugin threw' },
      });
    }
    await promise;
    const errAudit = h.audits.find((a) => a.event === 'plugin.hook_error');
    expect(errAudit).toBeDefined();
    expect(errAudit?.error).toContain('plugin threw');
  });

  it('HOOK_TIMEOUT code → audit hook_timeout', async () => {
    const plugin = makePlugin('p1');
    const ctx = { kind: 'pre_turn' as const, payload: {} };
    const promise = h.runner.runHook([plugin], 'pre_turn', ctx);
    await new Promise((r) => setImmediate(r));
    const rpc = h.spawned[0]?.posted.find((m) => m.type === 'host-rpc');
    if (rpc !== undefined && 'call_id' in rpc) {
      h.spawned[0]!.fireMessage({
        type: 'plugin-rpc-error',
        call_id: rpc.call_id,
        error: { code: 'HOOK_TIMEOUT', message: 'Script execution timed out' },
      });
    }
    await promise;
    const timeoutAudit = h.audits.find((a) => a.event === 'plugin.hook_timeout');
    expect(timeoutAudit).toBeDefined();
  });

  it('two runHook calls for same plugin reuse the same worker (idempotent spawn)', async () => {
    const plugin = makePlugin('p1');
    const ctx1 = { kind: 'pre_turn' as const, payload: { call: 1 } };
    const p1 = h.runner.runHook([plugin], 'pre_turn', ctx1);
    await new Promise((r) => setImmediate(r));
    const handle = h.spawned[0]!;
    const rpc1 = handle.posted.find((m) => m.type === 'host-rpc');
    if (rpc1 !== undefined && 'call_id' in rpc1) {
      handle.fireMessage({
        type: 'plugin-rpc-result',
        call_id: rpc1.call_id,
        result: { payload: { call: 1, ok: true } },
      });
    }
    await p1;

    const ctx2 = { kind: 'pre_turn' as const, payload: { call: 2 } };
    const p2 = h.runner.runHook([plugin], 'pre_turn', ctx2);
    await new Promise((r) => setImmediate(r));
    expect(h.spawned).toHaveLength(1); // no new spawn
    const rpc2 = handle.posted.filter((m) => m.type === 'host-rpc')[1];
    if (rpc2 !== undefined && 'call_id' in rpc2) {
      handle.fireMessage({
        type: 'plugin-rpc-result',
        call_id: rpc2.call_id,
        result: { payload: { call: 2, ok: true } },
      });
    }
    await p2;
    expect(h.audits.filter((a) => a.event === 'plugin.hook_ok')).toHaveLength(2);
  });

  it('different plugins spawn independent workers', async () => {
    const p1 = makePlugin('plugin-a');
    const p2 = makePlugin('plugin-b');
    const ctxA = { kind: 'pre_turn' as const, payload: {} };
    const ctxB = { kind: 'pre_turn' as const, payload: {} };
    const promiseA = h.runner.runHook([p1], 'pre_turn', ctxA);
    await new Promise((r) => setImmediate(r));
    const handleA = h.spawned[0]!;
    const rpcA = handleA.posted.find((m) => m.type === 'host-rpc');
    if (rpcA !== undefined && 'call_id' in rpcA) {
      handleA.fireMessage({
        type: 'plugin-rpc-result',
        call_id: rpcA.call_id,
        result: { payload: {} },
      });
    }
    await promiseA;

    const promiseB = h.runner.runHook([p2], 'pre_turn', ctxB);
    await new Promise((r) => setImmediate(r));
    expect(h.spawned).toHaveLength(2);
    const handleB = h.spawned[1]!;
    const rpcB = handleB.posted.find((m) => m.type === 'host-rpc');
    if (rpcB !== undefined && 'call_id' in rpcB) {
      handleB.fireMessage({
        type: 'plugin-rpc-result',
        call_id: rpcB.call_id,
        result: { payload: {} },
      });
    }
    await promiseB;
    expect(handleA.pid).not.toBe(handleB.pid);
  });

  it('plugin without hook for kind is skipped (no spawn)', async () => {
    const plugin: LoadedPlugin = {
      dir: '/fake',
      manifest: { name: 'no-pre', version: '1.0.0', hooks: { post_turn: 'hooks/post.js' } },
      trusted: true,
    };
    await h.runner.runHook([plugin], 'pre_turn', { kind: 'pre_turn', payload: {} });
    expect(h.spawned).toHaveLength(0);
    expect(h.audits).toHaveLength(0);
  });

  it('capability gate denial → hook_blocked audit, no spawn', async () => {
    const grantLedger = makeGrantLedger();
    const spawned: MockHandle[] = [];
    let nextPid = 20000;
    const spawnFn: PoolSpawnFn = () => {
      const handle = createHandle(nextPid++);
      spawned.push(handle);
      return handle;
    };
    const audits: PluginHookAuditEvent[] = [];
    const runner = new PluginPoolRunner({
      auditSink: (e) => audits.push(e),
      gate: {
        ensureGranted: () => Promise.resolve(false),
      } as unknown as import('../../../src/main/plugins/PluginCapabilityGate').PluginCapabilityGate,
      poolDeps: {
        grantLedger,
        subscriptionRegistry: makeSubscriptionRegistry(),
        abortRegistry: makeAbortRegistry(),
      },
      spawnFn,
      workerEntryPath: '/fake/entry.js',
    });
    const plugin = makePlugin('p-blocked');
    await runner.runHook([plugin], 'pre_turn', { kind: 'pre_turn', payload: {} });
    expect(spawned).toHaveLength(0);
    expect(audits.find((a) => a.event === 'plugin.hook_blocked')).toBeDefined();
    await runner.shutdown();
  });

  it('payload mutation does not leak between calls (cleared keys)', async () => {
    const plugin = makePlugin('p-mut');
    const ctx = { kind: 'pre_turn' as const, payload: { keep: 'original' } as Record<string, unknown> };
    const promise = h.runner.runHook([plugin], 'pre_turn', ctx);
    await new Promise((r) => setImmediate(r));
    const rpc = h.spawned[0]?.posted.find((m) => m.type === 'host-rpc');
    if (rpc !== undefined && 'call_id' in rpc) {
      h.spawned[0]!.fireMessage({
        type: 'plugin-rpc-result',
        call_id: rpc.call_id,
        result: { payload: { replaced: 'yes' } },
      });
    }
    await promise;
    expect(ctx.payload).toEqual({ replaced: 'yes' });
    expect(ctx.payload).not.toHaveProperty('keep');
  });
});
