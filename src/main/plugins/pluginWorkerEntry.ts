/**
 * v2.0.0 (B2) — Plugin worker entry — utility_process child.
 *
 * 본 파일은 `utilityProcess.fork(workerPath, ...)` 의 entry 다. 부모
 * (PluginUtilityProcessRunner) 가 hook 요청을 message 로 보내면 child 가 plugin
 * 스크립트를 vm.createContext sandbox 안에서 실행하고 결과 + audit event 를
 * message 로 답한다.
 *
 * 격리 효과: V8 isolate 가 main process 와 분리 → plugin 이 main globals
 * (BrowserWindow, app, dialog 등) 에 직접 접근 불가. vm.createContext 는 한
 * 번 더 sandbox layer 를 더해 require/process 같은 흔한 escape vector 차단.
 *
 * Spec: docs/adr/0003-plugin-utility-process-isolation.md
 */

import { promises as fsp } from 'node:fs';
import { join } from 'node:path';
import { Script, createContext } from 'node:vm';

// ────────────────────────────────────────────────────────────
// IPC message protocol — child ↔ parent
// ────────────────────────────────────────────────────────────

export interface WorkerRunHookRequest {
  type: 'run-hook';
  hook_id: string;
  plugin_name: string;
  plugin_dir: string;
  hook_kind: 'pre_turn' | 'post_turn';
  hook_path: string;
  /** plain JSON (no functions) — `notify` 는 child 에서 message 로 변환 */
  payload: Record<string, unknown>;
  timeout_ms: number;
}

export interface WorkerShutdownRequest {
  type: 'shutdown';
}

export type WorkerRequest = WorkerRunHookRequest | WorkerShutdownRequest;

export interface WorkerHookResult {
  type: 'hook-result';
  hook_id: string;
  success: boolean;
  /** plugin 이 mutate 한 payload — parent 가 caller 에게 그대로 반환 */
  payload?: Record<string, unknown>;
  /** plugin throw 시 normalized 메시지 */
  error?: string;
  /** vm timeout 발생 여부 */
  timed_out?: boolean;
  duration_ms: number;
}

export interface WorkerNotifyEvent {
  type: 'notify';
  hook_id: string;
  message: string;
  kind?: 'info' | 'warning' | 'error';
}

export type WorkerEvent = WorkerHookResult | WorkerNotifyEvent;

// ────────────────────────────────────────────────────────────
// Hook execution — pure logic, exported for unit tests
// ────────────────────────────────────────────────────────────

/**
 * 한 hook 실행. caller (parent message handler) 가 result event 로 변환해
 * postMessage. 본 함수는 pure — IPC 의존성 없음.
 *
 * notify 콜백은 caller 가 주입 — child 에서 message-passing 으로 변환.
 */
