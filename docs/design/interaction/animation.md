---
title: Interaction — Animation Patterns
parent: ../_index.md
related:
  - ../tokens/motion.md
  - ../a11y/reduced-motion.md
status: draft
last_updated: 2026-05-02
---

# Animation Patterns

> **한 줄 요약**: 100-300ms duration. 60fps. composite-only properties.

---

## 패턴 카탈로그

### Fade in/out

```tsx
<motion.div
  initial={{ opacity: 0 }}
  animate={{ opacity: 1 }}
  exit={{ opacity: 0 }}
  transition={{ duration: 0.2 }}
/>
```

**사용**: Modal, dropdown, toast 가장 기본.

---

### Slide

```tsx
// 위에서 아래
<motion.div
  initial={{ opacity: 0, y: -10 }}
  animate={{ opacity: 1, y: 0 }}
  exit={{ opacity: 0, y: -10 }}
  transition={{ duration: 0.2, ease: [0, 0, 0.2, 1] }}  // ease-out
/>

// 아래에서 위 (toast)
initial: { opacity: 0, y: 20 }
animate: { opacity: 1, y: 0 }

// 우측에서
initial: { opacity: 0, x: 20 }
```

---

### Scale (modal, popup)

```tsx
<motion.div
  initial={{ opacity: 0, scale: 0.95 }}
  animate={{ opacity: 1, scale: 1 }}
  exit={{ opacity: 0, scale: 0.95 }}
  transition={{ duration: 0.2 }}
/>
```

---

### Shared layout (FLIP)

리스트 reorder, 페이지 전환 등:

```tsx
import { motion, LayoutGroup } from 'framer-motion';

<LayoutGroup>
  {items.map(item => (
    <motion.div key={item.id} layout transition={{ duration: 0.3 }}>
      {item.content}
    </motion.div>
  ))}
</LayoutGroup>
```

→ Framer Motion 이 자동 FLIP (First Last Invert Play).

---

### Stagger (연쇄)

```tsx
<motion.ul
  initial="hidden"
  animate="visible"
  variants={{
    visible: { transition: { staggerChildren: 0.05 } },
  }}
>
  {items.map(item => (
    <motion.li
      key={item.id}
      variants={{
        hidden: { opacity: 0, y: 10 },
        visible: { opacity: 1, y: 0 },
      }}
    >
      {item.text}
    </motion.li>
  ))}
</motion.ul>
```

→ 5개 미만 권장. 너무 많으면 답답.

---

### Spring (drag, physics)

```tsx
<motion.div
  drag
  dragConstraints={{ left: 0, right: 300 }}
  dragSnapToOrigin
  transition={{
    type: 'spring',
    stiffness: 300,
    damping: 30,
  }}
/>
```

---

### Loading dots

```tsx
function LoadingDots() {
  return (
    <div className="flex gap-1">
      {[0, 1, 2].map(i => (
        <motion.div
          key={i}
          animate={{ y: [0, -4, 0] }}
          transition={{
            duration: 0.6,
            repeat: Infinity,
            delay: i * 0.15,
            ease: 'easeInOut',
          }}
          className="w-2 h-2 bg-accent rounded-full"
        />
      ))}
    </div>
  );
}
```

---

### Streaming cursor

```tsx
function BlinkingCursor() {
  return (
    <motion.span
      animate={{ opacity: [1, 0, 1] }}
      transition={{ duration: 1, repeat: Infinity, times: [0, 0.5, 1] }}
      className="inline-block w-0.5 h-4 bg-accent ml-0.5"
    />
  );
}
```

---

### Pulse (attention)

```tsx
<motion.div
  animate={{ scale: [1, 1.05, 1] }}
  transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
>
  <NotificationDot />
</motion.div>
```

→ 새 알림 강조. 단, 자제 (시각 노이즈).

---

### Page transition

```tsx
import { AnimatePresence } from 'framer-motion';

<AnimatePresence mode="wait">
  <motion.div
    key={location.pathname}
    initial={{ opacity: 0, x: 20 }}
    animate={{ opacity: 1, x: 0 }}
    exit={{ opacity: 0, x: -20 }}
    transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
  >
    {children}
  </motion.div>
</AnimatePresence>
```

---

## 표준 timing (정리)

```
Hover/active:       100ms ease-out
Modal/dropdown:     200ms ease-in-out
Toast slide:        200ms ease-out
Page transition:    300ms ease-out-quint
Stagger delay:      50-100ms 사이
Spring (drag):      stiffness 300, damping 30
```

---

## 안티 패턴

```
✗ 너무 긴 애니메이션 (>500ms)
✗ 너무 짧은 (<100ms — 점프하는 느낌)
✗ Layout properties (width, height — 60fps 안 됨)
✗ 모든 element 에 animate (시각 노이즈)
✗ Reduced motion 무시
```

---

## Performance

```
✓ transform + opacity 만 (composite)
✗ width, height, top, left (layout)
✓ will-change (애니메이션 시작 직전만)
✗ requestAnimationFrame 직접 (Framer Motion 사용)
```

상세: [../../performance/rendering.md](../../performance/rendering.md).

---

## Reduced motion

```css
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation-duration: 0.01ms !important;
    transition-duration: 0.01ms !important;
  }
}
```

상세: [../a11y/reduced-motion.md](../a11y/reduced-motion.md).

---

## 관련

- [../tokens/motion.md](../tokens/motion.md) — Duration / easing
- [../a11y/reduced-motion.md](../a11y/reduced-motion.md)
- [../../performance/rendering.md](../../performance/rendering.md)
