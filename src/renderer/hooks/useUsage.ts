/**
 * useUsage — Renderer hook for v0.4.0 token / cost telemetry.
 *
 * Spec: ROADMAP.md (v0.4.0 Usage/Cost Tracking MVP)
 *
 * Wraps the `window.dreampia.usage.*` IPC namespace. 패턴은 useMcp 와 동일:
 * preload bridge 미존재 (vitest 격리 / packaged 깨진 build) 시 안전 fallback.
 *
 * Range presets (편의):
 *   - 'today'  — 오늘 자정부터 지금까지
 *   - '7d'     — 7일 전부터 지금까지
 *   - '30d'    — 30일 전부터 지금까지
 *
 * Auto-refresh on mount + manual refresh().
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Result } from '@/main/types';

// ────────────────────────────────────────────────────────────
// Public types — UsageStore shape with renderer-friendly UI alias
// ────────────────────────────────────────────────────────────

export type UsageProviderUI = 'claude' | 'codex' | 'mock';

export interface UsageEventUI {
  id: string;
  session_id: string;
  turn_id: string;
  provider: UsageProviderUI;
  model: string;
  input_tokens: number;
  output_tokens: number;
  cache_creation_input_tokens: number;
  cache_read_input_tokens: number;
  reasoning_output_tokens: number;
  total_cost_usd: number;
  recorded_at: string;
  source?: string;
}

export interface UsageSummaryUI {
  provider: UsageProviderUI;
  model: string;
  total_input: number;
  total_output: number;
  total_cache_creation: number;
  total_cache_read: number;
  total_reasoning: number;
  total_cost_usd: number;
  event_count: number;
}

export interface DailyUsageRowUI {
  date: string;
  provider: UsageProviderUI;
  total_cost_usd: number;
  total_tokens: number;
}

export type UsageRangePreset = 'today' | '7d' | '30d';

export interface UsageSummaryArgs {
  from?: string;
  to?: string;
  provider?: UsageProviderUI;
  model?: string;
  session_id?: string;
}

// v0.9.0 — Usage CSV export + cost limits.
export interface UsageLimitsUI {
  cost_limit_usd?: number;
  alert_threshold: number;
}

export interface UsageLimitsPatchUI {
  cost_limit_usd?: number | null;
  alert_threshold?: number | null;
}

interface UsageApi {
  summary: (args?: UsageSummaryArgs) => Promise<Result<UsageSummaryUI[]>>;
  daily: (args: { days: number; provider?: UsageProviderUI }) => Promise<Result<DailyUsageRowUI[]>>;
  bySession: (sessionId: string) => Promise<Result<UsageEventUI[]>>;
  exportCsv?: (args?: UsageSummaryArgs) => Promise<Result<string>>;
  getLimits?: () => Promise<Result<UsageLimitsUI>>;
  setLimits?: (patch: UsageLimitsPatchUI) => Promise<Result<void>>;
}

function getUsageApi(): UsageApi | null {
  if (typeof window === 'undefined') return null;
  const dp = (window as unknown as { dreampia?: { usage?: UsageApi } }).dreampia;
  if (!dp || typeof dp.usage !== 'object' || dp.usage === null) return null;
  return dp.usage;
}

// ────────────────────────────────────────────────────────────
// Range preset → ISO 시각 범위
// ────────────────────────────────────────────────────────────

/**
 * Preset → {from, to, days} 변환.
 *
 * - today: 자정 (local) → 지금. daily query 는 days=1 로 매핑.
 * - 7d / 30d: 단순 N일 전 → 지금. daily query 는 days=N.
 */
export function rangeFromPreset(
  preset: UsageRangePreset
): { from: string; to: string; days: number } {
  const now = new Date();
  if (preset === 'today') {
    const start = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
    return { from: start.toISOString(), to: now.toISOString(), days: 1 };
  }
  const days = preset === '7d' ? 7 : 30;
  const start = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
  return { from: start.toISOString(), to: now.toISOString(), days };
}

// ────────────────────────────────────────────────────────────
// Hook return
// ────────────────────────────────────────────────────────────

export interface UseUsageApi {
  summary: UsageSummaryUI[];
  daily: DailyUsageRowUI[];
  loading: boolean;
  error: string | null;
  /** 마지막 refresh 가 끝난 시각 (ms). 첫 mount 전이면 null. */
  lastRefreshedAt: number | null;
  preset: UsageRangePreset;
  setPreset: (next: UsageRangePreset) => void;
  refresh: () => Promise<void>;
  /**
   * v0.9.0 — 현재 preset range 의 usage event 들을 CSV (RFC 4180) 로 export.
   * IPC 미지원이거나 실패 시 null. 성공 시 CSV 문자열.
   */
  exportCsv: () => Promise<string | null>;
}

