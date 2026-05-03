/**
 * Settings module tests — v0.9.0 usage_cost_limit_usd + usage_alert_threshold.
 *
 * v0.8.0 까지는 theme / default_provider / default_permission_level 만 검증됐다.
 * v0.9.0 에선 두 신규 비용 한도 필드의 read/write/clamp/silent-drop 검증.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const userDataRef = vi.hoisted(() => ({ current: '' }));

vi.mock('electron', () => {
  return {
    app: {
      getPath: (_name: string): string => userDataRef.current,
    },
  };
});

import { readSettings, writeSettings, __resetSettingsCache } from '../../src/main/settings';

let testTmpDir = '';

beforeEach(() => {
  testTmpDir = mkdtempSync(join(tmpdir(), 'dreampia-usage-limits-test-'));
  userDataRef.current = testTmpDir;
  __resetSettingsCache();
});

afterEach(() => {
  if (testTmpDir.length > 0 && existsSync(testTmpDir)) {
    rmSync(testTmpDir, { recursive: true, force: true });
  }
});

describe('Settings — usage_cost_limit_usd (v0.9.0)', () => {
  it('returns undefined when missing', () => {
    expect(readSettings().usage_cost_limit_usd).toBeUndefined();
  });

  it('preserves valid non-negative finite numbers', () => {
    writeFileSync(
      join(testTmpDir, 'settings.json'),
      JSON.stringify({ usage_cost_limit_usd: 25.5 })
    );
    __resetSettingsCache();
    expect(readSettings().usage_cost_limit_usd).toBe(25.5);
  });

  it('drops negative values (silent fallback to undefined)', () => {
    writeFileSync(
      join(testTmpDir, 'settings.json'),
      JSON.stringify({ usage_cost_limit_usd: -10 })
    );
    __resetSettingsCache();
    expect(readSettings().usage_cost_limit_usd).toBeUndefined();
  });

  it('drops non-finite (Infinity/NaN) silently', () => {
    writeFileSync(
      join(testTmpDir, 'settings.json'),
      `{"usage_cost_limit_usd": null}`
    );
    __resetSettingsCache();
    expect(readSettings().usage_cost_limit_usd).toBeUndefined();
  });

  it('round-trips through writeSettings', () => {
    writeSettings({ usage_cost_limit_usd: 100.25 });
    __resetSettingsCache();
    expect(readSettings().usage_cost_limit_usd).toBe(100.25);
  });

  it('accepts 0 (limit explicitly set to zero — UI handles as exceed)', () => {
    writeSettings({ usage_cost_limit_usd: 0 });
    __resetSettingsCache();
    expect(readSettings().usage_cost_limit_usd).toBe(0);
  });
});

describe('Settings — usage_alert_threshold (v0.9.0)', () => {
  it('returns undefined when missing', () => {
    expect(readSettings().usage_alert_threshold).toBeUndefined();
  });

  it('preserves values in [0, 1]', () => {
    for (const v of [0, 0.5, 0.8, 1]) {
      writeFileSync(
        join(testTmpDir, 'settings.json'),
        JSON.stringify({ usage_alert_threshold: v })
      );
      __resetSettingsCache();
      expect(readSettings().usage_alert_threshold).toBe(v);
    }
  });

  it('drops out-of-range values', () => {
    for (const v of [-0.1, 1.1, 2]) {
      writeFileSync(
        join(testTmpDir, 'settings.json'),
        JSON.stringify({ usage_alert_threshold: v })
      );
      __resetSettingsCache();
      expect(readSettings().usage_alert_threshold).toBeUndefined();
    }
  });

  it('round-trips through writeSettings', () => {
    writeSettings({ usage_alert_threshold: 0.9 });
    __resetSettingsCache();
    expect(readSettings().usage_alert_threshold).toBe(0.9);
  });

  it('persists alongside cost_limit_usd', () => {
    writeSettings({ usage_cost_limit_usd: 50, usage_alert_threshold: 0.75 });
    __resetSettingsCache();
    const s = readSettings();
    expect(s.usage_cost_limit_usd).toBe(50);
    expect(s.usage_alert_threshold).toBe(0.75);
  });
});
