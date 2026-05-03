/**
 * UsageChart — v0.9.0 일별 사용량 stacked bar chart.
 *
 * 의존성 0: recharts 같은 외부 차트 라이브러리 대신 plain SVG.
 * - 번들 크기: ~50KB → 0KB
 * - 테스트: jsdom 에서 svg 직접 확인 가능 (recharts 는 ResizeObserver mock 필요)
 * - 접근성: <title>, role="img" 로 screen reader 친화
 *
 * 입력: DailyUsageRowUI[] (date 'YYYY-MM-DD' + provider + total_tokens / cost)
 * 출력: stacked bar (provider 별 색 분기) + 날짜 x축 + 토큰 y축.
 *
 * 한국어 axis label, 'ko-KR' Intl 포매터로 큰 숫자 압축 (1.2K).
 *
 * Spec: ROADMAP.md (v0.9.0 F — Usage 보강)
 */

import type { DailyUsageRowUI, UsageProviderUI } from '../../hooks/useUsage';

export interface UsageChartProps {
  /** useUsage().daily 결과를 그대로. 빈 배열일 시 placeholder 표시. */
  data: ReadonlyArray<DailyUsageRowUI>;
  /**
   * 'tokens' (default) — y 축에 토큰 합계.
   * 'cost'             — y 축에 비용 (USD).
   */
  metric?: 'tokens' | 'cost';
  /** 표시할 max 일수. 너무 많은 막대는 가독성 저하 — 30 이상이면 truncate. */
  maxDays?: number;
}

// Provider 색상 — 기존 UsageSettings 의 badge 와 시각적으로 sync.
// HEX 직접 지정 (tailwind 클래스 X) — SVG fill 에 직접 사용.
const PROVIDER_COLORS: Record<UsageProviderUI, string> = {
  claude: '#fb923c', // orange-400
  codex: '#34d399', // emerald-400
  mock: '#9ca3af', // gray-400
};

const PROVIDER_LABELS: Record<UsageProviderUI, string> = {
  claude: 'Claude',
  codex: 'Codex',
  mock: 'Mock',
};

interface DayBucket {
  date: string;
  byProvider: Record<UsageProviderUI, number>;
  total: number;
}

/**
 * raw rows → 일자 → provider 합계로 reshape. 같은 날짜의 다른 provider 들이
 * 한 막대 안에 stacked 로 그려진다.
 */
function bucketize(
  rows: ReadonlyArray<DailyUsageRowUI>,
  metric: 'tokens' | 'cost'
): DayBucket[] {
  const map = new Map<string, DayBucket>();
  for (const r of rows) {
    let bucket = map.get(r.date);
    if (bucket === undefined) {
      bucket = {
        date: r.date,
        byProvider: { claude: 0, codex: 0, mock: 0 },
        total: 0,
      };
      map.set(r.date, bucket);
    }
    const value = metric === 'tokens' ? r.total_tokens : r.total_cost_usd;
    bucket.byProvider[r.provider] += value;
    bucket.total += value;
  }
  // 날짜 ASC 로 정렬 — 차트는 왼쪽이 오래된 날짜.
  return Array.from(map.values()).sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
}

/** ko-KR 짧은 날짜 포맷: 'YYYY-MM-DD' → 'M/D' (사용자에게 더 읽기 쉽게). */
function formatTickDate(date: string): string {
  const parts = date.split('-');
  if (parts.length !== 3) return date;
  const m = Number(parts[1]);
  const d = Number(parts[2]);
  if (!Number.isFinite(m) || !Number.isFinite(d)) return date;
  return `${m}/${d}`;
}

/** 큰 숫자 압축: 1500 → '1.5K', 1200000 → '1.2M'. */
function formatTokenTick(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(Math.floor(n));
}

const usdTickFormatter = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  minimumFractionDigits: 0,
  maximumFractionDigits: 2,
});

function formatCostTick(n: number): string {
  if (n === 0) return '$0';
  if (n < 0.01) return '<$0.01';
  return usdTickFormatter.format(n);
}

