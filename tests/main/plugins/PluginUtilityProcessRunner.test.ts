/**
 * v2.0.0 (B2) — PluginUtilityProcessRunner unit tests.
 *
 * mock spawn function 으로 utility_process spawn 추상화. real Electron
 * subprocess 없이 message protocol + audit emit + timeout 검증.
 */

import { describe, it, expect, vi } from 'vitest';
import {
  PluginUtilityProcessRunner,
  type PluginWorkerHandle,
  type PluginWorkerSpawnFn,
} from '../../../src/main/plugins/PluginUtilityProcessRunner';
import type {
  PluginHookContext,
  PluginHookAuditEvent,
} from '../../../src/main/plugins/PluginHookRunner';
import type {
  WorkerEvent,
  WorkerRequest,
  WorkerHookResult,
} from '../../../src/main/plugins/pluginWorkerEntry';
import type { LoadedPlugin } from '../../../src/main/plugins/PluginManager';

// ────────────────────────────────────────────────────────────
// Mock worker handle — test 가 message + exit 를 수동 trigger.
// ────────────────────────────────────────────────────────────

interface MockHandle extends PluginWorkerHandle {
  /** 부모가 보낸 마지막 request — test assertion 용. */
  lastRequest: WorkerRequest | null;
  /** kill 호출 여부. */
  killed: boolean;
  /** test 가 child 응답을 trigger. */
  emitMessage: (msg: WorkerEvent) => void;
  emitExit: (code: number | null) => void;
}

function makeMockHandle(): MockHandle {
  let messageListener: ((msg: WorkerEvent) => void) | null = null;
  let exitListener: ((code: number | null) => void) | null = null;
  const handle: MockHandle = {
    lastRequest: null,
    killed: false,
    postMessage: (msg) => {
      handle.lastRequest = msg;
    },
    on: (event, listener) => {
      if (event === 'message') messageListener = listener;
    },
    onExit: (listener) => {
      exitListener = listener;
    },
    kill: () => {
      handle.killed = true;
    },
    emitMessage: (msg) => {
      messageListener?.(msg);
    },
    emitExit: (code) => {
      exitListener?.(code);
    },
  };
  return handle;
}

// ────────────────────────────────────────────────────────────
// Test fixtures
// ────────────────────────────────────────────────────────────

function makePlugin(name: string, hookPath = 'hooks/pre_turn.js'): LoadedPlugin {
  return {
    manifest: {
      name,
      version: '1.0.0',
      hooks: { pre_turn: hookPath, post_turn: hookPath },
      capabilities: [],
    },
    dir: `/fake/plugins/${name}`,
  } as unknown as LoadedPlugin;
}

function makeCtx(): PluginHookContext {
  return {
    kind: 'pre_turn',
    payload: { count: 0 },
  };
}

// ────────────────────────────────────────────────────────────
// Tests
// ────────────────────────────────────────────────────────────

