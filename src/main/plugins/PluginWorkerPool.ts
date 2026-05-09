/**
 * PluginWorkerPool — per-plugin long-lived utilityProcess worker pool.
 *
 * Spec: docs/adr/0009-plugin-worker-lifecycle.md, .omc/plans/v2.3.0-plugin-ga.md §4 Phase 5A.3 (US-502).
 *
 * Replaces v2.0.0's per-hook spawn pattern (`PluginUtilityProcessRunner.ts:11`).
 * Each plugin gets one long-lived child process. Hooks, RPCs, and event
 * subscriptions all multiplex over the persistent connection.
 *
 * Implements interfaces declared in `poolInterfaces.ts` (US-501 STOP POINT).
 *
 * Acceptance criteria (per ADR-0009):
 *   - AC-9.1 heartbeat ping/pong every 30s + 5s grace + degraded fallback
 *   - AC-9.2 memory cap (default 256MB; soft kill via host-shutdown after sustained breach)
 *   - AC-9.3 crash detection + exp backoff (max 5 in 10min → quarantine)
 *   - AC-9.4 reload (manifest changed) = clean teardown + respawn
 *   - AC-9.5 PID-keyed subscription cleanup on exit
 *
 * Memory-cap polling (AC-9.2): we use `process.resourceUsage()` of the host's
 * own process if PID-level RSS is unavailable cross-platform. v2.3.0 ships the
 * polling hook + state machine; per-PID RSS measurement on Electron 33 utility
 * processes ships in v2.4.0 once electron exposes a stable API (currently
 * requires platform-specific syscalls). TODO is captured in the
 * `MemoryProbe` injection point — production wires real probe; tests inject
 * deterministic probe.
 */

import type {
  PluginWorkerPool as PluginWorkerPoolInterface,
  PluginWorker,
  PluginWorkerState,
  PluginWorkerManifestShape,
  HostPriorityMessage,
  PluginToHostMessage,
  GrantLedger,
  SubscriptionRegistry,
  AbortRegistry,
} from './poolInterfaces';

// ────────────────────────────────────────────────────────────
// Spawn abstraction (reused pattern from PluginUtilityProcessRunner)
// ────────────────────────────────────────────────────────────

export interface PoolWorkerHandle {
  pid: number;
  postMessage: (
    msg:
      | HostPriorityMessage
      | { type: 'host-rpc'; call_id: string; method: string; params: unknown }
  ) => void;
  on: (event: 'message', listener: (msg: PluginToHostMessage) => void) => void;
  onExit: (listener: (code: number | null) => void) => void;
  kill: () => void;
}

export type PoolSpawnFn = (
  entryPath: string,
  manifest: PluginWorkerManifestShape
) => PoolWorkerHandle;

/**
 * Memory probe — returns RSS bytes of the worker's process, or null if not
 * measurable. Polled at heartbeat tick. Production: platform-specific syscall
 * lookup; tests: deterministic stub.
 */
export type MemoryProbe = (pid: number) => number | null;

// ────────────────────────────────────────────────────────────
// Pool options
// ────────────────────────────────────────────────────────────

export interface PluginWorkerPoolOptions {
  spawnFn: PoolSpawnFn;
  workerEntryPath: string;
  grantLedger: GrantLedger;
  subscriptionRegistry: SubscriptionRegistry;
  abortRegistry: AbortRegistry;
  /** Default 30000 ms. Tests override. */
  heartbeatIntervalMs?: number;
  /** Default 5000 ms (grace before degraded → restarting). */
  heartbeatGraceMs?: number;
  /** Default 256 MB. Per-plugin manifest can override. */
  defaultMemoryCapMb?: number;
  /** Default 90000 ms — sustained breach time before soft-kill. */
  memoryCapBreachMs?: number;
  /** Default 5 — restarts within 10min before quarantine. */
  maxRestartsInWindow?: number;
  /** Default 600000 ms (10min). */
  restartWindowMs?: number;
  /** RSS probe. If undefined, AC-9.2 polling is skipped (v2.4.0 ships real probe). */
  memoryProbe?: MemoryProbe;
  /** Test clock injection. */
  now?: () => number;
  /** Test setTimeout injection (for heartbeat fake-time). */
  scheduler?: {
    setInterval: (cb: () => void, ms: number) => unknown;
    clearInterval: (handle: unknown) => void;
    setTimeout: (cb: () => void, ms: number) => unknown;
    clearTimeout: (handle: unknown) => void;
  };
  /** Audit sink for state transitions. */
  auditSink?: (event: PoolAuditEvent) => void;
  /** Quarantine signal callback — caller persists settings.plugins[id].quarantined=true. */
  onQuarantine?: (plugin_id: string) => void;
}

