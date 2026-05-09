/**
 * onQuarantineHook — settings-writer integration for PluginWorkerPool quarantine signal.
 *
 * Spec: docs/security-reviews/v2.3.0-trust-boundary.md §7 release-blocking gap #2.
 *
 * `PluginWorkerPool` (US-502) accepts an `onQuarantine(plugin_id)` callback.
 * Production wires this to persist `settings.plugins[plugin_id].quarantined = true`
 * so the next app boot does NOT auto-spawn the quarantined plugin (ADR-0009
 * crash-loop guard).
 *
 * Usage (PluginManager wiring — slated for v2.4.0 per security review §8):
 *
 *   const pool = new HostPluginWorkerPool({
 *     ...,
 *     onQuarantine: makeOnQuarantineHook(),
 *   });
 *
 * v2.3.0 ships the helper available; integration into PluginManager runner
 * choice happens in v2.4.0 alongside the per-hook → Pool migration.
 */

import { readSettings, writeSettings } from '../settings';

/**
 * Returns an onQuarantine callback that persists
 * `settings.plugins[plugin_id].quarantined = true` to the user's settings.json.
 * The persisted flag is read on next app boot and prevents auto-spawn until
 * `pool.resetQuarantine(plugin_id)` clears it.
 *
 * Side effect: writes to `~/.dreampia/settings.json`. Failures are logged but
 * not thrown — the pool's in-memory quarantine state still protects against
 * crash loops within the current process.
 */
export function makeOnQuarantineHook(): (plugin_id: string) => void {
  return (plugin_id: string): void => {
    try {
      const current = readSettings();
      const plugins = current.plugins ?? {};
      const entry = plugins[plugin_id] ?? {};
      writeSettings({
        plugins: {
          ...plugins,
          [plugin_id]: {
            ...entry,
            quarantined: true,
          },
        },
      });
      console.warn(`[plugin-pool] plugin ${plugin_id} quarantined and persisted to settings`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.warn(`[plugin-pool] plugin ${plugin_id} quarantined but persist failed: ${msg}`);
    }
  };
}