describe('v2.0.0 (B2) — PluginUtilityProcessRunner', () => {
  it('happy path: child success → payload mutate + audit ok', async () => {
    const handle = makeMockHandle();
    const audits: PluginHookAuditEvent[] = [];
    const runner = new PluginUtilityProcessRunner({
      spawnFn: () => handle,
      auditSink: (e) => audits.push(e),
    });
    const ctx = makeCtx();
    const plugins = [makePlugin('p1')];

    const promise = runner.runHook(plugins, 'pre_turn', ctx);
    // 부모가 request 보낸 후 child 응답 시뮬레이션.
    expect(handle.lastRequest?.type).toBe('run-hook');
    handle.emitMessage({
      type: 'hook-result',
      hook_id: 'p1-pre_turn-x',
      success: true,
      payload: { count: 42 },
      duration_ms: 15,
    });
    await promise;

    expect(ctx.payload).toEqual({ count: 42 });
    expect(audits.length).toBe(1);
    expect(audits[0]?.event).toBe('plugin.hook_ok');
    expect(audits[0]?.plugin_name).toBe('p1');
    expect(handle.killed).toBe(true);
  });

  it('child error → audit error (no payload mutation)', async () => {
    const handle = makeMockHandle();
    const audits: PluginHookAuditEvent[] = [];
    const runner = new PluginUtilityProcessRunner({
      spawnFn: () => handle,
      auditSink: (e) => audits.push(e),
    });
    const ctx = makeCtx();

    const promise = runner.runHook([makePlugin('p2')], 'pre_turn', ctx);
    handle.emitMessage({
      type: 'hook-result',
      hook_id: 'p2-x',
      success: false,
      error: 'plugin threw oops',
      duration_ms: 5,
    });
    await promise;

    expect(ctx.payload).toEqual({ count: 0 });
    expect(audits[0]?.event).toBe('plugin.hook_error');
    expect(audits[0]?.error).toMatch(/oops/);
  });

  it('child timeout (vm) → audit timeout', async () => {
    const handle = makeMockHandle();
    const audits: PluginHookAuditEvent[] = [];
    const runner = new PluginUtilityProcessRunner({
      spawnFn: () => handle,
      auditSink: (e) => audits.push(e),
    });

    const promise = runner.runHook([makePlugin('p3')], 'pre_turn', makeCtx());
    handle.emitMessage({
      type: 'hook-result',
      hook_id: 'p3-x',
      success: false,
      error: 'Script execution timed out after 5000ms',
      timed_out: true,
      duration_ms: 5_000,
    });
    await promise;

    expect(audits[0]?.event).toBe('plugin.hook_timeout');
  });

  it('parent wall-clock timeout (child never responds) → audit timeout + kill', async () => {
    vi.useFakeTimers();
    const handle = makeMockHandle();
    const audits: PluginHookAuditEvent[] = [];
    const runner = new PluginUtilityProcessRunner({
      spawnFn: () => handle,
      auditSink: (e) => audits.push(e),
      timeout_ms: 100,
    });

    const promise = runner.runHook([makePlugin('p4')], 'pre_turn', makeCtx());
    // child 응답 없이 wall timeout (100 + 1000 buffer = 1100ms) 경과.
    await vi.advanceTimersByTimeAsync(1_200);
    await promise;

    expect(handle.killed).toBe(true);
    expect(audits[0]?.event).toBe('plugin.hook_timeout');
    expect(audits[0]?.error).toMatch(/wall-clock timeout/);
    vi.useRealTimers();
  });

  it('child exit before result → audit error', async () => {
    const handle = makeMockHandle();
    const audits: PluginHookAuditEvent[] = [];
    const runner = new PluginUtilityProcessRunner({
      spawnFn: () => handle,
      auditSink: (e) => audits.push(e),
    });

    const promise = runner.runHook([makePlugin('p5')], 'pre_turn', makeCtx());
    handle.emitExit(137); // SIGKILL-ish
    await promise;

    expect(audits[0]?.event).toBe('plugin.hook_error');
    expect(audits[0]?.error).toMatch(/worker exited unexpectedly/);
  });

  it('notify event → ctx.notify forwarded', async () => {
    const handle = makeMockHandle();
    const notifyMock = vi.fn();
    const ctx: PluginHookContext = {
      kind: 'pre_turn',
      payload: {},
      notify: notifyMock,
    };
    const runner = new PluginUtilityProcessRunner({ spawnFn: () => handle });

    const promise = runner.runHook([makePlugin('p6')], 'pre_turn', ctx);
    handle.emitMessage({
      type: 'notify',
      hook_id: 'p6-x',
      message: 'hi from plugin',
      kind: 'warning',
    });
    handle.emitMessage({
      type: 'hook-result',
      hook_id: 'p6-x',
      success: true,
      payload: {},
      duration_ms: 5,
    });
    await promise;

    expect(notifyMock).toHaveBeenCalledWith('hi from plugin', 'warning');
  });

  it('plugin without hook for kind → skipped silently', async () => {
    const handle = makeMockHandle();
    let spawnCalled = 0;
    const spawnFn: PluginWorkerSpawnFn = () => {
      spawnCalled++;
      return handle;
    };
    const audits: PluginHookAuditEvent[] = [];
    const runner = new PluginUtilityProcessRunner({
      spawnFn,
      auditSink: (e) => audits.push(e),
    });
    const plugin: LoadedPlugin = {
      manifest: {
        name: 'no-hooks',
        version: '1.0.0',
        // hooks intentionally absent
        capabilities: [],
      },
      dir: '/fake/plugins/no-hooks',
    } as unknown as LoadedPlugin;

    await runner.runHook([plugin], 'pre_turn', makeCtx());

    expect(spawnCalled).toBe(0);
    expect(audits.length).toBe(0);
  });

  it('multiple plugins → sequential spawn (per-hook)', async () => {
    let spawnCount = 0;
    const handles: MockHandle[] = [];
    const spawnFn: PluginWorkerSpawnFn = () => {
      const h = makeMockHandle();
      handles.push(h);
      spawnCount++;
      return h;
    };
    const audits: PluginHookAuditEvent[] = [];
    const runner = new PluginUtilityProcessRunner({
      spawnFn,
      auditSink: (e) => audits.push(e),
    });

    const plugins = [makePlugin('a'), makePlugin('b'), makePlugin('c')];
    const promise = runner.runHook(plugins, 'pre_turn', makeCtx());

    // sequential — 한 시점에 한 child 만 active.
    for (let i = 0; i < 3; i++) {
      // 각 plugin 의 응답 차례로.
      // 단, await 없이 즉시 응답 trigger 하면 전체 synchronous 처럼 보임.
      // setTimeout 0 으로 microtask flush 후 다음 plugin spawn.
      await new Promise((r) => setTimeout(r, 0));
      handles[i]?.emitMessage({
        type: 'hook-result',
        hook_id: `${plugins[i]?.manifest.name}-x`,
        success: true,
        payload: {},
        duration_ms: 1,
      });
    }
    await promise;

    expect(spawnCount).toBe(3);
    expect(audits.map((e) => e.plugin_name)).toEqual(['a', 'b', 'c']);
  });
});

