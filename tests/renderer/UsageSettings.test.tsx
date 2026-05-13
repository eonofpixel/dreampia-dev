/**
 * UsageSettings — v0.4.0 token / cost 모달 UI smoke test.
 *
 * 검증 포인트:
 *  - open=false 면 렌더 X
 *  - open=true 면 dialog + 헤더 + preset 탭
 *  - 빈 상태 안내 문구
 *  - Provider 별 합계 표 + 일별 추이 표
 *  - 새로고침 버튼이 useUsage.refresh 호출 (lastRefreshedAt 갱신)
 *  - preset 변경 시 active state 토글
 *  - 비용 / 토큰 포맷팅 (USD / locale)
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { UsageSettings } from '../../src/renderer/components/settings/UsageSettings';
import { __mockStore } from '../setup';

async function waitForUsagePanelSettled(): Promise<void> {
  await screen.findByTestId('cost-limit-input');
  await waitFor(() => {
    expect(screen.getByText(/마지막 갱신/i)).toBeInTheDocument();
  });
}

describe('UsageSettings', () => {
  it('renders nothing when open=false', () => {
    const { container } = render(<UsageSettings open={false} onClose={() => {}} />);
    expect(container.firstChild).toBeNull();
  });

  it('renders dialog with header when open=true', async () => {
    render(<UsageSettings open={true} onClose={() => {}} />);
    expect(screen.getByRole('dialog', { name: /사용량 설정/i })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /사용량/i })).toBeInTheDocument();
    await waitForUsagePanelSettled();
  });

  it('renders preset radio group with 3 options', async () => {
    render(<UsageSettings open={true} onClose={() => {}} />);
    expect(screen.getByRole('radio', { name: '오늘' })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: '7일' })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: '30일' })).toBeInTheDocument();
    await waitForUsagePanelSettled();
  });

  it('shows empty state when no usage data', async () => {
    render(<UsageSettings open={true} onClose={() => {}} />);
    await waitFor(() => {
      expect(screen.getByText(/아직 사용 기록이 없어요/i)).toBeInTheDocument();
    });
    await waitForUsagePanelSettled();
  });

  it('renders summary table when usage exists', async () => {
    __mockStore.usageSummary = [
      {
        provider: 'claude',
        model: 'claude-3-5-sonnet',
        total_input: 1000,
        total_output: 500,
        total_cache_creation: 0,
        total_cache_read: 0,
        total_reasoning: 0,
        total_cost_usd: 0.012,
        event_count: 3,
      },
      {
        provider: 'codex',
        model: 'gpt-4o',
        total_input: 500,
        total_output: 200,
        total_cache_creation: 0,
        total_cache_read: 0,
        total_reasoning: 0,
        total_cost_usd: 0.0035,
        event_count: 1,
      },
    ];
    render(<UsageSettings open={true} onClose={() => {}} />);
    await waitFor(() => {
      expect(screen.getByText('claude-3-5-sonnet')).toBeInTheDocument();
    });
    expect(screen.getByText('gpt-4o')).toBeInTheDocument();
    // 합계 cost: 0.012 + 0.0035 = 0.0155 → "$0.0155" (4-digit max)
    expect(screen.getByText(/\$0\.0155/)).toBeInTheDocument();
    // 이벤트 합계
    expect(screen.getByText(/4건/)).toBeInTheDocument();
    await waitForUsagePanelSettled();
  });

  it('renders daily trend table', async () => {
    __mockStore.usageDaily = [
      { date: '2026-05-03', provider: 'claude', total_cost_usd: 0.012, total_tokens: 1500 },
      { date: '2026-05-02', provider: 'claude', total_cost_usd: 0.005, total_tokens: 800 },
    ];
    render(<UsageSettings open={true} onClose={() => {}} />);
    await waitFor(() => {
      expect(screen.getByText('2026-05-03')).toBeInTheDocument();
    });
    expect(screen.getByText('2026-05-02')).toBeInTheDocument();
    await waitForUsagePanelSettled();
  });

  it('switches preset when tab clicked', async () => {
    const user = userEvent.setup();
    render(<UsageSettings open={true} onClose={() => {}} />);
    const todayTab = screen.getByRole('radio', { name: '오늘' });
    expect(todayTab).toHaveAttribute('aria-checked', 'false');
    await user.click(todayTab);
    await waitFor(() => {
      expect(todayTab).toHaveAttribute('aria-checked', 'true');
    });
    await waitForUsagePanelSettled();
  });

  it('refresh button triggers re-fetch', async () => {
    const user = userEvent.setup();
    render(<UsageSettings open={true} onClose={() => {}} />);
    await waitFor(() => {
      expect(screen.getByText(/마지막 갱신/i)).toBeInTheDocument();
    });
    const summaryFn = window.dreampia.usage.summary as unknown as { mock?: { calls: unknown[] } };
    const initialCalls = summaryFn.mock?.calls.length ?? 0;
    await user.click(screen.getByRole('button', { name: /새로고침/i }));
    await waitFor(() => {
      expect(summaryFn.mock?.calls.length ?? 0).toBeGreaterThan(initialCalls);
    });
    await waitForUsagePanelSettled();
  });

  it('close button calls onClose', async () => {
    const onClose = vi.fn();
    const user = userEvent.setup();
    render(<UsageSettings open={true} onClose={onClose} />);
    await waitForUsagePanelSettled();
    await user.click(screen.getByRole('button', { name: /닫기/i }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('shows IPC error in banner', async () => {
    __mockStore.usageError = 'IPC bridge unavailable';
    render(<UsageSettings open={true} onClose={() => {}} />);
    await waitFor(() => {
      expect(screen.getByText(/IPC bridge unavailable/i)).toBeInTheDocument();
    });
    await waitForUsagePanelSettled();
  });

  it('formats $0 cost as "$0.00"', async () => {
    __mockStore.usageSummary = [
      {
        provider: 'mock',
        model: 'fake-model',
        total_input: 10,
        total_output: 5,
        total_cache_creation: 0,
        total_cache_read: 0,
        total_reasoning: 0,
        total_cost_usd: 0,
        event_count: 1,
      },
    ];
    render(<UsageSettings open={true} onClose={() => {}} />);
    await waitFor(() => {
      expect(screen.getByText('fake-model')).toBeInTheDocument();
    });
    // 합계도 0 — 헤더 카드 + 행 양쪽에서 모두 $0.00.
    const zeroCells = screen.getAllByText(/\$0\.00/);
    expect(zeroCells.length).toBeGreaterThanOrEqual(2);
    await waitForUsagePanelSettled();
  });
});
