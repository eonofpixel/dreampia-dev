/**
 * PluginPoolRunner — long-lived worker hook execution via HostPluginWorkerPool (v2.4.0 Task 1).
 *
 * Spec: docs/adr/0009-plugin-worker-lifecycle.md, .omc/plans/v2.3.0-plugin-ga.md §4 Phase 5A.3.
 *
 * Replaces v2.0.0's per-hook spawn pattern (`PluginUtilityProcessRunner.ts:11`) for
 * the `utility_process` and `auto` paths. Each plugin gets one long-lived
 * utility_process child managed by `HostPluginWorkerPool`. Hook execution
 * routes through worker.call('run-hook', { ...params }).
 *
 * Implements `PluginRunner` (same interface as PluginHookRunner /
 * PluginUtilityProcessRunner), so main/index.ts can swap the runner without
 * touching ipc.ts hook-call sites.
 *
 * Lifecycle:
 *   - First runHook for plugin X → pool.spawn(X) creates worker (long-lived)
 *   - Subsequent runHook for X → reuses existing worker
 *   - Pool handles heartbeats, restarts, quarantine via ADR-0009 state machine
 *   - main/index.ts pool.shutdown() on app quit
 *
 * Audit shape matches legacy runners (PluginHookAuditEvent) so audit_log
 * consumers don't need to branch on isolation strategy.
 */

import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  HostPluginWorkerPool,
  type PluginWorkerPoolOptions,
  type PoolWorkerHandle,
  type PoolSpawnFn,
} from './PluginWorkerPool';
import type {
  PluginWorkerManifestShape,
  GrantLedger,
  SubscriptionRegistry,
  AbortRegistry,
  PluginToHostMessage,
  HostPriorityMessage,
} from './poolInterfaces';
import type { LoadedPlugin } from './PluginManager';
import type { PluginCapabilityGate } from './PluginCapabilityGate';
import type { PluginRunner, PluginHookContext, PluginHookAuditEvent } from './PluginHookRunner';
import {
  attachIsolationTelemetry,
  type IsolationTelemetryEvent,
  type UtilityProcessLike,
} from './pluginIsolationTelemetry';

// ESM-safe __dirname equivalent. The main process bundle is ESM (package.json
// "type":"module"), so the bare `__dirname` global is undefined. Without this,
// constructor crashes at startup with "ReferenceError: __dirname is not defined".
const __dirname_esm = dirname(fileURLToPath(import.meta.url));

export interface PluginPoolRunnerOptions {
  /** hook 실행 timeout ms. default 5_000. */
  timeout_ms?: number;
  /** audit sink — same shape as PluginHookRunner / PluginUtilityProcessRunner. */
  auditSink?: (event: PluginHookAuditEvent) => void;
  /** capability gate — 미주입 시 통과 (test/legacy). */
  gate?: PluginCapabilityGate;
  /** Pool dependencies — production wires real GrantLedger / SubscriptionRegistry / AbortRegistry. */
  poolDeps: {
    grantLedger: GrantLedger;
    subscriptionRegistry: SubscriptionRegistry;
    abortRegistry: AbortRegistry;
  };
  /** Pool tuning (optional — defaults match ADR-0009). */
  poolOptions?: Pick<
    PluginWorkerPoolOptions,
    | 'heartbeatIntervalMs'
    | 'heartbeatGraceMs'
    | 'defaultMemoryCapMb'
    | 'memoryCapBreachMs'
    | 'maxRestartsInWindow'
    | 'restartWindowMs'
    | 'memoryProbe'
  >;
  /** Pool audit sink (worker.spawned / quarantined etc). */
  poolAuditSink?: PluginWorkerPoolOptions['auditSink'];
  /** v2.4.0 (Task 5) — utility_process spawn/exit/error telemetry. */
  isolationTelemetrySink?: (event: IsolationTelemetryEvent) => void;
  /**
   * v2.4.0 (Task 5) — onQuarantine 콜백. 보통 makeOnQuarantineHook() 결과.
   * Pool 이 crash-loop 감지 시 호출하여 settings.plugins[id].quarantined=true 영속.
   */
  onQuarantine?: (plugin_id: string) => void;
  /**
   * Worker entry script 의 절대 경로. default: 본 모듈과 같은 dir 의 pluginWorkerEntry.js.
   */
  workerEntryPath?: string;
  /**
   * Custom spawn fn (test injection). Production: defaultPoolSpawnFn lazy-imports
   * electron + attaches telemetry.
   */
  spawnFn?: PoolSpawnFn;
}

export class PluginPoolRunner implements PluginRunner {
  private readonly pool: HostPluginWorkerPool;
  private readonly timeoutMs: number;
  private readonly auditSink: (event: PluginHookAuditEvent) => void;
  private readonly gate: PluginCapabilityGate | undefined;

  constructor(options: PluginPoolRunnerOptions) {
    this.timeoutMs = options.timeout_ms ?? 5_000;
    this.gate = options.gate;
    this.auditSink =
      options.auditSink ??
      ((e): void => {
        if (e.event !== 'plugin.hook_ok') {
          console.error(
            `[PluginPoolRunner] ${e.event} ${e.plugin_name}/${e.hook}: ${e.error ?? ''}`
          );
        }
      });

    const workerEntryPath = options.workerEntryPath ?? join(__dirname_esm, 'pluginWorkerEntry.js');
    const spawnFn =
      options.spawnFn ??
      makeDefaultPoolSpawnFn({
        ...(options.isolationTelemetrySink !== undefined && {
          telemetrySink: options.isolationTelemetrySink,
        }),
      });

    this.pool = new HostPluginWorkerPool({
      spawnFn,
      workerEntryPath,
      grantLedger: options.poolDeps.grantLedger,
      subscriptionRegistry: options.poolDeps.subscriptionRegistry,
      abortRegistry: options.poolDeps.abortRegistry,
      ...(options.poolOptions ?? {}),
      ...(options.poolAuditSink !== undefined && { auditSink: options.poolAuditSink }),
      ...(options.onQuarantine !== undefined && { onQuarantine: options.onQuarantine }),
    });
  }