export async function executeHook(
  req: WorkerRunHookRequest,
  notify: (message: string, kind?: 'info' | 'warning' | 'error') => void
): Promise<WorkerHookResult> {
  const startedAt = Date.now();
  try {
    const abs = join(req.plugin_dir, req.hook_path);
    const source = await fsp.readFile(abs, 'utf8');
    const script = new Script(source, { filename: abs });
    // mutable payload — plugin 이 in-place 수정 가능
    const ctx = {
      kind: req.hook_kind,
      payload: req.payload,
      notify,
    };
    const sandbox: Record<string, unknown> = {
      console,
      ctx,
    };
    const sandboxCtx = createContext(sandbox);
    script.runInContext(sandboxCtx, { timeout: req.timeout_ms });
    return {
      type: 'hook-result',
      hook_id: req.hook_id,
      success: true,
      payload: ctx.payload,
      duration_ms: Date.now() - startedAt,
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    const timedOut = /Script execution timed out/i.test(msg);
    return {
      type: 'hook-result',
      hook_id: req.hook_id,
      success: false,
      error: msg,
      timed_out: timedOut,
      duration_ms: Date.now() - startedAt,
    };
  }
}

// ────────────────────────────────────────────────────────────
// Bootstrap — utility_process entry only (test 시 import 만)
// ────────────────────────────────────────────────────────────

// ────────────────────────────────────────────────────────────
// v2.4.0 (Task 1) — long-lived worker protocol (PluginWorkerPool).
//
// In addition to the legacy per-hook { type: 'run-hook' } message (used by
// PluginUtilityProcessRunner.ts), the worker entry now answers:
//   - { type: 'host-ping', seq }       → { type: 'plugin-pong', seq }
//   - { type: 'host-shutdown', reason } → process.exit(0)
//   - { type: 'host-rpc', call_id, method='run-hook', params: {plugin_name,
//       plugin_dir, hook_kind, hook_path, payload, timeout_ms} }
//       → { type: 'plugin-rpc-result', call_id, result: { payload, duration_ms } }
//       → { type: 'plugin-rpc-error',  call_id, error: { code, message } }
//
// Long-lived workers do NOT exit after one hook — they wait for shutdown.
// ────────────────────────────────────────────────────────────

interface HostPingMessage {
  type: 'host-ping';
  seq: number;
}
interface HostShutdownMessage {
  type: 'host-shutdown';
  reason: 'reload' | 'memory-cap' | 'quarantine' | 'app-exit';
}
interface HostRpcMessage {
  type: 'host-rpc';
  call_id: string;
  method: string;
  params: unknown;
}
interface HostRevokeMessage {
  type: 'host-revoke';
  capability?: string;
  grant_epoch: number;
}
type LongLivedHostMessage =
  | HostPingMessage
  | HostShutdownMessage
  | HostRpcMessage
  | HostRevokeMessage;

interface PluginPongMessage {
  type: 'plugin-pong';
  seq: number;
}
interface PluginRpcResultMessage {
  type: 'plugin-rpc-result';
  call_id: string;
  result: unknown;
}
interface PluginRpcErrorMessage {
  type: 'plugin-rpc-error';
  call_id: string;
  error: { code: string; message: string };
}
type LongLivedPluginMessage = PluginPongMessage | PluginRpcResultMessage | PluginRpcErrorMessage;

type AnyHostMessage = WorkerRequest | LongLivedHostMessage;
type AnyPluginMessage = WorkerEvent | LongLivedPluginMessage;

// Electron utility_process 에선 `process.parentPort` (Electron 글로벌 type)
// 가 message bridge. vitest 에서 import 했을 땐 parentPort 부재 — guard 로 skip.
// parentPort 의 정확한 타입은 Electron 의 ambient declaration 이 제공하지만
// node 환경 vitest 가 import 시 type 모름 → unknown 캐스트로 안전 우회.
type ParentPortLike = {
  on: (event: 'message', listener: (e: { data: AnyHostMessage }) => void) => void;
  postMessage: (msg: AnyPluginMessage) => void;
};

/**
 * Translate a host-rpc 'run-hook' params object into the legacy
 * WorkerRunHookRequest shape so executeHook can be reused without copy-paste.
 *
 * Exported for unit tests — the parentPort bootstrap below routes here.
 */
export function rpcParamsToRunHookRequest(
  call_id: string,
  params: unknown
): WorkerRunHookRequest | null {
  if (typeof params !== 'object' || params === null) return null;
  const p = params as Record<string, unknown>;
  if (
    typeof p['plugin_name'] !== 'string' ||
    typeof p['plugin_dir'] !== 'string' ||
    typeof p['hook_path'] !== 'string' ||
    typeof p['timeout_ms'] !== 'number' ||
    (p['hook_kind'] !== 'pre_turn' && p['hook_kind'] !== 'post_turn') ||
    typeof p['payload'] !== 'object' ||
    p['payload'] === null
  ) {
    return null;
  }
  return {
    type: 'run-hook',
    hook_id: call_id,
    plugin_name: p['plugin_name'],
    plugin_dir: p['plugin_dir'],
    hook_kind: p['hook_kind'],
    hook_path: p['hook_path'],
    payload: p['payload'] as Record<string, unknown>,
    timeout_ms: p['timeout_ms'],
  };
}

/**
 * Pure message handler for the long-lived worker protocol. Returns a Promise
 * that resolves when any async work (executeHook) is done. Caller (parentPort
 * bootstrap below + unit tests) supplies a `postMessage` callback and an
 * optional `onShutdown` to control process.exit timing.
 *
 * Exported so unit tests can drive the host-rpc protocol without spawning a
 * real utility_process.
 */
export async function handleHostMessage(
  req: AnyHostMessage,
  postMessage: (msg: AnyPluginMessage) => void,
  onShutdown?: () => void
): Promise<void> {
  if (req.type === 'host-ping') {
    postMessage({ type: 'plugin-pong', seq: req.seq });
    return;
  }
  if (req.type === 'host-shutdown') {
    onShutdown?.();
    return;
  }
  if (req.type === 'host-revoke') {
    // Long-lived workers respect revoke by aborting any pending hook.
    // For v2.4.0 minimum: no-op — host dispatcher already aborts in-flight
    // RPCs via AbortRegistry. Future: wire into per-call AbortController.
    return;
  }
  if (req.type === 'host-rpc') {
    if (req.method === 'run-hook') {
      const runReq = rpcParamsToRunHookRequest(req.call_id, req.params);
      if (runReq === null) {
        postMessage({
          type: 'plugin-rpc-error',
          call_id: req.call_id,
          error: { code: 'INVALID_PARAMS', message: 'malformed run-hook params' },
        });
        return;
      }
      const notify = (message: string, kind?: 'info' | 'warning' | 'error'): void => {
        postMessage({
          type: 'notify',
          hook_id: runReq.hook_id,
          message,
          ...(kind !== undefined && { kind }),
        });
      };
      const result = await executeHook(runReq, notify);
      if (result.success) {
        postMessage({
          type: 'plugin-rpc-result',
          call_id: req.call_id,
          result: { payload: result.payload, duration_ms: result.duration_ms },
        });
      } else {
        postMessage({
          type: 'plugin-rpc-error',
          call_id: req.call_id,
          error: {
            code: result.timed_out === true ? 'HOOK_TIMEOUT' : 'HOOK_ERROR',
            message: result.error ?? 'unknown',
          },
        });
      }
      return;
    }
    postMessage({
      type: 'plugin-rpc-error',
      call_id: req.call_id,
      error: { code: 'METHOD_NOT_FOUND', message: `unknown method: ${req.method}` },
    });
    return;
  }
  // Legacy per-hook protocol.
  if (req.type === 'shutdown') {
    onShutdown?.();
    return;
  }
  if (req.type === 'run-hook') {
    const notify = (message: string, kind?: 'info' | 'warning' | 'error'): void => {
      postMessage({
        type: 'notify',
        hook_id: req.hook_id,
        message,
        ...(kind !== undefined && { kind }),
      });
    };
    const result = await executeHook(req, notify);
    postMessage(result);
    onShutdown?.();
    return;
  }
}

const electronProcess = process as unknown as { parentPort?: ParentPortLike };
if (electronProcess.parentPort !== undefined) {
  const parentPort = electronProcess.parentPort;
  parentPort.on('message', (e) => {
    void handleHostMessage(e.data, parentPort.postMessage.bind(parentPort), () => process.exit(0));
  });
}

