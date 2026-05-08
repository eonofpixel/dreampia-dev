/**
 * v2.0.0 (B2) — Plugin hook runner via Electron `utility_process`.
 *
 * Spec: docs/adr/0003-plugin-utility-process-isolation.md
 *
 * 책임:
 *  - PluginHookRunner 와 동일한 외부 인터페이스 (`runHook(plugins, kind, ctx)`).
 *  - Hook 실행을 utility_process 자식 process 에 위임 — V8 isolate 분리,
 *    main globals 직접 접근 불가, crash 격리.
 *  - per-hook spawn 패턴 — 한 hook 처리 후 child 자연 종료. 단순 + 격리 강함.
 *    (성능 최적화 — long-lived worker pool — v2.1.x 후속 슬롯).
 *  - timeout 강제 — child wall-clock + parent kill SIGTERM 이중 안전망.
 *
 * Backward compat: 본 클래스는 PluginHookRunner 의 alternative. `index.ts` 가
 * settings `plugin_isolation_mode` 또는 env `DREAMPIA_PLUGIN_ISOLATION` 로
 * 선택. v2.0.0 default 는 in_process (기존 PluginHookRunner) — utility_process
 * 는 explicit opt-in. v2.1.0 에서 default 전환 예정.
 *
 * DI: `spawnFn` 옵션으로 utility_process spawn 을 추상화 — vitest 가 mock 주입
 * 가능하게.
 */

import { join } from 'node:path';
import type { LoadedPlugin } from './PluginManager';
import type { PluginCapabilityGate } from './PluginCapabilityGate';
import type {
  PluginHookContext,
  PluginHookAuditEvent,
} from './PluginHookRunner';
import type {
  WorkerRequest,
  WorkerEvent,
  WorkerHookResult,
} from './pluginWorkerEntry';

// ────────────────────────────────────────────────────────────
// Worker handle — utility_process child 의 abstraction.
// ────────────────────────────────────────────────────────────

export interface PluginWorkerHandle {
  postMessage: (msg: WorkerRequest) => void;
  on: (event: 'message', listener: (msg: WorkerEvent) => void) => void;
  /** child 종료 시 fire — exit code 또는 null (kill). */
  onExit: (listener: (code: number | null) => void) => void;
  kill: () => void;
}

export type PluginWorkerSpawnFn = (entryPath: string) => PluginWorkerHandle;

// ────────────────────────────────────────────────────────────
// Options
// ────────────────────────────────────────────────────────────

export interface PluginUtilityProcessRunnerOptions {
  /** hook 실행 timeout ms. default 5_000. parent 측 wall-clock 강제. */
  timeout_ms?: number;
  /** audit sink — PluginHookRunner 와 동일 시그니처. */
  auditSink?: (event: PluginHookAuditEvent) => void;
  /** capability gate — 미주입 시 통과 (legacy/test). */
  gate?: PluginCapabilityGate;
  /**
   * utility_process spawn 함수. test 가 mock 주입 가능.
   * default: lazy 로 electron utility_process 사용 (production).
   */
  spawnFn?: PluginWorkerSpawnFn;
  /**
   * worker entry script 의 절대 경로. default 는 본 파일과 같은 디렉토리의
   * `pluginWorkerEntry.js` (compiled).
   */
  workerEntryPath?: string;
}

// ────────────────────────────────────────────────────────────
// Default spawn — Electron utility_process
// ────────────────────────────────────────────────────────────

/**
 * Lazy import — electron 은 main process 에서만 사용 가능. test (node 환경)
 * 가 본 모듈 import 했을 때 electron 시도하면 fail.
 */
function defaultSpawnFn(entryPath: string): PluginWorkerHandle {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { utilityProcess } = require('electron') as typeof import('electron');
  const child = utilityProcess.fork(entryPath);
  return {
    postMessage: (msg) => {
      child.postMessage(msg);
    },
    on: (event, listener) => {
      if (event === 'message') {
        child.on('message', (raw) => {
          listener(raw as WorkerEvent);
        });
      }
    },
    onExit: (listener) => {
      child.on('exit', (code) => {
        listener(code);
      });
    },
    kill: () => {
      child.kill();
    },
  };
}

// ────────────────────────────────────────────────────────────
// PluginUtilityProcessRunner
// ────────────────────────────────────────────────────────────

export class PluginUtilityProcessRunner {
  private readonly timeoutMs: number;
  private readonly auditSink: (event: PluginHookAuditEvent) => void;
  private readonly gate: PluginCapabilityGate | undefined;
  private readonly spawnFn: PluginWorkerSpawnFn;
  private readonly workerEntryPath: string;

  constructor(options: PluginUtilityProcessRunnerOptions = {}) {
    this.timeoutMs = options.timeout_ms ?? 5_000;
    this.gate = options.gate;
    this.spawnFn = options.spawnFn ?? defaultSpawnFn;
    this.workerEntryPath = options.workerEntryPath ?? join(__dirname, 'pluginWorkerEntry.js');
    this.auditSink =
      options.auditSink ??
      ((e): void => {
        if (e.event !== 'plugin.hook_ok') {
          // eslint-disable-next-line no-console
          console.error(
            `[PluginUtilityProcessRunner] ${e.event} ${e.plugin_name}/${e.hook}: ${e.error ?? ''}`
          );
        }
      });
  }