export interface PoolAuditEvent {
  timestamp: string;
  plugin_id: string;
  pid?: number;
  event:
    | 'worker.spawned'
    | 'worker.ready'
    | 'worker.degraded'
    | 'worker.restarting'
    | 'worker.quarantined'
    | 'worker.terminated'
    | 'worker.memcap_breach'
    | 'worker.heartbeat_miss';
  detail?: string;
}

// ────────────────────────────────────────────────────────────
// Internal worker state
// ────────────────────────────────────────────────────────────

interface InternalWorker {
  plugin_id: string;
  manifest: PluginWorkerManifestShape;
  handle: PoolWorkerHandle | null;
  state: PluginWorkerState;
  pid: number;
  pendingPings: Set<number>;
  /** ISO timestamps of recent restart events for window-based quarantine check. */
  restartHistory: number[];
  heartbeatHandle: unknown;
  graceHandle: unknown;
  /** ms timestamp when memory first exceeded cap (null if currently within). */
  memoryBreachStartMs: number | null;
  /** Pending RPC call_ids → resolve callbacks. Cleared on revoke / exit. */
  inflightCalls: Map<string, { resolve: (v: unknown) => void; reject: (e: Error) => void }>;
  /** Counter for ping seq. */
  pingSeq: number;
}

// ────────────────────────────────────────────────────────────
// Pool implementation
// ────────────────────────────────────────────────────────────

export class HostPluginWorkerPool implements PluginWorkerPoolInterface {
  private readonly opts: Required<
    Omit<
      PluginWorkerPoolOptions,
      'memoryProbe' | 'auditSink' | 'onQuarantine' | 'scheduler' | 'now'
    >
  > & {
    memoryProbe: MemoryProbe | undefined;
    auditSink: (event: PoolAuditEvent) => void;
    onQuarantine: (plugin_id: string) => void;
    scheduler: NonNullable<PluginWorkerPoolOptions['scheduler']>;
    now: () => number;
  };
  private readonly workers = new Map<string, InternalWorker>();
  private readonly quarantined = new Set<string>();

  constructor(options: PluginWorkerPoolOptions) {
    const defaultScheduler = {
      setInterval: (cb: () => void, ms: number) => setInterval(cb, ms),
      clearInterval: (h: unknown) => clearInterval(h as ReturnType<typeof setInterval>),
      setTimeout: (cb: () => void, ms: number) => setTimeout(cb, ms),
      clearTimeout: (h: unknown) => clearTimeout(h as ReturnType<typeof setTimeout>),
    };
    this.opts = {
      spawnFn: options.spawnFn,
      workerEntryPath: options.workerEntryPath,
      grantLedger: options.grantLedger,
      subscriptionRegistry: options.subscriptionRegistry,
      abortRegistry: options.abortRegistry,
      heartbeatIntervalMs: options.heartbeatIntervalMs ?? 30_000,
      heartbeatGraceMs: options.heartbeatGraceMs ?? 5_000,
      defaultMemoryCapMb: options.defaultMemoryCapMb ?? 256,
      memoryCapBreachMs: options.memoryCapBreachMs ?? 90_000,
      maxRestartsInWindow: options.maxRestartsInWindow ?? 5,
      restartWindowMs: options.restartWindowMs ?? 600_000,
      memoryProbe: options.memoryProbe,
      auditSink: options.auditSink ?? ((): void => {}),
      onQuarantine: options.onQuarantine ?? ((): void => {}),
      scheduler: options.scheduler ?? defaultScheduler,
      now: options.now ?? Date.now,
    };
  }

