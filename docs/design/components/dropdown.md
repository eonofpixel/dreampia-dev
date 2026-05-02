---
title: Components — Dropdown
parent: ./_index.md
related:
  - ../tokens/elevation.md
  - popover.md
status: draft
last_updated: 2026-05-02
---

# Dropdown

> **한 줄 요약**: Trigger 클릭 → 메뉴 표시. 권한 dropdown (F-027), 모델 선택 (F-023, F-028) 핵심.

---

## Variants

```
[Menu]      액션 목록 (저장 / 삭제 / ...)
[Select]    값 선택 (단일)
[MultiSelect] 다중 선택
[ContextMenu] 우클릭 메뉴
[ChatTitle] 채팅 ··· 메뉴 (12 옵션 — 라운드 4 발견)
```

## Sizes

```
[sm]    text-sm,  좁은 (모델 선택)
[md]    text-sm,  표준  ★
[lg]    text-base, 큰
```

---

## Visual Mockup

```
[Menu] (채팅 ···)
        ··· 클릭
         ↓
┌─────────────────────────────────┐
│ 📌 채팅 고정         Ctrl+Alt+P │
│ ✏ 채팅 이름 바꾸기   Ctrl+Alt+R │
│ 💾 채팅 보관         Ctrl+Shift+A│
│ ─────────────                   │
│ 📋 작업 디렉토리 복사            │
│ 🆔 세션 ID 복사                 │
│ 🔗 딥링크 복사                  │
│ 📄 Markdown으로 복사            │
│ ─────────────                   │
│ 🔀 사이드 채팅 열기              │
│ 🍴 로컬로 포크                   │
│ 🌳 새 작업 트리로 포크           │
│ 🤖 자동화 추가...               │
│ 📦 미니 창에서 열기              │
└─────────────────────────────────┘

[Select] (권한 — F-027)
[🔵 워크스페이스 쓰기 ▼]  ← trigger
         ↓
┌─────────────────────────────┐
│ 🔵 워크스페이스 쓰기 (기본) │ ← 현재
├─────────────────────────────┤
│ 🔒 읽기 전용                │
│ 🔵 워크스페이스 쓰기        │
│ 🔓 전체 접근                │
│ ⚙ 사용자 지정...            │
└─────────────────────────────┘
```

---

## 구현 (Menu)

```tsx
import * as Dropdown from '@radix-ui/react-dropdown-menu';

export function DropdownMenu({ trigger, items }) {
  return (
    <Dropdown.Root>
      <Dropdown.Trigger asChild>{trigger}</Dropdown.Trigger>
      
      <Dropdown.Portal>
        <Dropdown.Content
          sideOffset={4}
          className={cn(
            'z-[1400] min-w-[200px]',
            'bg-bg-elevated rounded-md shadow-md',
            'p-1',
            'animate-in fade-in-0 zoom-in-95',
          )}
        >
          {items.map((item, i) => {
            if (item.type === 'separator') {
              return <Dropdown.Separator key={i} className="h-px bg-border-primary my-1" />;
            }
            
            return (
              <Dropdown.Item
                key={item.value}
                onSelect={item.onSelect}
                disabled={item.disabled}
                className={cn(
                  'flex items-center gap-2 px-3 py-2 text-sm rounded',
                  'cursor-default outline-none',
                  'data-[highlighted]:bg-bg-tertiary',
                  'data-[disabled]:opacity-50 data-[disabled]:pointer-events-none'
                )}
              >
                {item.icon && <span className="w-4 h-4">{item.icon}</span>}
                <span className="flex-1">{item.label}</span>
                {item.shortcut && (
                  <kbd className="text-xs text-text-tertiary">{item.shortcut}</kbd>
                )}
              </Dropdown.Item>
            );
          })}
        </Dropdown.Content>
      </Dropdown.Portal>
    </Dropdown.Root>
  );
}
```

---

## Select 구현

```tsx
import * as Select from '@radix-ui/react-select';

export function SelectField({ value, onChange, options, placeholder }) {
  return (
    <Select.Root value={value} onValueChange={onChange}>
      <Select.Trigger className={cn(
        'flex items-center justify-between gap-2',
        'h-10 px-3 rounded',
        'bg-bg-secondary border border-border-primary',
        'text-sm hover:border-border-secondary',
        'focus:outline-none focus:ring-2 focus:ring-accent/20'
      )}>
        <Select.Value placeholder={placeholder} />
        <Select.Icon><ChevronDown className="w-4 h-4" /></Select.Icon>
      </Select.Trigger>
      
      <Select.Portal>
        <Select.Content className="z-[1400] bg-bg-elevated rounded shadow-md p-1">
          <Select.Viewport>
            {options.map(opt => (
              <Select.Item
                key={opt.value}
                value={opt.value}
                className={cn(
                  'flex items-center gap-2 px-3 py-2 text-sm rounded',
                  'cursor-default outline-none',
                  'data-[highlighted]:bg-bg-tertiary',
                  'data-[state=checked]:bg-accent/10'
                )}
              >
                {opt.icon}
                <Select.ItemText>{opt.label}</Select.ItemText>
              </Select.Item>
            ))}
          </Select.Viewport>
        </Select.Content>
      </Select.Portal>
    </Select.Root>
  );
}
```

