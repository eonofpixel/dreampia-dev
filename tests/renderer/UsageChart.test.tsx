/**
 * UsageChart — v0.9.0 SVG 일별 사용량 chart 검증.
 *
 * Smoke + accessibility:
 *  1. 빈 데이터 → empty placeholder.
 *  2. 데이터 있을 때 svg + bars 렌더 (data-testid).
 *  3. legend 표시 (claude/codex/mock).
 *  4. metric='cost' 도 동작.
 *  5. maxDays prop 으로 truncate.
 */

import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { UsageChart } from '../../src/renderer/components/settings/UsageChart';
import type { DailyUsageRowUI } from '../../src/renderer/hooks/useUsage';

describe('UsageChart', () => {
  it('shows empty placeholder when no data', () => {
    render(<UsageChart data={[]} />);
    expect(screen.getByTestId('usage-chart-empty')).toBeInTheDocument();
  });

  it('renders svg with bars when data present', () => {
    const data: DailyUsageRowUI[] = [
      { date: '2026-05-01', provider: 'claude', total_cost_usd: 0.5, total_tokens: 1000 },
      { date: '2026-05-02', provider: 'codex', total_cost_usd: 0.3, total_tokens: 500 },
    ];
    render(<UsageChart data={data} />);
    expect(screen.getByTestId('usage-chart')).toBeInTheDocument();
    expect(screen.getByTestId('bar-2026-05-01')).toBeInTheDocument();
    expect(screen.getByTestId('bar-2026-05-02')).toBeInTheDocument();
  });

  it('shows legend with claude / codex / mock', () => {
    const data: DailyUsageRowUI[] = [
      { date: '2026-05-01', provider: 'claude', total_cost_usd: 0.5, total_tokens: 1000 },
    ];
    render(<UsageChart data={data} />);
    expect(screen.getByTestId('legend-claude')).toBeInTheDocument();
    expect(screen.getByTestId('legend-codex')).toBeInTheDocument();
    expect(screen.getByTestId('legend-mock')).toBeInTheDocument();
  });

  it('stacks providers in same date', () => {
    const data: DailyUsageRowUI[] = [
      { date: '2026-05-01', provider: 'claude', total_cost_usd: 0.5, total_tokens: 1000 },
      { date: '2026-05-01', provider: 'codex', total_cost_usd: 0.3, total_tokens: 500 },
    ];
    render(<UsageChart data={data} />);
    // 같은 날짜의 두 row 가 한 bar 그룹에 있어야 함.
    const bar = screen.getByTestId('bar-2026-05-01');
    // Within one g, we expect two rect elements (claude + codex segments).
    const rects = bar.querySelectorAll('rect');
    expect(rects.length).toBeGreaterThanOrEqual(2);
  });

  it('renders with metric=cost without crashing', () => {
    const data: DailyUsageRowUI[] = [
      { date: '2026-05-01', provider: 'claude', total_cost_usd: 0.5, total_tokens: 1000 },
    ];
    render(<UsageChart data={data} metric="cost" />);
    expect(screen.getByTestId('usage-chart')).toBeInTheDocument();
  });

  it('truncates to last maxDays bars when data exceeds limit', () => {
    const data: DailyUsageRowUI[] = [];
    for (let d = 1; d <= 50; d++) {
      const day = String(d).padStart(2, '0');
      data.push({
        date: `2026-05-${day}`,
        provider: 'claude',
        total_cost_usd: 0.1,
        total_tokens: 100,
      });
    }
    const { container } = render(<UsageChart data={data} maxDays={10} />);
    // 50 일치 데이터가 들어가도 최대 10 개의 bar 만 그려져야 한다.
    const bars = container.querySelectorAll('[data-testid^="bar-"]');
    expect(bars.length).toBeLessThanOrEqual(10);
  });
});