export function useUsage(initialPreset: UsageRangePreset = '7d'): UseUsageApi {
  const [summary, setSummary] = useState<UsageSummaryUI[]>([]);
  const [daily, setDaily] = useState<DailyUsageRowUI[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastRefreshedAt, setLastRefreshedAt] = useState<number | null>(null);
  const [preset, setPreset] = useState<UsageRangePreset>(initialPreset);

  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const range = useMemo(() => rangeFromPreset(preset), [preset]);

  const refresh = useCallback(async (): Promise<void> => {
    const api = getUsageApi();
    if (api === null) {
      if (mountedRef.current) {
        setLoading(false);
      }
      return;
    }
    if (mountedRef.current) {
      setLoading(true);
      setError(null);
    }
    const [summaryResult, dailyResult] = await Promise.all([
      api.summary({ from: range.from, to: range.to }),
      api.daily({ days: range.days }),
    ]);
    if (!mountedRef.current) return;

    if (summaryResult.ok) {
      setSummary(summaryResult.value);
    } else {
      setError(summaryResult.error);
    }
    if (dailyResult.ok) {
      setDaily(dailyResult.value);
    } else {
      // Summary 실패 시 daily error 가 마지막 이긴 하지만 한 화면에서 두 개
      // 모두 표시하기 어려우므로 더 최근 error 만 보존.
      setError(dailyResult.error);
    }
    setLoading(false);
    setLastRefreshedAt(Date.now());
  }, [range]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const exportCsv = useCallback(async (): Promise<string | null> => {
    const api = getUsageApi();
    if (api === null || typeof api.exportCsv !== 'function') return null;
    try {
      const result = await api.exportCsv({ from: range.from, to: range.to });
      if (!result.ok) {
        if (mountedRef.current) setError(result.error);
        return null;
      }
      return result.value;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (mountedRef.current) setError(msg);
      return null;
    }
  }, [range]);

  return {
    summary,
    daily,
    loading,
    error,
    lastRefreshedAt,
    preset,
    setPreset,
    refresh,
    exportCsv,
  };
}

// ────────────────────────────────────────────────────────────
// useUsageLimits — v0.9.0 비용 한도 / 임계값 hook
//
// useUsage 와 분리한 이유: useUsage 는 preset 변경마다 refresh — limits 는
// 별도 lifecycle (사용자가 한도 설정할 때만 refresh). 두 hook 을 같은
// component 안에서 함께 사용 가능 (UsageSettingsPanel 이 이렇게 사용).
// ────────────────────────────────────────────────────────────

export interface UseUsageLimitsApi {
  limits: UsageLimitsUI | null;
  loading: boolean;
  error: string | null;
  /** 다시 fetch (settings 가 외부 변경됐을 수 있음). */
  refresh: () => Promise<void>;
  /**
   * 한도 / 임계값 set. null 을 보내면 해당 필드 제거.
   * 성공 시 자동 refresh 후 true 반환.
   */
  setLimits: (patch: UsageLimitsPatchUI) => Promise<boolean>;
}

const DEFAULT_LIMITS: UsageLimitsUI = { alert_threshold: 0.8 };

export function useUsageLimits(): UseUsageLimitsApi {
  const [limits, setLimitsState] = useState<UsageLimitsUI | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const refresh = useCallback(async (): Promise<void> => {
    const api = getUsageApi();
    if (api === null || typeof api.getLimits !== 'function') {
      if (mountedRef.current) {
        setLimitsState(DEFAULT_LIMITS);
        setLoading(false);
      }
      return;
    }
    if (mountedRef.current) {
      setLoading(true);
      setError(null);
    }
    try {
      const result = await api.getLimits();
      if (!mountedRef.current) return;
      if (result.ok) {
        setLimitsState(result.value);
      } else {
        setError(result.error);
        setLimitsState(DEFAULT_LIMITS);
      }
    } catch (err) {
      if (!mountedRef.current) return;
      setError(err instanceof Error ? err.message : String(err));
      setLimitsState(DEFAULT_LIMITS);
    }
    setLoading(false);
  }, []);

  const setLimitsCb = useCallback(
    async (patch: UsageLimitsPatchUI): Promise<boolean> => {
      const api = getUsageApi();
      if (api === null || typeof api.setLimits !== 'function') return false;
      if (mountedRef.current) setError(null);
      try {
        const result = await api.setLimits(patch);
        if (!result.ok) {
          if (mountedRef.current) setError(result.error);
          return false;
        }
        await refresh();
        return true;
      } catch (err) {
        if (mountedRef.current) {
          setError(err instanceof Error ? err.message : String(err));
        }
        return false;
      }
    },
    [refresh]
  );

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return { limits, loading, error, refresh, setLimits: setLimitsCb };
}
