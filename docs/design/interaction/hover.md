---
title: Interaction — Hover
parent: ../_index.md
related:
  - ../tokens/motion.md
  - ../components/tooltip.md
status: draft
last_updated: 2026-05-02
---

# Hover Patterns

> **한 줄 요약**: 100ms 이내 응답. 색 변화 + 옵션 인디케이션.

---

## 기본 hover 효과

```css
/* Button */
button:hover {
  background: var(--color-accent-hover);    /* 더 진한 색 */
  transition: background 100ms ease-out;
}

/* Card (interactive) */
.card-interactive:hover {
  box-shadow: var(--shadow-base);
  transition: box-shadow 100ms ease-out;
}

/* Link */
a:hover {
  color: var(--color-text-link-hover);
  text-decoration: underline;
}
```

---

## Hover 강도

```
[Subtle]    배경 약간 변화 (8% darker/lighter)
[Standard]  명확한 변화 (15-20%)  ★
[Strong]    큰 변화 (border, shadow)
```

### 사용 가이드

```
Subtle:    리스트 아이템, 사이드바 항목 (자주 hover)
Standard:  버튼, 카드 (의도적 호버)
Strong:    Highlight 효과 (가장 강조 — 신중)
```

---

## Hover 트리거 패턴

### Group hover (자식 요소)

```tsx
<div className="group">
  <span>제목</span>
  <button className="opacity-0 group-hover:opacity-100 transition-opacity">
    편집
  </button>
</div>
```

→ 메시지의 inline actions (👍 👎 ↪) 가 이 패턴.

### Hover 시 추가 정보

```tsx
<div className="relative group">
  <FileIcon />
  <div className="absolute hidden group-hover:block ...">
    파일 정보
  </div>
</div>

// 또는 Tooltip 컴포넌트 사용 (300ms 지연)
<TooltipTrigger content="파일 정보">
  <FileIcon />
</TooltipTrigger>
```

---

## Hover 가능 여부 표시 (cursor)

```css
/* Clickable */
.clickable { cursor: pointer; }

/* Disabled */
.disabled { cursor: not-allowed; }

/* Drag */
.draggable { cursor: grab; }
.draggable:active { cursor: grabbing; }

/* Resize */
.resize-x { cursor: ew-resize; }
.resize-y { cursor: ns-resize; }
```

---

## 인접 요소 영향 (CSS sibling)

```css
/* Card hover 시 옆 카드도 약간 영향 */
.card:hover ~ .card {
  opacity: 0.7;
}

/* 지나치면 노이즈. 자주 사용 X */
```

---

## Touch / 터치 환경

```
모바일 / 터치:
  - hover 없음 (long-press 가 가까움)
  - 우리 = 데스크톱 only → 큰 이슈 X
  
주의:
  hover 의 critical 정보 X (touch 사용자 못 봄)
  → 정보는 항상 표시 + hover 는 강조만
```

---

## Hover 지연

```
즉시 (0ms):     색 변화, 배경 변화
짧은 지연:      Tooltip (300ms)
긴 지연:        Auto-show details (500ms+)
```

→ 너무 빨라서 trigger 잘못 X, 너무 느려서 답답 X.

---

## Reduced motion

```css
@media (prefers-reduced-motion: reduce) {
  *:hover {
    transition: none !important;
  }
}
```

→ 색 변화는 즉시. 애니메이션 X.

---

## Performance

### Hover 트리거 작업 자제

```tsx
// ✗ 나쁨: hover 마다 비용 큰 작업
<div onMouseEnter={() => fetchData()}>

// ✓ 좋음: 첫 hover 시만 fetch + cache
<div onMouseEnter={() => preloadDataOnce()}>

// 더 좋음: prefetch 별도 시점
useEffect(() => prefetch(), []);
```

### Will-change (성급한 최적화 X)

```css
/* 곧 hover 될 element 만 (모든 element X) */
.card-interactive:hover {
  /* will-change 지정 안 해도 충분 */
}
```

---

## 안티 패턴

```
✗ Hover 만으로 모든 정보 표시 (touch 사용자 못 봄)
✗ Hover 시 너무 큰 변화 (사용자 놀람)
✗ Hover 트리거 작업 (매번 fetch)
✗ Hover 지연 X (실수로 trigger)
```

---

## 관련

- [click.md](./click.md) — Click 패턴
- [../tokens/motion.md](../tokens/motion.md) — 100ms duration
- [../components/tooltip.md](../components/tooltip.md) — Hover tooltip