  async runHook(
    plugins: ReadonlyArray<LoadedPlugin>,
    kind: 'pre_turn' | 'post_turn',
    ctx: PluginHookContext
  ): Promise<void> {
    for (const plugin of plugins) {
      const hookPath = plugin.manifest.hooks?.[kind];
      if (hookPath === undefined) continue;
      const startedAt = Date.now();

      // Capability gate — same pattern as legacy runners.
      if (this.gate !== undefined) {
        const caps = plugin.manifest.capabilities ?? [];
        const granted = await this.gate.ensureGranted(plugin.manifest.name, caps);
        if (!granted) {
          this.auditSink({
            timestamp: new Date().toISOString(),
            event: 'plugin.hook_blocked',
            plugin_name: plugin.manifest.name,
            hook: kind,
            duration_ms: Date.now() - startedAt,
            error: 'capability not granted',
          });
          continue;
        }
      }

      try {
        const manifest = loadedPluginToWorkerManifest(plugin);
        const worker = await this.pool.spawn(plugin.manifest.name, manifest);
        const params = {
          plugin_name: plugin.manifest.name,
          plugin_dir: plugin.dir,
          hook_kind: kind,
          hook_path: hookPath,
          payload: ctx.payload,
          timeout_ms: this.timeoutMs,
        };
        const result = await worker.call<{ payload: Record<string, unknown> }>('run-hook', params);
        // Reflect plugin-mutated payload back into caller's ctx.payload.
        if (result?.payload !== undefined && result.payload !== null) {
          for (const k of Object.keys(ctx.payload)) {
            delete ctx.payload[k];
          }
          Object.assign(ctx.payload, result.payload);
        }
        this.auditSink({
          timestamp: new Date().toISOString(),
          event: 'plugin.hook_ok',
          plugin_name: plugin.manifest.name,
          hook: kind,
          duration_ms: Date.now() - startedAt,
        });
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        const isTimeout = /HOOK_TIMEOUT/i.test(msg) || /timed out/i.test(msg);
        this.auditSink({
          timestamp: new Date().toISOString(),
          event: isTimeout ? 'plugin.hook_timeout' : 'plugin.hook_error',
          plugin_name: plugin.manifest.name,
          hook: kind,
          duration_ms: Date.now() - startedAt,
          error: msg,
        });
        // continue to next plugin (best-effort).
      }
    }
  }

  /** Graceful shutdown — main/index.ts before-quit calls this. */
  async shutdown(): Promise<void> {
    await this.pool.shutdown();
  }

  /** Test inspection — expose pool. */
  getPoolForTesting(): HostPluginWorkerPool {
    return this.pool;
  }
}

/**
 * Convert a LoadedPlugin (manifest.json shape) into the PluginWorkerManifestShape
 * the pool consumes at spawn time. PluginManager's PluginManifest is broader
 * than the pool's needs — pool only reads plugin_id, entrypoint, capabilities,
 * runtime hints.
 */
function loadedPluginToWorkerManifest(plugin: LoadedPlugin): PluginWorkerManifestShape {
  return {
    plugin_id: plugin.manifest.name,
    // Pool's "entrypoint" is the path the worker loads; for hook-only plugins
    // we pass plugin dir as a marker — the actual hook script path is sent
    // per-call inside the run-hook params, not at spawn time.
    entrypoint: plugin.dir,
    capabilities: plugin.manifest.capabilities ?? [],
    runtime: {
      // Defaults — manifest doesn't carry these today. Pool falls back to
      // its own defaults (256MB cap, 30s heartbeat) when unset.
    },
  };
}

/**
 * Production pool spawn fn. Lazy-imports electron's utilityProcess so this
 * module is safe to import in vitest (node runtime).
 */
export function makeDefaultPoolSpawnFn(opts: {
  telemetrySink?: (event: IsolationTelemetryEvent) => void;
}): PoolSpawnFn {
  return (entryPath: string, manifest: PluginWorkerManifestShape): PoolWorkerHandle => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { utilityProcess } = require('electron') as typeof import('electron');
    const child = utilityProcess.fork(entryPath);
    if (opts.telemetrySink !== undefined) {
      attachIsolationTelemetry(
        child as unknown as UtilityProcessLike,
        manifest.plugin_id,
        opts.telemetrySink
      );
    }
    const handle: PoolWorkerHandle = {
      pid: child.pid ?? -1,
      postMessage: (
        msg:
          | HostPriorityMessage
          | { type: 'host-rpc'; call_id: string; method: string; params: unknown }
      ) => {
        child.postMessage(msg);
      },
      on: (event: 'message', listener: (msg: PluginToHostMessage) => void) => {
        if (event === 'message') {
          child.on('message', (raw) => {
            listener(raw as PluginToHostMessage);
          });
        }
      },
      onExit: (listener: (code: number | null) => void) => {
        child.on('exit', (code) => {
          listener(code);
        });
      },
      kill: () => {
        child.kill();
      },
    };
    return handle;
  };
}
