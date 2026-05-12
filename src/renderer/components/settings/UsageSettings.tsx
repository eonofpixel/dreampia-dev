/**
 * UsageSettings — v0.4.0 token / cost tracking 모달.
 *
 * Spec: ROADMAP.md (v0.4.0 Usage/Cost Tracking MVP)
 *
 * UI:
 *  - Header: "사용량 / 비용"
 *  - Preset 탭: 오늘 / 7일 / 30일 (라디오 그룹)
 *  - Section 1: provider 별 합계 (model 분리)
 *  - Section 2: 일별 추이 (날짜 / provider / 토큰 / 비용)
 *  - Footer: 새로고침 + 마지막 갱신 시각
 *
 * 한국어 우선, 비용은 USD 4자리 소수까지 (Intl.NumberFormat). v0.4.0 에선
 * 차트 / CSV export 없이 표만 — 추가는 v0.5.0+.
 *
 * v0.8.0 — `UsageSettingsPanel` 도 함께 export. SettingsModal '사용량' 탭이
 * 자체 header 없이 panel 만 mount 한다.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { X, RefreshCw, AlertCircle, BarChart3, Download, ShieldAlert } from 'lucide-react';
import {
  useUsage,
  useUsageLimits,
  type DailyUsageRowUI,
  type UsageProviderUI,
  type UsageRangePreset,
  type UsageSummaryUI,
} from '../../hooks/useUsage';
import { UsageChart } from './UsageChart';
import { useT } from '../../i18n';
import { MODEL_PRICING_LAST_UPDATED } from '@/providers';

export interface UsageSettingsProps {
  open: boolean;
  onClose: () => void;
}

const PROVIDER_LABELS: Record<UsageProviderUI, string> = {
  claude: 'Claude',
  codex: 'Codex',
  mock: 'Mock',
};

const PROVIDER_BADGE_COLORS: Record<UsageProviderUI, string> = {
  claude: 'bg-orange-500/20 text-orange-300',
  codex: 'bg-emerald-500/20 text-emerald-300',
  mock: 'bg-gray-500/20 text-gray-300',
};

/**
 * v0.11.0 — preset 라벨은 i18n key 로 변환. UI 가 useT 로 resolve.
 */
const PRESET_LABEL_KEYS: Record<UsageRangePreset, string> = {
  today: 'usage.today',
  '7d': 'usage.7days',
  '30d': 'usage.30days',
};

const PRESETS: readonly UsageRangePreset[] = ['today', '7d', '30d'];

// USD 4자리 소수까지 표시. cost 가 0.0001 미만이라도 0.0000 으로 보이지 않게
// 0 인 케이스만 별도로 "$0.00" 으로 표시.
const usdFormatter = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  minimumFractionDigits: 2,
  maximumFractionDigits: 4,
});

const tokenFormatter = new Intl.NumberFormat('ko-KR');

function formatCost(cost: number): string {
  if (cost === 0) return '$0.00';
  if (cost < 0.0001) return '< $0.0001';
  return usdFormatter.format(cost);
}

function formatTokens(n: number): string {
  return tokenFormatter.format(Math.max(0, Math.floor(n)));
}

function formatRefreshTime(t: ReturnType<typeof useT>, ts: number | null): string {
  if (ts === null) return t('usage.refresh_time.never');
  const seconds = Math.floor((Date.now() - ts) / 1000);
  if (seconds < 5) return t('usage.refresh_time.now');
  if (seconds < 60) return t('usage.refresh_time.seconds', { n: seconds });
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return t('usage.refresh_time.minutes', { n: minutes });
  const hours = Math.floor(minutes / 60);
  return t('usage.refresh_time.hours', { n: hours });
}

export function UsageSettings({ open, onClose }: UsageSettingsProps): React.JSX.Element | null {
  const t = useT();
  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
      role="dialog"
      aria-modal="true"
      aria-label={t('usage.modal_aria')}
    >
      <div className="flex max-h-[90vh] w-[860px] max-w-[95vw] flex-col rounded-lg border border-hairline bg-canvas shadow-xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-hairline p-4">
          <div className="flex items-center gap-2">
            <BarChart3 className="h-5 w-5 text-text-secondary" />
            <div>
              <h2 className="text-lg font-semibold">{t('usage.title')}</h2>
              <p className="text-xs text-text-secondary">{t('usage.subtitle')}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="rounded-md p-2 hover:bg-surface-strong"
            aria-label={t('usage.close')}
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <UsageSettingsPanel />
      </div>
    </div>
  );
}

