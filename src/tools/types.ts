/**
 * Tool Orchestration — 핵심 타입 (Tool / ExecutionContext / ToolCall / ToolResult).
 *
 * Spec: docs/tools/interface.md, docs/tools/queue.md, docs/tools/principles.md
 *
 * Phase 1 P0 minimum:
 *  - Zod schemas (NOT JSONSchema/AJV) — TS 친화 + 이미 deps 에 있음
 *  - Sub-resources (ctx.fs / ctx.net / ctx.shell) 미구현 — tool 이 native API 직접 호출
 *  - SideEffect / RetryPolicy / progress reporter 는 placeholder
 *  - log_tail 는 in-memory only (TO-7 에서 DB 영구화)
 *
 * 모든 export 는 type-only (런타임 export 는 Registry/Queue/Context/errors 에서).
 */

import type { z } from 'zod';
import type { Session, SessionId, TurnId, ToolCallId, AbsolutePath, ISO8601 } from '@/types';
import type { Capability } from '@/permission';

// ────────────────────────────────────────────────────────────
// ToolId — INV-1: 'category.action' 형식 (반드시 dot 포함)
// ────────────────────────────────────────────────────────────

export type ToolId = string;

// ────────────────────────────────────────────────────────────
// PermissionTarget — Tool 이 input 으로부터 추출하는 권한 target
//
// 'src/permission/Targets.ts' 의 ResolvedTarget 와 동일 형식이지만
// 도구 모듈이 permission 모듈 내부 타입에 직접 의존하지 않도록 별도 정의.
// ────────────────────────────────────────────────────────────

export type PermissionTargetKind = 'path' | 'url' | 'domain' | 'global';

export interface PermissionTarget {
  kind: PermissionTargetKind;
  value: string;
  /**
   * Optional separate string for danger-pattern matching when the permission
   * target must remain a path/url/domain for default-level scoping.
   */
  danger_value?: string;
}

// ────────────────────────────────────────────────────────────
// Tool<TInput, TOutput>
// ────────────────────────────────────────────────────────────

export interface Tool<TInput = unknown, TOutput = unknown> {
  /** 'shell.run', 'fs.read' 등. INV-1: dot 포함 필수. */
  id: ToolId;
  /** semver. */
  version: string;
  /** 출처. 'mcp' / 'plugin' / 'skill' 은 후속 phase. */
  source: 'builtin' | 'mcp' | 'plugin' | 'skill';
  /** MCP 서버명 / plugin 이름 등 (선택). */
  source_id?: string;

  // ── Schema (Zod 런타임 검증) ──
  input_schema: z.ZodSchema<TInput>;
  output_schema: z.ZodSchema<TOutput>;

  // ── Permission (P4: Tool 내 권한 체크 X — Queue 가 보장) ──
  required_capabilities(input: TInput): Capability[];
  /**
   * Optional: input 으로부터 권한 target 추출.
   * 미정의 시 { kind: 'global', value: '' } 사용.
   * 예: shell.run 은 실행 cwd 를 path target 으로 반환해 workspace_write
   * level 이 workspace 외부 실행을 막을 수 있게 한다.
   */
  permission_target?(
    input: TInput,
    capability: Capability,
    ctx: { session: Session }
  ): PermissionTarget;

  // ── Execution ──
  execute(input: TInput, ctx: ExecutionContext): Promise<TOutput>;
  /** Optional: cancellation 시 cleanup 훅. Queue 가 abort 직후 호출. */
  cancel?(ctx: ExecutionContext): Promise<void>;

  // ── Display (P7: UI 정보 분리) ──
  display: {
    name: string;
    icon?: string;
    summary(input: TInput): string;
    summary_result(output: TOutput): string;
  };

  // ── Lifecycle ──
  /** 기본 30_000 ms. */
  timeout_ms?: number;
  /** P6: idempotent 면 retry 가능 (P0 에선 retry 미지원 — 향후 TO-6). */
  idempotent?: boolean;
}

// ────────────────────────────────────────────────────────────
// LogEntry — ctx.log 가 만드는 항목 (P5: 모든 실행 로그)
// ────────────────────────────────────────────────────────────

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface LogEntry {
  level: LogLevel;
  timestamp: ISO8601;
  message: string;
  data?: Record<string, unknown>;
}

