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
import type { Session, SessionId, TurnId, ToolCallId } from '@/types';
import type { ResolvedTarget } from '@/permission/Targets';

import type {
  ActiveExecution,
  LogEntry,
  PermissionTarget,
  QueueStats,
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
// Options
// ────────────────────────────────────────────────────────────

export interface ToolQueueOptions {
  /** 글로벌 동시 실행 한도. default 3. */
  max_concurrent?: number;
  /** 세션 당 동시 실행 한도. default 1 (인과 관계 보존). */
  max_concurrent_per_session?: number;
  /** Tool 자체 timeout 미지정 시 기본값. default 30_000 ms. */
  default_timeout_ms?: number;
  /** ToolResult.log_tail 최대 항목 수. default 50. */
  log_tail_size?: number;
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
  private readonly opts: Required<ToolQueueOptions>;

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
      return buildFailedResult({
        call,
        status: 'failed',
        error: toolNotFoundError(call.tool_id),
      });
    }

    // ── Step 2: Input 검증 (Zod) ──
    const inputParse = tool.input_schema.safeParse(call.input);
    if (!inputParse.success) {
      return buildFailedResult({
        call,
        status: 'failed',
        error: invalidInputError(call.tool_id, inputParse.error.message),
      });
    }
    const validatedInput = inputParse.data;

    // ── Step 3: Session 조회 ──
    const session = this.getSession(call.session_id);
    if (!session) {
      return buildFailedResult({
        call,
        status: 'failed',
        error: sessionNotFoundError(call.session_id),
      });
    }

    // ── Step 4: Permission 체크 (P4) ──
    const permError = this.checkPermissions(tool, validatedInput, session);
    if (permError) {
      return buildFailedResult({ call, status: 'failed', error: permError });
    }

    // ── Step 5: capacity 대기 ──
    const cap = await this.waitForCapacity(call);
    if (!cap.ok) {
      // 대기 중 취소됨 — cancelled 응답
      return buildFailedResult({
        call,
        status: 'cancelled',
        error: abortedError(cap.reason),
      });
    }

    // ── Step 6: 실행 ──
    return this.runTool(call, tool, validatedInput, session);
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

  private checkPermissions(tool: Tool, input: unknown, session: Session): ToolError | null {
    const caps = tool.required_capabilities(input);

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
          return this.decisionToError(cap, decision);
        }
      }

      const decision = isAllowed(cap, resolved, session, session.workspace.root);

      if (decision.allowed) continue;

      // ── warn-action override (Queue-level) ──
      // dangerous_pattern + action='warn' 은 정보 제공만 — 차단 X.
      // log 기록은 ctx.log 에서 — 여기선 그냥 통과시킴.
      if (decision.reason === 'dangerous_pattern' && decision.action === 'warn') {
        // continue — 다음 capability 체크
        continue;
      }

      // ── deny: ToolError 생성 ──
      return this.decisionToError(cap, decision);
    }

    return null;
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

    const ctx = createContext({
      session_id: call.session_id,
      turn_id: call.turn_id,
      call_id: call.id,
      cwd: session.workspace.root,
      signal: abortController.signal,
      logSink,
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
      });
    } catch (err) {
      clearTimeout(timeoutHandle);
      return this.handleExecutionError(call, startedAt, log, err, abortController);
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
    abortController: AbortController
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
        });
      }
      return buildFailedResult({
        call,
        status: 'cancelled',
        error: abortedError(reason),
        started_at: startedAt,
        log: truncatedLog,
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
      });
    }

    // 일반 실행 에러
    return buildFailedResult({
      call,
      status: 'failed',
      error: executionError(call.tool_id, err),
      started_at: startedAt,
      log: truncatedLog,
    });
  }
}

// ────────────────────────────────────────────────────────────
// Re-exports for callers
// ────────────────────────────────────────────────────────────

export { ToolErrorCode };
