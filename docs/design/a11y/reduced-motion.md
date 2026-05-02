---
title: A11y — Reduced Motion
parent: ./_index.md
related:
  - ../tokens/motion.md
  - ../interaction/animation.md
status: draft
last_updated: 2026-05-02
---

# Reduced Motion

> **한 줄 요약**: OS 의 "모션 줄이기" 설정 존중. 일부 사용자에 필수.

---

## 왜?

```
일부 사용자에게 motion = 위험:
  - Vestibular 장애 (균형 이상)
  - 편두통 (motion → 두통)
  - 어지럼증
  - PTSD
  - ADHD (집중 방해)

"prefers-reduced-motion" 미디어 쿼리:
  ✓ macOS:   설정 → 손쉬운 사용 → 디스플레이 → 동작 줄이기
  ✓ Windows: 설정 → 접근성 → 시각 효과 → 애니메이션 효과
  ✓ iOS / Android: 비슷
```

---

## CSS 적용

```css
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
    scroll-behavior: auto !important;
  }
  
  /* 단, essential transition 은 유지 (단축) */
  .essential-transition {
    transition-duration: 100ms !important;
  }
}
```

→ 거의 모든 애니메이션 제거.

---

## React (Framer Motion)

```tsx
import { useReducedMotion } from 'framer-motion';

function Modal() {
  const shouldReduceMotion = useReducedMotion();
  
  return (
    <motion.div
      initial={{ opacity: 0, scale: shouldReduceMotion ? 1 : 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{
        duration: shouldReduceMotion ? 0 : 0.2,
      }}
    >
      ...
    </motion.div>
  );
}
```

→ Scale animation 제거. Opacity 만 유지 (essential).

---

## Hook 패턴

```tsx
function usePrefersReducedMotion(): boolean {
  const [prefers, setPrefers] = useState(false);
  
  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    setPrefers(mq.matches);
    
    const listener = (e: MediaQueryListEvent) => setPrefers(e.matches);
    mq.addEventListener('change', listener);
    return () => mq.removeEventListener('change', listener);
  }, []);
  
  return prefers;
}
```

---

## 영향받는 영역

```
✓ 애니메이션 (modal, dropdown, toast)
✓ 트랜지션 (hover 색 변화는 OK, transform 은 줄임)
✓ Auto-scroll (smooth → instant)
✓ Spinner (회전 → pulse)
✓ Stagger (지연 0)
✓ Page transition

유지:
✓ Essential indicators (cursor blink, error pulse — 빠르게)
✓ Loading 표시 (다른 형태로)
✓ Focus ring (즉시 표시)
```

---

## Spinner 대체

```css
@media (prefers-reduced-motion: reduce) {
  .animate-spin {
    /* 회전 → pulse */
    animation: pulse 1.5s ease-in-out infinite;
  }
  
  /* 또는 단순 dot */
  .spinner-fallback {
    display: inline-block;
    width: 8px;
    height: 8px;
    background: var(--color-accent);
    border-radius: 50%;
  }
}
```

---

## Auto-scroll

```tsx
function ChatPanel() {
  const reducedMotion = usePrefersReducedMotion();
  
  const scrollToBottom = () => {
    container.scrollTo({
      top: container.scrollHeight,
      behavior: reducedMotion ? 'auto' : 'smooth',  // ★
    });
  };
}
```

---

## Streaming cursor

```tsx
function BlinkingCursor() {
  const reducedMotion = usePrefersReducedMotion();
  
  if (reducedMotion) {
    // 정적 cursor (깜박임 X)
    return <span className="inline-block w-0.5 h-4 bg-accent" />;
  }
  
  return (
    <motion.span 
      animate={{ opacity: [1, 0, 1] }}
      transition={{ duration: 1, repeat: Infinity }}
      className="inline-block w-0.5 h-4 bg-accent"
    />
  );
}
```

---

## Page transition

```tsx
<motion.div
  initial={shouldReduceMotion ? {} : { opacity: 0, x: 20 }}
  animate={shouldReduceMotion ? {} : { opacity: 1, x: 0 }}
  transition={shouldReduceMotion ? { duration: 0 } : { duration: 0.3 }}
>
  ...
</motion.div>
```

---

## 사용자 토글 (옵션)

OS 설정 외에 앱 설정에도 옵션:

```tsx
<SwitchField
  label="모션 줄이기"
  hint="애니메이션을 최소화합니다"
  checked={settings.reduce_motion}
  onCheckedChange={(v) => setSettings({ ...settings, reduce_motion: v })}
/>
```

→ OR 조건: OS 또는 앱에서 ON 이면 적용.

```typescript
const effectiveReducedMotion = osPrefersReduced || userToggleOn;
```

---

## 테스트

```
Chrome DevTools:
  Cmd+Shift+P → "Show Rendering" → 
  "Emulate CSS media feature prefers-reduced-motion: reduce"
  
또는:
  OS 설정에서 활성화 → 앱 reload
```

---

## 관련

- [../tokens/motion.md](../tokens/motion.md)
- [../interaction/animation.md](../interaction/animation.md)