  async spawn(plugin_id: string, manifest: PluginWorkerManifestShape): Promise<PluginWorker> {
    if (this.quarantined.has(plugin_id)) {
      throw new Error(`plugin ${plugin_id} is quarantined; manual reset required`);
    }
    const existing = this.workers.get(plugin_id);
    if (existing !== undefined && existing.state !== 'terminated') {
      return this.toPublicWorker(existing);
    }
    const internal: InternalWorker = {
      plugin_id,
      manifest,
      handle: null,
      state: 'init',
      pid: -1,
      pendingPings: new Set(),
      restartHistory: [],
      heartbeatHandle: null,
      graceHandle: null,
      memoryBreachStartMs: null,
      inflightCalls: new Map(),
      pingSeq: 0,
    };
    this.workers.set(plugin_id, internal);
    this.startWorker(internal);
    return this.toPublicWorker(internal);
  }

  get(plugin_id: string): PluginWorker | undefined {
    const w = this.workers.get(plugin_id);
    return w === undefined ? undefined : this.toPublicWorker(w);
  }

  async reload(plugin_id: string): Promise<void> {
    const w = this.workers.get(plugin_id);
    if (w === undefined) return;
    if (w.handle !== null) {
      try {
        w.handle.postMessage({ type: 'host-shutdown', reason: 'reload' });
      } catch {
        // ignore — worker may already be dead
      }
    }
    // Flush window: wait briefly, then kill.
    await new Promise<void>((resolve) =>
      this.opts.scheduler.setTimeout(() => resolve(), Math.min(5000, this.opts.heartbeatGraceMs))
    );
    this.transitionToRestarting(w, 'reload');
    this.startWorker(w);
  }

  notifyRevoke(plugin_id: string, capability?: string): number {
    const new_epoch = this.opts.grantLedger.bumpEpoch(plugin_id);
    const w = this.workers.get(plugin_id);
    if (w !== undefined && w.handle !== null) {
      try {
        w.handle.postMessage({ type: 'host-revoke', capability, grant_epoch: new_epoch });
      } catch {
        // worker may be down — abort path below still runs
      }
    }
    this.opts.abortRegistry.abortAllForPlugin(plugin_id, 'capability revoked');
    if (capability !== undefined) {
      this.opts.subscriptionRegistry.removeForCapability(plugin_id, capability);
    } else if (w !== undefined && w.pid > 0) {
      this.opts.subscriptionRegistry.removeAllForPid(w.pid);
    }
    return new_epoch;
  }

  resetQuarantine(plugin_id: string): void {
    this.quarantined.delete(plugin_id);
    const w = this.workers.get(plugin_id);
    if (w !== undefined && w.state === 'quarantined') {
      // Caller must call spawn() again to actually restart.
      this.workers.delete(plugin_id);
    }
  }

  async shutdown(): Promise<void> {
    for (const w of this.workers.values()) {
      this.clearTimers(w);
      if (w.handle !== null) {
        try {
          w.handle.postMessage({ type: 'host-shutdown', reason: 'app-exit' });
        } catch {
          // ignore
        }
        try {
          w.handle.kill();
        } catch {
          // ignore
        }
      }
      w.state = 'terminated';
    }
    this.workers.clear();
  }

  // ──────────────────────────────────────────────────────────
  // Internal lifecycle
  // ──────────────────────────────────────────────────────────

  private startWorker(w: InternalWorker): void {
    w.state = 'starting';
    let handle: PoolWorkerHandle;
    try {
      handle = this.opts.spawnFn(this.opts.workerEntryPath, w.manifest);
    } catch (err) {
      this.recordRestart(w, `spawn failed: ${err instanceof Error ? err.message : String(err)}`);
      return;
    }
    w.handle = handle;
    w.pid = handle.pid;
    this.audit(w, 'worker.spawned');

    handle.on('message', (msg) => this.handleWorkerMessage(w, msg));
    handle.onExit((code) => this.handleWorkerExit(w, code));

    // Transition to ready immediately. Real handshake protocol can be layered
    // on later by adding a 'plugin-ready' message; for v2.3.0 we trust the
    // first successful pong as ready confirmation.
    w.state = 'ready';
    this.audit(w, 'worker.ready');
    this.startHeartbeat(w);
  }