export function UsageChart({
  data,
  metric = 'tokens',
  maxDays = 30,
}: UsageChartProps): React.JSX.Element {
  const buckets = bucketize(data, metric).slice(-maxDays);

  if (buckets.length === 0) {
    return (
      <div
        role="img"
        aria-label="사용량 차트 (데이터 없음)"
        data-testid="usage-chart-empty"
        className="flex h-32 items-center justify-center rounded-md border border-dashed border-border-primary text-xs text-text-tertiary"
      >
        차트로 표시할 데이터가 없어요.
      </div>
    );
  }

  // SVG viewBox dimensions. 차트 영역은 padding 안쪽.
  const W = 600;
  const H = 200;
  const PAD_TOP = 12;
  const PAD_RIGHT = 16;
  const PAD_BOTTOM = 28; // x-axis tick 영역
  const PAD_LEFT = 48; // y-axis tick 영역
  const chartW = W - PAD_LEFT - PAD_RIGHT;
  const chartH = H - PAD_TOP - PAD_BOTTOM;

  const maxTotal = Math.max(...buckets.map((b) => b.total), 0.0001);
  const barCount = buckets.length;
  // 막대 사이 8% gap.
  const slot = chartW / barCount;
  const barWidth = Math.max(2, slot * 0.7);

  // y-axis ticks — 5개 (0, 25%, 50%, 75%, 100%).
  const yTicks = [0, 0.25, 0.5, 0.75, 1].map((frac) => ({
    frac,
    value: maxTotal * frac,
    y: PAD_TOP + chartH - chartH * frac,
  }));

  // x-axis ticks — 너무 빽빽해지지 않도록 1, ceil(N/8) 간격.
  const xLabelStride = Math.max(1, Math.ceil(barCount / 8));

  const formatTick = metric === 'tokens' ? formatTokenTick : formatCostTick;
  const metricLabel = metric === 'tokens' ? '토큰' : '비용';

  return (
    <div data-testid="usage-chart">
      {/* Legend */}
      <div className="mb-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px] text-text-tertiary">
        {(['claude', 'codex', 'mock'] as const).map((p) => (
          <span key={p} className="inline-flex items-center gap-1" data-testid={`legend-${p}`}>
            <span
              className="inline-block h-2 w-2 rounded-sm"
              style={{ backgroundColor: PROVIDER_COLORS[p] }}
              aria-hidden="true"
            />
            {PROVIDER_LABELS[p]}
          </span>
        ))}
      </div>

      <svg
        viewBox={`0 0 ${W} ${H}`}
        role="img"
        aria-label={`일별 ${metricLabel} 차트`}
        className="h-48 w-full"
        preserveAspectRatio="none"
      >
        <title>{`일별 ${metricLabel} 추이 (${buckets.length}일)`}</title>

        {/* Y-axis grid lines + ticks */}
        {yTicks.map((t, i) => (
          <g key={i} className="text-[9px]">
            <line
              x1={PAD_LEFT}
              y1={t.y}
              x2={W - PAD_RIGHT}
              y2={t.y}
              stroke="currentColor"
              strokeOpacity={0.1}
              strokeDasharray="2 2"
            />
            <text
              x={PAD_LEFT - 4}
              y={t.y + 3}
              textAnchor="end"
              fill="currentColor"
              opacity={0.6}
            >
              {formatTick(t.value)}
            </text>
          </g>
        ))}

        {/* Bars (stacked per provider) */}
        {buckets.map((b, i) => {
          const x = PAD_LEFT + slot * i + (slot - barWidth) / 2;
          let yCursor = PAD_TOP + chartH;
          return (
            <g key={b.date} data-testid={`bar-${b.date}`}>
              {(['claude', 'codex', 'mock'] as const).map((p) => {
                const v = b.byProvider[p];
                if (v <= 0) return null;
                const segH = (v / maxTotal) * chartH;
                yCursor -= segH;
                return (
                  <rect
                    key={p}
                    x={x}
                    y={yCursor}
                    width={barWidth}
                    height={segH}
                    fill={PROVIDER_COLORS[p]}
                  >
                    <title>{`${b.date} · ${PROVIDER_LABELS[p]}: ${formatTick(v)}`}</title>
                  </rect>
                );
              })}
              {/* X-axis tick (interval) */}
              {i % xLabelStride === 0 && (
                <text
                  x={x + barWidth / 2}
                  y={H - PAD_BOTTOM + 14}
                  textAnchor="middle"
                  fill="currentColor"
                  opacity={0.6}
                  className="text-[9px]"
                >
                  {formatTickDate(b.date)}
                </text>
              )}
            </g>
          );
        })}

        {/* Axes */}
        <line
          x1={PAD_LEFT}
          y1={PAD_TOP + chartH}
          x2={W - PAD_RIGHT}
          y2={PAD_TOP + chartH}
          stroke="currentColor"
          strokeOpacity={0.2}
        />
        <line
          x1={PAD_LEFT}
          y1={PAD_TOP}
          x2={PAD_LEFT}
          y2={PAD_TOP + chartH}
          stroke="currentColor"
          strokeOpacity={0.2}
        />
      </svg>
    </div>
  );
}
