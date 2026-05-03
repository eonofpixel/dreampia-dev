/**
 * UsageSettings — v0.9.0 CSV 내보내기 + 비용 한도 / 임계 알림 UI 검증.
 *
 * Existing v0.4.0 tests 는 UsageSettings.test.tsx 에 — 그대로 유지.
 * v0.9.0 추가분만 별도 file 로 분리해 회귀 추적 용이.
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { UsageSettings } from '../../src/renderer/components/settings/UsageSettings';
import { __mockStore } from '../setup';

describe('UsageSettings — CSV export (v0.9.0)', () => {
  it('renders [CSV 내보내기] 버튼 in panel', async () => {
    render(<UsageSettings open={true} onClose={() => {}} />);
    await waitFor(() => {
      expect(screen.getByTestId('usage-export-csv')).toBeInTheDocument();
    });
  });

  it('clicking [CSV 내보내기] invokes usage.exportCsv IPC', async () => {
    __mockStore.usageExportCsv = 'fake,csv\n';
    render(<UsageSettings open={true} onClose={() => {}} />);
    const button = await screen.findByTestId('usage-export-csv');
    const exportSpy = window.dreampia.usage.exportCsv as unknown as {
      mockClear?: () => void;
    } & ((...args: unknown[]) => Promise<unknown>);
    exportSpy.mockClear?.();
    // jsdom 의 URL.createObjectURL / revokeObjectURL 이 없을 수 있어 stub.
    const origCreate = URL.createObjectURL;
    const origRevoke = URL.revokeObjectURL;
    URL.createObjectURL = vi.fn(() => 'blob:mock');
    URL.revokeObjectURL = vi.fn();
    try {
      await userEvent.click(button);
      await waitFor(() => {
        expect(exportSpy).toHaveBeenCalled();
      });
    } finally {
      URL.createObjectURL = origCreate;
      URL.revokeObjectURL = origRevoke;
    }
  });
});

describe('UsageSettings — Cost Limit (v0.9.0)', () => {
  it('renders cost limit section', async () => {
    render(<UsageSettings open={true} onClose={() => {}} />);
    await waitFor(() => {
      expect(screen.getByTestId('cost-limit-section')).toBeInTheDocument();
    });
  });

  it("status shows '한도 미설정' when no limit configured", async () => {
    __mockStore.usageLimits = { alert_threshold: 0.8 };
    render(<UsageSettings open={true} onClose={() => {}} />);
    await waitFor(() => {
      expect(screen.getByTestId('cost-limit-status')).toHaveTextContent(/한도 미설정/);
    });
  });

  it('status shows safe label when below threshold', async () => {
    __mockStore.usageLimits = { cost_limit_usd: 100, alert_threshold: 0.8 };
    __mockStore.usageSummary = [
      {
        provider: 'claude',
        model: 'claude-3-5-sonnet',
        total_input: 100,
        total_output: 50,
        total_cache_creation: 0,
        total_cache_read: 0,
        total_reasoning: 0,
        total_cost_usd: 10, // 10% of 100
        event_count: 1,
      },
    ];
    render(<UsageSettings open={true} onClose={() => {}} />);
    await waitFor(() => {
      expect(screen.getByTestId('cost-limit-status')).toHaveTextContent(/안전/);
    });
  });

  it('status shows warning when above threshold but below limit', async () => {
    __mockStore.usageLimits = { cost_limit_usd: 100, alert_threshold: 0.8 };
    __mockStore.usageSummary = [
      {
        provider: 'claude',
        model: 'claude-3-5-sonnet',
        total_input: 100,
        total_output: 50,
        total_cache_creation: 0,
        total_cache_read: 0,
        total_reasoning: 0,
        total_cost_usd: 85, // 85% of 100 — above 80% threshold
        event_count: 1,
      },
    ];
    render(<UsageSettings open={true} onClose={() => {}} />);
    await waitFor(() => {
      expect(screen.getByTestId('cost-limit-status')).toHaveTextContent(/경고/);
    });
  });

  it('status shows over-limit when cost exceeds limit', async () => {
    __mockStore.usageLimits = { cost_limit_usd: 50, alert_threshold: 0.8 };
    __mockStore.usageSummary = [
      {
        provider: 'claude',
        model: 'claude-3-5-sonnet',
        total_input: 100,
        total_output: 50,
        total_cache_creation: 0,
        total_cache_read: 0,
        total_reasoning: 0,
        total_cost_usd: 120, // 240% — over limit
        event_count: 1,
      },
    ];
    render(<UsageSettings open={true} onClose={() => {}} />);
    await waitFor(() => {
      expect(screen.getByTestId('cost-limit-status')).toHaveTextContent(/한도 초과/);
    });
  });

  it('saving a new limit invokes setLimits IPC with parsed number', async () => {
    render(<UsageSettings open={true} onClose={() => {}} />);
    const input = await screen.findByTestId('cost-limit-input');
    const save = screen.getByTestId('cost-limit-save');
    const setLimitsSpy = window.dreampia.usage.setLimits as unknown as {
      mockClear?: () => void;
    } & ((...args: unknown[]) => Promise<unknown>);
    setLimitsSpy.mockClear?.();
    await userEvent.clear(input);
    await userEvent.type(input, '42.5');
    await userEvent.click(save);
    await waitFor(() => {
      expect(setLimitsSpy).toHaveBeenCalledWith({ cost_limit_usd: 42.5 });
    });
  });

  it('threshold radio group 50/80/90 toggles alert_threshold', async () => {
    render(<UsageSettings open={true} onClose={() => {}} />);
    await screen.findByTestId('cost-limit-section');
    const setLimitsSpy = window.dreampia.usage.setLimits as unknown as {
      mockClear?: () => void;
    } & ((...args: unknown[]) => Promise<unknown>);
    setLimitsSpy.mockClear?.();
    const opt = screen.getByTestId('cost-limit-threshold-0.9');
    await userEvent.click(opt);
    await waitFor(() => {
      expect(setLimitsSpy).toHaveBeenCalledWith({ alert_threshold: 0.9 });
    });
  });
});
