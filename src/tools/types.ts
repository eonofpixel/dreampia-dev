/**
 * Tool Orchestration — 핵심 타입 (Tool / ExecutionContext / ToolCall / ToolResult).
 *
 * Spec: docs/tools/interface.md, docs/tools/queue.md, docs/tools/principles.md
 *
 * Phase 1 P0 minimum:
 *  - Zod schemas (NOT JSONSchema/AJV) — TS 친화 + 이미 deps 에 있음
 *  - Sub-resources (ctx.fs / ctx.net / ctx.shell) 미구현 — tool 이 native API 직접 호출
 *  - RetryPolicy / progress reporter 는 placeholder
 *  - log_tail 는 in-memory only (TO-7 에서 DB 영구화)
 *
 * v1.0.11 (SEC-4): SideEffect 가 정식 discriminated union — Tool 이
 * ctx.record_side_effect() 로 file/process/network 부작용을 보고하면
 * Queue 가 ToolResult.side_effects 에 누적. audit/replay 의 데이터 무결성
 * 기반 (SEC-3 의존성).
 *
 * 모든 타입 export 는 type-only (런타임 export 는 Registry/Queue/Context/errors 에서).
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

  /**
   * Side-effect 보고. Tool 이 file/process/network 부작용 발생 직후 호출.
   * Queue 가 ActiveExecution 에 누적 → ToolResult.side_effects 로 흘러간다.
   * v1.0.11 SEC-4 기준 — audit_log 의 target_json 직렬화 source.
   */
  record_side_effect: (effect: SideEffect) => void;

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

// ────────────────────────────────────────────────────────────
// SideEffect — v1.0.11 SEC-4: 정식 discriminated union
//
// Tool 이 ctx.record_side_effect() 로 호출. Queue 가 ActiveExecution
// 에 누적해 ToolResult.side_effects 에 그대로 채움. audit_log 의
// target_json 도 이 구조를 그대로 직렬화 → replay/감사 무결성.
//
// 설계 원칙:
//  - kind discriminator + 작업별 op enum (확장 가능)
//  - 식별자 (path / pid / url) 은 가능한 한 절대 경로 / URL
//  - 보안 민감 payload (파일 내용, body) 는 기록 X — meta 만
// ────────────────────────────────────────────────────────────

export type SideEffectKind = 'file' | 'process' | 'network';

export type FileSideEffectOp = 'read' | 'write' | 'create' | 'delete' | 'rename' | 'chmod';

export interface FileSideEffect {
  kind: 'file';
  op: FileSideEffectOp;
  /** 절대 경로. rename 의 경우 source. */
  path: AbsolutePath;
  /** rename 의 destination. */
  to_path?: AbsolutePath;
  /** read/write 시 바이트 수 (선택). */
  bytes?: number;
}

export type ProcessSideEffectOp = 'spawn' | 'kill' | 'exit';

export interface ProcessSideEffect {
  kind: 'process';
  op: ProcessSideEffectOp;
  /** spawn 시 실행된 명령 (truncate 권장 — 사용자 secret 포함 가능). */
  cmd?: string;
  /** OS pid (선택 — child_process spawn 직후 알 수 있음). */
  pid?: number;
  /** exit op 시 종료 코드. */
  exit_code?: number;
  /** kill / exit 시 signal. */
  signal?: string;
}

export type NetworkSideEffectOp = 'request' | 'connect' | 'disconnect';

export interface NetworkSideEffect {
  kind: 'network';
  op: NetworkSideEffectOp;
  /** HTTP / WebSocket / generic URL. */
  url?: string;
  /** request op 시 HTTP method. */
  method?: string;
  /** request op 응답 status. */
  status?: number;
  /** 호스트 (URL 분해 — 필터링 편의). */
  host?: string;
}

export type SideEffect = FileSideEffect | ProcessSideEffect | NetworkSideEffect;

// ────────────────────────────────────────────────────────────
// PermissionConfirmer — v1.1.0 SEC-2 full (Codex Q6 (3a)+(4b)+(5c)+(6))
//
// Queue 가 `requires_user_confirmation` 또는 dangerous_pattern action=
// 'require_modal' 만나면 본 인터페이스의 confirm() 호출 + Promise await.
// Tools 모듈은 Electron / IPC 직접 의존 X — main 의 IpcPermissionConfirmer
// 가 본 인터페이스를 구현해 renderer 와 brokering.
//
// Codex 권고: "PermissionConfirmer 인터페이스 주입 — Queue 가 permission /
// audit 단일 관문이라 여기서 처리해야 invariant 안 깨짐."
// ────────────────────────────────────────────────────────────

/**
 * 사용자 응답 종류 (Codex (4b) picking):
 *  - 'once'    : 이번 호출만 허용. grant 영속 X.
 *  - 'session' : 이 세션 동안 허용. session.permission.grants 에 in-memory
 *                추가 (DB 영속 X — 세션 종료 시 사라짐).
 *  - 'always'  : 영구 grant. SessionStore.addPermissionGrant 로 DB 영속.
 *  - 'deny'    : 차단. grant 영속 X (필요 시 별도 deny grant 추가).
 */
export type PermissionGrantDuration = 'once' | 'session' | 'always' | 'deny';

export interface PermissionRequest {
  /** 매 요청마다 고유 — main / renderer 가 응답을 매칭하기 위함. */
  request_id: string;
  session_id: SessionId;
  turn_id: TurnId;
  call_id: ToolCallId;
  tool_id: ToolId;
  capability: string;
  target: { kind: PermissionTargetKind; value: string };
  /** Resolver 가 만든 사용자 표시용 힌트. */
  hint?: string;
  /**
   * dangerous_pattern action='require_modal' 인 경우 true. UI 가 inline 카드
   * 대신 center modal 로 escalate (Codex (5c)).
   */
  is_dangerous: boolean;
  /** Tool 의 display.name — UI 가 사용자에게 보여줄 짧은 이름. */
  tool_display_name: string;
  /** 요청 시각 — UI 가 timeout 카운트다운 표시용. */
  requested_at: ISO8601;
}

export interface PermissionResponse {
  request_id: string;
  decision: PermissionGrantDuration;
  /** 사용자가 입력한 사유 (선택). audit_log 에 기록. */
  reason?: string;
}

export interface PermissionConfirmer {
  /**
   * 사용자에게 권한 confirmation 을 요청. Promise resolve 까지 await.
   *
   * timeout (default 60s) 시 'deny' 반환 (fail-closed — Codex (6)).
   * Renderer 미연결 / IPC 실패 시 'deny'.
   * 사용자가 dismiss (X / Esc) 시 'deny' 반환 + grant 영속 X (cancelled
   * 와 구분 — Codex (6)).
   */
  confirm(request: PermissionRequest): Promise<PermissionResponse>;
}

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
  /** v1.0.11 SEC-4: ctx.record_side_effect() 누적 — result.side_effects source. */
  side_effects: SideEffect[];
  /**
   * v1.1.4 hotfix (Codex Q10): IPC 출처 webContentsId. cancelCall/cancelTurn 의
   * requester webContentsId 와 비교해서 다른 webContents 의 cancel 시도 거절.
   * NO_ORIGIN(0) = 테스트/프로그램적 호출 — 모든 cancel 수락 (호환).
   */
  web_contents_id: number;
}

// ────────────────────────────────────────────────────────────
// QueueStats (모니터링)
// ────────────────────────────────────────────────────────────

export interface QueueStats {
  active: number;
  pending: number;
  by_session: Map<SessionId, number>;
}