---

## 사용 예시

### 채팅 ··· 메뉴 (F-라운드 4)

```tsx
<DropdownMenu
  trigger={<Button variant="ghost" size="sm" aria-label="더보기">···</Button>}
  items={[
    { value: 'pin', icon: '📌', label: '채팅 고정', shortcut: 'Ctrl+Alt+P', onSelect: pinChat },
    { value: 'rename', icon: '✏', label: '채팅 이름 바꾸기', shortcut: 'Ctrl+Alt+R', onSelect: renameChat },
    { value: 'archive', icon: '💾', label: '채팅 보관', shortcut: 'Ctrl+Shift+A', onSelect: archive },
    { type: 'separator' },
    { value: 'copy-cwd', icon: '📋', label: '작업 디렉토리 복사', onSelect: copyCwd },
    { value: 'copy-id', icon: '🆔', label: '세션 ID 복사', onSelect: copyId },
    { value: 'deeplink', icon: '🔗', label: '딥링크 복사', onSelect: copyDeepLink },
    { value: 'markdown', icon: '📄', label: 'Markdown으로 복사', onSelect: exportMarkdown },
    { type: 'separator' },
    { value: 'side', icon: '🔀', label: '사이드 채팅 열기', onSelect: openSide },
    { value: 'fork-local', icon: '🍴', label: '로컬로 포크', onSelect: forkLocal },
    { value: 'fork-tree', icon: '🌳', label: '새 작업 트리로 포크', onSelect: forkTree },
    { value: 'automation', icon: '🤖', label: '자동화 추가...', onSelect: addAutomation },
    { value: 'mini', icon: '📦', label: '미니 창에서 열기', onSelect: openMini },
  ]}
/>
```

### 권한 dropdown (F-027)

```tsx
<SelectField
  value={level}
  onChange={setLevel}
  options={[
    { value: 'read_only', icon: '🔒', label: '읽기 전용' },
    { value: 'workspace_write', icon: '🔵', label: '워크스페이스 쓰기' },
    { value: 'full_access', icon: '🔓', label: '전체 접근' },
    { value: 'custom', icon: '⚙', label: '사용자 지정...' },
  ]}
/>
```

### 모델 선택 (F-023, F-028)

```tsx
<SelectField
  value={model}
  onChange={setModel}
  options={[
    { value: 'gpt-5.5', label: 'GPT-5.5' },
    { value: 'gpt-5', label: 'GPT-5' },
    { value: 'gpt-5-mini', label: 'GPT-5 mini' },
    { value: 'gpt-5-nano', label: 'GPT-5 nano' },
    { value: 'claude-opus-4-7', label: 'Claude Opus 4.7' },
    { value: 'claude-sonnet-4-6', label: 'Claude Sonnet 4.6' },
  ]}
/>
```

### Context Menu (우클릭)

```tsx
import * as ContextMenu from '@radix-ui/react-context-menu';

<ContextMenu.Root>
  <ContextMenu.Trigger>
    <ChatItem />
  </ContextMenu.Trigger>
  
  <ContextMenu.Content className="...">
    {/* 채팅 ··· 메뉴와 같은 옵션들 */}
  </ContextMenu.Content>
</ContextMenu.Root>
```

---

## Accessibility

```
✓ Trigger = role="button"
✓ Menu = role="menu"
✓ Items = role="menuitem"
✓ 키보드: ↑↓ 이동, Enter 선택, Esc 닫기
✓ Focus 자동 (열림 시 첫 항목)
✓ Type-ahead (item 첫 글자 입력 시 점프)
```

### 한국어 type-ahead

```
"채" 입력 → "채팅 고정", "채팅 이름..." 점프

→ Radix UI 가 자동 처리.
```

---

## 관련

- [../tokens/elevation.md](../tokens/elevation.md) — z-index, shadow
- [popover.md](./popover.md) — Popover (/, @ 팔레트)
- [../../ux/patterns/F-027-permission-dropdown.md](../../ux/patterns/F-027-permission-dropdown.md)