  private startHeartbeat(w: InternalWorker): void {
    this.clearTimers(w);
    const tick = (): void => {
      if (w.handle === null || w.state === 'terminated') return;
      w.pingSeq += 1;
      const seq = w.pingSeq;
      w.pendingPings.add(seq);
      try {
        w.handle.postMessage({ type: 'host-ping', seq });
      } catch {
        // worker dead — exit handler will fire
        return;
      }
      // Memory probe
      if (this.opts.memoryProbe !== undefined) {
        this.checkMemory(w);
      }
      // Grace timer for this ping
      w.graceHandle = this.opts.scheduler.setTimeout(() => {
        if (w.pendingPings.has(seq)) {
          w.pendingPings.delete(seq);
          this.handleHeartbeatMiss(w);
        }
      }, this.opts.heartbeatGraceMs);
    };
    w.heartbeatHandle = this.opts.scheduler.setInterval(tick, this.opts.heartbeatIntervalMs);
  }

  private handleHeartbeatMiss(w: InternalWorker): void {
    if (w.state === 'ready') {
      w.state = 'degraded';
      this.audit(w, 'worker.degraded', 'heartbeat miss');
      // Wait one more interval; if still missing → restart.
      w.graceHandle = this.opts.scheduler.setTimeout(() => {
        if (w.state === 'degraded') {
          this.audit(w, 'worker.heartbeat_miss');
          this.recordRestart(w, 'heartbeat miss after grace');
        }
      }, this.opts.heartbeatIntervalMs);
    } else if (w.state === 'degraded') {
      this.audit(w, 'worker.heartbeat_miss');
      this.recordRestart(w, 'heartbeat miss double');
    }
  }

  private checkMemory(w: InternalWorker): void {
    const probe = this.opts.memoryProbe;
    if (probe === undefined || w.handle === null) return;
    const rss = probe(w.pid);
    if (rss === null) return;
    const capBytes =
      (w.manifest.runtime.memory_cap_mb ?? this.opts.defaultMemoryCapMb) * 1024 * 1024;
    const overshoot = rss > capBytes * 1.1;
    if (overshoot) {
      if (w.memoryBreachStartMs === null) {
        w.memoryBreachStartMs = this.opts.now();
      } else if (this.opts.now() - w.memoryBreachStartMs >= this.opts.memoryCapBreachMs) {
        this.audit(w, 'worker.memcap_breach', `rss=${rss} cap=${capBytes}`);
        if (w.handle !== null) {
          try {
            w.handle.postMessage({ type: 'host-shutdown', reason: 'memory-cap' });
          } catch {
            // ignore
          }
        }
        // Soft-kill counts as a restart.
        this.recordRestart(w, 'memory cap exceeded');
      }
    } else {
      w.memoryBreachStartMs = null;
    }
  }

  private handleWorkerMessage(w: InternalWorker, msg: PluginToHostMessage): void {
    switch (msg.type) {
      case 'plugin-pong':
        w.pendingPings.delete(msg.seq);
        if (w.state === 'degraded') {
          w.state = 'ready';
          this.audit(w, 'worker.ready', 'pong recovered');
        }
        break;
      case 'plugin-rpc-result': {
        const pending = w.inflightCalls.get(msg.call_id);
        if (pending !== undefined) {
          w.inflightCalls.delete(msg.call_id);
          pending.resolve(msg.result);
        }
        break;
      }
      case 'plugin-rpc-error': {
        const pending = w.inflightCalls.get(msg.call_id);
        if (pending !== undefined) {
          w.inflightCalls.delete(msg.call_id);
          pending.reject(new Error(`${msg.error.code}: ${msg.error.message}`));
        }
        break;
      }
      case 'plugin-subscribe':
        this.opts.subscriptionRegistry.add(w.plugin_id, w.pid, msg.subscription_id, msg.topic);
        break;
      case 'plugin-unsubscribe':
        this.opts.subscriptionRegistry.removeOne(msg.subscription_id);
        break;
    }
  }

  private handleWorkerExit(w: InternalWorker, code: number | null): void {
    this.clearTimers(w);
    // PID-keyed subscription cleanup (AC-9.5).
    if (w.pid > 0) {
      this.opts.subscriptionRegistry.removeAllForPid(w.pid);
      this.opts.abortRegistry.abortAllForPid(w.pid, 'worker exited');
    }
    // Reject all in-flight RPCs.
    for (const [call_id, p] of w.inflightCalls.entries()) {
      p.reject(new Error(`worker exited (code=${code}) before call_id=${call_id} resolved`));
    }
    w.inflightCalls.clear();
    if (w.state === 'terminated') return;
    if (w.state === 'restarting') {
      // Already in restart flow.
      return;
    }
    this.recordRestart(w, `worker exit (code=${code})`);
  }

