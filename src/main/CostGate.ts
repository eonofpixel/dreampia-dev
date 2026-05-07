/**
 * CostGate — pre-flight cost limit enforcement (v1.0.12 COST-2).
 *
 * Spec: docs/v1.x-roadmap.md (COST-2), Codex 외부 검토 (2026-05-04).
 *
 * 정책 (Codex 검토 반영)
 * ─────────────────────
 *  1. 차단 위치: ai/start-stream main IPC boundary — renderer pre-flight 는
 *     UX 용, enforcement 는 main 에서만 신뢰.
 *  2. 한도 단위: MTD UTC default — 매월 1일 00:00 UTC 자동 reset (별도 reset
 *     로직 X, query 가 시작 시각만 필터링).
 *  3. Failure mode: hard limit = 차단. "계속하시겠습니까?" 는 hard 를 soft
 *     로 만든다 (override 가 필요하면 별도 명시 설정).
 *  4. Pre-flight estimate: durable MTD total + reserved pending estimate +
 *     이번 turn 의 보수 estimate (input + output_max) 합산.
 *  5. Unknown 모델 + hard-limit 활성: 즉시 차단 (Codex picking — 4a).
 *  6. Stream 중 한도 도달: 현재 turn 은 complete, 다음 turn 부터 차단.
 *
 * 데이터 흐름:
 *   register reserved → hasCapacity? → start stream (or block) →
 *   stream end → release reserved + UsageStore.recordEvent (실 비용 영속) →
 *   다음 호출 시 MTD durable 합계가 갱신됨
 *
 * AuditLogStore 와 협업: 모든 차단/threshold 도달 결정에 audit event 발행
 * (cost.limit_blocked, cost.unknown_model_blocked, cost.alert_threshold).
 */

import { estimatePreflightCost } from '@/providers/pricing';

import type { UsageStore } from '@/storage';

// ────────────────────────────────────────────────────────────
// Types
// ────────────────────────────────────────────────────────────

export interface CostLimits {
  /** USD. undefined / null 이면 한도 없음 (gate 무력화). */
  cost_limit_usd?: number;
  /**
   * 0~1 사이. cost_limit_usd 의 N% 도달 시 alert toast 발화 (차단 X).
   * 미지정 시 0.8 default.
   */
  alert_threshold?: number;
}

export type CostGateOutcome =
  | {
      kind: 'allow';
      /** 보수 합계 USD (audit 용). */
      projected_total_usd: number;
      /** alert_threshold * limit 도달 여부 (allow 지만 toast 발화 hint). */
      alert: boolean;
    }
  | {
      kind: 'block';
      reason: 'limit_exceeded' | 'unknown_model_under_limit';
      /** 사용자에게 보여줄 i18n key 또는 메시지. */
      hint: string;
      /** 사용자가 한도 / 사용량 직접 보도록. */
      limit_usd?: number;
      mtd_total_usd?: number;
      projected_total_usd?: number;
    };

export interface CostGateInput {
  model: string;
  /** caller 가 알면 더 정확. 미지정 시 0 (= output_max only 보수 estimate). */
  input_estimate_tokens?: number;
  /** provider max_output_tokens. 미지정 시 4096 default. */
  output_max_tokens?: number;
}

/**
 * v1.0.12 (COST-2): cost-gate 결정 audit event. AuditLogStore 가 받아 영속.
 *
 * Codex 외부 검토 결론: "unknown 차단 / MTD reset 둘 다 audit_log 에 남겨야"
 * — 본 sink 가 그 통로.
 */
export interface CostAuditEvent {
  timestamp: string;
  session_id: string;
  /** 'cost.limit_blocked' | 'cost.unknown_model_blocked' | 'cost.alert_threshold' */
  event: string;
  model: string;
  /** USD limit + 합계 직렬화 (target_json). */
  target_json: string;
  outcome: 'blocked' | 'allowed_with_alert';
  hint?: string;
}

// ────────────────────────────────────────────────────────────
// CostGate
// ────────────────────────────────────────────────────────────

/**
 * v1.0.12 (COST-2): 한도 enforcement gate.
 *
 * UsageStore + 사용자 limits 를 받아 pre-flight check 수행. 동시 진행 중인
 * stream 의 reserved estimate 도 in-memory ledger 로 추적.
 *
 * 사용:
 *   const gate = new CostGate(usageStore, getLimits);
 *   const decision = gate.checkBeforeStream({ model, input_estimate_tokens, ... });
 *   if (decision.kind === 'block') return Result.fail(...);
 *   const reservation = gate.reserve(stream_id, decision.projected_increment_usd);
 *   try { await streaming(...) } finally { gate.release(reservation); }
 */
export class CostGate {
  private readonly usage: UsageStore;
  private readonly getLimits: () => CostLimits;
  /**
   * stream_id → reserved USD. 동시 stream 의 보수 추정치 합계.
   * stream 종료 시 release(stream_id) 로 제거. release 누락 방지를 위해
   * caller (IPC handler) 가 try/finally 로 감싸야 한다.
   */
  private readonly reserved = new Map<string, number>();

