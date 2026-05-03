/**
 * pricing.ts tests — model lookup + cost estimation.
 *
 * Spec: ROADMAP.md (v0.4.0)
 */

import { describe, it, expect } from 'vitest';
import {
  MODEL_PRICING,
  estimateCostUsd,
  lookupPricing,
} from '../../src/providers/pricing';

describe('lookupPricing', () => {
  it('returns exact pricing for registered model', () => {
    const p = lookupPricing('claude-3-5-sonnet-20241022');
    expect(p).not.toBeNull();
    expect(p?.input_per_mtok).toBe(3);
    expect(p?.output_per_mtok).toBe(15);
  });

  it('returns null for unknown model', () => {
    expect(lookupPricing('totally-fake-model')).toBeNull();
    expect(lookupPricing('')).toBeNull();
  });

  it('uses prefix match for new release of registered family', () => {
    // 'claude-3-5-sonnet' 키 등록 → 더 긴 변형도 잡힘.
    const p = lookupPricing('claude-3-5-sonnet-20251101-future');
    expect(p).not.toBeNull();
    expect(p?.input_per_mtok).toBe(3);
  });

  it('prefers longer prefix match when multiple keys match', () => {
    // 'claude-haiku-4-5' 와 'claude-haiku-4-5-20251001' 모두 등록 — 정확 매칭이
    // 우선이므로 'claude-haiku-4-5-20251001' 키가 먼저 발견되어야 함.
    const p = lookupPricing('claude-haiku-4-5-20251001');
    expect(p?.input_per_mtok).toBe(1);
  });

  it('does not match when model is shorter than registered key', () => {
    // 'claude' 만 lookup 하면 'claude-3-5-sonnet' 등이 매칭되면 안 됨
    // (반대 방향 prefix 는 의미 없음).
    expect(lookupPricing('claude')).toBeNull();
  });
});

describe('estimateCostUsd', () => {
  it('returns 0 for unknown model', () => {
    expect(
      estimateCostUsd('unknown-model', { input_tokens: 1000, output_tokens: 1000 })
    ).toBe(0);
  });

  it('computes input + output cost correctly', () => {
    // claude-3-5-sonnet: $3 / Mtok input, $15 / Mtok output.
    // 1M input + 1M output = 3 + 15 = 18 USD.
    const cost = estimateCostUsd('claude-3-5-sonnet-20241022', {
      input_tokens: 1_000_000,
      output_tokens: 1_000_000,
    });
    expect(cost).toBe(18);
  });

  it('rounds to 6 decimal places', () => {
    // 1 input token at $3/M = $0.000003 — exactly 6 decimals.
    const cost = estimateCostUsd('claude-3-5-sonnet-20241022', {
      input_tokens: 1,
      output_tokens: 0,
    });
    expect(cost).toBe(0.000003);
  });

  it('includes cache_creation cost when provided', () => {
    // claude-3-5-sonnet-20241022 cache_write_per_mtok=3.75
    // 1M cache_creation = 3.75 USD.
    const cost = estimateCostUsd('claude-3-5-sonnet-20241022', {
      input_tokens: 0,
      output_tokens: 0,
      cache_creation_input_tokens: 1_000_000,
    });
    expect(cost).toBe(3.75);
  });

  it('includes cache_read cost when provided', () => {
    // cache_read_per_mtok = 0.30 — 1M cache_read = 0.30 USD.
    const cost = estimateCostUsd('claude-3-5-sonnet-20241022', {
      input_tokens: 0,
      output_tokens: 0,
      cache_read_input_tokens: 1_000_000,
    });
    expect(cost).toBe(0.3);
  });

  it('falls back to defaults for cache rates when override missing', () => {
    // claude-haiku-4-5: input_per_mtok=1, no cache_*_per_mtok overrides.
    // Default cache_write = input * 1.25 = 1.25, cache_read = input * 0.10 = 0.10.
    // 1M cache_creation + 1M cache_read = 1.25 + 0.10 = 1.35.
    const cost = estimateCostUsd('claude-haiku-4-5-20251001', {
      input_tokens: 0,
      output_tokens: 0,
      cache_creation_input_tokens: 1_000_000,
      cache_read_input_tokens: 1_000_000,
    });
    expect(cost).toBeCloseTo(1.35, 6);
  });

  it('handles 0 token usage gracefully', () => {
    expect(
      estimateCostUsd('claude-3-5-sonnet-20241022', { input_tokens: 0, output_tokens: 0 })
    ).toBe(0);
  });

  it('Codex / OpenAI models are priced', () => {
    // gpt-4o: $2.50 input, $10 output → 1M+1M = 12.50
    expect(estimateCostUsd('gpt-4o', { input_tokens: 1_000_000, output_tokens: 1_000_000 })).toBe(
      12.5
    );
    // o3-mini: $1.10 input, $4.40 output → 1M+1M = 5.50
    expect(
      estimateCostUsd('o3-mini', { input_tokens: 1_000_000, output_tokens: 1_000_000 })
    ).toBe(5.5);
  });
});

describe('MODEL_PRICING table', () => {
  it('contains required Claude models', () => {
    expect(MODEL_PRICING['claude-3-5-sonnet-20241022']).toBeDefined();
    expect(MODEL_PRICING['claude-3-5-haiku']).toBeDefined();
    expect(MODEL_PRICING['claude-3-opus']).toBeDefined();
  });

  it('contains required Codex / OpenAI models', () => {
    expect(MODEL_PRICING['gpt-4o']).toBeDefined();
    expect(MODEL_PRICING['gpt-5.5']).toBeDefined();
    expect(MODEL_PRICING['o1']).toBeDefined();
    expect(MODEL_PRICING['o3-mini']).toBeDefined();
  });

  it('all entries have input/output > 0', () => {
    for (const [model, p] of Object.entries(MODEL_PRICING)) {
      expect(p.input_per_mtok, `${model} input_per_mtok`).toBeGreaterThan(0);
      expect(p.output_per_mtok, `${model} output_per_mtok`).toBeGreaterThan(0);
    }
  });
});
