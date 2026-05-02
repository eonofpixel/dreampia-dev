---
title: Design Tokens — Motion
parent: ./_index.md
related:
  - ../interaction/animation.md
  - ../a11y/reduced-motion.md
status: draft
last_updated: 2026-05-02
---

# Motion (애니메이션)

> **한 줄 요약**: 빠른 피드백 (P6) + 우아함. 60fps 유지. reduced-motion 존중.

---

## Duration Tokens

```css
--duration-instant:   0ms;       /* 즉시 (state 토글) */
--duration-fast:      100ms;     /* 빠른 (hover, focus) */
--duration-base:      200ms;     /* 일반 (modal, dropdown) */
--duration-slow:      300ms;     /* 느린 (페이지 전환) */
--duration-slower:    500ms;     /* 매우 느린 (강조) */
```

### 가이드

```
Hover effect:        100ms (fast)
Focus ring:           100ms
Button press:         100ms
Tooltip 표시:         150ms
Dropdown 펼침:        200ms (base)
Modal 등장:           200ms
Toast 등장/사라짐:    200ms
패널 collapse:        300ms (slow)
페이지 전환:          300ms
스크롤 (programmatic): 300ms
```

→ **100ms 미만은 너무 빨라 보임 / 300ms 초과는 답답.**

---

## Easing Tokens

```css
/* CSS cubic-bezier */
--easing-linear:       cubic-bezier(0, 0, 1, 1);
--easing-default:      cubic-bezier(0.4, 0, 0.2, 1);   /* Material default */

/* Entrance (등장) */
--easing-out:          cubic-bezier(0, 0, 0.2, 1);     /* 빨리 시작, 천천히 끝 */
--easing-out-quint:    cubic-bezier(0.22, 1, 0.36, 1); /* 더 부드러운 out */

/* Exit (사라짐) */
--easing-in:           cubic-bezier(0.4, 0, 1, 1);     /* 천천히 시작, 빨리 끝 */
--easing-in-quint:     cubic-bezier(0.64, 0, 0.78, 0);

/* Both */
--easing-in-out:       cubic-bezier(0.4, 0, 0.2, 1);
--easing-emphasized:   cubic-bezier(0.2, 0, 0, 1);     /* 강조 (큰 변화) */

/* Bounce (스프링 같은 느낌) */
--easing-back-out:     cubic-bezier(0.34, 1.56, 0.64, 1);
--easing-elastic-out:  cubic-bezier(0.68, -0.55, 0.265, 1.55);
```

### 의미별 사용

```
등장 (entrance):     ease-out          (사용자에게 빨리 보여줌)
사라짐 (exit):       ease-in           (사용자 시선 따라 천천히)
양방향 (bidirectional): ease-in-out
강조:                emphasized        (Material expressive 패턴)
재미:                back-out / elastic (성공 알림 등)
```

---

## 적용 예시

### Modal

```tsx
import { motion } from 'framer-motion';

<motion.div
  initial={{ opacity: 0, scale: 0.95, y: 10 }}
  animate={{ opacity: 1, scale: 1, y: 0 }}
  exit={{ opacity: 0, scale: 0.95, y: 10 }}
  transition={{
    duration: 0.2,
    ease: [0.4, 0, 0.2, 1],   // ease-in-out
  }}
>
  {/* Modal content */}
</motion.div>
```

### Dropdown

```tsx
<motion.div
  initial={{ opacity: 0, y: -8 }}
  animate={{ opacity: 1, y: 0 }}
  exit={{ opacity: 0, y: -8 }}
  transition={{
    duration: 0.15,           // 약간 빠른
    ease: [0, 0, 0.2, 1],     // ease-out
  }}
>
  {/* Dropdown items */}
</motion.div>
```

### Hover

```tsx
<button className="
  transition-colors duration-100 ease-out
  bg-accent hover:bg-accent-hover
">
  버튼
</button>
```

### Page transition

