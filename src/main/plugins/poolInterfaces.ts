/**
 * poolInterfaces — interface-only sketch for the v2.3.0 Plugin Worker Pool.
 *
 * Spec: ADR-0009, .omc/plans/v2.3.0-plugin-ga.md §4 Phase 5A.2 (US-501).
 *
 * **STOP POINT** (codex-mandated guardrail):
 * Before any concrete implementation in PluginWorkerPool.ts (US-502),
 * code-reviewer (Opus) must verify this file contains:
 *   1. `grant_epoch` field on PluginWorker (G5 sync invalidation)
 *   2. PID-keyed SubscriptionRegistry (race-free PID reuse)
 *   3. Explicit revoke path covering grant invalidation + abort + subscription cleanup
 * If any of these is missing, ralph halts and surfaces conflict.
 *
 * No runtime code lives here. Importing this module in production code
 * pulls only TypeScript types — no side effects.
 */

// ────────────────────────────────────────────────────────────
// Worker lifecycle states (mirrors ADR-0009 state machine)
// ────────────────────────────────────────────────────────────

export type PluginWorkerState =
  | 'init'
  | 'starting'
  | 'ready'
  | 'degraded'
  | 'restarting'
  | 'quarantined'
  | 'terminated';

// ────────────────────────────────────────────────────────────
// Pool — singleton owning all live workers
// ────────────────────────────────────────────────────────────

export interface PluginWorkerPool {
  /**
   * Spawn a worker for the given plugin. Idempotent: if a worker already
   * exists for this id, returns the existing one.
   */
  spawn(plugin_id: string, manifest: PluginWorkerManifestShape): Promise<PluginWorker>;

  /** Look up an existing worker without spawning. */
  get(plugin_id: string): PluginWorker | undefined;

  /**
   * Reload (manifest changed). Sends host-shutdown reason='reload', destroys
   * subscriptions (PID-keyed), then respawns. Plugin code must re-subscribe
   * in its `init` handler.
   */
  reload(plugin_id: string): Promise<void>;

  /**
   * **G5 codex sync invalidation entry point.** Pool synchronously bumps
   * grant_epoch via GrantLedger, then posts a priority message to the worker
   * (bypasses queue) and triggers abort on every in-flight RPC for the
   * plugin (AbortRegistry). Subscription registry entries for the revoked
   * capability are removed.
   *
   * Returns the new grant_epoch so the caller can update local cache.
   */
  notifyRevoke(plugin_id: string, capability?: string): number;

  /** Manual quarantine reset (user action — settings UI). */
  resetQuarantine(plugin_id: string): void;

  /** Graceful shutdown of all workers (app exit). */
  shutdown(): Promise<void>;
}

// ────────────────────────────────────────────────────────────
// Worker — single utilityProcess.fork() child
// ────────────────────────────────────────────────────────────

export interface PluginWorker {
  readonly plugin_id: string;
  readonly pid: number;
  /** G5: monotonic counter, read on every in-flight RPC for race detection. */
  readonly grant_epoch: number;
  readonly state: PluginWorkerState;

  /**
   * Issue an RPC. Caller passes an AbortSignal that fires on revoke
   * (chained from AbortRegistry). The RPC is rejected with AbortError if
   * the signal aborts before the response arrives.
   */
  call<T>(method: string, params: unknown, signal?: AbortSignal): Promise<T>;

  /**
   * Send a priority message that bypasses the in-worker queue
   * (host-revoke, host-shutdown). Synchronous from the host perspective —
   * the postMessage is enqueued on parentPort before this returns.
   */
  postPriority(msg: HostPriorityMessage): void;
}

// ────────────────────────────────────────────────────────────
// Grant ledger — G5 synchronous invalidation backbone
// ────────────────────────────────────────────────────────────

export interface GrantLedger {
  /** Increments + returns the new epoch. Synchronous. */
  bumpEpoch(plugin_id: string): number;
  /** Read current epoch (0 if never bumped). */
  currentEpoch(plugin_id: string): number;
  /**
   * True if the snapshot epoch is older than the current epoch — used by
   * dispatcher to detect grant invalidation mid-RPC.
   */
  isStaleAt(plugin_id: string, snapshot_epoch: number): boolean;
}

// ────────────────────────────────────────────────────────────
// Subscription registry — PID-keyed (race-free PID reuse)
// ────────────────────────────────────────────────────────────

export interface SubscriptionRegistry {
  add(plugin_id: string, pid: number, subscription_id: string, topic: string): void;
  removeOne(subscription_id: string): void;
  /** Called from `child.on('exit')` — guarantees clean state across PID reuse. */
  removeAllForPid(pid: number): void;
  /** Capability revoke path — remove entries whose topic matches the revoked cap. */
  removeForCapability(plugin_id: string, capability: string): void;
  listForPlugin(plugin_id: string): ReadonlyArray<{
    subscription_id: string;
    topic: string;
    pid: number;
  }>;
}

// ────────────────────────────────────────────────────────────
// Abort registry — mid-call abort (G5 + AC-4.5)
// ────────────────────────────────────────────────────────────

export interface AbortRegistry {
  /**
   * Create an abort handle for a single RPC. The signal fires when:
   *   - `abort()` is called explicitly on the returned handle
   *   - `abortAllForPlugin(plugin_id)` is called for the owning plugin
   *   - the worker process exits / crashes
   */
  create(
    plugin_id: string,
    call_id: string
  ): {
    signal: AbortSignal;
    abort: (reason?: string) => void;
  };

  /** G5: revoke triggers this. All in-flight RPCs for the plugin abort within 100ms. */
  abortAllForPlugin(plugin_id: string, reason?: string): void;

  /** Worker exit — abort everything for that PID's plugin. */
  abortAllForPid(pid: number, reason?: string): void;
}

// ────────────────────────────────────────────────────────────
// Wire shapes
// ────────────────────────────────────────────────────────────

/**
 * Priority messages sent from host to worker. Bypass any in-worker queue.
 * Worker handles these synchronously in its parentPort message handler.
 */
export type HostPriorityMessage =
  | { type: 'host-revoke'; capability?: string; grant_epoch: number }
  | { type: 'host-shutdown'; reason: 'reload' | 'memory-cap' | 'quarantine' | 'app-exit' }
  | { type: 'host-ping'; seq: number };

/**
 * Plugin-side messages sent worker → host. Includes pong + RPC results +
 * subscribe/unsubscribe + event publishes (when worker is also a publisher).
 */
export type PluginToHostMessage =
  | { type: 'plugin-pong'; seq: number }
  | { type: 'plugin-rpc-result'; call_id: string; result: unknown }
  | { type: 'plugin-rpc-error'; call_id: string; error: { code: string; message: string } }
  | { type: 'plugin-subscribe'; subscription_id: string; topic: string }
  | { type: 'plugin-unsubscribe'; subscription_id: string };

// ────────────────────────────────────────────────────────────
// Manifest shape (subset used by pool spawn)
// ────────────────────────────────────────────────────────────

/**
 * Subset of plugin manifest fields the pool needs at spawn time. Avoids
 * importing the full PluginManifest type to keep this file dep-free.
 */
export interface PluginWorkerManifestShape {
  readonly plugin_id: string;
  readonly entrypoint: string;
  readonly capabilities: readonly string[];
  readonly runtime: {
    readonly node?: string;
    readonly memory_cap_mb?: number;
    readonly heartbeat_interval_ms?: number;
  };
}
