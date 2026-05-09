/**
 * PluginWorkerPool tests (v2.3.0 US-502 / AC-9.1..9.5).
 *
 * Coverage matrix:
 *   - AC-9.1 heartbeat: pong recovers from degraded; double-miss → restart
 *   - AC-9.2 memcap: sustained breach triggers soft-kill (host-shutdown reason='memory-cap')
 *   - AC-9.3 crash → exp backoff → max-restarts → quarantine + onQuarantine fired
 *   - AC-9.4 reload: host-shutdown reason='reload' posted, then respawn
 *   - AC-9.5 PID-keyed subscription cleanup on exit
 *   - notifyRevoke: bumps grant_epoch + posts host-revoke + abortAllForPlugin
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  HostPluginWorkerPool,
  type PoolWorkerHandle,
  type PoolSpawnFn,
  type MemoryProbe,
  type PoolAuditEvent,
} from '../../../src/main/plugins/PluginWorkerPool';
import type {
  PluginWorkerManifestShape,
  PluginToHostMessage,
  HostPriorityMessage,
  GrantLedger,
  SubscriptionRegistry,
  AbortRegistry,
} from '../../../src/main/plugins/poolInterfaces';

// ──────────────────────────────────────────────────────────
// Mocks
// ──────────────────────────────────────────────────────────

interface MockHandle extends PoolWorkerHandle {
  posted: Array<HostPriorityMessage | { type: 'host-rpc'; call_id: string; method: string; params: unknown }>;
  fireMessage: (msg: PluginToHostMessage) => void;
  fireExit: (code: number | null) => void;
  isKilled: boolean;
}

function createHandle(pid: number): MockHandle {
  let messageListener: ((m: PluginToHostMessage) => void) | null = null;
  let exitListener: ((code: number | null) => void) | null = null;
  const handle: MockHandle = {
    pid,
    posted: [],
    fireMessage: (m) => messageListener?.(m),
    fireExit: (code) => exitListener?.(code),
    isKilled: false,
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
      handle.isKilled = true;
      // Do NOT auto-fire exit — tests fire it explicitly to control timing.
    },
  };
  return handle;
}

class FakeScheduler {
  private nextHandle = 1;
  private intervals = new Map<number, { cb: () => void; intervalMs: number; nextFireMs: number }>();
  private timeouts = new Map<number, { cb: () => void; fireAtMs: number }>();
  private nowMs = 0;

  setInterval(cb: () => void, ms: number): number {
    const h = this.nextHandle++;
    this.intervals.set(h, { cb, intervalMs: ms, nextFireMs: this.nowMs + ms });
    return h;
  }
  clearInterval(handle: unknown): void {
    this.intervals.delete(handle as number);
  }
  setTimeout(cb: () => void, ms: number): number {
    const h = this.nextHandle++;
    this.timeouts.set(h, { cb, fireAtMs: this.nowMs + ms });
    return h;
  }
  clearTimeout(handle: unknown): void {
    this.timeouts.delete(handle as number);
  }
  now(): number {
    return this.nowMs;
  }
  advance(ms: number): void {
    const target = this.nowMs + ms;
    while (this.nowMs < target) {
      // Find earliest event among intervals + timeouts.
      let nextFire = target;
      for (const v of this.intervals.values()) if (v.nextFireMs < nextFire) nextFire = v.nextFireMs;
      for (const v of this.timeouts.values()) if (v.fireAtMs < nextFire) nextFire = v.fireAtMs;
      this.nowMs = nextFire;
      // Fire all events scheduled at this time.
      for (const [h, v] of Array.from(this.timeouts.entries())) {
        if (v.fireAtMs <= this.nowMs) {
          this.timeouts.delete(h);
          v.cb();
        }
      }
      for (const v of Array.from(this.intervals.values())) {
        if (v.nextFireMs <= this.nowMs) {
          v.cb();
          v.nextFireMs += v.intervalMs;
        }
      }
    }
    this.nowMs = target;
  }
}

function makeGrantLedger(): GrantLedger & { _epochs: Map<string, number> } {
  const epochs = new Map<string, number>();
  return {
    _epochs: epochs,
    bumpEpoch: (id) => {
      const next = (epochs.get(id) ?? 0) + 1;
      epochs.set(id, next);
      return next;
    },
    currentEpoch: (id) => epochs.get(id) ?? 0,
    isStaleAt: (id, snap) => snap < (epochs.get(id) ?? 0),
  };
}

function makeSubscriptionRegistry(): SubscriptionRegistry & {
  _entries: Array<{ plugin_id: string; pid: number; subscription_id: string; topic: string }>;
  _removedForPid: number[];
  _removedForCap: Array<{ plugin_id: string; capability: string }>;
} {
  const entries: Array<{ plugin_id: string; pid: number; subscription_id: string; topic: string }> = [];
  const removedForPid: number[] = [];
  const removedForCap: Array<{ plugin_id: string; capability: string }> = [];
  return {
    _entries: entries,
    _removedForPid: removedForPid,
    _removedForCap: removedForCap,
    add: (plugin_id, pid, subscription_id, topic) => {
      entries.push({ plugin_id, pid, subscription_id, topic });
    },
    removeOne: (sub_id) => {
      const idx = entries.findIndex((e) => e.subscription_id === sub_id);
      if (idx >= 0) entries.splice(idx, 1);
    },
    removeAllForPid: (pid) => {
      removedForPid.push(pid);
      for (let i = entries.length - 1; i >= 0; i -= 1) {
        if (entries[i]!.pid === pid) entries.splice(i, 1);
      }
    },
    removeForCapability: (plugin_id, capability) => {
      removedForCap.push({ plugin_id, capability });
    },
    listForPlugin: (plugin_id) =>
      entries
        .filter((e) => e.plugin_id === plugin_id)
        .map((e) => ({ subscription_id: e.subscription_id, topic: e.topic, pid: e.pid })),
  };
}

function makeAbortRegistry(): AbortRegistry & { _aborted: Array<{ plugin_id?: string; pid?: number; reason?: string }> } {
  const aborted: Array<{ plugin_id?: string; pid?: number; reason?: string }> = [];
  return {
    _aborted: aborted,
    create: () => {
      const c = new AbortController();
      return { signal: c.signal, abort: (reason?: string) => c.abort(reason) };
    },
    abortAllForPlugin: (plugin_id, reason) => {
      aborted.push({ plugin_id, reason });
    },
    abortAllForPid: (pid, reason) => {
      aborted.push({ pid, reason });
    },
  };
}

function manifest(plugin_id: string): PluginWorkerManifestShape {
  return {
    plugin_id,
    entrypoint: 'dist/index.js',
    capabilities: ['host.fs.read'],
    runtime: { node: '^20', heartbeat_interval_ms: 30_000 },
  };
}

interface PoolHarness {
  pool: HostPluginWorkerPool;
  scheduler: FakeScheduler;
  audits: PoolAuditEvent[];
  spawned: MockHandle[];
  grantLedger: ReturnType<typeof makeGrantLedger>;
  subscriptionRegistry: ReturnType<typeof makeSubscriptionRegistry>;
  abortRegistry: ReturnType<typeof makeAbortRegistry>;
  quarantines: string[];
  memoryRss: Map<number, number>;
  spawnFn: PoolSpawnFn;
}

function setupHarness(opts: { memoryProbe?: boolean } = {}): PoolHarness {
  const scheduler = new FakeScheduler();
  const audits: PoolAuditEvent[] = [];
  const spawned: MockHandle[] = [];
  let nextPid = 10000;
  const grantLedger = makeGrantLedger();
  const subscriptionRegistry = makeSubscriptionRegistry();
  const abortRegistry = makeAbortRegistry();
  const quarantines: string[] = [];
  const memoryRss = new Map<number, number>();

  const spawnFn: PoolSpawnFn = (_entry, _man) => {
    const pid = nextPid++;
    const h = createHandle(pid);
    spawned.push(h);
    return h;
  };

  const memoryProbe: MemoryProbe | undefined = opts.memoryProbe
    ? (pid: number): number | null => memoryRss.get(pid) ?? null
    : undefined;

  const pool = new HostPluginWorkerPool({
    spawnFn,
    workerEntryPath: '/fake/entry.js',
    grantLedger,
    subscriptionRegistry,
    abortRegistry,
    heartbeatIntervalMs: 30_000,
    heartbeatGraceMs: 5_000,
    memoryCapBreachMs: 90_000,
    maxRestartsInWindow: 5,
    restartWindowMs: 600_000,
    memoryProbe,
    auditSink: (e) => audits.push(e),
    onQuarantine: (id) => quarantines.push(id),
    scheduler: {
      setInterval: (cb, ms) => scheduler.setInterval(cb, ms),
      clearInterval: (h) => scheduler.clearInterval(h),
      setTimeout: (cb, ms) => scheduler.setTimeout(cb, ms),
      clearTimeout: (h) => scheduler.clearTimeout(h),
    },
    now: () => scheduler.now(),
  });

  return {
    pool,
    scheduler,
    audits,
    spawned,
    grantLedger,
    subscriptionRegistry,
    abortRegistry,
    quarantines,
    memoryRss,
    spawnFn,
  };
}

let h: PoolHarness;
beforeEach(() => {
  h = setupHarness();
});

describe('v2.3.0 US-502 — spawn + ready', () => {
  it('spawn registers worker and audits ready', async () => {
    const w = await h.pool.spawn('p1', manifest('p1'));
    expect(w.plugin_id).toBe('p1');
    expect(w.state).toBe('ready');
    expect(h.spawned.length).toBe(1);
    expect(h.audits.find((e) => e.event === 'worker.spawned')).toBeDefined();
    expect(h.audits.find((e) => e.event === 'worker.ready')).toBeDefined();
  });

  it('spawn is idempotent: second call returns same worker', async () => {
    const a = await h.pool.spawn('p1', manifest('p1'));
    const b = await h.pool.spawn('p1', manifest('p1'));
    expect(a.pid).toBe(b.pid);
    expect(h.spawned.length).toBe(1);
  });
});

describe('v2.3.0 AC-9.1 — heartbeat', () => {
  it('pong while degraded → returns to ready', async () => {
    const w = await h.pool.spawn('p1', manifest('p1'));
    // Advance past heartbeat interval — ping fires.
    h.scheduler.advance(30_000);
    const handle = h.spawned[0]!;
    const ping = handle.posted.find((m) => m.type === 'host-ping');
    expect(ping).toBeDefined();
    // Don't pong — advance past grace → degraded.
    h.scheduler.advance(5_000);
    expect(w.state).toBe('degraded');
    // Now respond with pong.
    if (ping !== undefined && 'seq' in ping) {
      handle.fireMessage({ type: 'plugin-pong', seq: ping.seq });
    }
    expect(w.state).toBe('ready');
    expect(h.audits.find((e) => e.event === 'worker.degraded')).toBeDefined();
    const readyAudits = h.audits.filter((e) => e.event === 'worker.ready');
    expect(readyAudits.length).toBeGreaterThanOrEqual(2);
  });

  it('double miss → restarting', async () => {
    await h.pool.spawn('p1', manifest('p1'));
    // First ping
    h.scheduler.advance(30_000);
    h.scheduler.advance(5_000); // grace expires → degraded
    // Wait a full heartbeat interval — second miss → restarting
    h.scheduler.advance(30_000);
    expect(h.audits.find((e) => e.event === 'worker.heartbeat_miss')).toBeDefined();
    expect(h.audits.find((e) => e.event === 'worker.restarting')).toBeDefined();
  });
});

describe('v2.3.0 AC-9.2 — memory cap', () => {
  beforeEach(() => {
    h = setupHarness({ memoryProbe: true });
  });

  it('sustained memory breach (>110% cap for breach window) triggers soft-kill', async () => {
    await h.pool.spawn('p1', manifest('p1'));
    const handle = h.spawned[0]!;
    // 256 MB default cap × 1.1 = ~282 MB. Set to 300 MB.
    h.memoryRss.set(handle.pid, 300 * 1024 * 1024);
    // Auto-pong every ping so heartbeat-miss path doesn't restart the worker.
    const origPost = handle.postMessage;
    handle.postMessage = (msg): void => {
      origPost(msg);
      if (msg.type === 'host-ping' && 'seq' in msg) {
        handle.fireMessage({ type: 'plugin-pong', seq: msg.seq });
      }
    };
    // Advance heartbeats to accumulate sustained breach (>= 90s default).
    h.scheduler.advance(30_000); // tick 1: breach start (set memoryBreachStartMs=30000)
    h.scheduler.advance(30_000); // tick 2: elapsed 30s
    h.scheduler.advance(30_000); // tick 3: elapsed 60s
    h.scheduler.advance(30_000); // tick 4: elapsed 90s → soft-kill fires
    const shutdown = handle.posted.find(
      (m) => m.type === 'host-shutdown' && m.reason === 'memory-cap',
    );
    expect(shutdown).toBeDefined();
    expect(h.audits.find((e) => e.event === 'worker.memcap_breach')).toBeDefined();
  });
});

describe('v2.3.0 AC-9.3 — crash + restart + quarantine', () => {
  it('crash triggers restart audit', async () => {
    await h.pool.spawn('p1', manifest('p1'));
    const handle = h.spawned[0]!;
    handle.fireExit(1);
    expect(h.audits.find((e) => e.event === 'worker.restarting')).toBeDefined();
  });

  it('5 crashes within window → quarantined + onQuarantine fired', async () => {
    await h.pool.spawn('p1', manifest('p1'));
    // Crash 6 times rapidly. Each crash triggers a backoff respawn — but to
    // simulate quickly we just fire exit on each new handle.
    for (let i = 0; i < 6; i += 1) {
      const handle = h.spawned[h.spawned.length - 1]!;
      handle.fireExit(1);
      // Advance backoff window (max 60s)
      h.scheduler.advance(60_000);
    }
    expect(h.quarantines).toContain('p1');
    expect(h.audits.find((e) => e.event === 'worker.quarantined')).toBeDefined();
  });
});

describe('v2.3.0 AC-9.4 — reload', () => {
  it('reload posts host-shutdown reason="reload" and respawns', async () => {
    await h.pool.spawn('p1', manifest('p1'));
    const firstHandle = h.spawned[0]!;
    const reloadPromise = h.pool.reload('p1');
    h.scheduler.advance(5_000);
    await reloadPromise;
    const shutdown = firstHandle.posted.find(
      (m) => m.type === 'host-shutdown' && m.reason === 'reload',
    );
    expect(shutdown).toBeDefined();
    // After reload, a second handle should be spawned (or restart triggered).
    expect(h.audits.find((e) => e.event === 'worker.restarting')?.detail).toContain('reload');
  });
});

describe('v2.3.0 AC-9.5 — PID-keyed subscription cleanup', () => {
  it('worker exit triggers removeAllForPid', async () => {
    await h.pool.spawn('p1', manifest('p1'));
    const handle = h.spawned[0]!;
    // Plugin subscribes
    handle.fireMessage({
      type: 'plugin-subscribe',
      subscription_id: 'sub-1',
      topic: 'audit.log',
    });
    expect(h.subscriptionRegistry._entries.length).toBe(1);
    // Worker exits
    handle.fireExit(0);
    expect(h.subscriptionRegistry._removedForPid).toContain(handle.pid);
    expect(h.subscriptionRegistry._entries.length).toBe(0);
  });
});

describe('v2.3.0 G5 — notifyRevoke pipeline', () => {
  it('bumps grant_epoch + posts host-revoke + abortAllForPlugin', async () => {
    await h.pool.spawn('p1', manifest('p1'));
    const handle = h.spawned[0]!;
    expect(h.grantLedger.currentEpoch('p1')).toBe(0);
    const new_epoch = h.pool.notifyRevoke('p1', 'host.fs.read');
    expect(new_epoch).toBe(1);
    expect(h.grantLedger.currentEpoch('p1')).toBe(1);
    const revoke = handle.posted.find((m) => m.type === 'host-revoke');
    expect(revoke).toBeDefined();
    if (revoke !== undefined && revoke.type === 'host-revoke') {
      expect(revoke.capability).toBe('host.fs.read');
      expect(revoke.grant_epoch).toBe(1);
    }
    expect(h.abortRegistry._aborted.find((a) => a.plugin_id === 'p1')).toBeDefined();
    expect(h.subscriptionRegistry._removedForCap.find((c) => c.capability === 'host.fs.read')).toBeDefined();
  });

  it('whole-server revoke (no capability) removes all subscriptions for pid', async () => {
    await h.pool.spawn('p1', manifest('p1'));
    const handle = h.spawned[0]!;
    handle.fireMessage({ type: 'plugin-subscribe', subscription_id: 's1', topic: 'audit.log' });
    h.pool.notifyRevoke('p1');
    expect(h.subscriptionRegistry._removedForPid).toContain(handle.pid);
  });
});

describe('v2.3.0 — RPC call routing', () => {
  it('call resolves on plugin-rpc-result', async () => {
    const w = await h.pool.spawn('p1', manifest('p1'));
    const handle = h.spawned[0]!;
    const promise = w.call<string>('host.echo', { msg: 'hi' });
    // Find the call_id from posted messages
    const rpc = handle.posted.find((m) => m.type === 'host-rpc');
    expect(rpc).toBeDefined();
    if (rpc !== undefined && rpc.type === 'host-rpc') {
      handle.fireMessage({
        type: 'plugin-rpc-result',
        call_id: rpc.call_id,
        result: 'echoed:hi',
      });
    }
    await expect(promise).resolves.toBe('echoed:hi');
  });

  it('call rejects on plugin-rpc-error', async () => {
    const w = await h.pool.spawn('p1', manifest('p1'));
    const handle = h.spawned[0]!;
    const promise = w.call<string>('host.echo', {});
    const rpc = handle.posted.find((m) => m.type === 'host-rpc');
    if (rpc !== undefined && rpc.type === 'host-rpc') {
      handle.fireMessage({
        type: 'plugin-rpc-error',
        call_id: rpc.call_id,
        error: { code: 'BAD', message: 'nope' },
      });
    }
    await expect(promise).rejects.toThrow(/BAD/);
  });

  it('call rejects when signal is pre-aborted', async () => {
    const w = await h.pool.spawn('p1', manifest('p1'));
    const ctrl = new AbortController();
    ctrl.abort();
    await expect(w.call('host.echo', {}, ctrl.signal)).rejects.toThrow(/AbortError/);
  });
});

describe('v2.3.0 — shutdown', () => {
  it('shutdown posts host-shutdown reason="app-exit" and clears workers', async () => {
    await h.pool.spawn('p1', manifest('p1'));
    await h.pool.spawn('p2', manifest('p2'));
    expect(h.spawned.length).toBe(2);
    await h.pool.shutdown();
    for (const handle of h.spawned) {
      const shutdown = handle.posted.find(
        (m) => m.type === 'host-shutdown' && m.reason === 'app-exit',
      );
      expect(shutdown).toBeDefined();
      expect(handle.isKilled).toBe(true);
    }
  });
});
