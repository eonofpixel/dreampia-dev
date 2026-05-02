---
title: Performance — Code Splitting
parent: ./_index.md
related:
  - bundle.md
  - startup.md
status: draft
last_updated: 2026-05-02
---

# Code Splitting

> **한 줄 요약**: 처음 로드는 critical 만. 나머지 lazy.

---

## 분리 전략

```
Critical (initial bundle):
  ✓ React + ReactDOM
  ✓ Main layout (3-panel)
  ✓ Sidebar
  ✓ Empty 채팅 UI
  ✓ 기본 토큰 / 테마

Lazy (page chunks):
  ✓ Settings page
  ✓ Plugin manager
  ✓ Automation editor
  ✓ Backup / restore

Lazy (feature chunks):
  ✓ Code syntax highlighting (prism)
  ✓ Markdown rendering (react-markdown)
  ✓ Terminal (xterm.js — 큰)
  ✓ Diff viewer
  ✓ File tree (큰 워크스페이스)
  ✓ Charts (Phase 2)
```

---

## React.lazy + Suspense

```tsx
import { lazy, Suspense } from 'react';

const SettingsPage = lazy(() => import('./pages/Settings'));
const PluginManager = lazy(() => import('./pages/PluginManager'));

function App() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/settings" element={<SettingsPage />} />
        <Route path="/plugins" element={<PluginManager />} />
      </Routes>
    </Suspense>
  );
}
```

→ `/settings` 방문 시만 Settings chunk 로드.

---

## Component-level lazy

```tsx
// 큰 컴포넌트도 lazy 가능
const Terminal = lazy(() => import('./components/Terminal'));

function ChatPanel() {
  const [showTerminal, setShowTerminal] = useState(false);
  
  return (
    <div>
      <ChatMessages />
      
      {showTerminal && (
        <Suspense fallback={<TerminalSkeleton />}>
          <Terminal />
        </Suspense>
      )}
    </div>
  );
}
```

---

## Vendor chunks

```typescript
// vite.config.ts
build: {
  rollupOptions: {
    output: {
      manualChunks: (id) => {
        // node_modules 별도 chunk
        if (id.includes('node_modules')) {
          // React 별도
          if (id.includes('react')) return 'react-vendor';
          
          // Radix 별도
          if (id.includes('@radix-ui')) return 'radix-vendor';
          
          // Framer Motion 별도
          if (id.includes('framer-motion')) return 'motion-vendor';
          
          return 'vendor';
        }
      },
    },
  },
},
```

→ React 변경 X = 사용자 cache hit. 우리 코드만 다시 받음.

---

## Preload (priority)

곧 필요할 chunks 미리 로드:

```html
<link rel="modulepreload" href="/assets/SettingsPage.js" />
```

```typescript
// 동적
function preloadSettings() {
  import('./pages/Settings');   // 백그라운드 fetch
}

<button 
  onMouseEnter={preloadSettings}      // hover 시 preload
  onClick={navigateToSettings}         // click 시 navigate
>
  설정
</button>
```

→ 사용자 hover → preload → click 시 instant.

---

## Route-level prefetch

```tsx
import { Link } from 'react-router-dom';

<Link 
  to="/settings"
  onMouseEnter={() => preloadRoute('/settings')}
>
  설정
</Link>

function preloadRoute(path: string) {
  if (path === '/settings') import('./pages/Settings');
  if (path === '/plugins') import('./pages/Plugins');
}
```

---

## Dynamic feature loading

```typescript
// AI 응답에 코드 블록 있으면 syntax highlighter 로드
async function renderMessage(content: string) {
  if (content.includes('```')) {
    const { Highlighter } = await import('./Highlighter');
    return <Highlighter content={content} />;
  }
  
  return <PlainText content={content} />;
}
```

---

## Plugin / Skill lazy load

```typescript
// 플러그인 활성화 시점에만 로드
async function activatePlugin(pluginId: string) {
  const plugin = await import(`./plugins/${pluginId}/index.js`);
  await plugin.initialize();
}

// SKILL.md 도 lazy
async function executeSkill(skillId: string) {
  const skill = registry.get(skillId);
  
  // SKILL.md 본문은 사용 시점에만 로드 (큰 41KB)
  if (!skill.body_loaded) {
    skill.body = await fs.readFile(skill.path, 'utf-8');
    skill.body_loaded = true;
  }
  
  return runSkill(skill);
}
```

---

## Dynamic chunks 명명

```typescript
// webpack chunk name (디버깅 도움)
const Page = lazy(() => 
  import(/* webpackChunkName: "settings" */ './Settings')
);

// 또는 vite manualChunks 로 통제
```

---

## Suspense 경계

```tsx
// 너무 큰 경계 = 전체 로딩
<Suspense fallback={<Skeleton />}>
  <App />     {/* 모든 lazy chunk */}
</Suspense>

// ✓ 적절한 경계
<App>
  <Sidebar />     {/* 즉시 로드 */}
  <Suspense fallback={<ChatSkeleton />}>
    <ChatPage />  {/* lazy */}
  </Suspense>
  <Suspense fallback={<PreviewSkeleton />}>
    <PreviewPage />
  </Suspense>
</App>
```

---

## Analyze chunks

```bash
# 빌드 후 chunk 분석
npm run build

# stats.html 자동 열림 (rollup-plugin-visualizer)
# 각 chunk 크기 + 의존성 sunburst chart
```

---

## CI 검증

```yaml
- name: Chunk size check
  run: |
    for chunk in dist/assets/*.js; do
      SIZE=$(stat -c %s $chunk)
      if [ $SIZE -gt 200000 ]; then
        echo "❌ Chunk too large: $chunk ($SIZE bytes)"
        exit 1
      fi
    done
```

---

## 관련

- [bundle.md](./bundle.md)
- [startup.md](./startup.md)
- [cache.md](./cache.md)
