---
title: Components — Tab
parent: ./_index.md
related:
  - ../tokens/colors.md
status: draft
last_updated: 2026-05-02
---

# Tab

> **한 줄 요약**: Radix UI Tabs 위. 미리보기 멀티탭 (F-017) 핵심 컴포넌트.

---

## Variants

```
[Standard]      가로 일반 탭 (line-bottom 강조)
[Pills]         둥근 알약 모양
[Vertical]      세로 (settings 사이드바)
[Browser]       Chrome 같은 브라우저 탭 (X 버튼 + 드래그)
```

## States

```
[default]      회색 텍스트
[hover]        진해짐
[active]       파란 line-bottom + 텍스트 진하게
[disabled]     opacity 50%
```

---

## Visual Mockup

```
[Standard]
┌──────────────────────────────────────────┐
│ 일반    모양    구성    MCP 서버    깃    │
│ ────                                     │
└──────────────────────────────────────────┘
       ↑ active = bottom border (2px)

[Browser - F-017 미리보기]
┌──────────────────────────────────────────┐
│ [검토] [평택문화원 업무포털 ×] [hr.html ×] [+] │
└──────────────────────────────────────────┘
   각 탭 = 닫기 버튼 (×) + 드래그 가능

[Pills]
( 전체 ) ( 활성 ) ( 보관 )
   ↑ active = 파란 배경
```

---

## 구현

```tsx
import * as Tabs from '@radix-ui/react-tabs';

export function Tab({ defaultValue, items, variant = 'standard' }) {
  return (
    <Tabs.Root defaultValue={defaultValue} className="w-full">
      <Tabs.List className={cn('flex', LIST_VARIANTS[variant])}>
        {items.map(item => (
          <Tabs.Trigger
            key={item.value}
            value={item.value}
            className={cn('px-4 py-2 transition-colors', TRIGGER_VARIANTS[variant])}
          >
            {item.label}
          </Tabs.Trigger>
        ))}
      </Tabs.List>
      
      {items.map(item => (
        <Tabs.Content key={item.value} value={item.value}>
          {item.content}
        </Tabs.Content>
      ))}
    </Tabs.Root>
  );
}

const LIST_VARIANTS = {
  standard: 'border-b border-border-primary',
  pills: 'gap-2 bg-bg-secondary p-1 rounded',
  vertical: 'flex-col w-48 border-r border-border-primary',
};

const TRIGGER_VARIANTS = {
  standard: 
    'text-text-secondary hover:text-text-primary ' +
    'border-b-2 border-transparent ' +
    'data-[state=active]:border-accent data-[state=active]:text-text-primary',
  pills: 
    'rounded text-text-secondary hover:text-text-primary ' +
    'data-[state=active]:bg-accent data-[state=active]:text-accent-text',
};
```

---

## Browser Tab (F-017)

```tsx
function BrowserTabs({ tabs, activeId, onActivate, onClose, onAdd }) {
  return (
    <div className="flex items-center bg-bg-tertiary border-b border-border-primary">
      {tabs.map(tab => (
        <BrowserTab
          key={tab.id}
          {...tab}
          active={tab.id === activeId}
          onActivate={() => onActivate(tab.id)}
          onClose={() => onClose(tab.id)}
        />
      ))}
      
      <button onClick={onAdd} className="px-3 py-2 hover:bg-bg-secondary" aria-label="새 탭">
        <Plus className="w-4 h-4" />
      </button>
    </div>
  );
}

function BrowserTab({ title, favicon, active, onActivate, onClose }) {
  return (
    <div
      role="tab"
      aria-selected={active}
      onClick={onActivate}
      className={cn(
        'flex items-center gap-2 px-3 py-2',
        'border-r border-border-primary',
        'cursor-pointer max-w-[200px]',
        active 
          ? 'bg-bg-primary' 
          : 'bg-bg-tertiary hover:bg-bg-secondary'
      )}
    >
      {favicon && <img src={favicon} className="w-4 h-4" alt="" />}
      <span className="truncate text-sm">{title}</span>
      <button
        onClick={(e) => {
          e.stopPropagation();
          onClose();
        }}
        className="p-0.5 hover:bg-bg-tertiary rounded"
        aria-label="탭 닫기"
      >
        <X className="w-3 h-3" />
      </button>
    </div>
  );
}
```

---

## 사용 예시

```tsx
// 일반
<Tab
  defaultValue="general"
  items={[
    { value: 'general', label: '일반', content: <GeneralSettings /> },
    { value: 'theme', label: '모양', content: <ThemeSettings /> },
    { value: 'mcp', label: 'MCP 서버', content: <McpSettings /> },
  ]}
/>

// 브라우저 (F-017)
<BrowserTabs
  tabs={[
    { id: 'review', title: '검토' },
    { id: 'preview', title: '평택문화원', url: '...', favicon: '...' },
  ]}
  activeId="review"
  onActivate={(id) => switchTab(id)}
  onClose={(id) => closeTab(id)}
  onAdd={() => addTab()}
/>

// Vertical (settings)
<Tab variant="vertical" items={[...]} />
```

---

## 키보드

```
←→         이전/다음 탭
Home/End   첫/마지막 탭
Tab        탭 컨텐츠로 이동
Ctrl+W     활성 탭 닫기 (Browser variant)
Ctrl+T     새 탭 (Browser variant)
Ctrl+1~9   N번째 탭
```

---

## 드래그 (Phase 2)

```tsx
import { DndContext, useSortable } from '@dnd-kit/core';

function DraggableTabs({ tabs, onReorder }) {
  return (
    <DndContext onDragEnd={handleReorder}>
      <SortableContext items={tabs.map(t => t.id)}>
        {tabs.map(tab => <SortableTab key={tab.id} {...tab} />)}
      </SortableContext>
    </DndContext>
  );
}
```

---

## 관련

- [../tokens/colors.md](../tokens/colors.md) — 활성 / hover 색
- [../../ux/patterns/F-017-preview-tabs.md](../../ux/patterns/F-017-preview-tabs.md) — 미리보기 탭 패턴
