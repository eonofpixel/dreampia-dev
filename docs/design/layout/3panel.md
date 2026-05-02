---
title: Layout — 3-Panel Detail
parent: ../_index.md
related:
  - ../../ux/patterns/F-013-3panel.md
  - grid.md
status: draft
last_updated: 2026-05-02
---

# 3-Panel Layout

> **한 줄 요약**: 사이드바 + 채팅 + 미리보기. F-013 의 구현 디테일.

---

## 기본 구조

```
┌──────────┬──────────────────┬────────────────────────────────────┐
│ Sidebar  │   채팅            │   미리보기                          │
│ ~286px   │   ~750px          │   ~1054px (가장 큼)                 │
└──────────┴──────────────────┴────────────────────────────────────┘
```

---

## CSS

```tsx
function ThreePanelLayout({ children }) {
  const [sidebarWidth, setSidebarWidth] = useLocalStorage('sidebar', 286);
  const [chatWidth, setChatWidth] = useLocalStorage('chat', 750);
  
  return (
    <div 
      className="grid h-screen overflow-hidden"
      style={{
        gridTemplateColumns: 
          `${sidebarWidth}px 1px minmax(400px, ${chatWidth}px) 1px 1fr`,
      }}
    >
      <SidebarPanel />
      <Splitter direction="vertical" onResize={(d) => setSidebarWidth(w => Math.max(56, w + d))} />
      <ChatPanel />
      <Splitter direction="vertical" onResize={(d) => setChatWidth(w => Math.max(400, w + d))} />
      <PreviewPanel />
    </div>
  );
}
```

---

## 패널 비율 정책

```
권장 width:
  Sidebar:  286px (Codex 동일)
  Chat:     750px (코드 reading 친화)
  Preview:  나머지 (가장 큼)

최소 width:
  Sidebar:  56px (compact, icon-only)
  Chat:     400px (메시지 한 줄 충분)
  Preview:  300px

최대 width:
  Sidebar:  500px
  Chat:     1200px
  Preview:  제한 없음
```

---

## Splitter 컴포넌트

```tsx
function Splitter({ direction, onResize }) {
  const [dragging, setDragging] = useState(false);
  
  useEffect(() => {
    if (!dragging) return;
    
    let lastPos = direction === 'vertical' ? mouse.x : mouse.y;
    
    const handler = (e: MouseEvent) => {
      const newPos = direction === 'vertical' ? e.clientX : e.clientY;
      const diff = newPos - lastPos;
      lastPos = newPos;
      onResize(diff);
    };
    
    document.addEventListener('mousemove', handler);
    document.addEventListener('mouseup', () => setDragging(false), { once: true });
    
    return () => document.removeEventListener('mousemove', handler);
  }, [dragging, direction, onResize]);
  
  return (
    <div
      role="separator"
      tabIndex={0}
      aria-orientation={direction}
      onMouseDown={() => setDragging(true)}
      onKeyDown={(e) => {
        if (direction === 'vertical') {
          if (e.key === 'ArrowLeft') onResize(-10);
          if (e.key === 'ArrowRight') onResize(10);
        } else {
          if (e.key === 'ArrowUp') onResize(-10);
          if (e.key === 'ArrowDown') onResize(10);
        }
      }}
      className={cn(
        'bg-border-primary',
        direction === 'vertical' 
          ? 'w-px cursor-ew-resize hover:w-1 hover:bg-accent' 
          : 'h-px cursor-ns-resize hover:h-1 hover:bg-accent',
        'transition-all duration-100'
      )}
    />
  );
}
```

---

## 패널 토글

```tsx
function ThreePanelLayoutToggleable() {
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [previewOpen, setPreviewOpen] = useState(true);
  
  // 단축키
  useHotkey('ctrl+\\', () => setSidebarOpen(o => !o));
  
  return (
    <div className="flex h-screen overflow-hidden">
      {sidebarOpen && (
        <motion.div
          initial={{ width: 0 }}
          animate={{ width: 286 }}
          exit={{ width: 0 }}
        >
          <SidebarPanel />
        </motion.div>
      )}
      
      <ChatPanel className="flex-1" />
      
      {previewOpen && (
        <PreviewPanel className="flex-1" />
      )}
    </div>
  );
}
```

---

## 전체화면 모드 (F-014)

```tsx
function ThreePanelLayout() {
  const [fullscreen, setFullscreen] = useState(false);
  
  if (fullscreen) {
    return (
      <div className="relative h-screen">
        <PreviewPanel className="w-full h-full" />
        <FloatingChat />     {/* F-015 */}
      </div>
    );
  }
  
  // 일반 3-panel
}
```

상세: [floating-overlay.md](./floating-overlay.md).

---

## 패널 콘텐츠 영역

각 패널 내부:

```tsx
function ChatPanel() {
  return (
    <div className="flex flex-col h-full bg-bg-primary">
      <ChatHeader />        {/* 제목 + ··· 메뉴 */}
      <ChatMessages className="flex-1 overflow-y-auto" />
      <ChatInput />         {/* 하단 sticky */}
    </div>
  );
}

function PreviewPanel() {
  return (
    <div className="flex flex-col h-full bg-bg-primary">
      <PreviewTabs />       {/* F-017 */}
      <BrowserControls />   {/* ← → ↻ URL */}
      <PreviewContent className="flex-1" />
    </div>
  );
}
```

---

## 사용자 설정 저장

```typescript
interface LayoutPreferences {
  sidebar_width: number;        // px
  chat_width: number;           // px
  sidebar_collapsed: boolean;
  preview_visible: boolean;
  density: 'compact' | 'comfortable' | 'spacious';
}

// LocalStorage 또는 settings.db
function useLayoutPreferences() {
  return useLocalStorage<LayoutPreferences>('layout', {
    sidebar_width: 286,
    chat_width: 750,
    sidebar_collapsed: false,
    preview_visible: true,
    density: 'comfortable',
  });
}
```

---

## Animation (toggle)

```tsx
import { motion, AnimatePresence } from 'framer-motion';

<AnimatePresence>
  {sidebarOpen && (
    <motion.div
      initial={{ width: 0, opacity: 0 }}
      animate={{ width: 286, opacity: 1 }}
      exit={{ width: 0, opacity: 0 }}
      transition={{ duration: 0.2, ease: [0, 0, 0.2, 1] }}
      className="overflow-hidden"
    >
      <SidebarPanel />
    </motion.div>
  )}
</AnimatePresence>
```

---

## Performance

```
패널 모두 mount 유지 (재진입 시 빠름):
  - 토글 시 visibility/display 변경
  - DOM 재생성 X

큰 미리보기:
  - BrowserView (Electron) 사용
  - React 안 직접 X (CSP 회피)
```

---

## 관련

- [../../ux/patterns/F-013-3panel.md](../../ux/patterns/F-013-3panel.md)
- [floating-overlay.md](./floating-overlay.md) — 전체화면 시
- [panels.md](./panels.md) — 패널 토글 매트릭스
