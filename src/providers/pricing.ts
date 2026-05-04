/**
 * pricing.ts — model → USD cost-per-million-tokens map + estimator.
 *
 * Spec: ROADMAP.md (v0.4.0 Usage/Cost Tracking MVP), docs/v1.x-roadmap.md (COST-1)
 *
 * 정책
 * ────────
 *  - 가격은 best-effort. 미등록 모델은 priceUsage().found=false + usd=0 반환.
 *    이전 (v1.0.11 까지) 엔 estimateCostUsd 가 0 만 반환하고 unknown signal 이
 *    없어 "싸서 0" vs "몰라서 0" 구분이 불가능했음 (COST-1).
 *  - 정확한 매칭이 우선이고, 그 다음 prefix 매칭으로 새 release 도 잡는다
 *    (예: 'claude-3-5-sonnet-20251101' 도 'claude-3-5-sonnet' prefix 로 매칭).
 *  - cache_creation 은 입력 토큰보다 25% 비싼 경향 (Claude prompt cache write
 *    1.25x), cache_read 는 90% 저렴 (0.10x) — 둘 다 모델별 override 가능.
 *  - 가격은 MODEL_PRICING_LAST_UPDATED 기준. 변경 시 이 파일 + 테스트만 갱신.
 *  - 공식 가격 JSON endpoint (Anthropic / OpenAI 둘 다) 가 없어 manual 갱신.
 *    OpenAI Costs API / Anthropic Admin Usage 는 사후 reconcile 용 (별도 슬롯).
 *
 * Renderer 에서도 import 가능 — Node-only 의존성 X.
 */

export interface ModelPricing {
  /** USD per 1M input tokens (non-cached). */
  input_per_mtok: number;
  /** USD per 1M output tokens. */
  output_per_mtok: number;
  /** USD per 1M cache-creation input tokens. Default: input_per_mtok * 1.25. */
  cache_write_per_mtok?: number;
  /** USD per 1M cache-read input tokens. Default: input_per_mtok * 0.10. */
  cache_read_per_mtok?: number;
}

export interface UsageInputs {
  input_tokens: number;
  output_tokens: number;
  cache_creation_input_tokens?: number;
  cache_read_input_tokens?: number;
}

/**
 * 가격 정보 마지막 갱신 일자 (ISO 8601 date — UTC).
 *
 * v1.0.12 (COST-1): UI 가 stale 경고 분기에 사용. 30일 이상이면 회색 hint,
 * 90일 이상이면 노란색 경고. release 시 이 상수 + MODEL_PRICING 동시 갱신.
 *
 * 공식 가격 JSON endpoint 가 없어 manual 갱신이 정직 — Codex 외부 검토 결론.
 */
export const MODEL_PRICING_LAST_UPDATED = '2026-05-04';

/**
 * 2026-05 기준 reference rates (USD / 1M tokens).
 *
 * Claude: anthropic.com/pricing.
 * Codex / OpenAI: openai.com/api/pricing (gpt-5.5 는 published rate 도래 전이라
 * 보수적 placeholder — 실측 시 수정).
 *
 * 키는 정확한 model id. prefix 매칭 fallback 은 lookupPricing 에서.
 */
export const MODEL_PRICING: Readonly<Record<string, ModelPricing>> = {
  // ─── Claude ─────────────────────────────────────────────────
  'claude-3-5-sonnet-20241022': {
    input_per_mtok: 3,
    output_per_mtok: 15,
    cache_write_per_mtok: 3.75,
    cache_read_per_mtok: 0.3,
  },
  'claude-3-5-sonnet': {
    input_per_mtok: 3,
    output_per_mtok: 15,
    cache_write_per_mtok: 3.75,
    cache_read_per_mtok: 0.3,
  },
  'claude-3-5-haiku': { input_per_mtok: 0.8, output_per_mtok: 4 },
  'claude-haiku-4-5-20251001': { input_per_mtok: 1, output_per_mtok: 5 },
  'claude-haiku-4-5': { input_per_mtok: 1, output_per_mtok: 5 },
  'claude-3-opus': { input_per_mtok: 15, output_per_mtok: 75 },
  'claude-3-haiku': { input_per_mtok: 0.25, output_per_mtok: 1.25 },
  'claude-2': { input_per_mtok: 8, output_per_mtok: 24 },

  // ─── Codex / OpenAI ────────────────────────────────────────
  'gpt-5.5': { input_per_mtok: 5, output_per_mtok: 20 },
  'gpt-4o': { input_per_mtok: 2.5, output_per_mtok: 10 },
  'gpt-4o-mini': { input_per_mtok: 0.15, output_per_mtok: 0.6 },
  o1: { input_per_mtok: 15, output_per_mtok: 60 },
  'o1-mini': { input_per_mtok: 3, output_per_mtok: 12 },
  'o3-mini': { input_per_mtok: 1.1, output_per_mtok: 4.4 },
  o3: { input_per_mtok: 5, output_per_mtok: 20 },
};

