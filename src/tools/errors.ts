/**
 * Tool error 코드 + ToolResult 빌더 헬퍼.
 *
 * Spec: docs/tools/interface.md (ToolError), docs/tools/queue.md (errorResult)
 *
 * 모든 실패 응답을 한 곳에서 만들어 일관성 보장:
 *  - failed/cancelled/timeout status 와 code 매핑
 *  - retryable 여부 결정
 *  - duration_ms / timestamps 계산
 *
 * Tool 작성자가 직접 ToolError 만들 일 거의 없음 — Queue 가 처리.
 */

import type { ToolCall, ToolError, ToolResult, ToolResultStatus, LogEntry } from './types';

// ────────────────────────────────────────────────────────────
// 표준 에러 코드 (확장 가능 string union)
// ────────────────────────────────────────────────────────────

export const ToolErrorCode = {
  PERMISSION_DENIED: 'PERMISSION_DENIED',
  DANGEROUS_PATTERN: 'DANGEROUS_PATTERN',
  TIMEOUT: 'TIMEOUT',
  ABORTED: 'ABORTED',
  INVALID_INPUT: 'INVALID_INPUT',
  TOOL_NOT_FOUND: 'TOOL_NOT_FOUND',
  EXECUTION_ERROR: 'EXECUTION_ERROR',
  SESSION_NOT_FOUND: 'SESSION_NOT_FOUND',
} as const;

export type ToolErrorCodeValue = (typeof ToolErrorCode)[keyof typeof ToolErrorCode];

// ────────────────────────────────────────────────────────────
// AbortError — Tool 이 ctx.signal 감지 시 throw 권장
//
// Node 표준 AbortError 와 호환 (signal.aborted 시 child_process 등에서
// 던지는 에러도 'AbortError' name 가짐 → instanceof 대신 name 비교).
// ────────────────────────────────────────────────────────────

export class AbortError extends Error {
  override readonly name = 'AbortError';
  /** abort_controller.abort(reason) 의 reason. */
  reason: unknown;
  constructor(reason?: unknown) {
    super(typeof reason === 'string' ? reason : 'aborted');
    this.reason = reason;
  }
}

export function isAbortError(err: unknown): boolean {
  if (err instanceof AbortError) return true;
  if (err && typeof err === 'object' && 'name' in err) {
    const name = (err as { name?: unknown }).name;
    return name === 'AbortError';
  }
  return false;
}

// ────────────────────────────────────────────────────────────
// ToolResult builders
// ────────────────────────────────────────────────────────────

interface FailedResultArgs {
  call: ToolCall;
  status: ToolResultStatus; // 'failed' / 'cancelled' / 'timeout'
  error: ToolError;
  started_at?: string;
  completed_at?: string;
  log?: LogEntry[];
}

function nowIso(): string {
  return new Date().toISOString();
}

export function buildFailedResult(args: FailedResultArgs): ToolResult {
  const startedIso = args.started_at ?? nowIso();
  const completedIso = args.completed_at ?? startedIso;
  const startedMs = Date.parse(startedIso);
  const completedMs = Date.parse(completedIso);
  const duration =
    Number.isFinite(startedMs) && Number.isFinite(completedMs)
      ? Math.max(0, completedMs - startedMs)
      : 0;

  return {
    call_id: args.call.id,
    tool_id: args.call.tool_id,
    status: args.status,
    error: args.error,
    started_at: startedIso,
    completed_at: completedIso,
    duration_ms: duration,
    attempt_count: 1,
    side_effects: [],
    log_tail: args.log ?? [],
  };
}

export function buildSuccessResult(args: {
  call: ToolCall;
  output: unknown;
  started_at: string;
  log: LogEntry[];
}): ToolResult {
  const completedIso = nowIso();
  const startedMs = Date.parse(args.started_at);
  const completedMs = Date.parse(completedIso);
  const duration =
    Number.isFinite(startedMs) && Number.isFinite(completedMs)
      ? Math.max(0, completedMs - startedMs)
      : 0;

  return {
    call_id: args.call.id,
    tool_id: args.call.tool_id,
    status: 'success',
    output: args.output,
    started_at: args.started_at,
    completed_at: completedIso,
    duration_ms: duration,
    attempt_count: 1,
    side_effects: [],
    log_tail: args.log,
  };
}

// ────────────────────────────────────────────────────────────
// 표준 에러 객체 헬퍼
// ────────────────────────────────────────────────────────────

export function toolNotFoundError(toolId: string): ToolError {
  return {
    code: ToolErrorCode.TOOL_NOT_FOUND,
    message: `Tool not registered: ${toolId}`,
    retryable: false,
    user_visible_hint: '요청한 도구가 등록되어 있지 않습니다.',
  };
}

export function invalidInputError(toolId: string, reason: string): ToolError {
  return {
    code: ToolErrorCode.INVALID_INPUT,
    message: `Invalid input for ${toolId}: ${reason}`,
    details: { reason },
    retryable: false,
    user_visible_hint: '도구 입력 형식이 올바르지 않습니다.',
  };
}

export function sessionNotFoundError(sessionId: string): ToolError {
  return {
    code: ToolErrorCode.SESSION_NOT_FOUND,
    message: `Session not found: ${sessionId}`,
    retryable: false,
    user_visible_hint: '세션을 찾을 수 없습니다.',
  };
}

export function permissionDeniedError(args: {
  capability: string;
  reason: string;
  hint?: string;
  details?: Record<string, unknown>;
}): ToolError {
  return {
    code: ToolErrorCode.PERMISSION_DENIED,
    message: `Permission denied for ${args.capability}: ${args.reason}`,
    details: { capability: args.capability, reason: args.reason, ...args.details },
    retryable: false,
    user_visible_hint: args.hint ?? '권한이 거부되었습니다.',
  };
}

export function dangerousPatternError(args: {
  capability: string;
  action: string;
  hint?: string;
  details?: Record<string, unknown>;
}): ToolError {
  return {
    code: ToolErrorCode.DANGEROUS_PATTERN,
    message: `Dangerous pattern (${args.action}) for ${args.capability}`,
    details: { capability: args.capability, action: args.action, ...args.details },
    retryable: false,
    user_visible_hint: args.hint ?? '위험한 패턴으로 차단되었습니다.',
  };
}

export function timeoutError(timeoutMs: number): ToolError {
  return {
    code: ToolErrorCode.TIMEOUT,
    message: `Tool execution exceeded ${timeoutMs}ms`,
    details: { timeout_ms: timeoutMs },
    retryable: true,
    user_visible_hint: `시간 초과 (${timeoutMs}ms).`,
  };
}

export function abortedError(reason?: unknown): ToolError {
  const reasonStr = typeof reason === 'string' ? reason : 'cancelled';
  return {
    code: ToolErrorCode.ABORTED,
    message: `Tool execution aborted: ${reasonStr}`,
    details: { reason: reasonStr },
    retryable: false,
    user_visible_hint: '도구 실행이 취소되었습니다.',
  };
}

export function executionError(toolId: string, err: unknown): ToolError {
  const message = err instanceof Error ? err.message : String(err);
  const stack = err instanceof Error ? err.stack : undefined;
  return {
    code: ToolErrorCode.EXECUTION_ERROR,
    message: `${toolId} failed: ${message}`,
    details: stack ? { stack } : {},
    retryable: false,
    user_visible_hint: '도구 실행 중 오류가 발생했습니다.',
  };
}
