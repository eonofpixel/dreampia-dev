/**
 * CostGate — v1.0.12 (COST-2) pre-flight + reserved ledger contract tests.
 *
 * UsageStore 는 mock — getMonthToDateCostUsd 만 구현. better-sqlite3 ABI 의존
 * 없이 격리 단위 테스트.
 *
 * 검증:
 *  1. limit 미설정 → 항상 allow.
 *  2. unknown 모델 + limit 활성 → 즉시 block (Codex 4a).
 *  3. limit 활성 + projected >= limit → block (limit_exceeded).
 *  4. limit 활성 + projected < limit → allow + alert flag (threshold).
 *  5. reserved ledger reserve/release 누적/해제.
 *  6. 동시 stream 의 reserved 합산이 gate 결정에 반영.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { CostGate, type CostLimits } from '../../src/main/CostGate';
import type { UsageStore } from '../../src/storage';

function makeUsageStub(mtdReturns: number[]): UsageStore {
  let i = 0;
  const stub = {
    getMonthToDateCostUsd: (): number => {
      const v = mtdReturns[Math.min(i, mtdReturns.length - 1)] ?? 0;
      i += 1;
      return v;
    },
  } as unknown as UsageStore;
  return stub;
}

describe('CostGate — limit 미설정 시', () => {
  it('항상 allow 반환', () => {
    const usage = makeUsageStub([0]);
    const gate = new CostGate(usage, () => ({}));
    const decision = gate.checkBeforeStream({ model: 'gpt-4o' });
    expect(decision.kind).toBe('allow');
    if (decision.kind === 'allow') {
      expect(decision.alert).toBe(false);
    }
  });

  it('unknown 모델도 limit 미설정이면 allow', () => {
    const usage = makeUsageStub([0]);
    const gate = new CostGate(usage, () => ({}));
    const decision = gate.checkBeforeStream({ model: 'totally-unknown' });
    expect(decision.kind).toBe('allow');
  });
});

describe('CostGate — unknown 모델 + limit 활성', () => {
  it('즉시 block (unknown_model_under_limit)', () => {
    const usage = makeUsageStub([0]);
    const gate = new CostGate(usage, () => ({ cost_limit_usd: 10 }));
    const decision = gate.checkBeforeStream({ model: 'unknown-x' });
    expect(decision.kind).toBe('block');
    if (decision.kind === 'block') {
      expect(decision.reason).toBe('unknown_model_under_limit');
      expect(decision.limit_usd).toBe(10);
    }
  });
});

describe('CostGate — limit 활성 + projected 합산', () => {
  it('projected >= limit → block (limit_exceeded)', () => {
    const usage = makeUsageStub([9.99]); // MTD 9.99, limit 10, 4096 output → 0.04
    const gate = new CostGate(usage, () => ({ cost_limit_usd: 10 }));
    const decision = gate.checkBeforeStream({ model: 'gpt-4o', output_max_tokens: 4096 });
    expect(decision.kind).toBe('block');
    if (decision.kind === 'block') {
      expect(decision.reason).toBe('limit_exceeded');
      expect(decision.mtd_total_usd).toBeCloseTo(9.99, 6);
      expect(decision.projected_total_usd).toBeGreaterThan(10);
    }
  });

  it('projected < limit + threshold 미도달 → allow without alert', () => {
    const usage = makeUsageStub([0]); // MTD 0, limit 10, output_max=100 → 0.001 USD
    const gate = new CostGate(usage, () => ({
      cost_limit_usd: 10,
      alert_threshold: 0.5,
    }));
    const decision = gate.checkBeforeStream({
      model: 'gpt-4o',
      output_max_tokens: 100,
    });
    expect(decision.kind).toBe('allow');
    if (decision.kind === 'allow') {
      expect(decision.alert).toBe(false);
    }
  });

  it('projected >= alert_threshold * limit → allow + alert', () => {
    // MTD 5, limit 10, threshold 0.5 → alert at >= 5.0 USD.
    // gpt-4o 4096 output_max → 0.04096 → projected 5.04 → alert.
    const usage = makeUsageStub([5]);
    const gate = new CostGate(usage, () => ({
      cost_limit_usd: 10,
      alert_threshold: 0.5,
    }));
    const decision = gate.checkBeforeStream({
      model: 'gpt-4o',
      output_max_tokens: 4096,
    });
    expect(decision.kind).toBe('allow');
    if (decision.kind === 'allow') {
      expect(decision.alert).toBe(true);
    }
  });

  it('alert_threshold default 0.8 사용', () => {
    // MTD 8.0, limit 10, default 0.8 → alert at >= 8.0 USD.
    const usage = makeUsageStub([8.0]);
    const gate = new CostGate(usage, () => ({ cost_limit_usd: 10 }));
    const decision = gate.checkBeforeStream({
      model: 'gpt-4o',
      output_max_tokens: 100,
    });
    expect(decision.kind).toBe('allow');
    if (decision.kind === 'allow') {
      expect(decision.alert).toBe(true);
    }
  });
});

describe('CostGate — reserved ledger', () => {
  let gate: CostGate;
  let getLimits: () => CostLimits;
  beforeEach(() => {
    const usage = makeUsageStub([0, 0, 0, 0, 0]);
    getLimits = () => ({ cost_limit_usd: 1 });
    gate = new CostGate(usage, getLimits);
  });

  it('reserve 후 reserved total 누적', () => {
    expect(gate.getReservedTotal()).toBe(0);
    gate.reserve('s1', 0.3);
    expect(gate.getReservedTotal()).toBeCloseTo(0.3, 6);
    gate.reserve('s2', 0.4);
    expect(gate.getReservedTotal()).toBeCloseTo(0.7, 6);
  });

  it('release 후 reserved 제거', () => {
    gate.reserve('s1', 0.3);
    gate.reserve('s2', 0.4);
    gate.release('s1');
    expect(gate.getReservedTotal()).toBeCloseTo(0.4, 6);
    gate.release('s2');
    expect(gate.getReservedTotal()).toBe(0);
  });

  it('release 미존재 streamId 는 no-op', () => {
    gate.release('phantom');
    expect(gate.getReservedTotal()).toBe(0);
  });

  it('0 / 음수 reserve 는 ledger 추가 안 함', () => {
    gate.reserve('s1', 0);
    gate.reserve('s2', -1);
    expect(gate.getReservedTotal()).toBe(0);
  });

  it('동시 reserved 가 다음 gate 결정에 반영', () => {
    // limit 1, MTD 0, reserved 0.5 + 이번 turn 0.04 → 0.54 < 1 → allow.
    gate.reserve('previous-stream', 0.5);
    const decision = gate.checkBeforeStream({
      model: 'gpt-4o',
      output_max_tokens: 4096,
    });
    expect(decision.kind).toBe('allow');

    // reserved 0.99 추가 → 0.5 + 0.99 + 0.04 = 1.53 → block.
    gate.reserve('another-stream', 0.99);
    const decision2 = gate.checkBeforeStream({
      model: 'gpt-4o',
      output_max_tokens: 4096,
    });
    expect(decision2.kind).toBe('block');
  });
});

describe('CostGate.toErrorPayload', () => {
  it('직렬화-가능한 payload + COST_LIMIT_EXCEEDED code', () => {
    const usage = makeUsageStub([100]);
    const gate = new CostGate(usage, () => ({ cost_limit_usd: 10 }));
    const decision = gate.checkBeforeStream({ model: 'gpt-4o' });
    if (decision.kind !== 'block') throw new Error('expected block');
    const payload = CostGate.toErrorPayload(decision);
    expect(payload.code).toBe('COST_LIMIT_EXCEEDED');
    expect(payload.details.reason).toBe('limit_exceeded');
    expect(payload.details.limit_usd).toBe(10);
    // JSON round-trip 안전.
    expect(() => JSON.parse(JSON.stringify(payload))).not.toThrow();
  });
});
