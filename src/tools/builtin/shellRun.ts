/**
 * shell.run — 첫 번째 built-in tool. Subprocess 실행.
 *
 * Spec: docs/tools/_index.md (TO-5), docs/tools/categories.md
 *
 * 입력:
 *   - cmd: shell command 문자열 (필수)
 *   - cwd: 작업 디렉토리 (선택, 기본 ctx.cwd)
 *   - env: 환경변수 추가 (선택)
 *   - timeout_ms: per-call timeout (선택, ToolCall.timeout_ms 가 우선)
 *
 * 출력:
 *   - stdout / stderr / exit_code / duration_ms
 *
 * 권한:
 *   - LOCAL_EXECUTE 항상 필요
 *   - cmd 안에 sudo / runas 단어 매치 시 LOCAL_EXECUTE.elevated 추가 요구
 *
 * Permission target:
 *   - cmd 문자열을 target.value 로 — danger pattern (rm -rf /, format c: 등) 검사용
 *
 * 동작:
 *   - child_process.spawn { shell: true } 사용 (Win cmd.exe / Unix sh)
 *   - Node 16+ AbortSignal 옵션으로 외부 abort 시 즉시 kill
 *   - stdout/stderr 를 buffer 에 누적 + ctx.log debug 로 stream
 *   - close 이벤트로 resolve, error 이벤트로 reject (AbortError 포함)
 */

import { spawn } from 'node:child_process';
import { z } from 'zod';

import type { Capability } from '@/permission';
import type { Tool, PermissionTarget } from '../types';

// ────────────────────────────────────────────────────────────
// Schemas
// ────────────────────────────────────────────────────────────

const ShellRunInputSchema = z.object({
  cmd: z.string().min(1, 'cmd must be non-empty'),
  cwd: z.string().optional(),
  env: z.record(z.string()).optional(),
  timeout_ms: z.number().int().positive().optional(),
});

const ShellRunOutputSchema = z.object({
  stdout: z.string(),
  stderr: z.string(),
  exit_code: z.number().int(),
  duration_ms: z.number().int().nonnegative(),
});

export type ShellRunInput = z.infer<typeof ShellRunInputSchema>;
export type ShellRunOutput = z.infer<typeof ShellRunOutputSchema>;

// ────────────────────────────────────────────────────────────
// 권한 정책: sudo / runas 매치 시 elevated capability 추가
// ────────────────────────────────────────────────────────────

const ELEVATED_PATTERN = /\b(sudo|runas)\b/i;

// ────────────────────────────────────────────────────────────
// Tool definition
// ────────────────────────────────────────────────────────────

export const ShellRunTool: Tool<ShellRunInput, ShellRunOutput> = {
  id: 'shell.run',
  version: '1.0.0',
  source: 'builtin',

  input_schema: ShellRunInputSchema,
  output_schema: ShellRunOutputSchema,

  required_capabilities(input): Capability[] {
    const caps: Capability[] = ['LOCAL_EXECUTE'];
    if (ELEVATED_PATTERN.test(input.cmd)) {
      caps.push('LOCAL_EXECUTE.elevated');
    }
    return caps;
  },

  permission_target(input): PermissionTarget {
    // danger pattern (rm -rf /, sudo, format c: 등) 검사 위해 cmd 를 target value 로.
    // kind 'global' 사용 — DangerCheck 는 capability + target.value 만 본다.
    return { kind: 'global', value: input.cmd };
  },

  async execute(input, ctx): Promise<ShellRunOutput> {
    const startedMs = Date.now();
    ctx.log('info', `Spawning shell: ${input.cmd}`);

    return new Promise<ShellRunOutput>((resolve, reject) => {
      const child = spawn(input.cmd, {
        shell: true,
        cwd: input.cwd ?? ctx.cwd,
        env: { ...process.env, ...(input.env ?? {}) },
        // Node 16+ — AbortSignal 로 subprocess kill 가능 (engines >=22)
        signal: ctx.signal,
      });

      let stdout = '';
      let stderr = '';

      child.stdout?.on('data', (chunk: Buffer) => {
        const text = chunk.toString();
        stdout += text;
        const trimmed = text.replace(/\s+$/, '');
        if (trimmed.length > 0) {
          ctx.log('debug', trimmed, { stream: 'stdout' });
        }
      });

      child.stderr?.on('data', (chunk: Buffer) => {
        const text = chunk.toString();
        stderr += text;
        const trimmed = text.replace(/\s+$/, '');
        if (trimmed.length > 0) {
          ctx.log('debug', trimmed, { stream: 'stderr' });
        }
      });

      // error: spawn 실패 + AbortError (signal 발화 시)
      child.on('error', (err) => {
        // AbortError 는 그대로 throw (Queue 가 cancelled status 로 인식)
        reject(err);
      });

      child.on('close', (code, sig) => {
        // signal 로 종료된 경우 (e.g., SIGTERM) — abort 면 reject 가 먼저 일어났을 것
        if (ctx.signal.aborted) {
          // 이미 'error' 핸들러가 reject 했을 수 있음 — 안전하게 한번 더
          return;
        }
        const duration = Date.now() - startedMs;
        ctx.log('info', `shell exit ${code ?? -1} (${duration}ms)`, {
          signal: sig ?? null,
        });
        resolve({
          stdout,
          stderr,
          exit_code: code ?? -1,
          duration_ms: duration,
        });
      });
    });
  },

  display: {
    name: 'Shell 실행',
    icon: '⌨',
    summary: (input) => input.cmd.slice(0, 80),
    summary_result: (output) =>
      `exit ${output.exit_code} (${output.duration_ms}ms)`,
  },

  timeout_ms: 30_000,
  idempotent: false,
};
