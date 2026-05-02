---
title: Components — Sidebar
parent: ./_index.md
related:
  - ../layout/3panel.md
  - ../tokens/spacing.md
status: draft
last_updated: 2026-05-02
---

# Sidebar

> **한 줄 요약**: 좌측 286px 메뉴 + 채팅/프로젝트 리스트. F-013 의 핵심 컴포넌트.

---

## Variants

```
[Expanded]    286px 폭 (기본)
[Compact]     56px (아이콘만)
[Hidden]      완전 숨김 (전체화면 모드)
```

---

## Visual Mockup

```
[Expanded]
┌──────────────┐
│ ☰ 새 채팅   │  ← top action
├──────────────┤
│ 🔍 검색     │
│ 🔌 플러그인 │
│ 🤖 자동화   │
├──────────────┤
│ 프로젝트     │
│  pyeongtaek-portal│
│  another-project│
├──────────────┤
│ 채팅         │
│  📌 서버 열고 미리보기│
│  테스트 통과 │
│  리팩토링    │
│  ...        │
├──────────────┤
│ ⚙ 설정      │  ← bottom
└──────────────┘
```

---

## 구현

```tsx
function Sidebar({ collapsed = false }) {
  return (
    <aside className={cn(
      'flex flex-col h-full',
      'bg-bg-secondary border-r border-border-primary',
      'transition-all duration-200',
      collapsed ? 'w-14' : 'w-[286px]'
    )}>
      <SidebarHeader collapsed={collapsed} />
      <SidebarNav collapsed={collapsed} />
      <SidebarProjects collapsed={collapsed} />
      <SidebarChats collapsed={collapsed} />
      <SidebarFooter collapsed={collapsed} />
    </aside>
  );
}

function SidebarChats({ collapsed }) {
  const chats = useChats();
  const pinnedChats = chats.filter(c => c.pinned);
  const recentChats = chats.filter(c => !c.pinned).slice(0, 50);
  
  return (
    <nav className="flex-1 overflow-y-auto p-2">
      <SectionHeader>채팅</SectionHeader>
      
      {pinnedChats.length > 0 && (
        <>
          {pinnedChats.map((chat, i) => (
            <SidebarChatItem 
              key={chat.id}
              chat={chat}
              shortcut={i < 9 ? `Ctrl+${i + 1}` : undefined}
            />
          ))}
          <Divider />
        </>
      )}
      
      {recentChats.map(chat => (
        <SidebarChatItem key={chat.id} chat={chat} />
      ))}
    </nav>
  );
}

function SidebarChatItem({ chat, shortcut }) {
  return (
    <ContextMenu.Root>
      <ContextMenu.Trigger asChild>
        <button
          className={cn(
            'w-full flex items-center gap-2 px-3 py-2 rounded',
            'text-sm text-left truncate',
            'hover:bg-bg-tertiary',
            'data-[active=true]:bg-bg-tertiary data-[active=true]:font-medium'
          )}
          onClick={() => activateChat(chat.id)}
        >
          {chat.pinned && <Pin className="w-3 h-3 text-text-tertiary" />}
          <span className="flex-1 truncate">{chat.title}</span>
          {shortcut && (
            <kbd className="text-xs text-text-tertiary opacity-0 group-hover:opacity-100">
              {shortcut}
            </kbd>
          )}
        </button>
      </ContextMenu.Trigger>
      
      <ContextMenu.Content>
        {/* 채팅 ··· 12 옵션 (round 4 발견) */}
      </ContextMenu.Content>
    </ContextMenu.Root>
  );
}
```

---

## Compact (Collapsed)

```tsx
function CompactSidebar() {
  return (
    <aside className="w-14 bg-bg-secondary border-r border-border-primary flex flex-col">
      <TooltipTrigger content="새 채팅" side="right">
        <button className="p-3 hover:bg-bg-tertiary">
          <Plus className="w-5 h-5" />
        </button>
      </TooltipTrigger>
      
      <TooltipTrigger content="검색 (Ctrl+K)" side="right">
        <button className="p-3"><Search className="w-5 h-5" /></button>
      </TooltipTrigger>
      
      {/* ... */}
    </aside>
  );
}
```

---

## 검색 (Ctrl+K)

```tsx
// F-026 채팅 검색
function SidebarSearch() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  
  useHotkey('Ctrl+K', () => setOpen(true));
  
  return (
    <>
      <button onClick={() => setOpen(true)}>
        <Search className="w-4 h-4" />
        검색
        <kbd>Ctrl+K</kbd>
      </button>
      
      <CommandPalette open={open} onOpenChange={setOpen} query={query} />
    </>
  );
}
```

---

## 사이드바 토글

```typescript
// 단축키 Ctrl+\ (F-025)
useHotkey('Ctrl+\\', () => toggleSidebar());

// 또는 ☰ 햄버거 버튼
<TooltipTrigger content="사이드바 토글" shortcut="Ctrl+\\">
  <button onClick={toggleSidebar}>
    <Menu className="w-4 h-4" />
  </button>
</TooltipTrigger>
```

---

## Accessibility

```
✓ <aside> 시맨틱 태그
✓ <nav> 채팅 목록
✓ Tab 으로 모든 항목 도달
✓ 키보드: ↑↓ 채팅 목록 navigate
✓ Ctrl+1~9 빠른 점프
✓ 활성 채팅 명확 (font-medium + bg)
```

---

## 관련

- [../layout/3panel.md](../layout/3panel.md) — 3-패널 안에서의 위치
- [../../ux/patterns/F-026-chat-search.md](../../ux/patterns/F-026-chat-search.md) — 검색 + Ctrl+1~9
