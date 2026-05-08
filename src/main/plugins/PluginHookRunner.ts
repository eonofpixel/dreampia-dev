/**
 * PluginHookRunner — Plugin hook runtime (v1.1.22).
 *
 * Spec: docs/v1.x-roadmap.md (P1 v1.1.x Plugin Loader / hook 시스템).
 *
 * 책임:
 *  - Loaded plugin 의 manifest.hooks 에서 path 읽음 → Node `vm` sandbox 안에
 *    dynamic 로드.
 *  - `pre_turn(ctx)` / `post_turn(ctx)` 함수 실행. ctx 는 plain JS object —
 *    plugin 이 mutate 하면 caller 가 볼 수 있음 (intentional, hook 의 본질).
 *  - 실행 중 throw → catch 후 audit log + 다음 plugin 으로 진행.
 *  - timeout (default 5s) 강제 — vm.runInContext 의 timeout 옵션.
 *
 * Trust + capability 정책 (D1 — v1.1.6):
 *  - vm.createContext 는 isolation hint 일뿐 진짜 sandbox 아님 (prototype
 *    escape 가능). plugin 은 trust-on-install 모델 — 사용자가 install 시
 *    trust 부여. 실제 보호 layer 는 (a) PluginCapabilityGate 의 capability
 *    grant 게이트 + (b) install-time manifest 검토.
 *  - 본 runner 는 hook 실행 전 gate.ensureGranted() 로 manifest.capabilities
 *    가 모두 승인됐는지 확인. 미승인 / 거절 → hook skip + audit.
 *  - external IO (network/fs/etc) 는 plugin 이 직접 시도하면 vm 안에서 require
 *    프록시 부재로 실패. 진짜 IO 는 ctx.notify 같은 host-제공 API 만.
 */

import { promises as fsp } from 'node:fs';
import { join } from 'node:path';
import { Script, createContext } from 'node:vm';
import type { LoadedPlugin } from './PluginManager';
import type { PluginCapabilityGate } from './PluginCapabilityGate';

export interface PluginHookContext {
  /** Hook 종류. */
  kind: 'pre_turn' | 'post_turn';
  /** Plugin 이 읽는 / mutating 하는 free-form payload. caller 가 정의. */
  payload: Record<string, unknown>;
  /** plugin 이 사용자에게 알릴 텍스트. caller (renderer) 가 toast 로 표시. */
  notify?: (message: string, kind?: 'info' | 'warning' | 'error') => void;
}

export interface PluginHookRunnerOptions {
  /** vm script timeout ms. default 5_000. */
  timeout_ms?: number;
  /** 실행 결과 audit. */
  auditSink?: (event: PluginHookAuditEvent) => void;
  /**
   * v1.1.6 (D1): manifest.capabilities 를 hook 실행 전 게이트. 미주입 시
   * gate skip — capability 선언이 있어도 통과 (legacy/test path). production
   * 은 항상 주입.
   */
  gate?: PluginCapabilityGate;
}

export interface PluginHookAuditEvent {
  timestamp: string;
  event:
    | 'plugin.hook_ok'
    | 'plugin.hook_error'
    | 'plugin.hook_timeout'
    | 'plugin.hook_blocked';
  plugin_name: string;
  hook: 'pre_turn' | 'post_turn';
  duration_ms: number;
  error?: string;
}

export class PluginHookRunner {
  private readonly timeoutMs: number;
  private readonly auditSink: (event: PluginHookAuditEvent) => void;
  private readonly gate: PluginCapabilityGate | undefined;
  /** Plugin 별 컴파일된 Script 캐시 — 매번 fs/eval 비용 회피. */
  private readonly scriptCache = new Map<string, Script>();

  constructor(options: PluginHookRunnerOptions = {}) {
    this.timeoutMs = options.timeout_ms ?? 5_000;
    this.gate = options.gate;
    this.auditSink =
      options.auditSink ??
      ((e): void => {
        if (e.event !== 'plugin.hook_ok') {
          console.error(
            `[PluginHookRunner] ${e.event} ${e.plugin_name}/${e.hook}: ${e.error ?? ''}`
          );
        }
      });
  }

  /**
   * 모든 loaded plugin 의 hook (pre_turn 또는 post_turn) 을 순차 실행.
   * 한 plugin throw 해도 다음 plugin 으로 진행 (best-effort).
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
      // v1.1.6 (D1) — capability gate. manifest.capabilities 가 모두 승인된
      // 상태가 아니면 hook skip + audit. gate 미주입 시 (test/legacy) 통과.
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
      try {
        const script = await this.loadScript(plugin, hookPath);
        const sandbox: Record<string, unknown> = {
          console,
          ctx: ctx,
        };
        const sandboxCtx = createContext(sandbox);
        script.runInContext(sandboxCtx, { timeout: this.timeoutMs });
        // Plugin 의 hook 함수가 sandbox.module.exports 또는 sandbox.<kind> 로
        // 등록됐을 수 있다. 단순한 프로토콜: plugin 이 module.exports = { pre_turn,
        // post_turn } 형식. 하지만 vm.createContext 에 module 이 없어 plugin 이
        // 직접 globalThis.<kind> 로 등록하거나 script body 가 즉시 실행되는
        // top-level statement 형식을 가정. 본 MVP 는 후자 — script body 가
        // ctx 로 직접 작업.
        this.auditSink({
          timestamp: new Date().toISOString(),
          event: 'plugin.hook_ok',
          plugin_name: plugin.manifest.name,
          hook: kind,
          duration_ms: Date.now() - startedAt,
        });
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        const isTimeout = /Script execution timed out/i.test(msg);
        this.auditSink({
          timestamp: new Date().toISOString(),
          event: isTimeout ? 'plugin.hook_timeout' : 'plugin.hook_error',
          plugin_name: plugin.manifest.name,
          hook: kind,
          duration_ms: Date.now() - startedAt,
          error: msg,
        });
        // 다음 plugin 으로 진행.
      }
    }
  }

  /** Test/shutdown helper. */
  clearScriptCache(): void {
    this.scriptCache.clear();
  }

  private async loadScript(plugin: LoadedPlugin, relPath: string): Promise<Script> {
    const abs = join(plugin.dir, relPath);
    const cached = this.scriptCache.get(abs);
    if (cached !== undefined) return cached;
    const source = await fsp.readFile(abs, 'utf8');
    const script = new Script(source, { filename: abs });
    this.scriptCache.set(abs, script);
    return script;
  }
}
