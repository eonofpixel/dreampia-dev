/**
 * v2.x (Phase D) — Chat virtualization threshold contract test.
 *
 * 검증:
 *  - TURN_VIRTUALIZATION_THRESHOLD 가 정의됨 + 합리적 range
 *  - Virtuoso import 가 build 시 깨지지 않음 (smoke)
 */

import { describe, it, expect } from 'vitest';
import { TURN_VIRTUALIZATION_THRESHOLD } from '../../../src/renderer/components/chat/ChatPanel';

describe('v2.x Phase D — Chat virtualization', () => {
  it('TURN_VIRTUALIZATION_THRESHOLD 가 정의됨 + 합리적 정수 (10 ~ 1000)', () => {
    expect(TURN_VIRTUALIZATION_THRESHOLD).toBeDefined();
    expect(typeof TURN_VIRTUALIZATION_THRESHOLD).toBe('number');
    expect(Number.isInteger(TURN_VIRTUALIZATION_THRESHOLD)).toBe(true);
    expect(TURN_VIRTUALIZATION_THRESHOLD).toBeGreaterThanOrEqual(10);
    expect(TURN_VIRTUALIZATION_THRESHOLD).toBeLessThanOrEqual(1000);
  });

  it('react-virtuoso 모듈이 정상 import (smoke)', async () => {
    const mod = await import('react-virtuoso');
    expect(mod.Virtuoso).toBeDefined();
    // React forwardRef/memo 컴포넌트는 typeof 'object' (function 이 아님).
    const t = typeof mod.Virtuoso;
    expect(t === 'object' || t === 'function').toBe(true);
  });

  // 향후 슬롯 — 실제 ChatPanel render + 10k turn fixture 의 perf benchmark.
  // 현재 PoC 는 threshold 도입 + Virtuoso wrapper 만. e2e 레벨 perf 측정은
  // Phase D 후속 (별 PR — DevTools timeline + axe regression).
});
