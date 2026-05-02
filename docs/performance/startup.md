---
title: Performance — Startup Time
parent: ./_index.md
related:
  - bundle.md
  - code-splitting.md
status: draft
last_updated: 2026-05-02
---

# Startup Time

> **한 줄 요약**: 1초 안 TTI. Cold start vs Warm start 분리.

---

## 시간 분해

```
Cold start (앱 첫 실행):
  0ms        OS spawn process
  ~100ms     Electron init (chromium)
  ~200ms     V8 snapshot 로드
  ~250ms     Main process 코드 로드
  ~300ms     Renderer process spawn
  ~400ms     React mount + first paint
  ~500ms     CSS / 이미지 로드
  ~700ms     Critical chunks
  ~800ms     세션 SQLite 로드
  1000ms     ★ TTI (사용자 입력 가능)

Warm start (이미 실행됨):
  사용자 dock/taskbar click → window 복원
  < 100ms     ★
```

---

## 최적화 전략

### 1. V8 snapshot

Electron 의 startup snapshot:

```javascript
// vite.config.ts (Electron Vite plugin)
export default defineConfig({
  electron: [
    {
      entry: 'src/main/index.ts',
      vite: {
        build: {
          rollupOptions: {
            external: ['electron', /^node:/],
          },
        },
      },
    },
  ],
});
```

→ V8 이 미리 byte code 캐시.

### 2. Lazy load (★ 핵심)

```typescript
// 즉시 필요한 것만
import { App } from './App';
import { mainWindow } from './main';

// 나머지 lazy
const SettingsPage = lazy(() => import('./pages/Settings'));
const PluginManager = lazy(() => import('./pages/PluginManager'));
```

상세: [code-splitting.md](./code-splitting.md).

### 3. 동기 → 비동기 전환

```typescript
// ✗ 시작 시 동기 로드 (block)
import { hugeData } from './data.json';
console.log(hugeData);

// ✓ 비동기 로드 (TTI 후)
const hugeData = await import('./data.json');
```

### 4. SQLite 비동기 init

```typescript
// 시작 시 사용자 입력 차단 X
async function initApp() {
  // 즉시: 기본 UI
  renderApp();
  
  // 비동기: 데이터 로드
  setTimeout(async () => {
    await loadSessions();
    await checkForUpdates();
    await prefetchPlugins();
  }, 100);  // 100ms 후 (UI 그리기 후)
}
```

### 5. 큰 라이브러리 lazy

```typescript
// xterm.js = 큰 (~500KB)
const Terminal = lazy(() => import('xterm'));

// 사용자가 터미널 열기 전엔 로드 X
```

---

## Splash screen (옵션)

```tsx
// 로딩 중 simple splash
function SplashScreen() {
  return (
    <div className="flex items-center justify-center h-screen">
      <Logo size="lg" />
      <p>로딩 중...</p>
    </div>
  );
}

// 200ms 이후 자동 사라짐 (TTI 까지)
```

→ Window 만 표시하고 React 안 mount 된 빈 화면 보다 나음.

---

## Critical CSS inline

```html
<!-- index.html -->
<style>
  /* 앱 shell 의 critical CSS 인라인 */
  body { margin: 0; background: #131517; }
  #app { display: flex; height: 100vh; }
  /* ... */
</style>

<link rel="stylesheet" href="/main.css" media="print" onload="this.media='all'" />
```

→ FCP 단축.

---

## Font loading

```css
@font-face {
  font-family: 'Pretendard Variable';
  src: url('/fonts/Pretendard.woff2') format('woff2-variations');
  font-display: swap;            /* FOUT 허용 */
}
```

`font-display: swap`:
- 폰트 로드 전: 시스템 폰트 사용 (FCP 빠름)
- 로드 완료: Pretendard 로 swap

---

## Image lazy

```tsx
<img 
  src={thumb} 
  loading="lazy"        // viewport 진입 시만 로드
  decoding="async"
/>
```

---

## Service Worker (Phase 2)

```typescript
// 재방문 시 cache 활용
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open('dreampia-v1').then((cache) => {
      return cache.addAll([
        '/',
        '/main.js',
        '/main.css',
        '/fonts/Pretendard.woff2',
      ]);
    })
  );
});

self.addEventListener('fetch', (event) => {
  event.respondWith(
    caches.match(event.request).then((response) => {
      return response || fetch(event.request);
    })
  );
});
```

→ 두 번째 시작부터 instant.

---

## Window 미리 렌더링 (Electron)

```typescript
// main.ts
app.whenReady().then(() => {
  // Window 미리 만들고 hidden
  const win = new BrowserWindow({
    show: false,    // 처음엔 숨김
  });
  
  win.loadURL('...');
  
  // ready-to-show 이벤트 시 표시
  win.once('ready-to-show', () => {
    win.show();
  });
});
```

→ 빈 window 안 보임 (사용자 인지 향상).

---

## 측정

```typescript
// User Timing API
performance.mark('app-start');

// ...

performance.mark('tti');
performance.measure('startup', 'app-start', 'tti');

const measure = performance.getEntriesByName('startup')[0];
console.log(`TTI: ${measure.duration}ms`);
```

### 자동 측정

```typescript
// Sentry performance
Sentry.init({
  dsn: '...',
  tracesSampleRate: 0.1,
  integrations: [
    new Sentry.BrowserTracing(),
  ],
});

// 자동으로 TTI, FCP, LCP 측정
```

---

## CI Regression

```yaml
- name: Measure startup
  run: |
    npm run build
    timing=$(node scripts/measure-startup.js)
    if [ $timing -gt 1500 ]; then
      echo "Startup regression: ${timing}ms"
      exit 1
    fi
```

---

## 관련

- [bundle.md](./bundle.md)
- [code-splitting.md](./code-splitting.md)
- [targets.md](./targets.md)