// ────────────────────────────────────────────────────────────
// ExecutionContext — Tool 실행 시 받는 환경
//
// P0 minimum:
//  - session_id / turn_id / call_id / signal / cwd / log
//  - parent_call_id (sub-call 추적용 placeholder)
//  - progress 는 optional — 일부 tool 만 사용
//
// OUT of scope (TO-5+):
//  - permissions resolver — Queue 가 사전 체크 (P4)
//  - workspace 객체 — cwd 만 P0
//  - fs / net / shell adapters — tool 이 native API 직접 호출
// ────────────────────────────────────────────────────────────

export interface ExecutionContext {
  session_id: SessionId;
  turn_id: TurnId;
  call_id: ToolCallId;
  signal: AbortSignal;
  cwd: AbsolutePath;

  /** 로깅. 결과의 log_tail 에도 누적됨. */
  log: (level: LogLevel, message: string, data?: Record<string, unknown>) => void;

  /** Optional: 0-100 진행률 보고. P0 에선 사용처 없지만 인터페이스만 노출. */
  progress?: (percent: number, message?: string) => void;

  /** Sub-call 인 경우 부모 call id. */
  parent_call_id?: ToolCallId;
}

// ────────────────────────────────────────────────────────────
// ToolCall (요청)
// ────────────────────────────────────────────────────────────

export type ToolCallOrigin = 'ai' | 'user' | 'automation';
export type ToolCallPriority = 'high' | 'normal' | 'low';

export interface ToolCall {
  id: ToolCallId;
  tool_id: ToolId;
  session_id: SessionId;
  turn_id: TurnId;
  parent_call_id?: ToolCallId;

  /** input_schema 가 검증할 raw 입력. */
  input: unknown;

  timeout_ms?: number;
  priority?: ToolCallPriority;
  origin: ToolCallOrigin;

  created_at: ISO8601;
}

// ────────────────────────────────────────────────────────────
// ToolResult (응답)
// ────────────────────────────────────────────────────────────

export type ToolResultStatus = 'success' | 'failed' | 'cancelled' | 'timeout';

/**
 * ToolError code 값 (확장 가능 string).
 *
 * 표준 코드:
 *  - 'PERMISSION_DENIED' — isAllowed 가 false (deny grant / level / plan mode 등)
 *  - 'DANGEROUS_PATTERN' — danger pattern 매칭 (deny_silent / require_modal)
 *  - 'TIMEOUT'           — abort_controller.abort('timeout') 발화
 *  - 'ABORTED'           — 사용자 취소 등 (cancelled status 와 같이)
 *  - 'INVALID_INPUT'     — input_schema 검증 실패
 *  - 'TOOL_NOT_FOUND'    — registry 에 미등록
 *  - 'EXECUTION_ERROR'   — tool.execute throw
 *  - 'SESSION_NOT_FOUND' — getSession 이 undefined
 */
export interface ToolError {
  code: string;
  message: string;
  details?: Record<string, unknown>;
  retryable: boolean;
  user_visible_hint?: string;
}

/**
 * SideEffect placeholder (TO-12 trace UI 가 사용).
 * P0 에선 빈 배열 — Tool 이 자체 추적 X.
 */
export type SideEffect = never;

export interface ToolResult {
  call_id: ToolCallId;
  tool_id: ToolId;
  status: ToolResultStatus;

  /** success 시 output_schema 통과한 출력. */
  output?: unknown;
  /** failed/cancelled/timeout 시 에러 정보. */
  error?: ToolError;

  started_at: ISO8601;
  completed_at: ISO8601;
  duration_ms: number;
  /** P0: retry 미지원 — 항상 1. */
  attempt_count: number;

  /** P0: 빈 배열 placeholder. */
  side_effects: SideEffect[];
  /** 최근 N 개 로그 (default 50). */
  log_tail: LogEntry[];
}

// ────────────────────────────────────────────────────────────
// ActiveExecution — Queue 내부 추적용 (외부 노출 X 권장)
// ────────────────────────────────────────────────────────────

export interface ActiveExecution {
  call: ToolCall;
  tool: Tool;
  context: ExecutionContext;
  started_at: ISO8601;
  abort_controller: AbortController;
  /** 누적 로그 — 완료 시 result.log_tail 의 source. */
  log: LogEntry[];
}

// ────────────────────────────────────────────────────────────
// QueueStats (모니터링)
// ────────────────────────────────────────────────────────────

export interface QueueStats {
  active: number;
  pending: number;
  by_session: Map<SessionId, number>;
}
