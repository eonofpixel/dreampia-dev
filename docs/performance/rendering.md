---
title: Performance — Rendering (60fps)
parent: ./_index.md
related:
  - ../design/tokens/motion.md
  - ../design/interaction/animation.md
status: draft
last_updated: 2026-05-02
---

# Rendering Performance

> **한 줄 요약**: 60fps 유지. composite-only properties. Virtualization.

---

## 60fps 목표

```
60fps = 16.67ms per frame

브라우저 단계:
  1. JS:        4ms  (React render)
  2. Style:     2ms
  3. Layout:    2ms  (가장 비쌈)
  4. Paint:     2ms
  5. Composite: 6ms
  ────────────────
  Total:        16ms ★
```

---

## CSS 카테고리

### Composite-only (60fps 보장)

```
✓ transform: translate, scale, rotate
✓ opacity
✓ filter (일부)
```

### Layout 트리거 (피해야)

```
✗ width, height
✗ top, left, right, bottom
✗ margin, padding
✗ font-size
✗ display
```

### Paint 트리거

```
✗ background-color  (변화 자체는 OK, 자주 X)
✗ color
✗ box-shadow (큰 변화)
```

---

## React 최적화

### memo / useMemo

```tsx
// 자식 컴포넌트 불필요 re-render 방지
const ChatMessage = memo(({ turn }) => {
  return <div>{turn.content}</div>;
}, (prev, next) => prev.turn.id === next.turn.id);
```

### useCallback (이벤트 handler)

```tsx
const handleClick = useCallback(() => {
  doSomething(id);
}, [id]);

// 자식에게 props 로 전달 시 reference 유지
<Button onClick={handleClick} />
```

### Virtualization (큰 리스트)

```tsx
import { useVirtualizer } from '@tanstack/react-virtual';

function VirtualizedList({ items }) {
  const parentRef = useRef();
  const virtualizer = useVirtualizer({
    count: items.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 60,    // 평균 행 높이
    overscan: 5,
  });
  
  return (
    <div ref={parentRef}>
      <div style={{ height: virtualizer.getTotalSize() }}>
        {virtualizer.getVirtualItems().map(virtualItem => (
          <div
            key={virtualItem.key}
            style={{
              transform: `translateY(${virtualItem.start}px)`,
            }}
          >
            <Item item={items[virtualItem.index]} />
          </div>
        ))}
      </div>
    </div>
  );
}
```

→ 1000+ 메시지 = DOM 노드 ~20개만 유지.

---

## 애니메이션

### Framer Motion (권장)

```tsx
// composite-only animation 자동
<motion.div
  animate={{ scale: 1.05 }}      // ✓ transform
  transition={{ duration: 0.1 }}
/>

// ✗ 잘못된 사용
<motion.div
  animate={{ width: 200 }}        // layout trigger
/>
```

### CSS animation

```css
/* ✓ 좋음: composite */
.modal-enter {
  animation: scale-in 200ms ease-out;
}

@keyframes scale-in {
  from {
    transform: scale(0.95);
    opacity: 0;
  }
  to {
    transform: scale(1);
    opacity: 1;
  }
}

/* ✗ 나쁨: layout */
@keyframes bad {
  from { width: 0; }
  to { width: 200px; }
}
```

---

## will-change (조심)

```css
/* 곧 애니메이션 될 element 만 */
.about-to-animate {
  will-change: transform, opacity;
}

/* 애니메이션 끝나면 제거 (메모리 비용) */
```

→ 모든 element 에 적용 = 역효과.

---

## Layer 분리 (transform: translateZ(0))

```css
/* 강제로 GPU layer 만듦 */
.heavy-element {
  transform: translateZ(0);
  /* 또는: will-change: transform */
}
```

→ 별도 합성 layer = paint 분리 가능.

단, 너무 많은 layer = GPU 메모리 압박. 신중히.

---

## React 18 features

### Concurrent rendering

```tsx
import { useTransition } from 'react';

function Search() {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [isPending, startTransition] = useTransition();
  
  const handleChange = (e) => {
    setQuery(e.target.value);     // urgent (input 표시)
    
    startTransition(() => {        // non-urgent (검색 결과)
      setResults(search(e.target.value));
    });
  };
}
```

→ Input typing 끊김 X.

### Suspense

```tsx
<Suspense fallback={<Skeleton />}>
  <LazyComponent />
</Suspense>
```

---

## DevTools Performance

```
Recording 방법:
1. Chrome DevTools → Performance
2. Record (Ctrl+E)
3. 작업 수행
4. Stop
5. 분석:
   - Long tasks (>50ms 빨강)
   - Frame chart (60fps 유지?)
   - Bottom-up (어디 시간 사용?)
```

### 무엇을 봐야

```
Main thread:
  - 길게 점유하는 task X
  - 16ms 내 끝나야 60fps

Layout shifts:
  - reflow 자주 발생 X
  
Paint:
  - 큰 영역 paint 자주 X
```

---

## CSS containment

```css
/* 자식 element 가 부모 layout 에 영향 X */
.card {
  contain: layout style paint;
}

/* 효과:
   - 자식 변화 시 부모 layout 재계산 X
   - 큰 리스트 성능 큰 향상
*/
```

---

## Lazy renderdomain heavy

```tsx
// CodeBlock (syntax highlight 비용 큼)
function CodeBlock({ value, language }) {
  const [highlighted, setHighlighted] = useState(false);
  
  useIdleCallback(() => {
    setHighlighted(true);    // Browser idle 시 highlight
  });
  
  if (!highlighted) {
    return <pre>{value}</pre>;   // Plain text 우선
  }
  
  return <Highlighter value={value} language={language} />;
}
```

---

## 측정

```typescript
// Performance Observer
const observer = new PerformanceObserver((list) => {
  for (const entry of list.getEntries()) {
    if (entry.duration > 50) {
      console.warn('Long task:', entry);
    }
  }
});
observer.observe({ entryTypes: ['longtask'] });
```

---

## CI 검증

```typescript
// Playwright
test('Scroll 60fps', async ({ page }) => {
  await page.goto('/chat/large');
  
  await page.evaluate(() => {
    let frameTimes = [];
    let lastFrame = performance.now();
    
    function tick() {
      const now = performance.now();
      frameTimes.push(now - lastFrame);
      lastFrame = now;
      requestAnimationFrame(tick);
    }
    
    requestAnimationFrame(tick);
    setTimeout(() => {
      const avg = frameTimes.reduce((a, b) => a + b) / frameTimes.length;
      window._fpsResult = 1000 / avg;
    }, 5000);
  });
  
  // 스크롤
  await page.evaluate(() => window.scrollBy(0, 1000));
  
  await page.waitForTimeout(5500);
  const fps = await page.evaluate(() => window._fpsResult);
  
  expect(fps).toBeGreaterThan(55);    // 60 ± 5 허용
});
```

---

## 관련

- [../design/tokens/motion.md](../design/tokens/motion.md) — 60fps 애니메이션
- [../design/interaction/animation.md](../design/interaction/animation.md)
- [memory.md](./memory.md)
