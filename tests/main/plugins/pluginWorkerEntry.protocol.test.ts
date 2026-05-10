/**
 * pluginWorkerEntry host-rpc protocol tests (v2.4.0 Task 1).
 *
 * Drives the worker-side message handler via handleHostMessage without
 * spawning a real utility_process. Closes the gap between PluginPoolRunner
 * (host side) and the worker entry (child side):
 *   - host-ping → plugin-pong roundtrip
 *   - host-rpc method='run-hook' with valid params → plugin-rpc-result with payload
 *   - host-rpc method='run-hook' with malformed params → INVALID_PARAMS error
 *   - host-rpc method='unknown' → METHOD_NOT_FOUND error
 *   - host-shutdown → onShutdown invoked
 *   - host-revoke → no-op (no postMessage call)
 *   - Plugin script throws → plugin-rpc-error code=HOOK_ERROR
 *   - Plugin script timeout → plugin-rpc-error code=HOOK_TIMEOUT
 *   - Legacy { type: 'run-hook' } direct message still works (per-hook spawn compat)
 *   - rpcParamsToRunHookRequest rejects each missing required field
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  handleHostMessage,
  rpcParamsToRunHookRequest,
} from '../../../src/main/plugins/pluginWorkerEntry';

interface CapturedPosts {
  posted: Array<unknown>;
  shutdownCalled: number;
}

function makeHarness(): CapturedPosts & {
  postMessage: (m: unknown) => void;
  onShutdown: () => void;
} {
  const state: CapturedPosts = { posted: [], shutdownCalled: 0 };
  return {
    ...state,
    posted: state.posted,
    postMessage: (m) => state.posted.push(m),
    onShutdown: () => {
      state.shutdownCalled += 1;
    },
    get shutdownCalled() {
      return state.shutdownCalled;
    },
  } as CapturedPosts & {
    postMessage: (m: unknown) => void;
    onShutdown: () => void;
  };
}

let tmpRoot: string;
let pluginDir: string;

function writePluginScript(rel: string, source: string): void {
  const abs = join(pluginDir, rel);
  writeFileSync(abs, source, 'utf-8');
}

beforeEach(() => {
  tmpRoot = mkdtempSync(join(tmpdir(), 'wentry-'));
  pluginDir = tmpRoot;
});

afterEach(() => {
  try {
    rmSync(tmpRoot, { recursive: true, force: true });
  } catch {
    // best-effort
  }
});

describe('v2.4.0 Task 1 — pluginWorkerEntry handleHostMessage', () => {
  it('host-ping → plugin-pong with same seq', async () => {
    const h = makeHarness();
    await handleHostMessage(
      { type: 'host-ping', seq: 42 },
      h.postMessage,
      h.onShutdown
    );
    expect(h.posted).toEqual([{ type: 'plugin-pong', seq: 42 }]);
    expect(h.shutdownCalled).toBe(0);
  });

  it('host-shutdown → onShutdown invoked, no postMessage', async () => {
    const h = makeHarness();
    await handleHostMessage(
      { type: 'host-shutdown', reason: 'reload' },
      h.postMessage,
      h.onShutdown
    );
    expect(h.posted).toHaveLength(0);
    expect(h.shutdownCalled).toBe(1);
  });

  it('host-revoke → no-op (no postMessage, no shutdown)', async () => {
    const h = makeHarness();
    await handleHostMessage(
      { type: 'host-revoke', capability: 'host.fs.read', grant_epoch: 5 },
      h.postMessage,
      h.onShutdown
    );
    expect(h.posted).toHaveLength(0);
    expect(h.shutdownCalled).toBe(0);
  });

  it('host-rpc unknown method → METHOD_NOT_FOUND error', async () => {
    const h = makeHarness();
    await handleHostMessage(
      { type: 'host-rpc', call_id: 'c1', method: 'nope', params: {} },
      h.postMessage,
      h.onShutdown
    );
    expect(h.posted).toHaveLength(1);
    const post = h.posted[0] as {
      type: string;
      call_id: string;
      error: { code: string };
    };
    expect(post.type).toBe('plugin-rpc-error');
    expect(post.call_id).toBe('c1');
    expect(post.error.code).toBe('METHOD_NOT_FOUND');
  });

  it('host-rpc run-hook with malformed params → INVALID_PARAMS', async () => {
    const h = makeHarness();
    await handleHostMessage(
      {
        type: 'host-rpc',
        call_id: 'c2',
        method: 'run-hook',
        params: { plugin_name: 'p1' /* missing fields */ },
      },
      h.postMessage,
      h.onShutdown
    );
    const post = h.posted[0] as { error: { code: string } };
    expect(post.error.code).toBe('INVALID_PARAMS');
  });

  it('host-rpc run-hook executes plugin script + returns plugin-rpc-result with payload', async () => {
    writePluginScript('hook.js', 'ctx.payload.executed = true; ctx.payload.kind = ctx.kind;');
    const h = makeHarness();
    await handleHostMessage(
      {
        type: 'host-rpc',
        call_id: 'c3',
        method: 'run-hook',
        params: {
          plugin_name: 'p1',
          plugin_dir: pluginDir,
          hook_kind: 'pre_turn',
          hook_path: 'hook.js',
          payload: { initial: 'value' },
          timeout_ms: 5_000,
        },
      },
      h.postMessage,
      h.onShutdown
    );
    expect(h.posted).toHaveLength(1);
    const post = h.posted[0] as {
      type: string;
      call_id: string;
      result: { payload: Record<string, unknown>; duration_ms: number };
    };
    expect(post.type).toBe('plugin-rpc-result');
    expect(post.call_id).toBe('c3');
    expect(post.result.payload).toEqual({
      initial: 'value',
      executed: true,
      kind: 'pre_turn',
    });
    expect(typeof post.result.duration_ms).toBe('number');
  });

  it('host-rpc run-hook with throwing plugin → plugin-rpc-error code=HOOK_ERROR', async () => {
    writePluginScript('boom.js', 'throw new Error("plugin exploded");');
    const h = makeHarness();
    await handleHostMessage(
      {
        type: 'host-rpc',
        call_id: 'c4',
        method: 'run-hook',
        params: {
          plugin_name: 'p1',
          plugin_dir: pluginDir,
          hook_kind: 'pre_turn',
          hook_path: 'boom.js',
          payload: {},
          timeout_ms: 5_000,
        },
      },
      h.postMessage,
      h.onShutdown
    );
    const post = h.posted[0] as { type: string; error: { code: string; message: string } };
    expect(post.type).toBe('plugin-rpc-error');
    expect(post.error.code).toBe('HOOK_ERROR');
    expect(post.error.message).toContain('plugin exploded');
  });

  it('host-rpc run-hook with infinite loop → plugin-rpc-error code=HOOK_TIMEOUT', async () => {
    writePluginScript('loop.js', 'while(true){}');
    const h = makeHarness();
    await handleHostMessage(
      {
        type: 'host-rpc',
        call_id: 'c5',
        method: 'run-hook',
        params: {
          plugin_name: 'p1',
          plugin_dir: pluginDir,
          hook_kind: 'pre_turn',
          hook_path: 'loop.js',
          payload: {},
          timeout_ms: 50,
        },
      },
      h.postMessage,
      h.onShutdown
    );
    const post = h.posted[0] as { error: { code: string } };
    expect(post.error.code).toBe('HOOK_TIMEOUT');
  });

  it('host-rpc run-hook emits notify message during execution', async () => {
    writePluginScript('notify.js', 'ctx.notify("hello", "warning");');
    const h = makeHarness();
    await handleHostMessage(
      {
        type: 'host-rpc',
        call_id: 'c6',
        method: 'run-hook',
        params: {
          plugin_name: 'p1',
          plugin_dir: pluginDir,
          hook_kind: 'post_turn',
          hook_path: 'notify.js',
          payload: {},
          timeout_ms: 5_000,
        },
      },
      h.postMessage,
      h.onShutdown
    );
    expect(h.posted).toHaveLength(2);
    const notifyMsg = h.posted[0] as { type: string; message: string; kind: string };
    expect(notifyMsg.type).toBe('notify');
    expect(notifyMsg.message).toBe('hello');
    expect(notifyMsg.kind).toBe('warning');
    const result = h.posted[1] as { type: string };
    expect(result.type).toBe('plugin-rpc-result');
  });

  it('legacy run-hook direct message still works + onShutdown fires', async () => {
    writePluginScript('legacy.js', 'ctx.payload.legacy = true;');
    const h = makeHarness();
    await handleHostMessage(
      {
        type: 'run-hook',
        hook_id: 'legacy-1',
        plugin_name: 'p-legacy',
        plugin_dir: pluginDir,
        hook_kind: 'pre_turn',
        hook_path: 'legacy.js',
        payload: {},
        timeout_ms: 5_000,
      },
      h.postMessage,
      h.onShutdown
    );
    const post = h.posted[0] as { type: string; success: boolean; payload?: Record<string, unknown> };
    expect(post.type).toBe('hook-result');
    expect(post.success).toBe(true);
    expect(post.payload?.['legacy']).toBe(true);
    expect(h.shutdownCalled).toBe(1);
  });

  it('legacy shutdown direct message → onShutdown', async () => {
    const h = makeHarness();
    await handleHostMessage({ type: 'shutdown' }, h.postMessage, h.onShutdown);
    expect(h.shutdownCalled).toBe(1);
    expect(h.posted).toHaveLength(0);
  });
});