  constructor(usage: UsageStore, getLimits: () => CostLimits) {
    this.usage = usage;
    this.getLimits = getLimits;
  }

  /**
   * 현재 in-memory reserved 합계 — 디버그 / 모니터링.
   */
  getReservedTotal(): number {
    let sum = 0;
    for (const v of this.reserved.values()) sum += v;
    return sum;
  }

  /**
   * Pre-flight check. 결정 (allow/block) + 보수 estimate 반환.
   *
   * @param now 테스트용 시각 주입. 미지정 시 new Date().
   */
  checkBeforeStream(
    args: CostGateInput,
    now: Date = new Date()
  ): CostGateOutcome & { projected_increment_usd: number } {
    const limits = this.getLimits();
    const limit = limits.cost_limit_usd;
    const threshold =
      typeof limits.alert_threshold === 'number' &&
      Number.isFinite(limits.alert_threshold) &&
      limits.alert_threshold >= 0 &&
      limits.alert_threshold <= 1
        ? limits.alert_threshold
        : 0.8;

    // 이번 turn 의 보수 estimate.
    const priced = estimatePreflightCost({
      model: args.model,
      ...(args.input_estimate_tokens !== undefined && {
        input_estimate_tokens: args.input_estimate_tokens,
      }),
      ...(args.output_max_tokens !== undefined && {
        output_max_tokens: args.output_max_tokens,
      }),
    });
    const increment = priced.usd;

    // Unknown 모델 + hard-limit 활성 → 즉시 차단 (Codex 4a).
    // limit 미설정이면 unknown 도 통과 (한도 자체가 없으니).
    if (!priced.found && limit !== undefined && limit > 0) {
      return {
        kind: 'block',
        reason: 'unknown_model_under_limit',
        hint:
          `Model "${args.model}" 가 가격 정보표에 없어 hard-limit 모드에서는 ` +
          `차단됩니다. v1.0.12 COST-1 정책 (unknown 모델 보수 차단).`,
        limit_usd: limit,
        projected_increment_usd: increment,
      };
    }

    // 한도 미설정 — 항상 통과.
    if (limit === undefined || limit <= 0) {
      return {
        kind: 'allow',
        projected_total_usd: 0,
        projected_increment_usd: increment,
        alert: false,
      };
    }

    // MTD durable + reserved + 이번 increment 합계.
    const mtd = this.usage.getMonthToDateCostUsd(now);
    const projected = mtd + this.getReservedTotal() + increment;

    if (projected >= limit) {
      return {
        kind: 'block',
        reason: 'limit_exceeded',
        hint:
          `이번 달 비용 한도 ($${limit.toFixed(2)}) 도달. ` +
          `현재 $${mtd.toFixed(4)} + 예약 $${this.getReservedTotal().toFixed(4)} ` +
          `+ 예상 $${increment.toFixed(4)} = $${projected.toFixed(4)}. ` +
          `다음 달 1일 00:00 UTC 자동 reset 또는 한도 늘리기.`,
        limit_usd: limit,
        mtd_total_usd: mtd,
        projected_total_usd: projected,
        projected_increment_usd: increment,
      };
    }

    const alert = projected >= limit * threshold;
    return {
      kind: 'allow',
      projected_total_usd: projected,
      projected_increment_usd: increment,
      alert,
    };
  }

  /**
   * Stream 시작 시점에 reserved ledger 에 등록. release() 짝.
   *
   * @returns reservation token (release 시 그대로 전달).
   */
  reserve(streamId: string, projectedIncrementUsd: number): string {
    if (projectedIncrementUsd <= 0) return streamId;
    this.reserved.set(streamId, projectedIncrementUsd);
    return streamId;
  }

  /**
   * Stream 종료 시 reserved 해제. UsageStore.recordEvent 가 실 비용을 별도로
   * 영속하므로 reserved 는 단순 삭제만.
   */
  release(streamId: string): void {
    this.reserved.delete(streamId);
  }

  /**
   * 차단 결정의 사용자-노출 i18n-friendly payload. IPC 응답에 그대로 넣어도
   * 안전 (stack trace 등 secret 없음).
   */
  static toErrorPayload(decision: Extract<CostGateOutcome, { kind: 'block' }>): {
    code: string;
    message: string;
    details: {
      reason: string;
      limit_usd: number | undefined;
      mtd_total_usd: number | undefined;
      projected_total_usd: number | undefined;
    };
  } {
    return {
      code: 'COST_LIMIT_EXCEEDED',
      message: decision.hint,
      details: {
        reason: decision.reason,
        limit_usd: decision.limit_usd,
        mtd_total_usd: decision.mtd_total_usd,
        projected_total_usd: decision.projected_total_usd,
      },
    };
  }
}
