/**
 * cost-limit-hook example plugin smoke test (v1.1.24).
 *
 * 본 test 는 examples/plugins/cost-limit-hook/ 을 실제 PluginManager 로 load
 * + PluginHookRunner 로 실행해서 ctx.notify 호출 동작 검증.
 */

import { describe, it, expect } from 'vitest';
import { resolve } from 'node:path';
import { PluginManager } from '../../../src/main/plugins/PluginManager';
import { PluginHookRunner } from '../../../src/main/plugins/PluginHookRunner';

const PLUGIN_ROOT = resolve(__dirname, '..', '..', '..', 'examples', 'plugins');

describe('v1.1.24 — cost-limit-hook example plugin', () => {
  it('manifest 로드 + capabilities 빈 배열', async () => {
    const mgr = new PluginManager({ rootDir: PLUGIN_ROOT });
    const result = await mgr.scan();
    const plugin = result.loaded.find((p) => p.manifest.name === 'cost-limit-hook');
    expect(plugin).toBeDefined();
    expect(plugin?.manifest.version).toBe('0.1.0');
    expect(plugin?.manifest.hooks?.post_turn).toBe('index.js');
    expect(plugin?.manifest.capabilities).toEqual([]);
  });

  it('mtd_total < 80% → notify 호출 X', async () => {
    const mgr = new PluginManager({ rootDir: PLUGIN_ROOT });
    const result = await mgr.scan();
    const plugin = result.loaded.find((p) => p.manifest.name === 'cost-limit-hook');
    if (plugin === undefined) throw new Error('plugin not loaded');
    const runner = new PluginHookRunner();
    const notifications: Array<{ kind: string; msg: string }> = [];
    await runner.runHook([plugin], 'post_turn', {
      kind: 'post_turn',
      payload: { mtd_total_usd: 5, limit_usd: 10 },
      notify: (msg, kind) =>
        notifications.push({ kind: kind ?? 'info', msg }),
    });
    expect(notifications.length).toBe(0);
  });

  it('mtd_total === 80% → warning toast', async () => {
    const mgr = new PluginManager({ rootDir: PLUGIN_ROOT });
    const result = await mgr.scan();
    const plugin = result.loaded.find((p) => p.manifest.name === 'cost-limit-hook');
    if (plugin === undefined) throw new Error('plugin not loaded');
    const runner = new PluginHookRunner();
    const notifications: Array<{ kind: string; msg: string }> = [];
    await runner.runHook([plugin], 'post_turn', {
      kind: 'post_turn',
      payload: { mtd_total_usd: 8, limit_usd: 10 },
      notify: (msg, kind) =>
        notifications.push({ kind: kind ?? 'info', msg }),
    });
    expect(notifications.length).toBe(1);
    expect(notifications[0]?.kind).toBe('warning');
    expect(notifications[0]?.msg).toMatch(/80%/);
  });

  it('mtd_total >= 100% → error toast', async () => {
    const mgr = new PluginManager({ rootDir: PLUGIN_ROOT });
    const result = await mgr.scan();
    const plugin = result.loaded.find((p) => p.manifest.name === 'cost-limit-hook');
    if (plugin === undefined) throw new Error('plugin not loaded');
    const runner = new PluginHookRunner();
    const notifications: Array<{ kind: string; msg: string }> = [];
    await runner.runHook([plugin], 'post_turn', {
      kind: 'post_turn',
      payload: { mtd_total_usd: 12, limit_usd: 10 },
      notify: (msg, kind) =>
        notifications.push({ kind: kind ?? 'info', msg }),
    });
    expect(notifications.length).toBe(1);
    expect(notifications[0]?.kind).toBe('error');
    expect(notifications[0]?.msg).toMatch(/초과/);
  });

  it('limit_usd 미지정 → notify X (no-op)', async () => {
    const mgr = new PluginManager({ rootDir: PLUGIN_ROOT });
    const result = await mgr.scan();
    const plugin = result.loaded.find((p) => p.manifest.name === 'cost-limit-hook');
    if (plugin === undefined) throw new Error('plugin not loaded');
    const runner = new PluginHookRunner();
    const notifications: Array<{ kind: string; msg: string }> = [];
    await runner.runHook([plugin], 'post_turn', {
      kind: 'post_turn',
      payload: { mtd_total_usd: 100 },
      notify: (msg, kind) =>
        notifications.push({ kind: kind ?? 'info', msg }),
    });
    expect(notifications.length).toBe(0);
  });
});