```tsx
<motion.div
  key={location.pathname}
  initial={{ opacity: 0, x: 20 }}
  animate={{ opacity: 1, x: 0 }}
  exit={{ opacity: 0, x: -20 }}
  transition={{
    duration: 0.3,
    ease: [0.22, 1, 0.36, 1],   // out-quint
  }}
>
  {/* Page content */}
</motion.div>
```

---

## Reduced Motion (★ 중요)

```css
/* OS 설정 'reduce motion' 따라가기 */
@media (prefers-reduced-motion: reduce) {
  * {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
  }
  
  /* 단, fade 같은 essential transition 은 유지 (단축) */
  .essential-transition {
    transition-duration: 100ms !important;
  }
}
```

상세: [../a11y/reduced-motion.md](../a11y/reduced-motion.md).

---

## 60fps 유지 가이드

### 안전한 properties (composite-only)

```
✓ transform: translate, scale, rotate
✓ opacity
```

### 위험한 properties (layout / paint)

```
✗ width, height (layout 재계산)
✗ left, top (use transform instead)
✗ box-shadow (paint 비용)
✗ filter: blur (paint 비용)
```

### 권장 패턴

```css
/* ✗ 나쁨 */
.modal {
  transition: top 200ms;
}
.modal.open {
  top: 0;
}

/* ✓ 좋음 */
.modal {
  transition: transform 200ms;
  transform: translateY(-20px);
}
.modal.open {
  transform: translateY(0);
}
```

### will-change (조심해서)

```css
/* 곧 변경될 예정인 element 만 */
.about-to-animate {
  will-change: transform, opacity;
}

/* 애니메이션 끝나면 제거 (메모리 비용) */
```

---

## Stagger (연쇄 등장)

리스트 순차 등장:

```tsx
<motion.ul>
  {items.map((item, i) => (
    <motion.li
      key={item.id}
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{
        duration: 0.2,
        delay: i * 0.05,        // 50ms 씩 지연
        ease: [0, 0, 0.2, 1],
      }}
    >
      {item.text}
    </motion.li>
  ))}
</motion.ul>
```

→ 너무 많이 (10+) 하면 답답함. 5개 이내 권장.

---

## Spring Physics (Framer Motion)

```tsx
<motion.div
  drag
  dragSnapToOrigin
  transition={{
    type: 'spring',
    stiffness: 300,    // 강도 (높을수록 빠름)
    damping: 30,       // 감쇠 (낮을수록 더 흔들림)
  }}
>
  {/* Draggable */}
</motion.div>
```

### 권장 spring

```
부드러움:    stiffness: 200, damping: 25
표준:       stiffness: 300, damping: 30
탄력:       stiffness: 400, damping: 28
```

---

## Loading 패턴

### Skeleton (≠ spinner)

```tsx
<div className="animate-pulse bg-bg-tertiary rounded h-8" />
```

```css
@keyframes pulse {
  0%, 100% { opacity: 0.5; }
  50% { opacity: 0.8; }
}

.animate-pulse {
  animation: pulse 1.5s cubic-bezier(0.4, 0, 0.6, 1) infinite;
}
```

### Spinner

```tsx
<div className="animate-spin h-4 w-4 border-2 border-accent rounded-full border-t-transparent" />
```

```css
@keyframes spin {
  to { transform: rotate(360deg); }
}

.animate-spin {
  animation: spin 1s linear infinite;
}
```

### Progress bar (indeterminate)

```css
@keyframes indeterminate {
  0% { transform: translateX(-100%); }
  100% { transform: translateX(100%); }
}
```

---

## 검증

```typescript
// 60fps 보장: DevTools Performance tab
// CI 에서 Lighthouse 자동 체크

// scripts/check-animations.ts
function check() {
  // 모든 animation/transition CSS 가
  // composite-only properties 만 사용하는지 검증
}
```

---

## 관련

- [../interaction/animation.md](../interaction/animation.md) — 애니메이션 패턴
- [../a11y/reduced-motion.md](../a11y/reduced-motion.md) — 모션 줄이기
- [../../performance/rendering.md](../../performance/rendering.md) — 60fps 보장
