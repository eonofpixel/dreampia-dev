/**
 * ExecutionQueue — 모든 Tool 실행의 single queue.
 *
 * Spec: docs/tools/queue.md, docs/tools/principles.md (P2/P4/P5)
 *
 * 책임:
 *  1. Permission 체크 (P4 — Queue 가 항상 isAllowed 호출)
 *  2. Input/Output 검증 (Zod safeParse)
 *  3. 동시 실행 제한 (max_concurrent / max_concurrent_per_session)
 *  4. AbortController 기반 cancellation + timeout
 *  5. 로그 누적 → ToolResult.log_tail
 *
 * 비폴링 capacity 대기:
 *  - 글로벌 슬롯 + 세션별 슬롯 둘 다 만족할 때까지 대기
 *  - 대기 resolver 들을 Set 으로 추적, 슬롯 free 시 일괄 깨움
 *  - 깨어난 후 재검사 (다른 호출이 슬롯 차지 가능)
 *
 * Permission 통합 결정 (warn-action override):
 *  - resolver.ts 의 isAllowed 는 dangerous_pattern 매칭 시 항상 allowed=false 반환.
 *  - DangerCheck 의 'warn' action 은 사양상 "정보 제공만 (차단 X)" — 모순.
 *  - P0 Queue 에선 warn 을 ALLOW 로 override (log warning + 실행 진행).
 *  - deny_silent / require_modal 은 차단 (P0 에서 modal UI 없음 → require_modal 도 deny).
 *  - 이 결정은 Resolver 변경 없이 Queue 단에서 해석 (기존 permission 테스트 유지).
 *
 * Pending priority:
 *  - high(0) → normal(1) → low(2), 그 다음 created_at FIFO.
 */

import { checkDangerousPattern, isAllowed, type GrantDecision } from '@/permission';
import type { Capability } from '@/permission';
import type { PermissionGrant } from '@/types/permission';
import type { Session, SessionId, TurnId, ToolCallId } from '@/types';
import type { ResolvedTarget } from '@/permission/Targets';

import type {
  ActiveExecution,
  LogEntry,
  PermissionConfirmer,
  PermissionGrantDuration,
  PermissionRequest,
  PermissionTarget,
  QueueStats,
  SideEffect,
  Tool,
  ToolCall,
  ToolError,
  ToolResult,
} from './types';
import {
  AbortError,
  ToolErrorCode,
  abortedError,
  buildFailedResult,
  buildSuccessResult,
  dangerousPatternError,
  executionError,
  invalidInputError,
  isAbortError,
  permissionDeniedError,
  sessionNotFoundError,
  timeoutError,
  toolNotFoundError,
} from './errors';
import { createContext } from './Context';
import type { ToolRegistry } from './Registry';

// ────────────────────────────────────────────────────────────
// v1.1.1 hotfix (Codex Q7): high-risk capability set
//
// 사용자가 한 번 'always' 로 승인하면 영원히 noisy / dangerous 작업이 silent
// 해질 capability 들. 이런 권한 요청은:
//  1. confirmer 에 is_dangerous=true 강제 → renderer 가 center modal 사용.
//  2. 'session' / 'always' 응답을 'once' 로 silently 다운그레이드.
//
// Codex 권고:
//   `LOCAL_WRITE.delete`, `LOCAL_OUTSIDE_CWD.write`, `LOCAL_EXECUTE.elevated`,
//   `NETWORK_REMOTE.upload` — 사용자 데이터 손실 / 권한 escalation / 외부
//   업로드 등 회복 불가능한 작업.
// ────────────────────────────────────────────────────────────

const HIGH_RISK_CAPABILITIES: ReadonlySet<string> = new Set<string>([
  'LOCAL_WRITE.delete',
  'LOCAL_OUTSIDE_CWD.write',
  'LOCAL_EXECUTE.elevated',
  'NETWORK_REMOTE.upload',
]);

function isHighRiskCapability(cap: string): boolean {
  return HIGH_RISK_CAPABILITIES.has(cap);
}

// ────────────────────────────────────────────────────────────
// Options
// ────────────────────────────────────────────────────────────

/**
 * v1.0.11 SEC-3: Queue 가 모든 tool_use 결정 (success/failed/cancelled/timeout
 * + permission denial) 시 호출할 audit sink 가 받는 이벤트.
 *
 * Storage layer (AuditLogStore) 와 Tools 모듈을 분리하기 위해 plain shape 만
 * 정의. main process 가 sink callback 안에서 AuditLogStore.recordEvent 로
 * 변환한다. (Tool 모듈은 better-sqlite3 의존 X — renderer 와도 잠재적 공유.)
 */
export interface ToolAuditEvent {
  timestamp: string;
  session_id: string;
  turn_id?: string;
  /** 'tool_use.success' | 'tool_use.failed' | 'tool_use.cancelled' | 'tool_use.timeout' | 'permission.denied' */
  event: string;
  tool_id: string;
  /** 권한 거부 시 해당 capability. tool_use 결정 시 첫 required_capability. */
  capability: string;
  /** SideEffect[] (tool_use) 또는 ResolvedTarget (permission.*) 의 JSON. */
  target_json: string;
  /** 'success' | 'permission_denied' | 'dangerous_pattern' | 'execution_error' | ... */
  decision_reason: string;
  outcome?: string;
  error?: string;
}

