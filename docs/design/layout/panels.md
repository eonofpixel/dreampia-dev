---
title: Layout — Panel Toggle Matrix
parent: ../_index.md
related:
  - 3panel.md
  - ../../ux/patterns/F-013-3panel.md
status: draft
last_updated: 2026-05-02
---

# Panel Toggle Matrix

> **한 줄 요약**: 5개 패널의 모든 토글 조합. 8개 layout state.

---

## 5개 패널

```
1. Sidebar    좌측 (사이드바)
2. Chat       중앙 (채팅)
3. Preview    우측 (미리보기)
4. Terminal   하단 (터미널 — F-030)
5. FileTree   좌측 안 (파일 트리 — F-031)
```

---

## 토글 매트릭스

```
[Default]
┌────────────┬──────────┬──────────────┐
│ Sidebar    │ Chat     │ Preview      │
└────────────┴──────────┴──────────────┘

[Sidebar collapsed]
┌──┬──────────┬──────────────┐
│☰ │ Chat     │ Preview      │
└──┴──────────┴──────────────┘

[Preview hidden]
┌────────────┬──────────────────────────┐
│ Sidebar    │ Chat                      │
└────────────┴──────────────────────────┘

[Chat hidden = Fullscreen]
┌────────────┬──────────────────────────┐
│ Sidebar    │ Preview (전체)            │ ← Floating chat
└────────────┴──────────────────────────┘

[Terminal added]
┌────────────┬──────────┬──────────────┐
│ Sidebar    │ Chat     │ Preview      │
├────────────┴──────────┴──────────────┤
│ Terminal                              │
└──────────────────────────────────────┘

[Both panels + terminal]
┌──┬──────────┬──────────────┐
│☰ │ Chat     │ Preview      │
├──┴──────────┴──────────────┤
│ Terminal                   │
└────────────────────────────┘

[FileTree (sidebar 안 또는 별도)]
┌──┬─────┬──────────┬──────────────┐
│☰ │File │ Chat     │ Preview      │
│  │Tree │          │              │
└──┴─────┴──────────┴──────────────┘
```

---

## 단축키 매핑

```
Ctrl+\         Sidebar 토글
Ctrl+J         Terminal 토글
Ctrl+Shift+E   FileTree 토글
Ctrl+Shift+G   Diff Panel (Preview 안)
F11            Fullscreen 토글
```

---

## 상태 저장

```typescript
interface LayoutState {
  sidebar: 'expanded' | 'compact' | 'hidden';
  preview: 'visible' | 'hidden';
  terminal: 'visible' | 'hidden';
  fileTree: 'visible' | 'hidden';
  fullscreen: boolean;          // → preview 가 차지
  
  // 크기
  sidebar_width: number;
  chat_width: number;
  terminal_height: number;
  fileTree_width: number;
}
```

---

## 자동 collapse 규칙

```
좁은 창 (< 1024px):
  - Sidebar 자동 compact
  - Terminal 자동 hidden (사용자 명시 X)
  - FileTree 자동 hidden

매우 좁은 (< 768px):
  - Sidebar 자동 hidden
  - 단일 패널 모드 (Chat 만)
  - "전체 보기" 버튼 표시
```

```tsx
useEffect(() => {
  const updateLayout = () => {
    const width = window.innerWidth;
    
    if (width < 768) {
      setLayout({ sidebar: 'hidden', preview: 'hidden', /* ... */ });
    } else if (width < 1024) {
      setLayout({ sidebar: 'compact', /* ... */ });
    } else {
      // 사용자 preference 복원
    }
  };
  
  updateLayout();
  window.addEventListener('resize', updateLayout);
  return () => window.removeEventListener('resize', updateLayout);
}, []);
```

---

## Animation

토글 시 부드럽게:

```tsx
<AnimatePresence>
  {sidebarVisible && (
    <motion.div
      initial={{ width: 0, opacity: 0 }}
      animate={{ width: sidebarWidth, opacity: 1 }}
      exit={{ width: 0, opacity: 0 }}
      transition={{ duration: 0.2, ease: [0, 0, 0.2, 1] }}
    >
      <Sidebar />
    </motion.div>
  )}
</AnimatePresence>
```

---

## Performance

```
원칙: 패널 모두 mount 유지 (visibility 만 변경)

이유:
  - 재진입 시 빠름
  - State 보존 (스크롤 위치, 입력값 등)
  
예외:
  - 큰 작업 panel (대시보드 등): unmount 가능
```

---

## 관련

- [3panel.md](./3panel.md) — 기본 layout
- [floating-overlay.md](./floating-overlay.md) — Fullscreen 모드
- [../../ux/patterns/F-030-terminal.md](../../ux/patterns/F-030-terminal.md)
- [../../ux/patterns/F-031-filetree.md](../../ux/patterns/F-031-filetree.md)
