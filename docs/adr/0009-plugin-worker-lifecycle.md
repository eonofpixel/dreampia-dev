# ADR-0009: Plugin Worker Lifecycle

- **Status**: accepted
- **Date**: 2026-05-09
- **Decision authority**: codex architect review (G1 codex confirm: long-lived per-plugin pool required for ADR-0005 subscription survival)
- **Predecessors**: ADR-0003 (utility_process isolation), ADR-0004 (IPC bridge), ADR-0005 (host event stream)
- **Consequence for**: v2.3.0 Plugin GA Phase 5 (US-500 / 501 / 502 / 503 / 504 / 505 / 506)

## Context

The v2.0.0 `PluginUtilityProcessRunner` (`src/main/plugins/PluginUtilityProcessRunner.ts:11`) uses **per-hook spawn** semantics: `utilityProcess.fork()` is called every time a plugin hook fires, the child runs the hook, then exits. This was sufficient for hook-only execution but is **architecturally incompatible** with ADR-0005 host event stream because:

1. Subscription lifetime cannot exceed the spawning hook's lifetime — every turn boundary destroys all subscriptions, defeating pub/sub.
2. Plugin runtime state (caches, in-flight RPCs, AbortRegistry entries) cannot persist across hooks.
3. Backpressure queues are pointless — there is no long-lived consumer.
4. G5 codex re-emphasis ("already-posted parentPort messages cannot be recalled, so revoke must synchronously invalidate dispatcher grants AND abort in-flight RPCs") presumes a persistent worker holding RPC state.

User's v2.3.0 maximum-ambition Plugin GA scope (Branch A in plan §4 Phase 5) accepts this redesign. This ADR specifies the replacement runtime: `PluginWorkerPool` — a per-plugin long-lived host runtime.

## Decision

Replace per-hook spawn with **per-plugin long-lived `utilityProcess` workers**, managed by a host-side `PluginWorkerPool` that owns lifecycle, restart policy, memory caps, subscription registry, and revoke cleanup.

The pool is **singleton per Electron main process**. It maps `plugin_id → PluginWorker`. Each `PluginWorker` owns one `utilityProcess.fork()` child process.

## Lifecycle state machine

```
                                              (heartbeat miss × 1)
                                              ┌──────────────┐
                                              │              │
        spawn()      handshake     ready      ▼              │
   ┌──────────────►  ┌────────┐  ┌─────┐  ┌──────────┐  ┌─────────┐
   │                 │starting│─►│ready│─►│degraded  │─►│restart  │
init                 └────┬───┘  └──┬──┘  └────┬─────┘  └─────────┘
                          │ fail    │ uncaught │ exit            │
                          ▼         ▼          ▼                 │
                       ┌──────────────────────────┐              │
                       │     restarting (n)       │◄─────────────┘
                       └─────────────┬────────────┘
                                     │ n > MAX_RESTARTS
                                     ▼
                              ┌──────────────┐
                              │  quarantined │
                              └──────────────┘
```

### States

| State | Meaning | Allowed transitions |
|-------|---------|---------------------|
| `init` | Pool slot reserved, no child yet | → `starting` |
| `starting` | `utilityProcess.fork()` issued, awaiting handshake | → `ready` (handshake ack) / `restarting` (spawn fail / handshake timeout) |
| `ready` | Handshake done, accepting RPC | → `degraded` (heartbeat miss) / `restarting` (uncaught error) / `terminated` (clean shutdown) |
| `degraded` | Heartbeat missed once, grace period before restart | → `ready` (heartbeat resumes) / `restarting` (second miss) |
| `restarting` | `child.kill()` issued, restart counter incremented, will respawn after backoff | → `starting` (restart) / `quarantined` (restart counter >= MAX_RESTARTS) |
| `quarantined` | Crash-loop detected, no further auto-restart; user must manually re-enable | → `init` (manual reset only) |
| `terminated` | Clean shutdown (plugin uninstalled / app exit) | terminal |

### State persistence

States are **in-memory only**. Quarantine status is surfaced to settings (`plugins.<id>.quarantined: true`) so it persists across app restarts. Quarantined plugins are NOT auto-spawned on next app boot.

## Acceptance criteria mapping (US-500 + US-502)

### AC-9.1 — Heartbeat ping/pong

- Worker child process listens on `parentPort` for `{ type: 'host-ping', seq: N }` messages.
- Host sends `host-ping` every **30 seconds** (configurable via `pluginHeartbeatIntervalMs` setting).
- Child responds with `{ type: 'plugin-pong', seq: N }` within **5 seconds**.
- One missed pong → state transitions `ready → degraded`. Pool starts a 5-second grace timer.
- Second consecutive miss (or grace timer expires without pong) → `degraded → restarting`.
- A pong while in `degraded` → state returns to `ready`, grace timer cancelled.

### AC-9.2 — Memory cap

- Default cap **256 MB RSS** per worker.
- Configurable per-plugin via manifest `runtime.memory_cap_mb` (clamped to 64..1024 MB by host).
- Implementation: host polls `process.resourceUsage()` of the child via `utilityProcess` PID at heartbeat tick; if RSS exceeds cap by >10% for **3 consecutive ticks** (i.e. 90 seconds sustained), worker is **soft-killed**: host sends `{ type: 'host-shutdown', reason: 'memory-cap' }`, child has 5 seconds to flush state, then `child.kill('SIGKILL')`.
- Soft-kill counts as a restart (state transitions through `restarting`). Restart counter incremented; if at MAX_RESTARTS, → quarantine.