  /**
   * 모든 trusted plugin 의 hook 을 순차 spawn → 실행 → 종료.
   * 한 plugin 의 child 가 timeout / error 나도 다음 plugin 으로 진행.
   */
  async runHook(
    plugins: ReadonlyArray<LoadedPlugin>,
    kind: 'pre_turn' | 'post_turn',
    ctx: PluginHookContext
  ): Promise<void> {
    for (const plugin of plugins) {
      const hookPath = plugin.manifest.hooks?.[kind];
      if (hookPath === undefined) continue;
      const startedAt = Date.now();

      // Capability gate — PluginHookRunner 와 동일 패턴.
      if (this.gate !== undefined) {
        const caps = plugin.manifest.capabilities ?? [];
        const granted = await this.gate.ensureGranted(plugin.manifest.name, caps);
        if (!granted) {
          this.auditSink({
            timestamp: new Date().toISOString(),
            event: 'plugin.hook_blocked',
            plugin_name: plugin.manifest.name,
            hook: kind,
            duration_ms: Date.now() - startedAt,
            error: 'capability not granted',
          });
          continue;
        }
      }

      const result = await this.runOneInWorker(plugin, hookPath, kind, ctx, startedAt);

      // ctx.payload mutation 반영 — caller 가 같은 ref 를 본다.
      if (result.success && result.payload !== undefined) {
        // payload 는 child 에서 JSON 직렬화/역직렬화 후 mutate. 동일 ref 보장
        // 위해 in-place 복사.
        for (const k of Object.keys(ctx.payload)) {
          delete ctx.payload[k];
        }
        Object.assign(ctx.payload, result.payload);
      }

      // audit emit
      const audit: PluginHookAuditEvent = result.success
        ? {
            timestamp: new Date().toISOString(),
            event: 'plugin.hook_ok',
            plugin_name: plugin.manifest.name,
            hook: kind,
            duration_ms: Date.now() - startedAt,
          }
        : {
            timestamp: new Date().toISOString(),
            event: result.timed_out === true ? 'plugin.hook_timeout' : 'plugin.hook_error',
            plugin_name: plugin.manifest.name,
            hook: kind,
            duration_ms: Date.now() - startedAt,
            error: result.error ?? 'unknown',
          };
      this.auditSink(audit);
    }
  }

  /**
   * 한 plugin/hook 을 utility_process child 에서 실행.
   * Promise 가 항상 resolve — error 도 WorkerHookResult 의 success=false 로.
   */
  private runOneInWorker(
    plugin: LoadedPlugin,
    hookPath: string,
    kind: 'pre_turn' | 'post_turn',
    ctx: PluginHookContext,
    startedAt: number
  ): Promise<WorkerHookResult> {
    return new Promise<WorkerHookResult>((resolve) => {
      const child = this.spawnFn(this.workerEntryPath);
      let resolved = false;
      const settle = (r: WorkerHookResult): void => {
        if (resolved) return;
        resolved = true;
        try {
          child.kill();
        } catch {
          // ignore
        }
        resolve(r);
      };

      // parent-side wall-clock timeout — child vm timeout 못 잡는 케이스 (예:
      // child 가 무한 sync loop 로 message 응답 못 함) 의 안전망.
      // Buffer 1s — child vm timeout 이 정상 fire 후 result 반환할 시간.
      const wallTimeoutMs = this.timeoutMs + 1_000;
      const wallTimer = setTimeout(() => {
        settle({
          type: 'hook-result',
          hook_id: 'wall-timeout',
          success: false,
          error: `parent wall-clock timeout (${wallTimeoutMs}ms)`,
          timed_out: true,
          duration_ms: Date.now() - startedAt,
        });
      }, wallTimeoutMs);

      child.on('message', (msg) => {
        if (msg.type === 'hook-result') {
          clearTimeout(wallTimer);
          settle(msg);
        } else if (msg.type === 'notify') {
          if (typeof ctx.notify === 'function') {
            ctx.notify(msg.message, msg.kind);
          }
        }
      });

      child.onExit((code) => {
        clearTimeout(wallTimer);
        // child 가 result 보내기 전에 비정상 종료 → error 로 보고.
        if (!resolved) {
          settle({
            type: 'hook-result',
            hook_id: 'child-exit',
            success: false,
            error: `worker exited unexpectedly (code=${code ?? 'null'})`,
            duration_ms: Date.now() - startedAt,
          });
        }
      });

      // Plain JSON 만 — notify 콜백은 message 로 변환.
      const req: WorkerRequest = {
        type: 'run-hook',
        hook_id: `${plugin.manifest.name}-${kind}-${startedAt}`,
        plugin_name: plugin.manifest.name,
        plugin_dir: plugin.dir,
        hook_kind: kind,
        hook_path: hookPath,
        payload: ctx.payload,
        timeout_ms: this.timeoutMs,
      };
      child.postMessage(req);
    });
  }
}