export type ToolAuditSink = (event: ToolAuditEvent) => void;

export interface ToolQueueOptions {
  /** 글로벌 동시 실행 한도. default 3. */
  max_concurrent?: number;
  /** 세션 당 동시 실행 한도. default 1 (인과 관계 보존). */
  max_concurrent_per_session?: number;
  /** Tool 자체 timeout 미지정 시 기본값. default 30_000 ms. */
  default_timeout_ms?: number;
  /** ToolResult.log_tail 최대 항목 수. default 50. */
  log_tail_size?: number;
  /**
   * v1.0.11 SEC-3: 모든 tool_use 결정 + permission denial 에서 호출.
   * 미지정 시 audit 미기록 (테스트 / 격리 환경 호환).
   * Sink 는 동기여야 함 — Queue 가 await 하지 않음. 안에서 비동기 작업 시
   * fire-and-forget. throw 시 Queue 는 결과를 그대로 반환 (audit 실패가 tool
   * 실행을 막지 않음).
   */
  audit_sink?: ToolAuditSink;
  /**
   * v1.1.0 SEC-2 full: requires_user_confirmation / require_modal 만나면
   * Queue 가 본 confirmer 의 confirm() 을 await. 미지정 시 v1.0.x 동작
   * (즉시 deny — 호환).
   */
  permission_confirmer?: PermissionConfirmer;
  /**
   * v1.1.0 SEC-2 full: 사용자가 'session' / 'always' 응답 시 grant 추가 콜백.
   * - 'session' grant: caller (보통 main 의 SessionStore wrapper) 가 in-memory
   *   session.permission.grants 에 추가. DB 영속 X.
   * - 'always' grant: caller 가 DB 에 영속 (SessionStore.addPermissionGrant).
   * 미지정 시 grant 영속 X (테스트 / 호환). 'once' / 'deny' 는 호출 X.
   */
  grant_persister?: (
    session_id: SessionId,
    grant: PermissionGrant,
    duration: 'session' | 'always'
  ) => void;
}

// ────────────────────────────────────────────────────────────
// 내부 pending 구조 — abort 가능하도록 deferred resolve 추적
// ────────────────────────────────────────────────────────────

/**
 * 대기 중 (capacity 못 잡음) 인 call 추적용.
 *
 * cancelCall / cancelTurn 이 active 가 아닌 대기 중 call 도 즉시 cancelled
 * 응답 처리할 수 있도록 deferred resolver 보관.
 */
interface PendingEntry {
  call: ToolCall;
  /** capacity 슬롯 사용 가능해지면 이 resolver 가 호출됨. */
  notify: () => void;
  /** cancelled 상태로 즉시 응답시킬 때 호출 — enqueue 의 promise 를 resolve. */
  cancel: (reason: string) => void;
}

// ────────────────────────────────────────────────────────────
// ToolQueue
// ────────────────────────────────────────────────────────────

export class ToolQueue {
  private readonly registry: ToolRegistry;
  private readonly getSession: (id: SessionId) => Session | undefined;
  private readonly opts: Required<
    Omit<ToolQueueOptions, 'audit_sink' | 'permission_confirmer' | 'grant_persister'>
  >;
  private readonly auditSink: ToolAuditSink | undefined;
  private readonly confirmer: PermissionConfirmer | undefined;
  private readonly grantPersister:
    | ((session_id: SessionId, grant: PermissionGrant, duration: 'session' | 'always') => void)
    | undefined;

  /**
   * v1.1.1 hotfix (Codex Q7 blind spot): 'session' grant 는 DB 영속 X — Queue
   * 의 in-memory map 으로만 추적. 앱 재시작 시 자동 사라짐 (의도). 'always'
   * 는 grantPersister 가 DB 저장.
   *
   * checkPermissions 가 Resolver 호출 전 session.permission.grants 와 머지.
   */
  private readonly sessionGrants = new Map<SessionId, PermissionGrant[]>();

  /** 현재 실행 중인 calls. */
  private readonly active = new Map<ToolCallId, ActiveExecution>();
  /** capacity 대기 중인 calls — priority + FIFO 정렬. */
  private readonly pending: PendingEntry[] = [];

  /**
   * Reserved slot 카운터 — capacity 체크와 active 등록 사이의 race 방지용.
   *
   * 문제: 여러 enqueue 호출이 동시 (같은 tick) 에 도착하면 모두 await 전에
   * active.size 가 0 으로 보임 → capacity 무한 통과. 해결: capacity 통과 시점에
   * 즉시 reservedGlobal++ 하고 runTool 의 finally 에서 감소.
   *
   * 세션별 카운터도 동일 이유.
   */
  private reservedGlobal = 0;
  private readonly reservedPerSession = new Map<SessionId, number>();

