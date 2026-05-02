---
title: Performance — Profiling
parent: ./_index.md
related:
  - monitoring.md
status: draft
last_updated: 2026-05-02
---

# Profiling

> **한 줄 요약**: 측정 안 한 것은 최적화 X. DevTools 우선.

---

## Chrome DevTools Performance

### Recording

```
1. View → Toggle Developer Tools (Ctrl+Shift+I)
2. Performance tab
3. Record (Ctrl+E)
4. 작업 (예: 채팅 전환)
5. Stop
6. 분석
```

### 무엇을 봐야

```
Main Thread:
  - Long tasks (>50ms 빨강 표시)
  - 함수 단위 시간 분석
  
Frames chart:
  - 60fps 유지 (16.67ms 미만)
  - Frame drops 발생 시점

Bottom-up:
  - 어떤 함수가 시간 사용
  - Self time vs Total time
```

### Long task 추적

```
Long task = 50ms+ block:
  - JS 실행 ↓ 분리
  - 큰 작업 = web worker 또는 setTimeout split
```

---

## Memory profiling

### Heap snapshot

```
1. Memory tab → Heap snapshot
2. Take snapshot (기준)
3. 작업 (예: 채팅 50번 전환)
4. Take snapshot 2
5. Comparison view → 새 객체 분석
```

### Allocation timeline

```
Memory tab → Allocation Sampling
→ 시간별 메모리 할당 기록
→ Leak 찾기
```

---

## React DevTools Profiler

```
Profiler tab → Record
→ 작업 수행
→ 분석:
  - 어떤 컴포넌트 re-render
  - 각 render 비용
  - Why did it render? (props/state 변화)
```

### React Compiler (Phase 2)

```
React 19+ Compiler 자동 메모이제이션
→ useMemo/useCallback 수동 X
→ 자동 최적화
```

---

## Lighthouse

```bash
# Web (개발 모드)
npx lighthouse http://localhost:3000 --view

# 또는 DevTools → Lighthouse tab
```

### 메트릭

```
Performance 점수 (0-100):
  FCP:   First Contentful Paint
  LCP:   Largest Contentful Paint
  TBT:   Total Blocking Time
  CLS:   Cumulative Layout Shift
  SI:    Speed Index
  TTI:   Time to Interactive
```

---

## User Timing API

```typescript
// 코드 안에 측정 점 표시
performance.mark('chat-switch-start');

await switchChat(id);

performance.mark('chat-switch-end');
performance.measure('chat-switch', 'chat-switch-start', 'chat-switch-end');

// 결과
const measure = performance.getEntriesByName('chat-switch')[0];
console.log(`Chat switch: ${measure.duration}ms`);
```

→ DevTools Performance tab 에 자동 표시.

---

## Performance Observer

```typescript
// Long task 자동 감지
const observer = new PerformanceObserver((list) => {
  for (const entry of list.getEntries()) {
    if (entry.duration > 50) {
      Sentry.captureMessage(`Long task: ${entry.name}`, {
        level: 'warning',
        extra: { duration: entry.duration, ...entry },
      });
    }
  }
});

observer.observe({ entryTypes: ['longtask'] });
```

---

## React Render 추적

```typescript
// Why did renderer ?
import { useEffect } from 'react';

function useWhyDidYouUpdate(name, props) {
  const previous = useRef();
  
  useEffect(() => {
    if (previous.current) {
      const allKeys = Object.keys({ ...previous.current, ...props });
      const changedProps = {};
      
      allKeys.forEach(key => {
        if (previous.current[key] !== props[key]) {
          changedProps[key] = {
            from: previous.current[key],
            to: props[key],
          };
        }
      });
      
      if (Object.keys(changedProps).length) {
        console.log('[why-did-you-update]', name, changedProps);
      }
    }
    
    previous.current = props;
  });
}

// 사용
function ExpensiveComponent(props) {
  useWhyDidYouUpdate('ExpensiveComponent', props);
  // ...
}
```

---

## SQLite 분석

```typescript
// 모든 query 시간 측정
const queryTimes: Record<string, number[]> = {};

const originalPrepare = db.prepare;
db.prepare = function(sql) {
  const stmt = originalPrepare.call(this, sql);
  const originalAll = stmt.all;
  
  stmt.all = function(...args) {
    const start = performance.now();
    const result = originalAll.apply(this, args);
    const duration = performance.now() - start;
    
    queryTimes[sql] = queryTimes[sql] ?? [];
    queryTimes[sql].push(duration);
    
    return result;
  };
  
  return stmt;
};

// 주기적 보고
setInterval(() => {
  for (const [sql, times] of Object.entries(queryTimes)) {
    const avg = times.reduce((a, b) => a + b) / times.length;
    if (avg > 50) {
      console.warn(`Slow query (avg ${avg.toFixed(1)}ms): ${sql}`);
    }
  }
}, 60000);
```

---

## CI Regression test

```yaml
# .github/workflows/perf.yml
- name: Run perf tests
  run: |
    npm run test:perf
    
- name: Lighthouse CI
  run: |
    npx lhci autorun --collect.numberOfRuns=3
```

```typescript
// tests/perf.test.ts
test('Chat switch < 200ms', async ({ page }) => {
  await page.goto('/');
  
  const start = Date.now();
  await page.click('[data-chat-id="chat-1"]');
  await page.waitForSelector('[data-chat-active]');
  const duration = Date.now() - start;
  
  expect(duration).toBeLessThan(200);
});
```

---

## Production profiling

### Sentry Performance

```typescript
import * as Sentry from '@sentry/electron';

Sentry.init({
  dsn: '...',
  tracesSampleRate: 0.1,        // 10% 샘플링
  
  integrations: [
    Sentry.browserTracingIntegration(),
  ],
});

// 자동:
//   - LCP, FCP, TBT, CLS 측정
//   - User interaction 추적
//   - Slow transaction 알림
```

### Custom metrics

```typescript
// Datadog / 자체 metric server
import { metrics } from './metrics';

// 사용자 흐름
metrics.histogram('chat.switch_duration_ms', duration);
metrics.counter('messages.sent', 1, { provider: 'claude' });
metrics.gauge('memory.heap_mb', usage.heapUsed / 1024 / 1024);
```

---

## 관련

- [monitoring.md](./monitoring.md) — Production 모니터링
- [rendering.md](./rendering.md)
