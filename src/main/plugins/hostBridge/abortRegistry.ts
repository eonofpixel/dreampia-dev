/**
 * abortRegistry — track in-flight RPCs and abort them on revoke / worker exit.
 *
 * Spec: .omc/plans/v2.3.0-plugin-ga.md §4 Phase 4.5 (US-404), gates G5 + AC-4.5.
 *
 * Closes Triple-Product-Risk race D ("half-write transactional"): when revoke
 * fires mid-RPC, the AbortSignal trips immediately and host.fs.write_text style
 * handlers must observe the signal before completing their I/O.
 *
 * Indexed by:
 *   - call_id (single RPC abort)
 *   - plugin_id (G5: revoke triggers abortAllForPlugin within 100ms)
 *   - pid (worker exit / crash: abort everything for that worker)
 */

import type { AbortRegistry as AbortRegistryInterface } from '../poolInterfaces';

interface RegistryEntry {
  call_id: string;
  plugin_id: string;
  pid?: number;
  controller: AbortController;
}

export class HostAbortRegistry implements AbortRegistryInterface {
  private readonly entries = new Map<string, RegistryEntry>();
  /** Reverse index for O(1) abort by plugin / pid. */
  private readonly byPlugin = new Map<string, Set<string>>();
  private readonly byPid = new Map<number, Set<string>>();

  /**
   * Create an abort handle for one RPC. Caller MUST call `abort()` on completion
   * (success or failure) to clean up — otherwise the registry leaks entries.
   * (HostBridgeDispatcher does this in its finally-equivalent path.)
   */
  create(
    plugin_id: string,
    call_id: string,
    pid?: number
  ): { signal: AbortSignal; abort: (reason?: string) => void } {
    if (this.entries.has(call_id)) {
      // Defensive: same call_id reused — abort the old one first to avoid leaks.
      const old = this.entries.get(call_id);
      if (old !== undefined) old.controller.abort('call_id reused');
    }
    const controller = new AbortController();
    const entry: RegistryEntry = { call_id, plugin_id, pid, controller };
    this.entries.set(call_id, entry);

    let pluginSet = this.byPlugin.get(plugin_id);
    if (pluginSet === undefined) {
      pluginSet = new Set();
      this.byPlugin.set(plugin_id, pluginSet);
    }
    pluginSet.add(call_id);

    if (pid !== undefined) {
      let pidSet = this.byPid.get(pid);
      if (pidSet === undefined) {
        pidSet = new Set();
        this.byPid.set(pid, pidSet);
      }
      pidSet.add(call_id);
    }

    const abortFn = (reason?: string): void => {
      this.cleanup(call_id);
      if (!controller.signal.aborted) {
        controller.abort(reason);
      }
    };

    return { signal: controller.signal, abort: abortFn };
  }

  /** G5: revoke triggers this. All in-flight RPCs for the plugin abort within 100ms. */
  abortAllForPlugin(plugin_id: string, reason: string = 'capability revoked'): void {
    const ids = this.byPlugin.get(plugin_id);
    if (ids === undefined) return;
    // Snapshot to avoid mutation during iteration (cleanup mutates the set).
    const snapshot = Array.from(ids);
    for (const call_id of snapshot) {
      const entry = this.entries.get(call_id);
      if (entry === undefined) continue;
      this.cleanup(call_id);
      if (!entry.controller.signal.aborted) {
        entry.controller.abort(reason);
      }
    }
  }

  /** Worker exit / crash — abort everything for the PID. */
  abortAllForPid(pid: number, reason: string = 'worker exited'): void {
    const ids = this.byPid.get(pid);
    if (ids === undefined) return;
    const snapshot = Array.from(ids);
    for (const call_id of snapshot) {
      const entry = this.entries.get(call_id);
      if (entry === undefined) continue;
      this.cleanup(call_id);
      if (!entry.controller.signal.aborted) {
        entry.controller.abort(reason);
      }
    }
  }

  /** Test inspection — count of currently-tracked in-flight RPCs. */
  inflightCount(): number {
    return this.entries.size;
  }

  inflightForPlugin(plugin_id: string): number {
    return this.byPlugin.get(plugin_id)?.size ?? 0;
  }

  private cleanup(call_id: string): void {
    const entry = this.entries.get(call_id);
    if (entry === undefined) return;
    this.entries.delete(call_id);
    const pluginSet = this.byPlugin.get(entry.plugin_id);
    if (pluginSet !== undefined) {
      pluginSet.delete(call_id);
      if (pluginSet.size === 0) this.byPlugin.delete(entry.plugin_id);
    }
    if (entry.pid !== undefined) {
      const pidSet = this.byPid.get(entry.pid);
      if (pidSet !== undefined) {
        pidSet.delete(call_id);
        if (pidSet.size === 0) this.byPid.delete(entry.pid);
      }
    }
  }
}
