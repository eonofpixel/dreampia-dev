/**
 * pricing.ts — v1.0.12 (COST-1) priceUsage / estimatePreflightCost contract.
 *
 * 기존 pricing.test.ts 의 estimateCostUsd 회귀는 그대로 유지하고, 새 API 만
 * 별도 파일로 격리. found/unknown 분기 + LAST_UPDATED 상수 + preflight 보수
 * estimate 검증.
 *
 * Spec: docs/v1.x-roadmap.md (COST-1)
 */

import { describe, it, expect } from 'vitest';
import {
  MODEL_PRICING_LAST_UPDATED,
  estimateCostUsd,
  estimatePreflightCost,
  priceUsage,
} from '../../src/providers/pricing';

describe('priceUsage — v1.0.12 found/unknown shape', () => {
  it('returns found=true + computed usd for registered model', () => {
    const r = priceUsage('claude-3-5-sonnet-20241022', {
      input_tokens: 1_000_000,
      output_tokens: 1_000_000,
    });
    expect(r.found).toBe(true);
    expect(r.usd).toBe(18); // 3 + 15 USD
  });

  it('returns found=false + usd=0 for unknown model', () => {
    const r = priceUsage('totally-fake-2099', { input_tokens: 999, output_tokens: 999 });
    expect(r.found).toBe(false);
    expect(r.usd).toBe(0);
  });

  it('estimateCostUsd remains backward-compatible (returns number, 0 for unknown)', () => {
    expect(estimateCostUsd('unknown-x', { input_tokens: 100, output_tokens: 100 })).toBe(0);
    expect(
      estimateCostUsd('gpt-4o', { input_tokens: 1_000_000, output_tokens: 1_000_000 })
    ).toBe(12.5);
  });

  it('found applies to prefix match too', () => {
    const r = priceUsage('claude-3-5-sonnet-20991231-future', {
      input_tokens: 0,
      output_tokens: 0,
    });
    expect(r.found).toBe(true);
    expect(r.usd).toBe(0);
  });
});

describe('estimatePreflightCost — v1.0.12 보수 estimate', () => {
  it('uses default output_max_tokens (4096) when missing', () => {
    // gpt-4o output $10/Mtok → 4096/1M * 10 = $0.04096.
    const r = estimatePreflightCost({ model: 'gpt-4o' });
    expect(r.found).toBe(true);
    expect(r.usd).toBeCloseTo(0.04096, 6);
  });

  it('adds input_estimate_tokens when provided', () => {
    // gpt-4o input $2.5/Mtok, output $10/Mtok.
    // 1M input + 4096 output → 2.5 + 0.04096 = 2.54096.
    const r = estimatePreflightCost({
      model: 'gpt-4o',
      input_estimate_tokens: 1_000_000,
    });
    expect(r.usd).toBeCloseTo(2.54096, 6);
  });

  it('respects custom output_max_tokens', () => {
    const r = estimatePreflightCost({
      model: 'gpt-4o',
      input_estimate_tokens: 0,
      output_max_tokens: 1000,
    });
    // 1000 / 1M * 10 = 0.01
    expect(r.usd).toBeCloseTo(0.01, 6);
  });

  it('unknown model returns found=false + usd=0 even with tokens', () => {
    const r = estimatePreflightCost({
      model: 'unknown-x',
      input_estimate_tokens: 1_000_000,
      output_max_tokens: 4096,
    });
    expect(r.found).toBe(false);
    expect(r.usd).toBe(0);
  });

  it('clamps negative tokens to 0', () => {
    const r = estimatePreflightCost({
      model: 'gpt-4o',
      input_estimate_tokens: -100,
      output_max_tokens: -1,
    });
    expect(r.found).toBe(true);
    expect(r.usd).toBe(0);
  });
});

describe('MODEL_PRICING_LAST_UPDATED', () => {
  it('is an ISO 8601 date string', () => {
    expect(MODEL_PRICING_LAST_UPDATED).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('parses to a finite Date', () => {
    const ms = Date.parse(`${MODEL_PRICING_LAST_UPDATED}T00:00:00.000Z`);
    expect(Number.isFinite(ms)).toBe(true);
  });
});
