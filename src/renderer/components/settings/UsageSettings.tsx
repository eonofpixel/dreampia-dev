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

import { useCallback } from 'react';
import { X, RefreshCw, AlertCircle, BarChart3 } from 'lucide-react';
import {
  useUsage,
  type DailyUsageRowUI,
  type UsageProviderUI,
  type UsageRangePreset,
  type UsageSummaryUI,
} from '../../hooks/useUsage';

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

const PRESET_LABELS: Record<UsageRangePreset, string> = {
  today: '오늘',
  '7d': '7일',
  '30d': '30일',
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

function formatRefreshTime(ts: number | null): string {
  if (ts === null) return '아직 갱신 전';
  const seconds = Math.floor((Date.now() - ts) / 1000);
  if (seconds < 5) return '방금';
  if (seconds < 60) return `${seconds}초 전`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}분 전`;
  const hours = Math.floor(minutes / 60);
  return `${hours}시간 전`;
}

export function UsageSettings({ open, onClose }: UsageSettingsProps): React.JSX.Element | null {
  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
      role="dialog"
      aria-modal="true"
      aria-label="사용량 설정"
    >
      <div className="flex max-h-[90vh] w-[860px] max-w-[95vw] flex-col rounded-lg border border-border-primary bg-bg-primary shadow-xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border-primary p-4">
          <div className="flex items-center gap-2">
            <BarChart3 className="h-5 w-5 text-text-secondary" />
            <div>
              <h2 className="text-lg font-semibold">사용량 / 비용</h2>
              <p className="text-xs text-text-secondary">
                Provider 별 토큰 사용량과 추정 비용을 확인할 수 있어요.
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="rounded-md p-2 hover:bg-bg-tertiary"
            aria-label="닫기"
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
 */
export function UsageSettingsPanel(): React.JSX.Element {
  const { summary, daily, loading, error, lastRefreshedAt, preset, setPreset, refresh } =
    useUsage('7d');

  const handleRefresh = useCallback((): void => {
    void refresh();
  }, [refresh]);

  const totalCost = summary.reduce((acc, row) => acc + row.total_cost_usd, 0);
  const totalEvents = summary.reduce((acc, row) => acc + row.event_count, 0);

  return (
    <>
      {/* Preset tabs */}
      <div
        role="radiogroup"
        aria-label="기간 선택"
        className="flex gap-1 border-b border-border-primary p-2"
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
            className="rounded-md px-3 py-1.5 text-sm hover:bg-bg-tertiary data-[active=true]:bg-bg-tertiary data-[active=true]:font-medium"
          >
            {PRESET_LABELS[p]}
          </button>
        ))}
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto p-4">
        {error !== null && (
          <div className="mb-3 flex items-start gap-2 rounded-md border border-red-500/40 bg-red-500/10 p-3 text-sm text-red-300">
            <AlertCircle className="mt-0.5 h-4 w-4 flex-shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {loading ? (
          <p className="text-sm text-text-secondary">불러오는 중...</p>
        ) : summary.length === 0 && daily.length === 0 ? (
          <div className="py-12 text-center text-sm text-text-secondary">
            아직 사용 기록이 없어요. 채팅을 시작하면 자동으로 기록됩니다.
          </div>
        ) : (
          <>
            {/* Total card */}
            <section
              aria-label="기간 합계"
              className="mb-4 grid grid-cols-2 gap-2 rounded-md border border-border-primary bg-bg-secondary p-3 text-sm"
            >
              <div>
                <div className="text-xs text-text-tertiary">{PRESET_LABELS[preset]} 합계</div>
                <div className="mt-0.5 text-base font-semibold">{formatCost(totalCost)}</div>
              </div>
              <div>
                <div className="text-xs text-text-tertiary">기록된 이벤트</div>
                <div className="mt-0.5 text-base font-semibold">{totalEvents}건</div>
              </div>
            </section>

            <SummarySection rows={summary} />
            <DailySection rows={daily} />
          </>
        )}
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between border-t border-border-primary p-3">
        <span className="text-xs text-text-tertiary">
          마지막 갱신: {formatRefreshTime(lastRefreshedAt)}
        </span>
        <button
          onClick={handleRefresh}
          className="flex items-center gap-2 rounded-md px-3 py-1.5 text-sm hover:bg-bg-tertiary"
        >
          <RefreshCw className="h-3.5 w-3.5" />
          새로고침
        </button>
      </div>
    </>
  );
}

// ────────────────────────────────────────────────────────────
// Summary section — provider/model 별 합계 표
// ────────────────────────────────────────────────────────────

interface SummarySectionProps {
  rows: UsageSummaryUI[];
}

function SummarySection({ rows }: SummarySectionProps): React.JSX.Element {
  if (rows.length === 0) {
    return (
      <section className="mb-4">
        <SectionHeader>Provider 별 합계</SectionHeader>
        <p className="rounded-md border border-border-primary bg-bg-secondary p-3 text-xs text-text-tertiary">
          이 기간엔 사용 기록이 없어요.
        </p>
      </section>
    );
  }

  return (
    <section className="mb-4">
      <SectionHeader>Provider 별 합계</SectionHeader>
      <div className="overflow-hidden rounded-md border border-border-primary">
        <table className="w-full text-sm">
          <thead className="bg-bg-secondary text-left text-xs text-text-tertiary">
            <tr>
              <th className="p-2 font-medium">Provider</th>
              <th className="p-2 font-medium">Model</th>
              <th className="p-2 text-right font-medium">입력</th>
              <th className="p-2 text-right font-medium">출력</th>
              <th className="p-2 text-right font-medium">캐시</th>
              <th className="p-2 text-right font-medium">비용</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const cacheTotal =
                row.total_cache_creation + row.total_cache_read + row.total_reasoning;
              return (
                <tr
                  key={`${row.provider}/${row.model}`}
                  className="border-t border-border-primary"
                >
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
  if (rows.length === 0) {
    return (
      <section>
        <SectionHeader>일별 추이</SectionHeader>
        <p className="rounded-md border border-border-primary bg-bg-secondary p-3 text-xs text-text-tertiary">
          일별 데이터가 없어요.
        </p>
      </section>
    );
  }

  return (
    <section>
      <SectionHeader>일별 추이</SectionHeader>
      <div className="overflow-hidden rounded-md border border-border-primary">
        <table className="w-full text-sm">
          <thead className="bg-bg-secondary text-left text-xs text-text-tertiary">
            <tr>
              <th className="p-2 font-medium">날짜</th>
              <th className="p-2 font-medium">Provider</th>
              <th className="p-2 text-right font-medium">토큰</th>
              <th className="p-2 text-right font-medium">비용</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, idx) => (
              <tr key={`${row.date}/${row.provider}/${idx}`} className="border-t border-border-primary">
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
