---
title: Performance — Bundle Size
parent: ./_index.md
related:
  - code-splitting.md
  - startup.md
status: draft
last_updated: 2026-05-02
---

# Bundle Size

> **한 줄 요약**: Initial < 300KB gzip. Lazy chunks split. Tree-shake aggressively.

---

## Budget

```
Main JS (initial):    < 300KB gzip
Main CSS:             < 50KB gzip
Lazy chunk (each):    < 200KB gzip
Total assets:         < 5MB

비교:
  Codex Desktop:      ~131MB asar (이건 entire bundle)
  Web only initial:   ~300KB OK
```

---

## 큰 라이브러리 식별

```
Top contributors (estimate):
  React + ReactDOM:          45KB
  Tailwind CSS (purged):     20KB (unused 제거)
  Framer Motion:             40KB
  Radix UI (사용 컴포넌트만): 30KB
  prism-react-renderer:      30KB (lazy 권장)
  date-fns:                  10KB (tree-shake 후)
  zod:                       15KB
  React Markdown:            25KB (lazy 권장)
  
Lazy chunks:
  xterm.js:                  ~500KB (terminal 사용 시만)
  monaco-editor:             ~3MB (사용 X — 자체 syntax)
  react-dnd / dnd-kit:       50KB (lazy)
  화상회의 등:                Phase 3+
```

---

## Tree shaking

### Import 최적화

```typescript
// ✗ 전체 import (큰 chunk)
import * as Icons from 'lucide-react';
<Icons.Settings />

// ✓ 명시적 import (tree-shake 가능)
import { Settings, Plus } from 'lucide-react';
```

### CommonJS 피하기

```typescript
// ✗ CommonJS (tree-shake X)
const _ = require('lodash');

// ✓ ESM
import debounce from 'lodash-es/debounce';

// ✓ 더 좋음: 직접 작성
function debounce<T>(fn: T, ms: number) { ... }
```

---

## Dynamic import (lazy)

```typescript
// 처음 시작 시 X, 사용자 요청 시 로드
const SettingsPage = lazy(() => 
  import(/* webpackChunkName: "settings" */ './pages/Settings')
);

// React Router
<Routes>
  <Route path="/settings" element={
    <Suspense fallback={<Skeleton />}>
      <SettingsPage />
    </Suspense>
  } />
</Routes>
```

상세: [code-splitting.md](./code-splitting.md).

---

## Vite 설정

```typescript
// vite.config.ts
export default defineConfig({
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          // 핵심
          'react-vendor': ['react', 'react-dom'],
          'ui-vendor': ['@radix-ui/react-dialog', '@radix-ui/react-popover'],
          
          // Lazy
          'syntax-highlight': ['prism-react-renderer'],
          'markdown': ['react-markdown', 'remark-gfm'],
          'terminal': ['xterm', 'xterm-addon-fit'],
        },
      },
    },
    
    // Source map (production 도)
    sourcemap: true,
    
    // Minify
    minify: 'esbuild',     // terser 보다 빠름
    
    // CSS code split
    cssCodeSplit: true,
  },
  
  // 더 작게
  optimizeDeps: {
    include: ['react', 'react-dom'],
    exclude: ['xterm'],     // lazy
  },
});
```

---

## 의존성 audit

```bash
# 분석
npm install -D rollup-plugin-visualizer

# 사용:
import { visualizer } from 'rollup-plugin-visualizer';

plugins: [
  visualizer({ open: true, gzipSize: true }),
]

# 결과: stats.html 에 sunburst chart
```

---

## 큰 dependency 대안

### Lodash → Native

```typescript
// ✗ import 'lodash'
const result = _.debounce(fn, 100);

// ✓ Native
function debounce(fn, ms) {
  let timeout;
  return (...args) => {
    clearTimeout(timeout);
    timeout = setTimeout(() => fn(...args), ms);
  };
}
```

### Moment → date-fns

```typescript
// ✗ moment (큰)
import moment from 'moment';

// ✓ date-fns (tree-shake)
import { format, formatDistance } from 'date-fns';
import { ko } from 'date-fns/locale';

format(date, 'yyyy년 M월 d일', { locale: ko });
```

### Axios → fetch

```typescript
// ✗ axios
import axios from 'axios';

// ✓ Native fetch
const data = await fetch('/api').then(r => r.json());
```

---

## Asset 최적화

### Image

```
PNG → WebP (50% 작음)
WebP → AVIF (Phase 2 — 더 작음)

Original PNG:        100KB
WebP:                40KB
AVIF:                25KB
```

### Icon

```
✗ PNG icon set (큰)
✓ SVG sprite
✓ Icon font (lucide-react 등 → tree-shake)
```

### Font

```typescript
// font-display: swap (FOUT 허용)
@font-face {
  font-family: 'Pretendard Variable';
  src: url('Pretendard.woff2') format('woff2-variations');
  font-display: swap;
  unicode-range: U+AC00-D7A3;    // 한글만 (필요 시)
}
```

→ 한글 + 영문 모두 = 큰 폰트. unicode-range 로 분리 가능.

---

## Compression

```
Gzip:    ~30% 작음 (default)
Brotli:  ~25% 작음 (Brotli 더 좋음)

Electron + Vite:
  - 빌드 시 자동 gzip
  - HTTP 응답에 자동 적용
```

---

## CI 검증

```yaml
# .github/workflows/bundle-size.yml
- name: Bundle size check
  run: |
    npm run build
    
    SIZE=$(stat -c %s dist/assets/main.js)
    if [ $SIZE -gt 500000 ]; then     # 500KB
      echo "❌ Bundle too large: $(($SIZE / 1024))KB"
      exit 1
    fi
    
    GZIP_SIZE=$(gzip -c dist/assets/main.js | wc -c)
    if [ $GZIP_SIZE -gt 300000 ]; then  # 300KB gzip
      echo "❌ Gzip too large"
      exit 1
    fi
```

---

## Production analysis

```
build:analyze 명령:
  npm run build:analyze
  
  → stats.html 생성
  → sunburst chart 로 큰 모듈 식별
  → 줄일 수 있는 곳 찾기
```

---

## 관련

- [code-splitting.md](./code-splitting.md) — Lazy load 전략
- [startup.md](./startup.md)
