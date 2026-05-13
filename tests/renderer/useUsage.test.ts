/**
 * useUsage — Renderer hook for v0.4.0 token / cost telemetry.
 *
 * window.dreampia.usage 는 setup.ts 의 in-memory mock. 각 테스트는
 * __mockStore.usageSummary / usageDaily / usageError 를 직접 채워 hook 동작을
 * 검증한다.
 */

import { describe, it, expect } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import { useUsage, rangeFromPreset } from '../../src/renderer/hooks/useUsage';
import { __mockStore } from '../setup';

describe('useUsage', () => {
  it('refresh fetches empty summary + daily on mount', async () => {
    const { result } = renderHook(() => useUsage());
    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });
    expect(result.current.summary).toEqual([]);
    expect(result.current.daily).toEqual([]);
    expect(result.current.error).toBeNull();
    expect(result.current.lastRefreshedAt).not.toBeNull();
  });

  it('returns seeded summary + daily data', async () => {
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
    ];
    __mockStore.usageDaily = [
      { date: '2026-05-03', provider: 'claude', total_cost_usd: 0.012, total_tokens: 1500 },
    ];
    const { result } = renderHook(() => useUsage());
    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });
    expect(result.current.summary).toHaveLength(1);
    expect(result.current.summary[0]?.model).toBe('claude-3-5-sonnet');
    expect(result.current.daily).toHaveLength(1);
    expect(result.current.daily[0]?.date).toBe('2026-05-03');
  });

  it('changes preset triggers re-fetch', async () => {
    const { result } = renderHook(() => useUsage('today'));
    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });
    expect(result.current.preset).toBe('today');
    act(() => {
      result.current.setPreset('30d');
    });
    await waitFor(() => {
      expect(result.current.preset).toBe('30d');
    });
    // preset 변경 → useEffect → refresh
    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });
  });

  it('refresh sets error when IPC fails', async () => {
    __mockStore.usageError = 'mock IPC failure';
    const { result } = renderHook(() => useUsage());
    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });
    expect(result.current.error).toBe('mock IPC failure');
  });

  it('manual refresh updates lastRefreshedAt', async () => {
    const { result } = renderHook(() => useUsage());
    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });
    const t0 = result.current.lastRefreshedAt;
    expect(t0).not.toBeNull();
    await new Promise((r) => setTimeout(r, 5));
    await act(async () => {
      await result.current.refresh();
    });
    expect(result.current.lastRefreshedAt).toBeGreaterThanOrEqual(t0 ?? 0);
  });

  it('initial preset defaults to 7d', async () => {
    const { result } = renderHook(() => useUsage());
    expect(result.current.preset).toBe('7d');
    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });
  });
});

describe('rangeFromPreset', () => {
  it('today preset returns midnight to now + days=1', () => {
    const r = rangeFromPreset('today');
    expect(r.days).toBe(1);
    const fromDate = new Date(r.from);
    expect(fromDate.getHours()).toBe(0);
    expect(fromDate.getMinutes()).toBe(0);
  });

  it('7d preset returns 7 days ago to now + days=7', () => {
    const r = rangeFromPreset('7d');
    expect(r.days).toBe(7);
    const diff = new Date(r.to).getTime() - new Date(r.from).getTime();
    expect(diff).toBeGreaterThan(6.9 * 24 * 60 * 60 * 1000);
    expect(diff).toBeLessThan(7.1 * 24 * 60 * 60 * 1000);
  });

  it('30d preset returns 30 days ago to now + days=30', () => {
    const r = rangeFromPreset('30d');
    expect(r.days).toBe(30);
    const diff = new Date(r.to).getTime() - new Date(r.from).getTime();
    expect(diff).toBeGreaterThan(29.5 * 24 * 60 * 60 * 1000);
    expect(diff).toBeLessThan(30.5 * 24 * 60 * 60 * 1000);
  });
});