/**
 * v0.8.0 — SettingsModal 의 '사용량' 탭 안에 mount 되는 body. 자체 header /
 * close 버튼은 가지지 않는다 (탭 sidebar 가 navigation 을 owner). 기존
 * UsageSettings 모달 caller / e2e 회귀 0.
 *
 * v0.9.0 — CSV 내보내기 + 일별 chart + 비용 한도 / 임계 알림 추가.
 */
export function UsageSettingsPanel(): React.JSX.Element {
  const t = useT();
  const { summary, daily, loading, error, lastRefreshedAt, preset, setPreset, refresh, exportCsv } =
    useUsage('7d');

  const handleRefresh = useCallback((): void => {
    void refresh();
  }, [refresh]);

  // v0.9.0 — CSV 다운로드. Blob + <a download> 를 동적으로 생성해 트리거.
  // IPC 미지원 환경 (preload 누락 / 테스트) 에선 silently no-op.
  const handleExportCsv = useCallback(async (): Promise<void> => {
    const csv = await exportCsv();
    if (csv === null) return;
    const range = preset === 'today' ? 'today' : preset;
    const today = new Date().toISOString().slice(0, 10);
    const filename = `dreampia-usage-${range}-${today}.csv`;
    // 안전: BOM 추가해 Excel 한국어 호환 (UTF-8 BOM EF BB BF).
    const blob = new Blob(['﻿', csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    try {
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      a.style.display = 'none';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    } finally {
      // setTimeout 으로 revoke — Firefox 가 click 직후 revoke 하면 download
      // 실패 사례 보고가 있어 macroTask 다음 frame 에 정리.
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    }
  }, [exportCsv, preset]);

  const totalCost = summary.reduce((acc, row) => acc + row.total_cost_usd, 0);
  const totalEvents = summary.reduce((acc, row) => acc + row.event_count, 0);

  return (
    <>
      {/* v1.0.12 (COST-1): 가격표 stale 경고 — 사용자가 비용이 부정확할 수
          있음을 인지하도록. 30일 이하 = 미표시, 30~90일 = 회색 hint, 90일+ =
          노란색 경고. */}
      <PricingFreshnessBanner />
      {/* Preset tabs */}
      <div
        role="radiogroup"
        aria-label={t('usage.cost_limit')}
        className="flex items-center gap-1 border-b border-hairline p-2"
      >
        {PRESETS.map((p) => (
          <button
            key={p}
            role="radio"
            aria-checked={preset === p}
            data-active={preset === p}
            onClick={() => {
              setPreset(p);
            }}
            className="rounded-md px-3 py-1.5 text-sm hover:bg-surface-strong data-[active=true]:bg-surface-strong data-[active=true]:font-medium"
          >
            {t(PRESET_LABEL_KEYS[p])}
          </button>
        ))}
        {/* v0.9.0 — CSV export. preset 의 range 그대로 export. */}
        <div className="ml-auto">
          <button
            type="button"
            onClick={() => {
              void handleExportCsv();
            }}
            className="flex items-center gap-1.5 rounded-md border border-hairline bg-surface-card px-2.5 py-1 text-xs hover:bg-surface-strong"
            data-testid="usage-export-csv"
            aria-label={t('usage.export_csv')}
          >
            <Download className="h-3 w-3" />
            {t('usage.export_csv')}
          </button>
        </div>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto p-4">
        {error !== null && (
          <div className="mb-3 flex items-start gap-2 rounded-md border border-semantic-danger/40 bg-semantic-danger/10 p-3 text-sm text-semantic-danger">
            <AlertCircle className="mt-0.5 h-4 w-4 flex-shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {/* v0.9.0 — 비용 한도 / 임계 알림. summary 데이터 없어도 표시 (한도 설정 가능). */}
        <CostLimitSection currentMonthCost={getCurrentMonthCost(summary)} />

        {loading ? (
          <p className="text-sm text-text-secondary">{t('usage.loading')}</p>
        ) : summary.length === 0 && daily.length === 0 ? (
          <div className="py-12 text-center text-sm text-text-secondary">{t('usage.empty')}</div>
        ) : (
          <>
            {/* Total card */}
            <section
              aria-label={t('usage.range_total_aria')}
              className="mb-4 grid grid-cols-2 gap-2 rounded-md border border-hairline bg-canvas-soft p-3 text-sm"
            >
              <div>
                <div className="text-xs text-text-tertiary">{t(PRESET_LABEL_KEYS[preset])}</div>
                <div className="mt-0.5 text-base font-semibold">{formatCost(totalCost)}</div>
              </div>
              <div>
                <div className="text-xs text-text-tertiary">{t('usage.events_label')}</div>
                <div className="mt-0.5 text-base font-semibold">
                  {t('usage.events_count', { n: totalEvents })}
                </div>
              </div>
            </section>

            {/* v0.9.0 — 일별 chart (토큰 stacked bar) */}
            {daily.length > 0 && (
              <section className="mb-4">
                <SectionHeader>{t('usage.daily_chart_title')}</SectionHeader>
                <div className="rounded-md border border-hairline bg-canvas-soft p-3 text-text-secondary">
                  <UsageChart data={daily} metric="tokens" maxDays={30} />
                </div>
              </section>
            )}

            <SummarySection rows={summary} />
            <DailySection rows={daily} />
          </>
        )}
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between border-t border-hairline p-3">
        <span className="text-xs text-text-tertiary">
          {t('usage.last_refresh', { when: formatRefreshTime(t, lastRefreshedAt) })}
        </span>
        <button
          onClick={handleRefresh}
          className="flex items-center gap-2 rounded-md px-3 py-1.5 text-sm hover:bg-surface-strong"
        >
          <RefreshCw className="h-3.5 w-3.5" />
          {t('usage.refresh')}
        </button>
      </div>
    </>
  );
}

// ────────────────────────────────────────────────────────────
// 비용 한도 / 임계 알림 (v0.9.0)
// ────────────────────────────────────────────────────────────

/**
 * 현재 달 (UTC 기준 1일~) 의 총 비용을 summary 에서 추출.
 * useUsage 의 summary 는 preset 의 range 안의 row 만 가지므로 정확한 월 합계
 * 가 아닐 수 있음 — 'today' / '7d' 가 month 의 일부만 포함. 실제 정확한 월
 * 합계는 별도 IPC 가 필요하지만 v0.9.0 MVP 는 preset 합계 기준 (UI 명시).
 */
function getCurrentMonthCost(summary: ReadonlyArray<UsageSummaryUI>): number {
  return summary.reduce((acc, row) => acc + row.total_cost_usd, 0);
}

interface CostLimitSectionProps {
  currentMonthCost: number;
}

const THRESHOLD_OPTIONS = [
  { value: 0.5, label: '50%' },
  { value: 0.8, label: '80%' },
  { value: 0.9, label: '90%' },
];

function CostLimitSection({ currentMonthCost }: CostLimitSectionProps): React.JSX.Element {
  const t = useT();
  const { limits, loading, setLimits } = useUsageLimits();
  const [draftLimit, setDraftLimit] = useState<string>('');

  // limits 가 로딩되면 input 의 default 값을 채움.
  useEffect(() => {
    if (limits === null) return;
    setDraftLimit(limits.cost_limit_usd !== undefined ? String(limits.cost_limit_usd) : '');
  }, [limits]);

  const threshold = limits?.alert_threshold ?? 0.8;
  const limitUsd = limits?.cost_limit_usd;

  const handleSaveLimit = useCallback((): void => {
    const trimmed = draftLimit.trim();
    if (trimmed.length === 0) {
      // 빈 입력 → 한도 제거
      void setLimits({ cost_limit_usd: null });
      return;
    }
    const parsed = Number(trimmed);
    if (!Number.isFinite(parsed) || parsed < 0) return;
    void setLimits({ cost_limit_usd: parsed });
  }, [draftLimit, setLimits]);

  const handleThresholdChange = useCallback(
    (value: number): void => {
      void setLimits({ alert_threshold: value });
    },
    [setLimits]
  );

  // 상태 계산 — '미설정' / '안전' / '경고' / '한도 초과'.
  // v0.11.0 — 라벨 i18n. 비율 표기는 같은 fmt 유지 (한국어 "{n}% 사용" 의 한
  // 글자만 바꿔 영어용으로 합칠 수 있도록 단순 base label + 비율 함께 표시).
  const status = useMemo(() => {
    if (limitUsd === undefined) {
      return {
        kind: 'unset' as const,
        label: t('usage.cost_limit.unset'),
        color: 'text-text-tertiary',
      };
    }
    if (limitUsd === 0) {
      return {
        kind: 'over' as const,
        label: t('usage.cost_limit.exceeded'),
        color: 'text-semantic-danger',
      };
    }
    const ratio = currentMonthCost / limitUsd;
    const pct = `${(ratio * 100).toFixed(0)}%`;
    if (ratio >= 1) {
      return {
        kind: 'over' as const,
        label: `${t('usage.cost_limit.exceeded')} (${pct})`,
        color: 'text-semantic-danger',
      };
    }
    if (ratio >= threshold) {
      return {
        kind: 'warn' as const,
        label: `${t('usage.cost_limit.warning')} (${pct})`,
        color: 'text-yellow-400',
      };
    }
    return {
      kind: 'safe' as const,
      label: `${t('usage.cost_limit.safe')} (${pct} / ${formatCost(limitUsd)})`,
      color: 'text-green-400',
    };
  }, [limitUsd, currentMonthCost, threshold, t]);

  return (
    <section
      className="mb-4 rounded-md border border-hairline bg-canvas-soft p-3"
      data-testid="cost-limit-section"
    >
      <header className="mb-2 flex items-center gap-2">
        <ShieldAlert className="h-4 w-4 text-text-secondary" aria-hidden="true" />
        <h3 className="text-xs font-semibold uppercase tracking-wide text-text-tertiary">
          {t('usage.cost_limit')}
        </h3>
        <span
          className={`ml-auto text-xs font-medium ${status.color}`}
          data-testid="cost-limit-status"
        >
          {status.label}
        </span>
      </header>

      {loading ? (
        <p className="text-xs text-text-tertiary">{t('usage.loading')}</p>
      ) : (
        <div className="space-y-2 text-xs">
          {/* 한도 입력 */}
          <div className="flex items-center gap-2">
            <label className="flex flex-1 items-center gap-2" data-testid="cost-limit-input-label">
              <span className="w-20 text-text-tertiary">{t('usage.cost_limit.input_label')}</span>
              <input
                type="number"
                step="0.01"
                min="0"
                value={draftLimit}
                onChange={(e) => {
                  setDraftLimit(e.target.value);
                }}
                placeholder={t('usage.cost_limit.input_placeholder')}
                className="flex-1 rounded-md border border-hairline bg-surface-card px-2 py-1 text-sm font-mono"
                data-testid="cost-limit-input"
              />
            </label>
            <button
              type="button"
              onClick={handleSaveLimit}
              className="rounded-md border border-hairline bg-surface-card px-2 py-1 hover:bg-surface-strong"
              data-testid="cost-limit-save"
            >
              {t('usage.cost_limit.save')}
            </button>
          </div>

          {/* 임계 옵션 */}
          <div className="flex items-center gap-2">
            <span className="w-20 text-text-tertiary">{t('usage.cost_limit.threshold_label')}</span>
            <div
              role="radiogroup"
              aria-label={t('usage.cost_limit.threshold_aria')}
              className="flex gap-1"
            >
              {THRESHOLD_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  role="radio"
                  aria-checked={threshold === opt.value}
                  data-active={threshold === opt.value}
                  data-testid={`cost-limit-threshold-${opt.value}`}
                  onClick={() => handleThresholdChange(opt.value)}
                  className="rounded-md px-2.5 py-0.5 hover:bg-surface-strong data-[active=true]:bg-surface-strong data-[active=true]:font-medium"
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          <p className="text-[10px] text-text-tertiary">{t('usage.cost_limit.month_note')}</p>
        </div>
      )}
    </section>
  );
}

// ────────────────────────────────────────────────────────────
// Summary section — provider/model 별 합계 표
// ────────────────────────────────────────────────────────────

interface SummarySectionProps {
  rows: UsageSummaryUI[];
}

function SummarySection({ rows }: SummarySectionProps): React.JSX.Element {
  const t = useT();
  if (rows.length === 0) {
    return (
      <section className="mb-4">
        <SectionHeader>{t('usage.summary.title')}</SectionHeader>
        <p className="rounded-md border border-hairline bg-canvas-soft p-3 text-xs text-text-tertiary">
          {t('usage.summary.empty')}
        </p>
      </section>
    );
  }

  return (
    <section className="mb-4">
      <SectionHeader>{t('usage.summary.title')}</SectionHeader>
      <div className="overflow-hidden rounded-md border border-hairline">
        <table className="w-full text-sm">
          <thead className="bg-canvas-soft text-left text-xs text-text-tertiary">
            <tr>
              <th className="p-2 font-medium">{t('usage.summary.col.provider')}</th>
              <th className="p-2 font-medium">{t('usage.summary.col.model')}</th>
              <th className="p-2 text-right font-medium">{t('usage.summary.col.input')}</th>
              <th className="p-2 text-right font-medium">{t('usage.summary.col.output')}</th>
              <th className="p-2 text-right font-medium">{t('usage.summary.col.cache')}</th>
              <th className="p-2 text-right font-medium">{t('usage.summary.col.cost')}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const cacheTotal =
                row.total_cache_creation + row.total_cache_read + row.total_reasoning;
              return (
                <tr key={`${row.provider}/${row.model}`} className="border-t border-hairline">
                  <td className="p-2">
                    <span
                      className={`inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-xs ${PROVIDER_BADGE_COLORS[row.provider]}`}
                    >
                      {PROVIDER_LABELS[row.provider]}
                    </span>
                  </td>
                  <td className="p-2 font-mono text-xs">{row.model}</td>
                  <td className="p-2 text-right">{formatTokens(row.total_input)}</td>
                  <td className="p-2 text-right">{formatTokens(row.total_output)}</td>
                  <td className="p-2 text-right text-text-secondary">
                    {cacheTotal > 0 ? formatTokens(cacheTotal) : '-'}
                  </td>
                  <td className="p-2 text-right font-medium">{formatCost(row.total_cost_usd)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}

// ────────────────────────────────────────────────────────────
// Daily section — 일별 추이 표
// ────────────────────────────────────────────────────────────

interface DailySectionProps {
  rows: DailyUsageRowUI[];
}

function DailySection({ rows }: DailySectionProps): React.JSX.Element {
  const t = useT();
  if (rows.length === 0) {
    return (
      <section>
        <SectionHeader>{t('usage.daily.title')}</SectionHeader>
        <p className="rounded-md border border-hairline bg-canvas-soft p-3 text-xs text-text-tertiary">
          {t('usage.daily.empty')}
        </p>
      </section>
    );
  }

  return (
    <section>
      <SectionHeader>{t('usage.daily.title')}</SectionHeader>
      <div className="overflow-hidden rounded-md border border-hairline">
        <table className="w-full text-sm">
          <thead className="bg-canvas-soft text-left text-xs text-text-tertiary">
            <tr>
              <th className="p-2 font-medium">{t('usage.daily.col.date')}</th>
              <th className="p-2 font-medium">{t('usage.daily.col.provider')}</th>
              <th className="p-2 text-right font-medium">{t('usage.daily.col.tokens')}</th>
              <th className="p-2 text-right font-medium">{t('usage.daily.col.cost')}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, idx) => (
              <tr
                key={`${row.date}/${row.provider}/${idx}`}
                className="border-t border-hairline"
              >
                <td className="p-2 font-mono text-xs">{row.date}</td>
                <td className="p-2">
                  <span
                    className={`inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-xs ${PROVIDER_BADGE_COLORS[row.provider]}`}
                  >
                    {PROVIDER_LABELS[row.provider]}
                  </span>
                </td>
                <td className="p-2 text-right">{formatTokens(row.total_tokens)}</td>
                <td className="p-2 text-right font-medium">{formatCost(row.total_cost_usd)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

// ────────────────────────────────────────────────────────────
// Helpers
// ────────────────────────────────────────────────────────────

function SectionHeader({ children }: { children: React.ReactNode }): React.JSX.Element {
  return (
    <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-text-tertiary">
      {children}
    </h3>
  );
}

// ────────────────────────────────────────────────────────────
// v1.0.12 (COST-1): pricing freshness banner
//
// MODEL_PRICING_LAST_UPDATED 와 현재 시각 비교 후 경고 띄움.
// - 0~29일: 미표시 (충분히 fresh).
// - 30~89일: 회색 정보 hint.
// - 90일+: 노란색 경고 ("가격 정보가 오래되어 비용 추정이 부정확할 수 있어요").
// ────────────────────────────────────────────────────────────

function PricingFreshnessBanner(): React.JSX.Element | null {
  const t = useT();
  const lastUpdated = MODEL_PRICING_LAST_UPDATED;
  const ageDays = computeAgeDays(lastUpdated);

  if (ageDays < 30) return null;

  const stale = ageDays >= 90;
  const tone = stale
    ? 'border-yellow-700/40 bg-yellow-900/20 text-yellow-300'
    : 'border-hairline bg-canvas-soft text-text-secondary';

  return (
    <div
      className={`mx-2 mt-2 rounded-md border ${tone} p-2 text-xs`}
      data-testid="usage-pricing-freshness"
      data-stale={stale ? 'true' : 'false'}
      role={stale ? 'status' : undefined}
    >
      <p>
        {t('usage.pricing_freshness.label', {
          date: lastUpdated,
          days: String(ageDays),
        })}
      </p>
      {stale && (
        <p className="mt-0.5 text-yellow-300/80">{t('usage.pricing_freshness.stale_hint')}</p>
      )}
    </div>
  );
}

function computeAgeDays(isoDate: string): number {
  const parsed = Date.parse(`${isoDate}T00:00:00.000Z`);
  if (!Number.isFinite(parsed)) return 0;
  const diff = Date.now() - parsed;
  return Math.max(0, Math.floor(diff / (24 * 60 * 60 * 1000)));
}
