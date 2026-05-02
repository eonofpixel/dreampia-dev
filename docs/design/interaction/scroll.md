---
title: Interaction — Scroll
parent: ../_index.md
status: draft
last_updated: 2026-05-02
---

# Scroll Patterns

> **한 줄 요약**: 부드러운 스크롤. 가상화 (큰 리스트). 자동 스크롤 (채팅).

---

## 기본 동작

```css
/* 부드러운 스크롤 */
html { scroll-behavior: smooth; }

/* Reduced motion 시 instant */
@media (prefers-reduced-motion: reduce) {
  html { scroll-behavior: auto; }
}

/* 사용자 정의 스크롤바 */
.scrollbar-custom {
  scrollbar-width: thin;
  scrollbar-color: var(--color-bg-tertiary) transparent;
}

.scrollbar-custom::-webkit-scrollbar {
  width: 8px;
  height: 8px;
}

.scrollbar-custom::-webkit-scrollbar-thumb {
  background: var(--color-bg-tertiary);
  border-radius: 4px;
}

.scrollbar-custom::-webkit-scrollbar-thumb:hover {
  background: var(--color-text-tertiary);
}
```

---

## 채팅 자동 스크롤

```tsx
function ChatPanel() {
  const containerRef = useRef<HTMLDivElement>(null);
  const [autoScroll, setAutoScroll] = useState(true);
  const messages = useMessages();
  
  // 새 메시지 추가 시 자동 스크롤
  useEffect(() => {
    if (autoScroll && containerRef.current) {
      containerRef.current.scrollTop = containerRef.current.scrollHeight;
    }
  }, [messages.length, autoScroll]);
  
  // 사용자가 위로 스크롤하면 auto-scroll 비활성
  const handleScroll = () => {
    const el = containerRef.current;
    if (!el) return;
    
    const isAtBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 100;
    setAutoScroll(isAtBottom);
  };
  
  return (
    <div 
      ref={containerRef}
      onScroll={handleScroll}
      className="flex-1 overflow-y-auto"
    >
      {messages.map(m => <ChatMessage key={m.id} message={m} />)}
    </div>
  );
}
```

→ 사용자 의도 존중. 위로 스크롤 = auto X.

---

## "맨 아래로" 버튼

```tsx
function ScrollToBottomButton({ visible, onClick }) {
  if (!visible) return null;
  
  return (
    <motion.button
      initial={{ opacity: 0, scale: 0.8 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.8 }}
      onClick={onClick}
      className="
        absolute bottom-20 right-4 z-10
        bg-accent text-accent-text rounded-full
        w-10 h-10 flex items-center justify-center
        shadow-lg
      "
      aria-label="맨 아래로"
    >
      <ChevronDown className="w-5 h-5" />
    </motion.button>
  );
}
```

→ Auto-scroll 비활성 + 새 메시지 있을 때 표시.

---

## Streaming 중 스크롤

AI 응답 streaming 시:

```tsx
function StreamingMessage({ partial }) {
  const ref = useRef<HTMLDivElement>(null);
  
  // partial 변경 마다 자동 스크롤 (단, 사용자가 위로 안 갔을 때)
  useEffect(() => {
    if (autoScrollEnabled) {
      ref.current?.scrollIntoView({ block: 'end', behavior: 'instant' });
    }
  }, [partial]);
  
  return <div ref={ref}>{partial}</div>;
}
```

→ Streaming 중에 끊임없이 새 텍스트 나오므로 매 update 마다.

---

## 가상화 (큰 리스트)

채팅 1000+ 또는 파일 트리 10K+:

```tsx
import { useVirtualizer } from '@tanstack/react-virtual';

function VirtualizedChatList({ messages }) {
  const parentRef = useRef<HTMLDivElement>(null);
  
  const virtualizer = useVirtualizer({
    count: messages.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 100,    // 평균 메시지 높이
    overscan: 5,                // 미리 렌더링 (스크롤 부드러움)
  });
  
  return (
    <div ref={parentRef} className="overflow-y-auto h-full">
      <div style={{ height: virtualizer.getTotalSize() }}>
        {virtualizer.getVirtualItems().map(virtualItem => (
          <div
            key={virtualItem.key}
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              width: '100%',
              transform: `translateY(${virtualItem.start}px)`,
            }}
          >
            <ChatMessage message={messages[virtualItem.index]} />
          </div>
        ))}
      </div>
    </div>
  );
}
```

→ DOM 노드 수 일정 (~20개) 유지. 100K 메시지도 부드럽게.

---

## Sticky headers

```tsx
<div className="overflow-y-auto">
  <div className="sticky top-0 bg-bg-secondary z-10">
    <SectionHeader>고정된 채팅</SectionHeader>
  </div>
  <div>
    {pinnedChats.map(...)}
  </div>
  
  <div className="sticky top-0 bg-bg-secondary z-10">
    <SectionHeader>최근 채팅</SectionHeader>
  </div>
  <div>
    {recentChats.map(...)}
  </div>
</div>
```

---

## Scroll snap (옵션)

```css
/* 탭 스크롤 시 한 탭씩 */
.scroll-snap-x {
  scroll-snap-type: x mandatory;
}

.scroll-snap-x > * {
  scroll-snap-align: start;
}
```

---

## Programmatic scroll

```tsx
// 부드럽게 특정 element 로
element.scrollIntoView({ behavior: 'smooth', block: 'center' });

// 즉시
container.scrollTop = container.scrollHeight;

// 픽셀 단위
container.scrollBy({ top: 100, behavior: 'smooth' });
```

---

## Infinite scroll (Phase 2)

```tsx
import { useInView } from 'react-intersection-observer';

function ChatList() {
  const [chats, setChats] = useState([]);
  const { ref, inView } = useInView();
  
  useEffect(() => {
    if (inView) loadMore();
  }, [inView]);
  
  return (
    <div>
      {chats.map(c => <ChatItem key={c.id} chat={c} />)}
      <div ref={ref}>로딩 중...</div>
    </div>
  );
}
```

---

## Accessibility

```
✓ 키보드 ↑↓ Page Up/Down 으로 스크롤 가능
✓ Focus 가 화면 밖이면 자동 스크롤 (focusin event)
✓ Sticky headers 가 키보드 navigation 차단 X
✓ 가상화 시 aria-rowcount + aria-rowindex
```

---

## 관련

- [../components/sidebar.md](../components/sidebar.md) — 사이드바 스크롤
- [../components/chat-message.md](../components/chat-message.md) — 채팅 자동 스크롤
