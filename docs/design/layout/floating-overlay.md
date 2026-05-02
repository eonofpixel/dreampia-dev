---
title: Layout — Floating Chat Overlay
parent: ../_index.md
related:
  - 3panel.md
  - ../../ux/patterns/F-015-floating-overlay.md
status: draft
last_updated: 2026-05-02
---

# Floating Chat Overlay

> **한 줄 요약**: 전체화면 시 채팅이 떠있는 panel. F-015 의 구현.

---

## 시각

```
[전체화면 모드]
┌─────────────────────────────────────────────────────────────────┐
│                                                                 │
│              미리보기 (전체)                                     │
│                                                                 │
│                                                                 │
│                                                                 │
│                          ┌──────────────────────────────┐       │
│                          │ 최근 메시지              ⌄ │       │
│                          │ + ⚠ <입력>...   5.5 매우 높음│       │
│                          └──────────────────────────────┘       │
└─────────────────────────────────────────────────────────────────┘
                                     ↑
                                     z-index 1700 (최상위)
                                     bottom-4, centered
                                     50% width (max-w 800px)
                                     bg/85 + backdrop-blur
                                     shadow-lg
                                     rounded-t-xl
```

---

## 구현

```tsx
function FloatingChatOverlay({ visible }) {
  const [expanded, setExpanded] = useState(false);
  
  if (!visible) return null;
  
  return (
    <motion.div
      initial={{ y: 100, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      exit={{ y: 100, opacity: 0 }}
      className={cn(
        'fixed bottom-0 left-1/2 -translate-x-1/2',
        'z-[1700]',
        'w-full max-w-2xl',
        'bg-bg-elevated/85 backdrop-blur-xl',
        'rounded-t-xl shadow-lg',
        'border border-b-0 border-border-primary'
      )}
    >
      {/* 최근 메시지 expand */}
      <RecentMessagesExpander
        expanded={expanded}
        onToggle={() => setExpanded(!expanded)}
      />
      
      {/* 입력창 */}
      <ChatInputArea />
    </motion.div>
  );
}
```

---

## "최근 메시지 ›" expander (F-016)

```tsx
function RecentMessagesExpander({ expanded, onToggle }) {
  const recentTurns = useRecentTurns(10);
  
  return (
    <>
      <button
        onClick={onToggle}
        className="w-full px-4 py-2 flex items-center justify-between hover:bg-bg-tertiary/50 transition-colors"
      >
        <span className="text-sm">최근 메시지</span>
        <ChevronDown className={cn(
          'w-4 h-4 transition-transform',
          expanded && 'rotate-180'
        )} />
      </button>
      
      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ height: 0 }}
            animate={{ height: 'auto' }}
            exit={{ height: 0 }}
            className="overflow-hidden border-t border-border-primary"
          >
            <div className="max-h-[60vh] overflow-y-auto p-3 space-y-2">
              {recentTurns.map(turn => (
                <CompactTurn key={turn.id} turn={turn} />
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
```

---

## 입력창

```tsx
function ChatInputArea() {
  return (
    <div className="px-4 pb-3 pt-2">
      <Textarea
        placeholder="후속 변경 사항을 부탁하세요"
        autoResize
        className="bg-transparent border-none resize-none focus:ring-0"
      />
      
      <div className="flex items-center justify-between mt-2">
        <div className="flex gap-1">
          <IconButton tooltip="첨부"><Plus className="w-4 h-4" /></IconButton>
          <IconButton tooltip="음성"><Mic className="w-4 h-4" /></IconButton>
        </div>
        
        <div className="flex items-center gap-2 text-xs">
          <PermissionDropdown />
          <ModelDropdown />
          <SubmitButton />
        </div>
      </div>
    </div>
  );
}
```

---

## 위치 / 크기

```css
/* Default position */
.floating-chat {
  bottom: 0;
  left: 50%;
  transform: translateX(-50%);
  width: min(800px, 60vw);
}

/* Mobile / 좁은 창 */
@media (max-width: 768px) {
  .floating-chat {
    width: calc(100vw - 16px);
    margin: 0 8px;
  }
}
```

---

## 다른 미리보기 element 위에

```css
.floating-chat {
  z-index: var(--z-floating-chat);   /* 1700 */
}

/* 미리보기 BrowserView 자동으로 아래 (Electron 가 처리) */
```

---

## 드래그 가능 (Phase 2)

```tsx
<motion.div
  drag
  dragConstraints={parentRef}
  dragElastic={0.1}
  className="floating-chat"
>
  ...
</motion.div>
```

→ 사용자가 위치 자유 조정.

---

## 자동 hide (편의)

```tsx
function AutoHideFloatingChat() {
  const [visible, setVisible] = useState(true);
  const [hovered, setHovered] = useState(false);
  
  // 입력 안 한지 5초 + hover X = 슬며시 사라짐
  useIdle(5000, () => {
    if (!hovered) setVisible(false);
  });
  
  // 마우스가 하단 근처 = 다시 표시
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (e.clientY > window.innerHeight - 100) {
        setVisible(true);
      }
    };
    
    window.addEventListener('mousemove', handler);
    return () => window.removeEventListener('mousemove', handler);
  }, []);
  
  return <FloatingChatOverlay visible={visible} />;
}
```

---

## 관련

- [3panel.md](./3panel.md) — 일반 모드
- [../../ux/patterns/F-014-fullscreen.md](../../ux/patterns/F-014-fullscreen.md)
- [../../ux/patterns/F-015-floating-overlay.md](../../ux/patterns/F-015-floating-overlay.md)
- [../../ux/patterns/F-016-recent-messages.md](../../ux/patterns/F-016-recent-messages.md)
