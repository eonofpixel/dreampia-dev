---
title: Components — Progress Bar
parent: ./_index.md
related:
  - spinner.md
  - ../tokens/colors.md
status: draft
last_updated: 2026-05-02
---

# Progress

> **한 줄 요약**: 진행률 표시. determinate (값 있음) + indeterminate (값 모름).

---

## Variants

```
[Linear-determinate]   가로 막대 (0-100%)
[Linear-indeterminate] 가로 막대 (애니메이션, 진행 모름)
[Circular-determinate] 원형 (작은 영역)
[Circular-indeterminate] 원형 spinner 같은
[Multi]                여러 단계 (e.g., 5/10)
```

## Sizes

```
[sm]   2px height
[md]   4px height  ★
[lg]   8px height
```

---

## Visual

```
[Linear determinate]
━━━━━━━━━━━━━━━━━━━━━━━━━━ 65%
████████████████░░░░░░░░░░  ← 65% filled

[Linear indeterminate]
━━━━━━━━━━━━━━━━━━━━━━━━━━
░░░░████████░░░░░░░░░░░░░░  ← 애니메이션 좌우 이동

[Circular]
   ╭─────╮
  ╱       ╲
 │   65%   │
  ╲       ╱
   ╰─────╯
```

---

## 구현

```tsx
import * as Progress from '@radix-ui/react-progress';

export function ProgressBar({ value, indeterminate, size = 'md' }) {
  return (
    <Progress.Root
      value={indeterminate ? null : value}
      max={100}
      className={cn(
        'relative w-full overflow-hidden rounded-full bg-bg-tertiary',
        SIZE_MAP[size]
      )}
    >
      <Progress.Indicator
        className={cn(
          'h-full bg-accent transition-transform duration-200',
          indeterminate && 'animate-progress-indeterminate'
        )}
        style={{ 
          transform: !indeterminate ? `translateX(-${100 - value}%)` : undefined,
        }}
      />
    </Progress.Root>
  );
}

const SIZE_MAP = {
  sm: 'h-0.5',     // 2px
  md: 'h-1',       // 4px
  lg: 'h-2',       // 8px
};
```

```css
@keyframes progress-indeterminate {
  0% { transform: translateX(-100%); }
  100% { transform: translateX(100%); }
}

.animate-progress-indeterminate {
  animation: progress-indeterminate 1.5s cubic-bezier(0.4, 0, 0.2, 1) infinite;
}
```

---

## Circular Progress

```tsx
export function CircularProgress({ value, size = 40, strokeWidth = 4 }) {
  const radius = (size - strokeWidth) / 2;
  const circumference = radius * 2 * Math.PI;
  const offset = circumference - (value / 100) * circumference;
  
  return (
    <div className="relative inline-flex" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        {/* 배경 */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="var(--color-bg-tertiary)"
          strokeWidth={strokeWidth}
        />
        {/* 진행 */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="var(--color-accent)"
          strokeWidth={strokeWidth}
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          strokeLinecap="round"
          className="transition-all duration-200"
        />
      </svg>
      
      {/* 가운데 텍스트 */}
      <span className="absolute inset-0 flex items-center justify-center text-xs font-medium">
        {Math.round(value)}%
      </span>
    </div>
  );
}
```

---

## 사용 예시

### Determinate (확실한 진행)

```tsx
// 파일 다운로드
<ProgressBar value={downloadedBytes / totalBytes * 100} />

// Multi-step
<MultiStepProgress current={3} total={5} />
```

### Indeterminate (모름)

```tsx
// AI 응답 대기
<ProgressBar indeterminate />

// 또는 spinner
<Spinner />
```

### Background job (F-038)

```tsx
function BackgroundJobItem({ job }) {
  return (
    <div className="p-3 border rounded">
      <div className="flex items-center gap-2 mb-2">
        <Spinner size="sm" />
        <span className="font-medium">{job.title}</span>
      </div>
      
      {job.progress ? (
        <ProgressBar value={job.progress.current / job.progress.total * 100} />
      ) : (
        <ProgressBar indeterminate />
      )}
      
      <div className="text-xs text-text-tertiary mt-1">
        {job.progress?.message ?? '진행 중...'}
      </div>
    </div>
  );
}
```

---

## /status 사용량 (F-020)

```tsx
function UsageProgress({ used, total, label }) {
  const percent = (used / total) * 100;
  const color = percent > 90 ? 'danger' : percent > 70 ? 'warning' : 'accent';
  
  return (
    <div className="space-y-1">
      <div className="flex justify-between text-sm">
        <span>{label}</span>
        <span className="text-text-secondary">
          {percent.toFixed(0)}% 남음
        </span>
      </div>
      <ProgressBar value={percent} variant={color} />
    </div>
  );
}

<UsageProgress used={72725} total={258000} label="컨텍스트" />
```

---

## Accessibility

```
✓ role="progressbar"
✓ aria-valuenow={value}
✓ aria-valuemin={0}
✓ aria-valuemax={100}
✓ aria-label / aria-labelledby
✓ Indeterminate: aria-valuenow 생략
```

---

## 관련

- [spinner.md](./spinner.md) — Spinner (indeterminate 작은)
- [../tokens/colors.md](../tokens/colors.md) — 진행 색
