/**
 * resolveIsolationMode tests (v2.3.0 US-600/601).
 *
 * Coverage: precedence order env > per-plugin > global > default,
 * downgrade consent predicate.
 */

import { describe, it, expect } from 'vitest';
import {
  resolveIsolationMode,
  requiresDowngradeConsent,
} from '../../../src/main/plugins/resolveIsolationMode';
import type { AppSettings } from '../../../src/main/settings';

describe('v2.3.0 US-600/601 — resolveIsolationMode precedence', () => {
  it('default when nothing is set', () => {
    const r = resolveIsolationMode('p1', {}, undefined);
    expect(r).toEqual({ mode: 'utility_process', source: 'default' });
  });

  it('global setting overrides default', () => {
    const settings: AppSettings = { pluginIsolationMode: 'in_process' };
    const r = resolveIsolationMode('p1', settings, undefined);
    expect(r).toEqual({ mode: 'in_process', source: 'global_setting' });
  });

  it('per-plugin override overrides global', () => {
    const settings: AppSettings = {
      pluginIsolationMode: 'utility_process',
      plugins: { p1: { isolationMode: 'in_process' } },
    };
    const r = resolveIsolationMode('p1', settings, undefined);
    expect(r).toEqual({ mode: 'in_process', source: 'per_plugin_override' });
  });

  it('per-plugin override is scoped per-plugin', () => {
    const settings: AppSettings = {
      pluginIsolationMode: 'utility_process',
      plugins: { p1: { isolationMode: 'in_process' } },
    };
    const r = resolveIsolationMode('p2', settings, undefined);
    expect(r).toEqual({ mode: 'utility_process', source: 'global_setting' });
  });

  it('env DREAMPIA_PLUGIN_ISOLATION overrides everything', () => {
    const settings: AppSettings = {
      pluginIsolationMode: 'in_process',
      plugins: { p1: { isolationMode: 'in_process' } },
    };
    const r = resolveIsolationMode('p1', settings, 'utility_process');
    expect(r).toEqual({ mode: 'utility_process', source: 'env' });
  });

  it('invalid env value falls through to per-plugin / global / default', () => {
    const settings: AppSettings = { pluginIsolationMode: 'auto' };
    const r = resolveIsolationMode('p1', settings, 'bogus');
    expect(r).toEqual({ mode: 'auto', source: 'global_setting' });
  });

  it('all 3 isolation modes round-trip cleanly', () => {
    for (const mode of ['in_process', 'utility_process', 'auto'] as const) {
      const r = resolveIsolationMode('p1', { pluginIsolationMode: mode }, undefined);
      expect(r.mode).toBe(mode);
    }
  });
});

describe('v2.3.0 US-601 — requiresDowngradeConsent', () => {
  it('false when no per-plugin entry', () => {
    expect(requiresDowngradeConsent('p1', {})).toBe(false);
  });

  it('false when isolationMode is utility_process', () => {
    const settings: AppSettings = { plugins: { p1: { isolationMode: 'utility_process' } } };
    expect(requiresDowngradeConsent('p1', settings)).toBe(false);
  });

  it('true when isolationMode is in_process AND no consent recorded', () => {
    const settings: AppSettings = { plugins: { p1: { isolationMode: 'in_process' } } };
    expect(requiresDowngradeConsent('p1', settings)).toBe(true);
  });

  it('false when isolationMode is in_process AND consent recorded', () => {
    const settings: AppSettings = {
      plugins: {
        p1: {
          isolationMode: 'in_process',
          isolationDowngradeConsent: '2026-05-09T00:00:00.000Z',
        },
      },
    };
    expect(requiresDowngradeConsent('p1', settings)).toBe(false);
  });

  it('false when isolationMode is auto (no in_process commitment)', () => {
    const settings: AppSettings = { plugins: { p1: { isolationMode: 'auto' } } };
    expect(requiresDowngradeConsent('p1', settings)).toBe(false);
  });
});
