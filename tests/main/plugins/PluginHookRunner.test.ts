/**
 * PluginHookRunner unit tests (v1.1.22).
 *
 * 검증:
 *  - hook 이 ctx 를 mutate 하면 caller 가 봄.
 *  - 실행 시간이 audit duration_ms 에 기록.
 *  - 한 plugin throw → 다음 plugin 진행 + audit 'plugin.hook_error'.
 *  - timeout — vm 의 timeout 옵션 작동 확인 → audit 'plugin.hook_timeout'.
 *  - hook 미정의 plugin → skip.
 *  - script cache — 같은 plugin/path 두 번 호출 시 같은 Script 객체.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  PluginHookRunner,
  type PluginHookAuditEvent,
} from '../../../src/main/plugins/PluginHookRunner';
import type { LoadedPlugin } from '../../../src/main/plugins/PluginManager';

let scratchDir: string;
let auditEvents: PluginHookAuditEvent[];

beforeEach(() => {
  scratchDir = mkdtempSync(join(tmpdir(), 'plugin-hook-test-'));
  auditEvents = [];
});

afterEach(() => {
  try {
    rmSync(scratchDir, { recursive: true, force: true });
  } catch {
    // ignore
  }
});

function makePlugin(name: string, hookSrc: string, hookKind: 'pre_turn' | 'post_turn' = 'pre_turn'): LoadedPlugin {
  const dir = join(scratchDir, name);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'index.js'), hookSrc, 'utf8');
  return {
    dir,
    manifest: {
      name,
      version: '0.1.0',
      hooks: { [hookKind]: 'index.js' },
    },
  };
}

function makeRunner(timeout_ms = 1_000): PluginHookRunner {
  return new PluginHookRunner({
    timeout_ms,
    auditSink: (e): void => {
      auditEvents.push(e);
    },
  });
}

describe('v1.1.22 — PluginHookRunner', () => {
  it('hook 이 ctx 를 mutate → caller 가 봄', async () => {
    const plugin = makePlugin(
      'mut',
      `ctx.payload.added = 'by plugin'; ctx.payload.count = (ctx.payload.count ?? 0) + 1;`
    );
    const runner = makeRunner();
    const ctx = { kind: 'pre_turn' as const, payload: { count: 5 } };
    await runner.runHook([plugin], 'pre_turn', ctx);
    expect(ctx.payload).toEqual({ count: 6, added: 'by plugin' });
    expect(auditEvents.find((e) => e.event === 'plugin.hook_ok')).toBeDefined();
  });

  it('plugin throw → 다음 plugin 진행 + audit hook_error', async () => {
    const bad = makePlugin('bad', `throw new Error('boom');`);
    const good = makePlugin('good', `ctx.payload.touched = true;`);
    const runner = makeRunner();
    const ctx = { kind: 'pre_turn' as const, payload: {} as Record<string, unknown> };
    await runner.runHook([bad, good], 'pre_turn', ctx);
    expect(ctx.payload.touched).toBe(true);
    const errEvent = auditEvents.find((e) => e.event === 'plugin.hook_error');
    expect(errEvent).toBeDefined();
    expect(errEvent?.plugin_name).toBe('bad');
    expect(errEvent?.error).toMatch(/boom/);
  });

  it('hook 미정의 plugin → skip (audit X)', async () => {
    const noHook: LoadedPlugin = {
      dir: scratchDir,
      manifest: { name: 'no-hook', version: '0.1.0' },
    };
    const runner = makeRunner();
    await runner.runHook([noHook], 'pre_turn', {
      kind: 'pre_turn',
      payload: {},
    });
    expect(auditEvents.length).toBe(0);
  });

  it('post_turn 도 동일하게 작동', async () => {
    const plugin = makePlugin(
      'post',
      `ctx.payload.post = 'ran';`,
      'post_turn'
    );
    const runner = makeRunner();
    const ctx = { kind: 'post_turn' as const, payload: {} as Record<string, unknown> };
    await runner.runHook([plugin], 'post_turn', ctx);
    expect(ctx.payload.post).toBe('ran');
  });

  it('timeout — 무한 루프 plugin 차단', async () => {
    const plugin = makePlugin('inf', `while (true) {}`);
    const runner = makeRunner(100);
    const ctx = { kind: 'pre_turn' as const, payload: {} };
    await runner.runHook([plugin], 'pre_turn', ctx);
    const timeoutEvent = auditEvents.find((e) => e.event === 'plugin.hook_timeout');
    expect(timeoutEvent).toBeDefined();
    expect(timeoutEvent?.plugin_name).toBe('inf');
  });

  it('audit duration_ms 기록', async () => {
    const plugin = makePlugin('quick', `ctx.payload.x = 1;`);
    const runner = makeRunner();
    await runner.runHook([plugin], 'pre_turn', {
      kind: 'pre_turn',
      payload: {},
    });
    const ok = auditEvents.find((e) => e.event === 'plugin.hook_ok');
    expect(ok?.duration_ms).toBeGreaterThanOrEqual(0);
  });

  it('clearScriptCache — cache invalidation', async () => {
    const plugin = makePlugin('cache', `ctx.payload.run = (ctx.payload.run ?? 0) + 1;`);
    const runner = makeRunner();
    const ctx = { kind: 'pre_turn' as const, payload: {} as Record<string, unknown> };
    await runner.runHook([plugin], 'pre_turn', ctx);
    runner.clearScriptCache();
    await runner.runHook([plugin], 'pre_turn', ctx);
    expect(ctx.payload.run).toBe(2);
  });
});