### AC-9.3 — Crash detection + exponential backoff

- `child.on('exit', ...)` and `child.on('error', ...)` both trigger `→ restarting`.
- Restart backoff: `min(60s, 2^n * 500ms)` where `n` is consecutive restarts since last `ready` state. Caps at 60s.
- **MAX_RESTARTS = 5** consecutive within the last 10 minutes. After this, → `quarantined`.
- Successful 60-second `ready` period resets the restart counter to 0.

### AC-9.4 — Plugin reload (manifest change)

- When `PluginManager` detects a manifest change for an active plugin, it calls `pool.reload(plugin_id)`.
- Reload semantics: send `{ type: 'host-shutdown', reason: 'reload' }` → wait up to 5s for child to flush → `child.kill()` → respawn with new manifest.
- Subscriptions held by the old worker are **destroyed** (PID-keyed cleanup, AC-9.5). Plugin code must re-subscribe in its `init` handler post-reload. This is documented in the plugin author guide (Phase 7).

### AC-9.5 — Subscription cleanup on exit

- `SubscriptionRegistry` is keyed by `(plugin_id, child_pid)`.
- When `child.on('exit')` fires for a worker, the pool calls `eventBus.removeAllForPid(pid)`.
- This guarantees that no event delivery races with PID reuse — even if the OS reuses the PID later for a different process, the registry has already cleaned up.

### Revoke cleanup (G5 codex sync invalidation)

- When `McpCapabilityGate.revokeOne(plugin_id, ...)` is called:
  1. `grant_epoch` increment (synchronous, in `McpCapabilityGate`).
  2. `pool.notifyRevoke(plugin_id, capability?)` — pool sends `{ type: 'host-revoke', capability }` priority message to child via `parentPort` (priority lane semantic — bypass any internal queue).
  3. `abortRegistry.abortAllForPlugin(plugin_id)` — fires AbortSignal on every in-flight RPC for that plugin within 100ms (AC-4.5).
  4. Subscription registry entries matching the revoked capability are removed (PID-keyed).

The `priority lane` + `synchronous grant invalidation` + `AbortRegistry` triple is what closes the codex G5 race ("already-posted parentPort messages cannot be recalled").

## Interface contract (preview for US-501)

```ts
// src/main/plugins/poolInterfaces.ts (US-501 — interface sketch STOP POINT)

export interface PluginWorkerPool {
  spawn(plugin_id: string, manifest: PluginManifest): Promise<PluginWorker>;
  get(plugin_id: string): PluginWorker | undefined;
  reload(plugin_id: string): Promise<void>;
  notifyRevoke(plugin_id: string, capability?: string): void;
  shutdown(): Promise<void>;
}

export interface PluginWorker {
  readonly plugin_id: string;
  readonly pid: number;
  readonly grant_epoch: number;
  readonly state: 'init' | 'starting' | 'ready' | 'degraded' | 'restarting' | 'quarantined' | 'terminated';
  call<T>(method: string, params: unknown, signal?: AbortSignal): Promise<T>;
  postPriority(msg: HostPriorityMessage): void;
}

export interface GrantLedger {
  bumpEpoch(plugin_id: string): number;
  currentEpoch(plugin_id: string): number;
  isStaleAt(plugin_id: string, epoch: number): boolean;
}

export interface SubscriptionRegistry {
  add(plugin_id: string, pid: number, subscription_id: string, topic: string): void;
  removeOne(subscription_id: string): void;
  removeAllForPid(pid: number): void;
  listForPlugin(plugin_id: string): Array<{ subscription_id: string; topic: string }>;
}

export interface AbortRegistry {
  create(call_id: string): { signal: AbortSignal; abort: (reason?: string) => void };
  abortAllForPlugin(plugin_id: string, reason?: string): void;
}
```

## Alternatives considered

1. **Keep per-hook spawn (Branch B)** — rejected. ADR-0005 full pub/sub becomes impossible. Lifecycle events only is a reduced product; user explicitly chose Branch A.
2. **Worker pool with shared workers across plugins** — rejected. Capability isolation requires separate processes per plugin (no cross-plugin information leak via shared memory).
3. **`worker_threads` instead of `utilityProcess`** — rejected. Same-process workers share Node memory + can call `require('node:fs')` directly, breaking the v2.0.0 utility_process trust boundary commitment.
4. **VM context isolation** — rejected. Same reasons as worker_threads.

## Consequences

- Adds significant new code surface (`PluginWorkerPool`, `GrantLedger`, `SubscriptionRegistry`, `AbortRegistry`).
- Plugin authors must understand that subscriptions die on reload (documented Phase 7).
- Memory cap polling adds a small CPU overhead at heartbeat tick (~30s interval).
- Quarantined plugins require user action to re-enable; needs a settings UI surface (Phase 6).
- Test surface grows: leak test (US-506), flood test (US-505), crash-quarantine test (US-502).

## Follow-ups

- US-501 — interface sketch (STOP POINT before any implementation code)
- US-502 — `PluginWorkerPool` implementation
- US-503 — `eventBus` with bounded queue + priority lane
- US-504 — topic publishers
- US-505 — flood + revoke-during-flood tests
- US-506 — 10× spawn-exit-restart leak test
- v2.4.0+ — quarantine recovery UI; per-plugin restart-policy override; cross-plugin event multicast (out of scope here)