  constructor(
    registry: ToolRegistry,
    getSession: (id: SessionId) => Session | undefined,
    options: ToolQueueOptions = {}
  ) {
    this.registry = registry;
    this.getSession = getSession;
    this.opts = {
      max_concurrent: options.max_concurrent ?? 3,
      max_concurrent_per_session: options.max_concurrent_per_session ?? 1,
      default_timeout_ms: options.default_timeout_ms ?? 30_000,
      log_tail_size: options.log_tail_size ?? 50,
    };
    this.auditSink = options.audit_sink;
    this.confirmer = options.permission_confirmer;
    this.grantPersister = options.grant_persister;
  }

  /**
   * v1.0.11 SEC-3: audit sink 안전 호출. throw 시 console.error 만 — tool
   * 결과는 그대로. Queue 의 모든 결정 출구가 이 함수를 호출.
   */
  private emitAudit(event: ToolAuditEvent): void {
    if (!this.auditSink) return;
    try {
      this.auditSink(event);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`[ToolQueue] audit sink failed for ${event.event}: ${msg}`);
    }
  }

  /**
   * tool_use.* 결과로부터 audit event 변환.
   *
   * target_json 는 SideEffect[] JSON — replay/감사 시 어떤 부작용이 발생했는지
   * 식별 가능. capability 는 tool 의 첫 required_capability (input 없는 단계
   * 에선 빈 문자열).
   */
  private resultToAuditEvent(call: ToolCall, result: ToolResult): ToolAuditEvent {
    const eventName = `tool_use.${result.status}`;
    const decisionReason =
      result.status === 'success' ? 'success' : (result.error?.code ?? 'unknown');
    const errMsg = result.error
      ? `${result.error.code}: ${result.error.message}`
      : undefined;
    return {
      timestamp: result.completed_at,
      session_id: call.session_id,
      turn_id: call.turn_id,
      event: eventName,
      tool_id: call.tool_id,
      capability: this.firstCapability(call) ?? '',
      target_json: JSON.stringify(result.side_effects ?? []),
      decision_reason: decisionReason,
      outcome: result.status,
      ...(errMsg !== undefined ? { error: errMsg } : {}),
    };
  }

  /** required_capabilities 의 첫 항목 — registry 미등록 / input parse 전이면 undefined. */
  private firstCapability(call: ToolCall): string | undefined {
    const tool = this.registry.get(call.tool_id);
    if (!tool) return undefined;
    try {
      const caps = tool.required_capabilities(call.input);
      return caps[0];
    } catch {
      return undefined;
    }
  }

  // ──────────────────────────────────────────────────────────
  // Public API
  // ──────────────────────────────────────────────────────────

  /**
   * Tool 호출 등록. 항상 ToolResult resolve (failed/cancelled 도 resolve).
   * Throw 하지 않음 — 모든 실패가 ToolResult 로 표현됨.
   */
  async enqueue(call: ToolCall): Promise<ToolResult> {
    // ── Step 1: Tool 조회 ──
    const tool = this.registry.get(call.tool_id);
    if (!tool) {
      const result = buildFailedResult({
        call,
        status: 'failed',
        error: toolNotFoundError(call.tool_id),
      });
      this.emitAudit(this.resultToAuditEvent(call, result));
      return result;
    }

    // ── Step 2: Input 검증 (Zod) ──
    const inputParse = tool.input_schema.safeParse(call.input);
    if (!inputParse.success) {
      const result = buildFailedResult({
        call,
        status: 'failed',
        error: invalidInputError(call.tool_id, inputParse.error.message),
      });
      this.emitAudit(this.resultToAuditEvent(call, result));
      return result;
    }
    const validatedInput = inputParse.data;

    // ── Step 3: Session 조회 ──
    const session = this.getSession(call.session_id);
    if (!session) {
      const result = buildFailedResult({
        call,
        status: 'failed',
        error: sessionNotFoundError(call.session_id),
      });
      this.emitAudit(this.resultToAuditEvent(call, result));
      return result;
    }

    // ── Step 4: Permission 체크 (P4) — v1.1.0 SEC-2 full: async ──
    // requires_user_confirmation / require_modal 시 confirmer.confirm() await.
    const permError = await this.checkPermissions(tool, validatedInput, session, call);
    if (permError) {
      const result = buildFailedResult({ call, status: 'failed', error: permError });
      this.emitAudit(this.resultToAuditEvent(call, result));
      return result;
    }

    // ── Step 5: capacity 대기 ──
    const cap = await this.waitForCapacity(call);
    if (!cap.ok) {
      // 대기 중 취소됨 — cancelled 응답
      const result = buildFailedResult({
        call,
        status: 'cancelled',
        error: abortedError(cap.reason),
      });
      this.emitAudit(this.resultToAuditEvent(call, result));
      return result;
    }

    // ── Step 6: 실행 ──
    const result = await this.runTool(call, tool, validatedInput, session);
    this.emitAudit(this.resultToAuditEvent(call, result));
    return result;
  }

  /**
   * 특정 call 취소. active 면 abort, pending 이면 cancelled 로 즉시 응답.
   * @returns 실제로 취소되었는지 여부.
   */
  cancelCall(callId: ToolCallId, reason: string = 'user_cancelled'): boolean {
    // active 인 경우
    const active = this.active.get(callId);
    if (active) {
      active.abort_controller.abort(reason);
      // tool.cancel cleanup hook (옵셔널) — fire-and-forget, 에러는 로그
      if (active.tool.cancel) {
        active.tool.cancel(active.context).catch((err: unknown) => {
          active.log.push({
            level: 'error',
            timestamp: new Date().toISOString(),
            message: `tool.cancel() failed: ${err instanceof Error ? err.message : String(err)}`,
          });
        });
      }
      return true;
    }

    // pending 인 경우 — entry.cancel 으로 enqueue 의 promise 즉시 resolve
    const pending = this.pending.find((p) => p.call.id === callId);
    if (pending) {
      pending.cancel(reason);
      return true;
    }

    return false;
  }

  /**
   * 같은 turn 의 모든 active + pending 취소.
   * @returns 취소된 call 개수.
   */
  cancelTurn(turnId: TurnId, reason: string = 'turn_cancelled'): number {
    let count = 0;

    // active: abort + cleanup hook
    for (const exec of this.active.values()) {
      if (exec.call.turn_id === turnId) {
        exec.abort_controller.abort(reason);
        if (exec.tool.cancel) {
          exec.tool.cancel(exec.context).catch((err: unknown) => {
            exec.log.push({
              level: 'error',
              timestamp: new Date().toISOString(),
              message: `tool.cancel() failed: ${err instanceof Error ? err.message : String(err)}`,
            });
          });
        }
        count += 1;
      }
    }

    // pending: cancel callback 으로 enqueue promise 즉시 resolve
    const toCancel = this.pending.filter((p) => p.call.turn_id === turnId);
    for (const entry of toCancel) {
      entry.cancel(reason);
      count += 1;
    }

    return count;
  }

  /** 현재 실행 중인 active 목록 (read-only). */
  getActive(): ReadonlyArray<{
    call: ToolCall;
    tool: Tool;
    started_at: string;
  }> {
    return Array.from(this.active.values()).map((a) => ({
      call: a.call,
      tool: a.tool,
      started_at: a.started_at,
    }));
  }

  /** Queue 통계. */
  getStats(): QueueStats {
    const bySession = new Map<SessionId, number>();
    for (const a of this.active.values()) {
      const sid = a.call.session_id;
      bySession.set(sid, (bySession.get(sid) ?? 0) + 1);
    }
    return {
      active: this.active.size,
      pending: this.pending.length,
      by_session: bySession,
    };
  }

  // ──────────────────────────────────────────────────────────
  // 내부 — Permission
  // ──────────────────────────────────────────────────────────

  /**
   * v1.1.0 SEC-2 full: async — `requires_user_confirmation` / 'require_modal'
   * 만나면 confirmer.confirm() await. 사용자 응답에 따라:
   *  - 'once': 이번 호출만 통과 (grant 영속 X).
   *  - 'session' / 'always': grant 영속 (persister 호출) 후 통과.
   *  - 'deny': 즉시 차단.
   *  - timeout: confirmer 가 'deny' 반환 (fail-closed).
   */
  private async checkPermissions(
    tool: Tool,
    input: unknown,
    session: Session,
    call: ToolCall
  ): Promise<ToolError | null> {
    const caps = tool.required_capabilities(input);

    // v1.1.1 hotfix: in-memory session grants 와 머지된 session 객체.
    // Resolver 의 findActiveGrants 가 본 augmented session 의 grants 를 본다.
    const augmentedSession = this.augmentSessionWithRuntimeGrants(session);

    for (const cap of caps) {
      const target = this.resolveTarget(tool, input, cap, session);
      const resolved: ResolvedTarget = {
        kind: target.kind,
        value: target.value,
      };

      const dangerTarget = target.danger_value;
      if (dangerTarget !== undefined) {
        const danger = checkDangerousPattern(cap, dangerTarget);
        if (danger !== null) {
          const decision: GrantDecision = {
            allowed: false,
            reason: 'dangerous_pattern',
            action: danger.action,
            hint: danger.rule.message,
          };
          if (danger.action === 'warn') continue;
          // v1.1.0: 'require_modal' 은 confirmer 호출. 'deny_silent' 는 즉시 차단.
          if (danger.action === 'require_modal' && this.confirmer !== undefined) {
            const userOk = await this.askConfirmation(
              tool,
              call,
              cap,
              resolved,
              session,
              decision.hint,
              true // is_dangerous
            );
            if (userOk) continue;
            return this.decisionToError(cap, decision);
          }
          // require_modal 인데 confirmer 가 없으면 v1.0.x 호환 deny.
          this.emitPermissionDeniedAudit(call, cap, resolved, decision);
          return this.decisionToError(cap, decision);
        }
      }

      // v1.1.1 hotfix (Codex Q7): high-risk capability 는 parent capability
      // 매칭 (예: LOCAL_WRITE 가 LOCAL_WRITE.delete 자동 허용) 으로 우회되면
      // 안 됨. Resolver 호출 전에 confirmer 강제 — 항상 dangerous modal.
      if (isHighRiskCapability(cap) && this.confirmer !== undefined) {
        const userOk = await this.askConfirmation(
          tool,
          call,
          cap,
          resolved,
          session,
          undefined, // hint
          true // is_dangerous (high-risk → 강제 escalation)
        );
        if (userOk) continue;
        const denyDecision: GrantDecision = {
          allowed: false,
          reason: 'requires_user_confirmation',
          hint: `high-risk capability ${cap} requires explicit user approval`,
        };
        return this.decisionToError(cap, denyDecision);
      }

      const decision = isAllowed(
        cap,
        resolved,
        augmentedSession,
        augmentedSession.workspace.root
      );

      if (decision.allowed) continue;

      // ── warn-action override (Queue-level) ──
      if (decision.reason === 'dangerous_pattern' && decision.action === 'warn') {
        continue;
      }

      // ── v1.1.0 SEC-2 full: requires_user_confirmation → confirmer ──
      if (
        decision.reason === 'requires_user_confirmation' &&
        this.confirmer !== undefined
      ) {
        const userOk = await this.askConfirmation(
          tool,
          call,
          cap,
          resolved,
          session,
          decision.hint,
          false // is_dangerous
        );
        if (userOk) continue;
        return this.decisionToError(cap, decision);
      }

      // ── deny: ToolError 생성 ──
      this.emitPermissionDeniedAudit(call, cap, resolved, decision);
      return this.decisionToError(cap, decision);
    }

    return null;
  }

  /**
   * v1.1.0 SEC-2 full: 사용자에게 confirmation 요청 + grant 영속 분기.
   *
   * @returns true 면 caller 가 다음 capability 진행. false 면 deny (caller 가
   *          decisionToError 로 차단).
   */
  private async askConfirmation(
    tool: Tool,
    call: ToolCall,
    capability: Capability,
    resolved: ResolvedTarget,
    _session: Session,
    hint: string | undefined,
    isDangerous: boolean
  ): Promise<boolean> {
    if (this.confirmer === undefined) return false;
    // v1.1.1 hotfix: high-risk capability 는 강제 dangerous → center modal.
    const highRisk = isHighRiskCapability(capability);
    const effectiveDangerous = isDangerous || highRisk;
    const requestedAt = new Date().toISOString();
    const request: PermissionRequest = {
      request_id: `pcr-${call.id}-${capability}-${Date.now()}`,
      session_id: call.session_id,
      turn_id: call.turn_id,
      call_id: call.id,
      tool_id: call.tool_id,
      capability,
      target: { kind: resolved.kind, value: resolved.value },
      ...(hint !== undefined && { hint }),
      is_dangerous: effectiveDangerous,
      tool_display_name: tool.display.name,
      requested_at: requestedAt,
    };

    let response;
    try {
      response = await this.confirmer.confirm(request);
    } catch (err) {
      // confirmer throw 는 fail-closed (deny).
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`[ToolQueue] confirmer.confirm threw: ${msg}`);
      this.emitPermissionDecisionAudit(
        call,
        capability,
        resolved,
        'permission.confirm_error',
        'denied',
        msg
      );
      return false;
    }

    // v1.1.1 hotfix: high-risk → 'session'/'always' 응답을 'once' 로 silently
    // downgrade. UI 가 dangerous modal 만 노출했을 때도 사용자가 IPC 직접 호출
    // 등으로 우회 시도하면 본 server-side downgrade 가 차단.
    let effectiveDecision = response.decision;
    if (
      highRisk &&
      (response.decision === 'session' || response.decision === 'always')
    ) {
      effectiveDecision = 'once';
      this.emitPermissionDecisionAudit(
        call,
        capability,
        resolved,
        'permission.high_risk_downgrade',
        'allowed',
        `decision ${response.decision} downgraded to once (high-risk capability)`
      );
    }

    // Audit 기록 — 사용자 응답 종류 + reason.
    const auditEvent = this.responseToAuditEvent(effectiveDecision);
    this.emitPermissionDecisionAudit(
      call,
      capability,
      resolved,
      auditEvent,
      effectiveDecision === 'deny' ? 'denied' : 'allowed',
      response.reason
    );

    if (effectiveDecision === 'deny') return false;

    // 'session' / 'always' → grant 영속 분기.
    if (effectiveDecision === 'session' || effectiveDecision === 'always') {
      const grantTarget = resolvedToGrantTarget(resolved);
      if (grantTarget !== null) {
        const grant: PermissionGrant = {
          id: response.request_id,
          session_id: call.session_id,
          capability,
          target: grantTarget,
          granted_at: new Date().toISOString(),
          granted_by: 'user',
          scope: effectiveDecision === 'always' ? 'persistent' : 'session',
          ...(response.reason !== undefined &&
            response.reason.length > 0 && { reason: response.reason }),
        };

        if (effectiveDecision === 'session') {
          // v1.1.1 hotfix: 'session' grant 는 in-memory only — DB 영속 X.
          // Queue 의 sessionGrants 가 다음 호출에 augmenting. 앱 재시작 =
          // 사라짐 (의도). grantPersister 호출 X.
          this.appendSessionGrant(call.session_id, grant);
        } else if (this.grantPersister !== undefined) {
          // 'always' → DB 영속.
          try {
            this.grantPersister(call.session_id, grant, 'always');
          } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            console.error(`[ToolQueue] grantPersister failed: ${msg}`);
            // grant 영속 실패 시에도 'once' 처럼 동작.
          }
        }
      }
    }
    return true;
  }

  /**
   * v1.1.1 hotfix: in-memory session grant 추가. checkPermissions 의 Resolver
   * 호출 전 session.permission.grants 와 머지된다.
   */
  private appendSessionGrant(sessionId: SessionId, grant: PermissionGrant): void {
    const list = this.sessionGrants.get(sessionId) ?? [];
    list.push(grant);
    this.sessionGrants.set(sessionId, list);
  }

  /**
   * v1.1.1 hotfix: Resolver 호출 전 augmented session 빌드. session 자체는
   * SessionStore.getSession 결과 (DB-backed) — mutation 하지 X. shallow copy
   * + permission.grants 만 머지.
   */
  private augmentSessionWithRuntimeGrants(session: Session): Session {
    const runtime = this.sessionGrants.get(session.id) ?? [];
    if (runtime.length === 0) return session;
    return {
      ...session,
      permission: {
        ...session.permission,
        grants: [...session.permission.grants, ...runtime],
      },
    };
  }

  /** Test / shutdown helper — in-memory session grant 모두 제거. */
  clearSessionGrants(): void {
    this.sessionGrants.clear();
  }

  /**
   * Test inspection — 특정 세션의 in-memory grant 목록 (read-only).
   */
  getSessionGrants(sessionId: SessionId): ReadonlyArray<PermissionGrant> {
    return this.sessionGrants.get(sessionId) ?? [];
  }

  /**
   * PermissionGrantDuration → audit event 이름.
   */
  private responseToAuditEvent(d: PermissionGrantDuration): string {
    switch (d) {
      case 'once':
        return 'permission.granted_once';
      case 'session':
        return 'permission.granted_session';
      case 'always':
        return 'permission.granted_always';
      case 'deny':
        return 'permission.denied_by_user';
    }
  }

  /**
   * v1.1.0: confirmer 응답 audit. emitPermissionDeniedAudit 와 다른 점은
   * 사용자 응답 (allow/deny) 도 포함.
   */
  private emitPermissionDecisionAudit(
    call: ToolCall,
    capability: Capability,
    target: ResolvedTarget,
    eventName: string,
    outcome: 'allowed' | 'denied',
    reason?: string
  ): void {
    this.emitAudit({
      timestamp: new Date().toISOString(),
      session_id: call.session_id,
      turn_id: call.turn_id,
      event: eventName,
      tool_id: call.tool_id,
      capability,
      target_json: JSON.stringify({ kind: target.kind, value: target.value }),
      decision_reason: outcome === 'allowed' ? 'user_confirmed' : 'user_denied',
      outcome,
      ...(reason !== undefined && reason.length > 0 ? { error: reason } : {}),
    });
  }

  /**
   * v1.0.11 SEC-3: permission denial 단독 audit. tool_use.failed 와 함께
   * 발행되지만 sourceevent 가 다르므로 분리 — 권한 검토 시 "어떤 capability
   * 가 가장 자주 거부되는가" 분석 가능.
   */
  private emitPermissionDeniedAudit(
    call: ToolCall,
    capability: Capability,
    target: ResolvedTarget,
    decision: GrantDecision
  ): void {
    this.emitAudit({
      timestamp: new Date().toISOString(),
      session_id: call.session_id,
      turn_id: call.turn_id,
      event: 'permission.denied',
      tool_id: call.tool_id,
      capability,
      target_json: JSON.stringify({ kind: target.kind, value: target.value }),
      decision_reason: decision.reason,
      outcome: 'denied',
      ...(decision.hint !== undefined ? { error: decision.hint } : {}),
    });
  }

  private decisionToError(capability: Capability, decision: GrantDecision): ToolError {
    const hint = decision.hint;

    switch (decision.reason) {
      case 'dangerous_pattern':
        return dangerousPatternError({
          capability,
          action: decision.action ?? 'deny_silent',
          ...(hint !== undefined && { hint }),
          details: { reason: decision.reason },
        });

      case 'explicitly_denied':
        return permissionDeniedError({
          capability,
          reason: decision.reason,
          ...(hint !== undefined && { hint }),
          details: decision.deny_grant ? { deny_grant_id: decision.deny_grant.id } : {},
        });

      case 'plan_mode_active':
      case 'level_does_not_allow':
      case 'requires_user_confirmation':
      default:
        return permissionDeniedError({
          capability,
          reason: decision.reason,
          ...(hint !== undefined && { hint }),
        });
    }
  }

  private resolveTarget(
    tool: Tool,
    input: unknown,
    cap: Capability,
    session: Session
  ): PermissionTarget {
    if (tool.permission_target) {
      return tool.permission_target(input, cap, { session });
    }
    return { kind: 'global', value: '' };
  }

  // ──────────────────────────────────────────────────────────
  // 내부 — capacity 관리
  // ──────────────────────────────────────────────────────────

  private hasCapacity(sessionId: SessionId): boolean {
    if (this.reservedGlobal >= this.opts.max_concurrent) return false;
    const sessionReserved = this.reservedPerSession.get(sessionId) ?? 0;
    return sessionReserved < this.opts.max_concurrent_per_session;
  }

  /**
   * Capacity 슬롯 점유 — 동기적으로 카운터 증가.
   * waitForCapacity 의 마지막에 호출되어야 race 가 사라짐.
   */
  private reserveSlot(sessionId: SessionId): void {
    this.reservedGlobal += 1;
    const cur = this.reservedPerSession.get(sessionId) ?? 0;
    this.reservedPerSession.set(sessionId, cur + 1);
  }

  /** Capacity 슬롯 반납 — runTool 의 finally 에서 호출. */
  private releaseSlot(sessionId: SessionId): void {
    this.reservedGlobal = Math.max(0, this.reservedGlobal - 1);
    const cur = this.reservedPerSession.get(sessionId) ?? 0;
    if (cur <= 1) {
      this.reservedPerSession.delete(sessionId);
    } else {
      this.reservedPerSession.set(sessionId, cur - 1);
    }
  }

  /**
   * 비폴링 대기 + 슬롯 atomic 점유.
   *
   * 같은 tick 에 여러 호출이 도착해도 hasCapacity 가 reserved 카운터를 보므로
   * 첫 호출만 통과하고 나머지는 pending 등록.
   *
   * @returns 'reserved' (정상 capacity 점유), 'cancelled' (대기 중 취소된 경우),
   *          또는 'cancelled' 시 reason 문자열.
   */
  private async waitForCapacity(
    call: ToolCall
  ): Promise<{ ok: true } | { ok: false; reason: string }> {
    if (this.hasCapacity(call.session_id)) {
      this.reserveSlot(call.session_id);
      return { ok: true };
    }

    // capacity 없음 → pending 등록 후 대기
    return new Promise<{ ok: true } | { ok: false; reason: string }>((resolve) => {
      const entry: PendingEntry = {
        call,
        notify: () => {
          // capacity 잡혔는지 다시 체크 — 다른 waiter 와 race 가능
          if (this.hasCapacity(call.session_id)) {
            // pending 에서 제거
            const idx = this.pending.indexOf(entry);
            if (idx >= 0) this.pending.splice(idx, 1);
            this.reserveSlot(call.session_id);
            resolve({ ok: true });
          }
          // 못 잡았으면 그냥 다시 대기 — notifySlotFree 가 다시 호출될 것
        },
        cancel: (reason: string) => {
          const idx = this.pending.indexOf(entry);
          if (idx >= 0) this.pending.splice(idx, 1);
          resolve({ ok: false, reason });
        },
      };
      this.pending.push(entry);
      this.sortPending();
    });
  }

  /**
   * Pending 우선순위 정렬: high(0) → normal(1) → low(2), 같은 priority 면 created_at FIFO.
   */
  private sortPending(): void {
    const prioOrder: Record<string, number> = { high: 0, normal: 1, low: 2 };
    this.pending.sort((a, b) => {
      const pa = prioOrder[a.call.priority ?? 'normal'] ?? 1;
      const pb = prioOrder[b.call.priority ?? 'normal'] ?? 1;
      if (pa !== pb) return pa - pb;
      return a.call.created_at.localeCompare(b.call.created_at);
    });
  }

  /**
   * 모든 pending 에 슬롯 free 알림 — 우선순위 순서로 깨움.
   * notify 가 capacity 못 잡으면 entry 는 pending 에 그대로 남음.
   */
  private notifySlotFree(): void {
    // 정렬된 pending 의 처음부터 notify
    const snapshot = [...this.pending];
    for (const entry of snapshot) {
      // 매번 hasCapacity 체크 — 첫 entry 가 잡으면 다음은 못 잡음
      if (!this.hasCapacity(entry.call.session_id)) continue;
      entry.notify();
    }
  }

  // ──────────────────────────────────────────────────────────
  // 내부 — 실제 실행
  // ──────────────────────────────────────────────────────────

  private async runTool(
    call: ToolCall,
    tool: Tool,
    validatedInput: unknown,
    session: Session
  ): Promise<ToolResult> {
    const startedAt = new Date().toISOString();
    const abortController = new AbortController();
    const log: LogEntry[] = [];
    const logSink = (entry: LogEntry): void => {
      log.push(entry);
      // Tail size 제한 — 오래된 항목 drop
      if (log.length > this.opts.log_tail_size * 4) {
        log.splice(0, log.length - this.opts.log_tail_size * 2);
      }
    };

    // v1.0.11 SEC-4: ctx.record_side_effect() 누적 buffer.
    // ActiveExecution 와 ToolResult 둘 다 동일 array reference.
    const sideEffects: SideEffect[] = [];
    const sideEffectSink = (effect: SideEffect): void => {
      sideEffects.push(effect);
    };

    const ctx = createContext({
      session_id: call.session_id,
      turn_id: call.turn_id,
      call_id: call.id,
      cwd: session.workspace.root,
      signal: abortController.signal,
      logSink,
      sideEffectSink,
      ...(call.parent_call_id !== undefined && { parent_call_id: call.parent_call_id }),
    });

    // ActiveExecution 등록
    const exec: ActiveExecution = {
      call,
      tool,
      context: ctx,
      started_at: startedAt,
      abort_controller: abortController,
      log,
      side_effects: sideEffects,
    };
    this.active.set(call.id, exec);

    // Timeout 설정
    const timeoutMs = call.timeout_ms ?? tool.timeout_ms ?? this.opts.default_timeout_ms;
    const timeoutHandle = setTimeout(() => {
      abortController.abort('timeout');
    }, timeoutMs);

    try {
      // 실제 execute — 에러 시 catch 로
      const output = await tool.execute(validatedInput, ctx);

      clearTimeout(timeoutHandle);

      // Output 검증 (lenient — 실패 시 warning log 만)
      const outParse = tool.output_schema.safeParse(output);
      if (!outParse.success) {
        log.push({
          level: 'warn',
          timestamp: new Date().toISOString(),
          message: `Output schema validation failed for ${tool.id} (returning anyway)`,
          data: { issue: outParse.error.message },
        });
      }

      return buildSuccessResult({
        call,
        output,
        started_at: startedAt,
        log: log.slice(-this.opts.log_tail_size),
        side_effects: sideEffects.slice(),
      });
    } catch (err) {
      clearTimeout(timeoutHandle);
      return this.handleExecutionError(
        call,
        startedAt,
        log,
        err,
        abortController,
        sideEffects.slice()
      );
    } finally {
      this.active.delete(call.id);
      // 슬롯 반납 + 다음 waiter 깨우기 (순서 중요: release 먼저)
      this.releaseSlot(call.session_id);
      this.notifySlotFree();
    }
  }

  private handleExecutionError(
    call: ToolCall,
    startedAt: string,
    log: LogEntry[],
    err: unknown,
    abortController: AbortController,
    sideEffects: SideEffect[]
  ): ToolResult {
    const truncatedLog = log.slice(-this.opts.log_tail_size);
    const aborted = abortController.signal.aborted;
    const reason = aborted ? abortController.signal.reason : undefined;

    if (aborted) {
      // timeout vs user cancel 구분
      if (reason === 'timeout') {
        return buildFailedResult({
          call,
          status: 'timeout',
          error: timeoutError(
            call.timeout_ms ??
              this.active.get(call.id)?.tool.timeout_ms ??
              this.opts.default_timeout_ms
          ),
          started_at: startedAt,
          log: truncatedLog,
          side_effects: sideEffects,
        });
      }
      return buildFailedResult({
        call,
        status: 'cancelled',
        error: abortedError(reason),
        started_at: startedAt,
        log: truncatedLog,
        side_effects: sideEffects,
      });
    }

    // Tool 안에서 AbortError throw 했지만 signal 이 아직 abort 안된 케이스
    if (err instanceof AbortError || isAbortError(err)) {
      return buildFailedResult({
        call,
        status: 'cancelled',
        error: abortedError(err instanceof AbortError ? err.reason : 'aborted'),
        started_at: startedAt,
        log: truncatedLog,
        side_effects: sideEffects,
      });
    }

    // 일반 실행 에러
    return buildFailedResult({
      call,
      status: 'failed',
      error: executionError(call.tool_id, err),
      started_at: startedAt,
      log: truncatedLog,
      side_effects: sideEffects,
    });
  }
}

// ────────────────────────────────────────────────────────────
// Helpers
// ────────────────────────────────────────────────────────────

/**
 * v1.1.0 SEC-2 full: ResolvedTarget → GrantTarget 변환. permission grant 의
 * target shape 이 ResolvedTarget 과 다름 (path vs value). 변환 불가능한
 * 케이스 (e.g. file system path 가 아닌 raw value) 는 null 반환 → caller
 * 가 grant 영속 skip + 'once' 처럼 동작.
 */
function resolvedToGrantTarget(
  resolved: ResolvedTarget
): import('@/types/permission').GrantTarget | null {
  switch (resolved.kind) {
    case 'path':
      return { kind: 'path', path: resolved.value };
    case 'url':
      return { kind: 'url', url: resolved.value };
    case 'domain':
      return { kind: 'domain', domain: resolved.value };
    case 'global':
      return { kind: 'global' };
    default:
      return null;
  }
}

// ────────────────────────────────────────────────────────────
// Re-exports for callers
// ────────────────────────────────────────────────────────────

export { ToolErrorCode };
