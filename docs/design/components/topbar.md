---
title: Components — TopBar
parent: ./_index.md
related:
  - sidebar.md
  - statusbar.md
status: draft
last_updated: 2026-05-02
---

# TopBar

> **한 줄 요약**: 윈도우 상단 - 메뉴 + 윈도우 컨트롤 + 컨텍스트 정보.

---

## Visual

```
┌─────────────────────────────────────────────────────────┐
│ [─] [□] [×]    Dreampia-Dev          [메뉴] [도움말] ⚙ │
└─────────────────────────────────────────────────────────┘

또는 (멀티 윈도우 헤더):

┌─────────────────────────────────────────────────────────┐
│  ☰   채팅: 서버 열고 미리보기              ▶ [▼ Code]   │
└─────────────────────────────────────────────────────────┘
```

---

## 구성

```typescript
interface TopBarProps {
  // 윈도우 컨트롤 (메인 윈도우 only)
  showWindowControls?: boolean;
  
  // 컨텍스트
  title?: string;
  breadcrumbs?: BreadcrumbItem[];
  
  // 액션
  actions?: ReactNode[];
  
  // 메뉴
  showMenu?: boolean;
}
```

---

## Electron Window Frame

```tsx
// 자체 frame (frame: false)
<div className="
  h-12 
  bg-bg-secondary 
  border-b border-border-primary
  flex items-center
  region-drag    /* electron drag */
">
  <WindowControls className="region-no-drag" />
  
  <div className="flex-1 px-3 truncate text-sm">
    {title}
  </div>
  
  <div className="region-no-drag flex gap-1 px-2">
    {actions}
  </div>
</div>
```

```css
.region-drag {
  -webkit-app-region: drag;       /* 드래그 가능 영역 */
}

.region-no-drag {
  -webkit-app-region: no-drag;    /* 버튼은 드래그 X */
}
```

---

## Window Controls (Windows)

```tsx
function WindowControls() {
  return (
    <div className="flex">
      <button className="w-12 h-12 hover:bg-bg-tertiary" onClick={minimize}>
        <Minus className="w-3 h-3" />
      </button>
      <button className="w-12 h-12 hover:bg-bg-tertiary" onClick={toggleMaximize}>
        <Square className="w-3 h-3" />
      </button>
      <button className="w-12 h-12 hover:bg-danger hover:text-white" onClick={close}>
        <X className="w-3 h-3" />
      </button>
    </div>
  );
}
```

→ macOS = traffic light (좌측), Windows = 우측 일반.

---

## Mini Window 헤더

```tsx
function MiniWindowTopBar({ session }) {
  return (
    <div className="h-10 px-3 flex items-center gap-2 border-b region-drag">
      <Pin className="w-3 h-3" />
      <span className="text-sm truncate flex-1">{session.title}</span>
      <button onClick={close} className="region-no-drag">
        <X className="w-4 h-4" />
      </button>
    </div>
  );
}
```

---

## 관련

- [sidebar.md](./sidebar.md)
- [statusbar.md](./statusbar.md)
