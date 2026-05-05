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
 * Sandbox 정책 (MVP):
 *  - vm.createContext({ console, ctx }) — Node 의 require / process / fs 등
 *    proxy X. plugin 이 외부 IO 하려면 manifest.capabilities + 별도 grant
 *    (v1.1.23).
 *  - 본 commit 은 sandbox 안에서 console.log 만 허용 (debug). external IO 는
 *    다음 commit 에서 IpcPermissionConfirmer 통해 승인된 capability 만.
 */

import { promises as fsp } from 'node:fs';
import { join } from 'node:path';
import { Script, createContext } from 'node:vm';
import type { LoadedPlugin } from './PluginManager';

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
}

export interface PluginHookAuditEvent {
  timestamp: string;
  event: 'plugin.hook_ok' | 'plugin.hook_error' | 'plugin.hook_timeout';
  plugin_name: string;
  hook: 'pre_turn' | 'post_turn';
  duration_ms: number;
  error?: string;
}

export class PluginHookRunner {
  private readonly timeoutMs: number;
  private readonly auditSink: (event: PluginHookAuditEvent) => void;
  /** Plugin 별 컴파일된 Script 캐시 — 매번 fs/eval 비용 회피. */
  private readonly scriptCache = new Map<string, Script>();

  constructor(options: PluginHookRunnerOptions = {}) {
    this.timeoutMs = options.timeout_ms ?? 5_000;
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