describe('v2.4.0 Task 1 — rpcParamsToRunHookRequest', () => {
  const validParams = {
    plugin_name: 'p1',
    plugin_dir: '/some/dir',
    hook_kind: 'pre_turn',
    hook_path: 'hook.js',
    payload: { x: 1 },
    timeout_ms: 5000,
  };

  it('valid params → returns WorkerRunHookRequest', () => {
    const result = rpcParamsToRunHookRequest('cid-1', validParams);
    expect(result).not.toBeNull();
    expect(result?.hook_id).toBe('cid-1');
    expect(result?.plugin_name).toBe('p1');
    expect(result?.hook_kind).toBe('pre_turn');
  });

  it('null/non-object params → null', () => {
    expect(rpcParamsToRunHookRequest('c', null)).toBeNull();
    expect(rpcParamsToRunHookRequest('c', 'string')).toBeNull();
    expect(rpcParamsToRunHookRequest('c', 42)).toBeNull();
  });

  it.each([
    ['plugin_name', { ...validParams, plugin_name: 42 }],
    ['plugin_dir', { ...validParams, plugin_dir: undefined }],
    ['hook_path', { ...validParams, hook_path: 123 }],
    ['timeout_ms', { ...validParams, timeout_ms: '5000' }],
    ['hook_kind', { ...validParams, hook_kind: 'invalid' }],
    ['payload null', { ...validParams, payload: null }],
  ])('rejects when %s is malformed', (_name, params) => {
    expect(rpcParamsToRunHookRequest('c', params)).toBeNull();
  });

  it('empty hook_path passes type check; downstream executeHook fails at fs.readFile', () => {
    // rpcParamsToRunHookRequest only enforces `typeof string`; emptiness is a
    // runtime concern handled by executeHook (returns success=false). This
    // test pins that contract so future "reject empty" changes are intentional.
    const result = rpcParamsToRunHookRequest('c', { ...validParams, hook_path: '' });
    expect(result?.hook_path).toBe('');
  });
});
