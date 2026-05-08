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

// Electron utility_process 에선 `process.parentPort` (Electron 글로벌 type)
// 가 message bridge. vitest 에서 import 했을 땐 parentPort 부재 — guard 로 skip.
// parentPort 의 정확한 타입은 Electron 의 ambient declaration 이 제공하지만
// node 환경 vitest 가 import 시 type 모름 → unknown 캐스트로 안전 우회.
type ParentPortLike = {
  on: (event: 'message', listener: (e: { data: WorkerRequest }) => void) => void;
  postMessage: (msg: WorkerEvent) => void;
};

const electronProcess = process as unknown as { parentPort?: ParentPortLike };
if (electronProcess.parentPort !== undefined) {
  const parentPort = electronProcess.parentPort;
  parentPort.on('message', (e) => {
    const req = e.data;
    if (req.type === 'shutdown') {
      // graceful — 즉시 exit. parent 가 child.kill() 또는 자연 종료 기대.
      // 본 child 는 한 hook 만 처리하는 short-lived 모델이라 자연 종료 충분.
      process.exit(0);
      return;
    }
    if (req.type === 'run-hook') {
      const notify = (message: string, kind?: 'info' | 'warning' | 'error'): void => {
        parentPort.postMessage({
          type: 'notify',
          hook_id: req.hook_id,
          message,
          ...(kind !== undefined && { kind }),
        });
      };
      void executeHook(req, notify).then((result) => {
        parentPort.postMessage(result);
        // 한 hook 처리 후 자연 종료 (short-lived per-hook spawn 모델).
        process.exit(0);
      });
    }
  });
}
