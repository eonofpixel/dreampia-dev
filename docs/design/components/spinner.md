---
title: Components — Spinner
parent: ./_index.md
related:
  - ../states/loading.md
status: draft
last_updated: 2026-05-02
---

# Spinner

> **한 줄 요약**: 로딩 표시. 60fps spin animation.

---

## Sizes

```
[xs]   12px
[sm]   16px  ← 버튼 안
[md]   20px  ← 인라인
[lg]   32px  ← 큰 영역
[xl]   48px  ← 페이지 로딩
```

## Variants

```
[Border]    원형 border + 일부 transparent (회전)
[Dots]      점 3개 (bounce)
```

---

## Visual

```
[Border]
  ⠋ ⠙ ⠹ ⠸ ⠼ ⠴ ⠦ ⠧ ⠇ ⠏  (회전)

  border 2px solid var(--color-accent)
  border-top: transparent
  animation: spin 1s linear infinite
```

---

## 구현

```tsx
const sizeMap = {
  xs: 'w-3 h-3 border',
  sm: 'w-4 h-4 border-2',
  md: 'w-5 h-5 border-2',
  lg: 'w-8 h-8 border-2',
  xl: 'w-12 h-12 border-4',
};

export function Spinner({ size = 'sm', className }) {
  return (
    <div
      role="status"
      aria-label="로딩 중"
      className={cn(
        sizeMap[size],
        'rounded-full border-accent border-t-transparent',
        'animate-spin',
        className
      )}
    >
      <span className="sr-only">로딩 중</span>
    </div>
  );
}
```

```css
@keyframes spin {
  to { transform: rotate(360deg); }
}

.animate-spin {
  animation: spin 1s linear infinite;
}
```

---

## Dots variant

```tsx
export function DotsSpinner() {
  return (
    <div role="status" className="flex gap-1">
      <div className="w-2 h-2 bg-accent rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
      <div className="w-2 h-2 bg-accent rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
      <div className="w-2 h-2 bg-accent rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
    </div>
  );
}
```

---

## 사용 예시

```tsx
// Button 안
<Button loading>저장</Button>  // 자동으로 Spinner

// 인라인
<div className="flex items-center gap-2">
  <Spinner size="sm" />
  <span>분석 중...</span>
</div>

// 페이지 전체
<div className="flex items-center justify-center h-screen">
  <Spinner size="xl" />
</div>
```

---

## Reduced motion

```css
@media (prefers-reduced-motion: reduce) {
  .animate-spin {
    animation: pulse 1.5s ease-in-out infinite;  /* spin 대신 pulse */
  }
}
```

---

## 관련

- [../states/loading.md](../states/loading.md) — Loading 상태
- [progress.md](./progress.md) — Progress bar