describe('v2.0.0 (B2) — pluginWorkerEntry.executeHook (pure)', () => {
  it('hook 본문 실행 → ctx.payload mutation 결과 반환', async () => {
    // import 가 본 파일 module 평가 시점에 실행되지만 process.parentPort 가
    // 부재 (vitest node 환경) → bootstrap block skip.
    const { executeHook } = await import('../../../src/main/plugins/pluginWorkerEntry');
    const path = await import('node:path');
    const fs = await import('node:fs/promises');
    const os = await import('node:os');
    const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'plugin-poc-'));
    const hookFile = path.join(tmp, 'pre_turn.js');
    await fs.writeFile(hookFile, "ctx.payload.greeted = true;\nctx.payload.from = 'plugin';\n");

    const result = await executeHook(
      {
        type: 'run-hook',
        hook_id: 'h1',
        plugin_name: 'pluginA',
        plugin_dir: tmp,
        hook_kind: 'pre_turn',
        hook_path: 'pre_turn.js',
        payload: { count: 0 },
        timeout_ms: 1_000,
      },
      () => {
        // notify not used in this test
      }
    ) as WorkerHookResult;

    expect(result.success).toBe(true);
    expect(result.payload).toEqual({
      count: 0,
      greeted: true,
      from: 'plugin',
    });

    await fs.rm(tmp, { recursive: true, force: true });
  });

  it('vm timeout → timed_out=true', async () => {
    const { executeHook } = await import('../../../src/main/plugins/pluginWorkerEntry');
    const path = await import('node:path');
    const fs = await import('node:fs/promises');
    const os = await import('node:os');
    const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'plugin-poc-'));
    const hookFile = path.join(tmp, 'slow.js');
    // busy loop — vm timeout 이 throw.
    await fs.writeFile(hookFile, 'while (true) {}\n');

    const result = await executeHook(
      {
        type: 'run-hook',
        hook_id: 'h2',
        plugin_name: 'slowP',
        plugin_dir: tmp,
        hook_kind: 'pre_turn',
        hook_path: 'slow.js',
        payload: {},
        timeout_ms: 100,
      },
      () => undefined
    );

    expect(result.success).toBe(false);
    expect(result.timed_out).toBe(true);
    expect(result.error).toMatch(/Script execution timed out/i);

    await fs.rm(tmp, { recursive: true, force: true });
  });
});
