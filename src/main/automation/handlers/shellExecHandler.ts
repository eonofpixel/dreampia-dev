/**
 * v1.7.24 — Shell exec handler.
 *
 * Config schema:
 *   - command: string                (required) — 실행 binary.
 *   - args?:   string[]              — argv. default [].
 *   - cwd?:    string                — 작업 디렉토리. default process.cwd().
 *   - timeout_ms?: number            — kill SIGKILL 까지 ms. default 30_000.
 *   - env?:    Record<string,string> — 추가 env. process.env 와 머지.
 *
 * 보안 모델:
 *   - settings.json 의 `automation_shell_enabled === true` 일 때만 동작.
 *     기본 false (사용자가 명시 opt-in 필요). 미허가면 ok=false +
 *     'shell handler disabled in settings'.
 *   - shell: false (no /bin/sh, no string interpolation). args 는 array 만.
 *     command injection 방지.
 *   - timeout 후 SIGKILL — 영구 실행 자동 차단.
 *   - max output 64KB capture (truncate).
 *
 * 출력:
 *   - exit_code === 0 → ok=true, output = `[exit 0] ${stdout || stderr}` (truncated).
 *   - exit_code !== 0 → ok=false, error = `exit ${code}: ${stderr || stdout}` (truncated).
 *   - timeout → ok=false, error = `timeout after ${ms}ms`.
 *   - spawn error (ENOENT 등) → ok=false, error = err.message.
 */

import { spawn as nodeSpawn, type ChildProcess } from 'node:child_process';
import type { AutomationHandler } from './HandlerRegistry';
import { truncateOutput } from './HandlerRegistry';
import { readSettings } from '../../settings';

export const SHELL_EXEC_HANDLER_NAME = 'shell-exec';

export type ShellSpawnFn = (
  command: string,
  args: ReadonlyArray<string>,
  options: { cwd?: string; env?: NodeJS.ProcessEnv }
) => ChildProcess;

const DEFAULT_TIMEOUT_MS = 30_000;
const MAX_OUTPUT_BYTES = 64 * 1024;

/**
 * Test 용 spawn injection. Production 은 기본 nodeSpawn 사용.
 */
let injectedSpawn: ShellSpawnFn | null = null;

export function setShellSpawnForTesting(fn: ShellSpawnFn | null): void {
  injectedSpawn = fn;
}

/**
 * Test 용 settings override. Production 은 readSettings() 호출.
 * null 이면 다시 readSettings() 사용.
 */
let settingsOverrideForTesting: { automation_shell_enabled?: boolean } | null =
  null;

export function setShellSettingsForTesting(
  override: { automation_shell_enabled?: boolean } | null
): void {
  settingsOverrideForTesting = override;
}

function isShellEnabled(): boolean {
  if (settingsOverrideForTesting !== null) {
    return settingsOverrideForTesting.automation_shell_enabled === true;
  }
  try {
    return readSettings().automation_shell_enabled === true;
  } catch {
    // Test 환경 (electron mock 미준비) 에서 readSettings 가 throw 가능.
    return false;
  }
}

export const shellExecHandler: AutomationHandler = async (ctx) => {
  if (!isShellEnabled()) {
    return {
      ok: false,
      error: 'shell handler disabled in settings (automation_shell_enabled)',
    };
  }

  const cfg = ctx.config;
  const command = typeof cfg['command'] === 'string' ? cfg['command'].trim() : '';
  if (command.length === 0) {
    return { ok: false, error: 'command required (config.command: string)' };
  }
  const args = Array.isArray(cfg['args'])
    ? cfg['args'].filter((a): a is string => typeof a === 'string')
    : [];
  const cwd =
    typeof cfg['cwd'] === 'string' && cfg['cwd'].length > 0
      ? cfg['cwd']
      : undefined;
  const timeoutMs =
    typeof cfg['timeout_ms'] === 'number' && cfg['timeout_ms'] > 0
      ? Math.floor(cfg['timeout_ms'])
      : DEFAULT_TIMEOUT_MS;
  const extraEnv =
    cfg['env'] !== null &&
    typeof cfg['env'] === 'object' &&
    !Array.isArray(cfg['env'])
      ? (cfg['env'] as Record<string, string>)
      : {};

  const spawnFn: ShellSpawnFn =
    injectedSpawn ?? ((cmd, a, o) => nodeSpawn(cmd, a as string[], o));

  return new Promise((resolve) => {
    let child: ChildProcess;
    try {
      child = spawnFn(command, args, {
        ...(cwd !== undefined && { cwd }),
        env: { ...process.env, ...extraEnv },
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      resolve({ ok: false, error: msg });
      return;
    }

    let stdoutBuf = '';
    let stderrBuf = '';
    let stdoutBytes = 0;
    let stderrBytes = 0;
    let timedOut = false;
    let resolved = false;

    const finish = (result: { ok: boolean; output?: string; error?: string }): void => {
      if (resolved) return;
      resolved = true;
      clearTimeout(timer);
      resolve(result);
    };

    const timer = setTimeout(() => {
      timedOut = true;
      try {
        child.kill('SIGKILL');
      } catch {
        // 이미 죽었을 수 있음.
      }
      finish({ ok: false, error: `timeout after ${timeoutMs}ms` });
    }, timeoutMs);

    child.stdout?.on('data', (chunk: Buffer | string) => {
      if (stdoutBytes >= MAX_OUTPUT_BYTES) return;
      const s = typeof chunk === 'string' ? chunk : chunk.toString('utf-8');
      stdoutBytes += Buffer.byteLength(s, 'utf-8');
      stdoutBuf += s;
    });
    child.stderr?.on('data', (chunk: Buffer | string) => {
      if (stderrBytes >= MAX_OUTPUT_BYTES) return;
      const s = typeof chunk === 'string' ? chunk : chunk.toString('utf-8');
      stderrBytes += Buffer.byteLength(s, 'utf-8');
      stderrBuf += s;
    });

    child.on('error', (err) => {
      finish({ ok: false, error: err.message });
    });

    child.on('close', (code) => {
      if (timedOut) return;
      if (code === 0) {
        const out = stdoutBuf.length > 0 ? stdoutBuf : stderrBuf;
        finish({ ok: true, output: truncateOutput(`[exit 0] ${out.trim()}`) });
      } else {
        const out = stderrBuf.length > 0 ? stderrBuf : stdoutBuf;
        finish({
          ok: false,
          error: truncateOutput(`exit ${code ?? '?'}: ${out.trim()}`),
        });
      }
    });
  });
};