/**
 * 가격표에서 모델을 찾는다.
 *
 * 1) 정확 일치 → 즉시 반환.
 * 2) prefix 매칭: 등록된 키 중 model 의 prefix 가 되는 가장 긴 key 를 선택
 *    (e.g. 'claude-3-5-sonnet-20251101' → 'claude-3-5-sonnet').
 * 3) 못 찾으면 null.
 */
export function lookupPricing(model: string): ModelPricing | null {
  const exact = MODEL_PRICING[model];
  if (exact !== undefined) return exact;

  let bestKey: string | null = null;
  for (const key of Object.keys(MODEL_PRICING)) {
    // prefix 매칭은 model 이 key 로 시작 + key 가 model 보다 짧을 때만 의미.
    // (반대 방향은 의미 없음 — 정확 매칭은 위에서 처리됨)
    if (model.startsWith(key) && (bestKey === null || key.length > bestKey.length)) {
      bestKey = key;
    }
  }
  if (bestKey === null) return null;
  // bestKey 는 위에서 keys() 순회 중 발견된 값이라 항상 lookup 가능.
  return MODEL_PRICING[bestKey] ?? null;
}

/**
 * Token usage → estimated USD cost.
 *
 * 가격이 없는 모델 → 0 반환 (token 만 기록되도록).
 * 결과는 6자리 소수까지 round (USD 0.000001 cents 의미 없으나 누적 합계 시
 * floating point drift 줄이기).
 *
 * v1.0.12 부터 unknown 분리 필요 시 priceUsage() 권장 — 본 함수는 호환 유지용.
 */
export function estimateCostUsd(model: string, usage: UsageInputs): number {
  return priceUsage(model, usage).usd;
}

/**
 * v1.0.12 (COST-1): unknown 분리 가능한 정식 가격 계산.
 *
 * 반환:
 *  - found: 모델이 MODEL_PRICING (또는 prefix) 에 매칭됐는지 여부.
 *  - usd: 6자리 round USD 비용. found=false 면 0.
 *
 * COST-2 의 hard limit gate 가 found=false 인 경우 unknown 정책 (기본 차단)
 * 적용. UsageStore.recordEvent 도 unknown 플래그 동시 영속.
 */
export function priceUsage(
  model: string,
  usage: UsageInputs
): { usd: number; found: boolean } {
  const pricing = lookupPricing(model);
  if (pricing === null) {
    return { usd: 0, found: false };
  }

  const cacheWritePer = pricing.cache_write_per_mtok ?? pricing.input_per_mtok * 1.25;
  const cacheReadPer = pricing.cache_read_per_mtok ?? pricing.input_per_mtok * 0.1;

  const inputCost = (usage.input_tokens / 1_000_000) * pricing.input_per_mtok;
  const outputCost = (usage.output_tokens / 1_000_000) * pricing.output_per_mtok;
  const cacheWriteCost =
    ((usage.cache_creation_input_tokens ?? 0) / 1_000_000) * cacheWritePer;
  const cacheReadCost = ((usage.cache_read_input_tokens ?? 0) / 1_000_000) * cacheReadPer;

  const total = inputCost + outputCost + cacheWriteCost + cacheReadCost;
  // 6자리 round — Math.round 가 float→int 변환에 가장 안전.
  return { usd: Math.round(total * 1_000_000) / 1_000_000, found: true };
}

/**
 * v1.0.12 (COST-2): pre-flight 보수 estimate.
 *
 * COST-2 gate 가 stream 시작 전에 "이번 turn 의 최악 비용" 을 합산해 한도
 * 초과 가능성을 평가. 실제 토큰 사용량은 stream end 후에야 알 수 있어
 * 항상 lower-bound 가산이 안전.
 *
 * 가산 정책 (Codex 권고: "최소 input estimate + max_output_tokens"):
 *  - input_estimate_tokens: caller 가 prompt + history token count 추정.
 *    미상이면 0 — 그러면 output_max 만 더해진 lower-bound.
 *  - output_max_tokens: provider max_output_tokens (없으면 4096 보수 default).
 *  - cache 토큰은 estimate 단계에서 0 — 실제 stream 후 reconcile.
 *
 * unknown 모델은 found=false + usd=0 — caller 가 unknown 차단 정책 결정.
 */
export function estimatePreflightCost(args: {
  model: string;
  input_estimate_tokens?: number;
  output_max_tokens?: number;
}): { usd: number; found: boolean } {
  const inputTok = Math.max(0, Math.floor(args.input_estimate_tokens ?? 0));
  const outputTok = Math.max(0, Math.floor(args.output_max_tokens ?? 4096));
  return priceUsage(args.model, {
    input_tokens: inputTok,
    output_tokens: outputTok,
  });
}
