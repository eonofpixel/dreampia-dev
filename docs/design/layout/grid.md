---
title: Layout — Grid System
parent: ../_index.md
related:
  - ../tokens/spacing.md
  - 3panel.md
status: draft
last_updated: 2026-05-02
---

# Grid System

> **한 줄 요약**: CSS Grid 기반. 12-column 보다 named grid (semantic).

---

## 메인 레이아웃 (3-패널)

```css
.app-layout {
  display: grid;
  grid-template-columns: 286px 750px 1fr;
  grid-template-rows: auto 1fr auto;
  grid-template-areas:
    "topbar topbar topbar"
    "sidebar chat preview"
    "statusbar statusbar statusbar";
  height: 100vh;
}

.topbar { grid-area: topbar; }
.sidebar { grid-area: sidebar; }
.chat { grid-area: chat; }
.preview { grid-area: preview; }
.statusbar { grid-area: statusbar; }
```

상세: [3panel.md](./3panel.md).

---

## 일반 그리드 (form, content)

```css
/* 12-column (옵션) */
.grid-12 {
  display: grid;
  grid-template-columns: repeat(12, 1fr);
  gap: 1rem;
}

/* Auto-fit (responsive) */
.grid-auto {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
  gap: 1rem;
}

/* Subgrid (Phase 2) */
.subgrid {
  display: grid;
  grid-template-columns: subgrid;
}
```

---

## Tailwind grid utilities

```tsx
// Form 2-column
<div className="grid grid-cols-2 gap-4">
  <Input label="이름" />
  <Input label="이메일" />
</div>

// Cards 자동 fit
<div className="grid grid-cols-[repeat(auto-fit,minmax(250px,1fr))] gap-4">
  {items.map(item => <Card key={item.id} {...item} />)}
</div>
```

---

## 반응형 (소수)

Dreampia-Dev = 데스크톱 우선. 단, 좁은 창 대응:

```tsx
<div className="
  grid 
  grid-cols-1                          // 미니 창 (< 768px)
  md:grid-cols-[286px_1fr]             // 작은 데스크톱
  lg:grid-cols-[286px_750px_1fr]       // 표준
">
  ...
</div>
```

상세: [../tokens/breakpoints.md](../tokens/breakpoints.md).

---

## 패널 resize

```tsx
function ResizableLayout() {
  const [sidebarWidth, setSidebarWidth] = useLocalStorage('layout.sidebar', 286);
  const [chatWidth, setChatWidth] = useLocalStorage('layout.chat', 750);
  
  return (
    <div 
      className="grid h-screen"
      style={{
        gridTemplateColumns: `${sidebarWidth}px 1px ${chatWidth}px 1px 1fr`,
      }}
    >
      <Sidebar />
      <Splitter onResize={(diff) => setSidebarWidth(w => w + diff)} />
      <Chat />
      <Splitter onResize={(diff) => setChatWidth(w => w + diff)} />
      <Preview />
    </div>
  );
}
```

→ Drag splitter 로 resize. 사용자 설정 저장.

---

## Container queries (Phase 2)

```css
/* 부모 width 따라 child 적응 */
.preview-panel {
  container-type: inline-size;
}

.preview-tab {
  font-size: 0.875rem;
}

@container (min-width: 600px) {
  .preview-tab {
    font-size: 1rem;
  }
}
```

→ 미디어 쿼리보다 정밀.

---

## 안티 패턴

```
✗ Float / clear (오래된 layout)
✗ 절대 좌표 (top/left for layout)
✗ 너무 많은 nested grid (디버깅 어려움)
✓ Flexbox (1D layout) + Grid (2D layout) 적절히 조합
```

---

## 관련

- [3panel.md](./3panel.md) — 메인 layout 상세
- [floating-overlay.md](./floating-overlay.md) — F-015
- [../tokens/spacing.md](../tokens/spacing.md) — Gap, padding