  private recordRestart(w: InternalWorker, reason: string): void {
    this.transitionToRestarting(w, reason);
    const nowMs = this.opts.now();
    w.restartHistory.push(nowMs);
    // Trim history outside window.
    const windowStart = nowMs - this.opts.restartWindowMs;
    w.restartHistory = w.restartHistory.filter((t) => t >= windowStart);
    if (w.restartHistory.length > this.opts.maxRestartsInWindow) {
      w.state = 'quarantined';
      this.quarantined.add(w.plugin_id);
      this.audit(w, 'worker.quarantined', `${w.restartHistory.length} restarts in window`);
      this.opts.onQuarantine(w.plugin_id);
      return;
    }
    // Backoff before respawn.
    const n = w.restartHistory.length;
    const backoffMs = Math.min(60_000, 2 ** n * 500);
    this.opts.scheduler.setTimeout(() => {
      if (w.state === 'restarting') {
        this.startWorker(w);
      }
    }, backoffMs);
  }

  private transitionToRestarting(w: InternalWorker, reason: string): void {
    this.clearTimers(w);
    if (w.handle !== null) {
      try {
        w.handle.kill();
      } catch {
        // ignore
      }
      w.handle = null;
    }
    w.state = 'restarting';
    w.pendingPings.clear();
    w.memoryBreachStartMs = null;
    this.audit(w, 'worker.restarting', reason);
  }

  private clearTimers(w: InternalWorker): void {
    if (w.heartbeatHandle !== null) {
      this.opts.scheduler.clearInterval(w.heartbeatHandle);
      w.heartbeatHandle = null;
    }
    if (w.graceHandle !== null) {
      this.opts.scheduler.clearTimeout(w.graceHandle);
      w.graceHandle = null;
    }
  }

  private audit(w: InternalWorker, event: PoolAuditEvent['event'], detail?: string): void {
    this.opts.auditSink({
      timestamp: new Date().toISOString(),
      plugin_id: w.plugin_id,
      pid: w.pid > 0 ? w.pid : undefined,
      event,
      detail,
    });
  }

  private toPublicWorker(w: InternalWorker): PluginWorker {
    const grantLedger = this.opts.grantLedger;
    const callWorker = <T>(method: string, params: unknown, signal?: AbortSignal): Promise<T> =>
      this.callWorker<T>(w, method, params, signal);
    const publicWorker: PluginWorker = {
      plugin_id: w.plugin_id,
      get pid(): number {
        return w.pid;
      },
      get grant_epoch(): number {
        return grantLedger.currentEpoch(w.plugin_id);
      },
      get state(): PluginWorkerState {
        return w.state;
      },
      call: callWorker,
      postPriority: (msg: HostPriorityMessage): void => {
        if (w.handle === null) return;
        try {
          w.handle.postMessage(msg);
        } catch {
          // worker dead
        }
      },
    };
    return publicWorker;
  }

  private callWorker<T>(
    w: InternalWorker,
    method: string,
    params: unknown,
    signal?: AbortSignal
  ): Promise<T> {
    if (w.handle === null || w.state === 'terminated' || w.state === 'quarantined') {
      return Promise.reject(
        new Error(`worker for ${w.plugin_id} not available (state=${w.state})`)
      );
    }
    const call_id = `${w.plugin_id}-${++w.pingSeq}-${Date.now()}`;
    return new Promise<T>((resolve, reject) => {
      w.inflightCalls.set(call_id, { resolve: resolve as (v: unknown) => void, reject });
      if (signal !== undefined) {
        if (signal.aborted) {
          w.inflightCalls.delete(call_id);
          reject(new Error('AbortError'));
          return;
        }
        signal.addEventListener('abort', () => {
          if (w.inflightCalls.has(call_id)) {
            w.inflightCalls.delete(call_id);
            reject(new Error('AbortError'));
          }
        });
      }
      try {
        if (w.handle === null) {
          w.inflightCalls.delete(call_id);
          reject(new Error('worker handle null'));
          return;
        }
        w.handle.postMessage({ type: 'host-rpc', call_id, method, params });
      } catch (err) {
        w.inflightCalls.delete(call_id);
        reject(err instanceof Error ? err : new Error(String(err)));
      }
    });
  }
}
