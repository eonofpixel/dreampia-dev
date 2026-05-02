---
title: Performance — Memory Management
parent: ./_index.md
related:
  - electron-tuning.md
status: draft
last_updated: 2026-05-02
---

# Memory Management

> **한 줄 요약**: 200MB 시작 + 세션당 +50MB. Leak 0.

---

## 메모리 budget

```
앱 시작 직후:        < 150MB
1 세션 활성:         < 250MB
10 세션 활성:        < 500MB
50 세션 활성:        < 1GB

오랜 사용 후:        < 1.5GB (gradual leak 0)
```

---

## Electron 의 본질적 비용

```
Electron baseline:    ~80-100MB
Chromium engine:      ~50MB
V8 (snapshot 후):     ~30MB
React runtime:        ~10MB
앱 코드 + 데이터:     나머지

→ 작은 앱이라도 ~150MB 필요
```

---

## 주요 leak 패턴

### 1. Event listener 누락

```typescript
// ✗ 누수
useEffect(() => {
  window.addEventListener('resize', handler);
  // cleanup 없음 - 컴포넌트 unmount 후도 listener 살아있음
}, []);

// ✓ 정상
useEffect(() => {
  window.addEventListener('resize', handler);
  return () => window.removeEventListener('resize', handler);
}, []);
```

### 2. Timer / interval

```typescript
// ✗ 누수
setInterval(() => fetch(...), 1000);

// ✓ 정상
useEffect(() => {
  const id = setInterval(() => fetch(...), 1000);
  return () => clearInterval(id);
}, []);
```

### 3. Closure 안 큰 객체

```typescript
// ✗ 누수
function createHandler(largeData) {
  return () => {
    // largeData 영원히 메모리 (closure)
  };
}

// ✓ 정상
function createHandler(largeData) {
  const id = largeData.id;     // 필요한 것만
  return () => {
    fetchById(id);
  };
}
```

### 4. WeakMap 활용

```typescript
// ✓ 자동 GC
const cache = new WeakMap();

function getMetadata(obj) {
  if (!cache.has(obj)) {
    cache.set(obj, computeMetadata(obj));
  }
  return cache.get(obj);
}

// obj 가 더 이상 참조 X 면 cache 도 자동 제거
```

---

## 큰 데이터 처리

### 채팅 메시지 (100K+)

```
문제:
  세션 안 모든 turn 메모리 = 큰 메모리

해결:
  1. SQLite 에 저장 (DB)
  2. 메모리: 최근 100개만
  3. 사용자 스크롤 시 lazy load
  4. Virtualization (DOM 노드 ~20개)
```

```typescript
function useMessages(sessionId: string) {
  const [recentMessages, setRecentMessages] = useState([]);
  
  // 최근 100개만 메모리
  useEffect(() => {
    db.prepare(`
      SELECT * FROM turns 
      WHERE session_id = ? 
      ORDER BY seq DESC 
      LIMIT 100
    `).all(sessionId).then(setRecentMessages);
  }, [sessionId]);
  
  return recentMessages;
}
```

### 큰 파일

```typescript
// ✗ 전체 메모리에 로드
const content = await fs.readFile(path, 'utf-8');

// ✓ Stream 처리
const stream = fs.createReadStream(path, { encoding: 'utf-8' });
stream.on('data', (chunk) => process(chunk));
```

### 이미지 / 스크린샷

```typescript
// ✗ Base64 메모리 보관
state.screenshot_base64 = '...';     // ~500KB per

// ✓ URI 만 보관, 표시 시 로드
state.screenshot_uri = 'blob://...';

// 표시 시:
<img src={state.screenshot_uri} />   // 브라우저 자동 caching
```

---

## DOM 메모리

```
React DOM:
  - 매 컴포넌트 = 메모리
  - Virtualization 으로 줄임 (1000 → 20)
  - useMemo/useCallback 으로 reference 안정

Native DOM (Electron):
  - BrowserView 별도 process (메모리 분리)
  - 사용 안 하는 BrowserView destroy
```

### BrowserView 관리

```typescript
class BrowserViewPool {
  private pool: BrowserView[] = [];
  private inUse = new Map<string, BrowserView>();
  
  acquire(tabId: string): BrowserView {
    let view = this.pool.pop();
    
    if (!view) {
      view = new BrowserView({
        webPreferences: {
          session: getPartition(tabId),
          sandbox: true,
        },
      });
    }
    
    this.inUse.set(tabId, view);
    return view;
  }
  
  release(tabId: string) {
    const view = this.inUse.get(tabId);
    if (view) {
      view.webContents.loadURL('about:blank');     // 메모리 free
      this.pool.push(view);
      this.inUse.delete(tabId);
    }
  }
  
  destroy(tabId: string) {
    const view = this.inUse.get(tabId);
    if (view) {
      view.webContents.destroy();
      this.inUse.delete(tabId);
    }
  }
}
```

---

## Cache eviction (LRU)

```typescript
import LRU from 'lru-cache';

const messageCache = new LRU<string, Message>({
  max: 1000,                    // 최대 1000개
  maxSize: 100 * 1024 * 1024,   // 100MB
  sizeCalculation: (m) => m.content.length,
  ttl: 1000 * 60 * 60,           // 1시간
});

// 자동 eviction (LRU + size + TTL)
messageCache.set('msg-1', message);
const m = messageCache.get('msg-1');   // hit 시 LRU 갱신
```

---

## 측정

### Process Memory

```typescript
import { app } from 'electron';

setInterval(() => {
  const usage = process.memoryUsage();
  console.log({
    rss: usage.rss / 1024 / 1024 + 'MB',         // Resident Set
    heap: usage.heapUsed / 1024 / 1024 + 'MB',
    external: usage.external / 1024 / 1024 + 'MB',
  });
}, 30000);
```

### Renderer Memory

```typescript
// Chrome DevTools Memory tab
// - Heap snapshot
// - Allocation timeline (시간별 할당)
// - Comparison (snapshot 비교 → leak 발견)
```

### Production 알림

```typescript
// Sentry 자동 수집
Sentry.init({
  beforeSend(event) {
    if (process.memoryUsage().rss > 1500 * 1024 * 1024) {
      event.tags = { ...event.tags, high_memory: true };
    }
    return event;
  },
});
```

---

## Garbage Collection

```typescript
// V8 가 자동 처리. 강제 GC 사용 X (production).

// 단, dev 모드 GC trigger:
if (global.gc) {
  global.gc();   // node --expose-gc 필요
}
```

---

## Memory leak 검출

### 자동 (CI)

```typescript
// 같은 작업 100번 반복 → 메모리 증가 없는지
test('No memory leak in chat switching', async () => {
  const startMem = process.memoryUsage().heapUsed;
  
  for (let i = 0; i < 100; i++) {
    await switchChat(i % 10);
  }
  
  if (global.gc) global.gc();
  
  const endMem = process.memoryUsage().heapUsed;
  const growth = endMem - startMem;
  
  expect(growth).toBeLessThan(10 * 1024 * 1024);   // < 10MB 증가
});
```

### 수동

```
Chrome DevTools Memory:
  1. Heap snapshot 1 (기준)
  2. 작업 (예: 채팅 전환 50번)
  3. Heap snapshot 2
  4. Comparison → "Comparison" view
  5. 새로 추가된 큰 객체 분석
```

---

## 관련

- [electron-tuning.md](./electron-tuning.md) — Electron 메모리 설정
- [rendering.md](./rendering.md)
