/**
 * resolveIsolationMode — combine env / per-plugin override / global default into
 * the effective isolation mode for a given plugin at spawn time.
 *
 * Spec: .omc/plans/v2.3.0-plugin-ga.md §4 Phase 6.1+6.2 (US-600/601), gate G6.
 *
 * Precedence (highest first):
 *   1. env DREAMPIA_PLUGIN_ISOLATION (legacy override; debug / forced testing)
 *   2. settings.plugins[plugin_id].isolationMode (per-plugin user override)
 *   3. settings.pluginIsolationMode (global user setting)
 *   4. 'utility_process' (v2.3.0 default)
 *
 * Returns the effective mode + the source so callers can audit.
 */

import type { AppSettings } from '../settings';

export type IsolationMode = 'in_process' | 'utility_process' | 'auto';

export interface IsolationResolution {
  mode: IsolationMode;
  source: 'env' | 'per_plugin_override' | 'global_setting' | 'default';
}

export function resolveIsolationMode(
  plugin_id: string,
  settings: AppSettings,
  envValue: string | undefined = process.env['DREAMPIA_PLUGIN_ISOLATION']
): IsolationResolution {
  if (envValue === 'in_process' || envValue === 'utility_process' || envValue === 'auto') {
    return { mode: envValue, source: 'env' };
  }
  const perPlugin = settings.plugins?.[plugin_id]?.isolationMode;
  if (perPlugin !== undefined) {
    return { mode: perPlugin, source: 'per_plugin_override' };
  }
  if (settings.pluginIsolationMode !== undefined) {
    return { mode: settings.pluginIsolationMode, source: 'global_setting' };
  }
  return { mode: 'utility_process', source: 'default' };
}

/**
 * Test predicate — does this plugin require explicit downgrade consent
 * before we can run it in_process? True when isolationMode='in_process'
 * and no isolationDowngradeConsent recorded.
 */
export function requiresDowngradeConsent(plugin_id: string, settings: AppSettings): boolean {
  const entry = settings.plugins?.[plugin_id];
  if (entry === undefined) return false;
  if (entry.isolationMode !== 'in_process') return false;
  return entry.isolationDowngradeConsent === undefined;
}
