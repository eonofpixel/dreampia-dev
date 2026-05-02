---
title: Components — Popover
parent: ./_index.md
related:
  - dropdown.md
  - tooltip.md
status: draft
last_updated: 2026-05-02
---

# Popover

> **한 줄 요약**: 자유 형식 floating UI. / 슬래쉬 + @ 멘션 팔레트의 기반.

---

## Variants

```
[Standard]    일반 popover
[Palette]     검색 + 결과 (/, @ 팔레트)
[Picker]      날짜/색 picker
[Floating]    위치 자유 (anchor 따라가기)
```

---

## Visual Mockup (/ 팔레트)

```
사용자 입력: /
            ↓
┌─────────────────────────────────────────────────────┐
│ [검색 fuzzy 자동]                                    │ ← 입력창 위
│                                                      │
│ prompts:analyst    Pre-planning consultant ... (Opus)│ ← hover/keyboard ↑↓
│ prompts:architect  Strategic Architecture ... (Opus) │
│ prompts:critic     Work plan review (Opus)           │
│ /플랜 모드        Plan checklist + browser tool     │
│ /속도형           Fast mode                         │
│ ...                                                  │
└─────────────────────────────────────────────────────┘

위치:    input 위 (위 공간 부족하면 아래)
크기:    input 폭과 같거나 약간 넓게
shadow:  md
animation: fade + slight slide
```

---

## 구현

```tsx
import * as Popover from '@radix-ui/react-popover';
import { motion, AnimatePresence } from 'framer-motion';

export function PopoverContainer({ open, onOpenChange, anchor, children, side = 'top' }) {
  return (
    <Popover.Root open={open} onOpenChange={onOpenChange}>
      <Popover.Anchor asChild>{anchor}</Popover.Anchor>
      
      <Popover.Portal>
        <AnimatePresence>
          {open && (
            <Popover.Content
              side={side}
              align="start"
              sideOffset={8}
              avoidCollisions
              asChild
            >
              <motion.div
                initial={{ opacity: 0, y: side === 'top' ? 8 : -8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: side === 'top' ? 8 : -8 }}
                transition={{ duration: 0.15 }}
                className={cn(
                  'z-[1400]',
                  'bg-bg-elevated rounded-md shadow-md',
                  'border border-border-primary'
                )}
              >
                {children}
              </motion.div>
            </Popover.Content>
          )}
        </AnimatePresence>
      </Popover.Portal>
    </Popover.Root>
  );
}
```

---

## 슬래쉬 명령 팔레트 (F-018)

```tsx
function SlashCommandPalette({ open, anchor, query, onSelect, onClose }) {
  const commands = useSlashCommands();
  const filtered = useMemo(() => fuzzyFilter(commands, query), [commands, query]);
  const [highlightIdx, setHighlightIdx] = useState(0);
  
  // 키보드 navigation
  useEffect(() => {
    if (!open) return;
    
    const handler = (e: KeyboardEvent) => {
      switch (e.key) {
        case 'ArrowDown':
          e.preventDefault();
          setHighlightIdx(i => Math.min(i + 1, filtered.length - 1));
          break;
        case 'ArrowUp':
          e.preventDefault();
          setHighlightIdx(i => Math.max(i - 1, 0));
          break;
        case 'Enter':
          e.preventDefault();
          onSelect(filtered[highlightIdx]);
          break;
        case 'Escape':
          onClose();
          break;
      }
    };
    
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [open, filtered, highlightIdx, onSelect, onClose]);
  
  return (
    <PopoverContainer open={open} anchor={anchor} side="top">
      <div className="w-[600px] max-h-[400px] overflow-y-auto py-1">
        {filtered.length === 0 ? (
          <div className="px-3 py-4 text-sm text-text-tertiary text-center">
            검색 결과 없음
          </div>
        ) : (
          filtered.map((cmd, i) => (
            <CommandRow
              key={cmd.id}
              command={cmd}
              highlighted={i === highlightIdx}
              onClick={() => onSelect(cmd)}
              onMouseEnter={() => setHighlightIdx(i)}
            />
          ))
        )}
      </div>
    </PopoverContainer>
  );
}

function CommandRow({ command, highlighted, onClick, onMouseEnter }) {
  return (
    <button
      onClick={onClick}
      onMouseEnter={onMouseEnter}
      className={cn(
        'w-full text-left px-3 py-2 flex items-center gap-3',
        highlighted && 'bg-bg-tertiary'
      )}
    >
      <code className="font-mono text-sm">{command.id}</code>
      <span className="flex-1 text-sm text-text-secondary truncate">
        {command.description}
      </span>
      {command.model && (
        <Badge variant="outline" size="xs">{command.model}</Badge>
      )}
    </button>
  );
}
```

---

## @ 멘션 팔레트 (F-019)

```tsx
function MentionPalette({ open, anchor, query, onSelect }) {
  const agents = useAgents();
  const files = useFiles(query);
  const filteredAgents = fuzzyFilter(agents, query);
  
  return (
    <PopoverContainer open={open} anchor={anchor} side="top">
      <div className="w-[500px] max-h-[400px] overflow-y-auto py-1">
        {/* Agents 섹션 */}
        <SectionHeader>에이전트</SectionHeader>
        {filteredAgents.map(a => (
          <MentionRow 
            key={a.id} 
            kind="agent"
            id={a.id}
            display={a.name}
            description={a.description}
            onSelect={() => onSelect({ kind: 'agent', id: a.id, display: a.name })}
          />
        ))}
        
        {/* Files 섹션 */}
        <SectionHeader>파일</SectionHeader>
        {files.length === 0 ? (
          <div className="px-3 py-2 text-sm text-text-tertiary">
            파일을 검색하려면 입력하세요.
          </div>
        ) : (
          files.map(f => (
            <MentionRow
              key={f.path}
              kind="file"
              id={f.path}
              display={f.name}
              description={f.path}
              onSelect={() => onSelect({ kind: 'file', id: f.path, display: f.name })}
            />
          ))
        )}
      </div>
    </PopoverContainer>
  );
}
```

---

## Accessibility

```
✓ Trigger 와 popover ARIA 연결 (aria-controls, aria-expanded)
✓ Keyboard navigation 자동 (Radix)
✓ Focus trap (옵션)
✓ Esc 로 닫기
✓ 외부 클릭으로 닫기
```

### 한국어 IME 충돌 회피

```tsx
// IME 조합 중 ↑↓ 키 무시
function useArrowKeyNav() {
  const [isComposing, setIsComposing] = useState(false);
  
  return {
    onCompositionStart: () => setIsComposing(true),
    onCompositionEnd: () => setIsComposing(false),
    onKeyDown: (e: KeyboardEvent) => {
      if (isComposing) return;     // ★ IME 우선
      
      if (e.key === 'ArrowDown') {
        // ...
      }
    },
  };
}
```

---

## 위치 결정 (auto-flip)

```
사용자 위치 시도 순서 (Radix):
  1. 선호 (예: top)
  2. 반대 (top 안 되면 bottom)
  3. 좌/우
  4. 마지막 viewport 안
```

→ avoidCollisions=true 자동.

---

## 관련

- [dropdown.md](./dropdown.md) — Dropdown 메뉴
- [tooltip.md](./tooltip.md) — Tooltip
- [../../ux/patterns/F-018-slash-commands.md](../../ux/patterns/F-018-slash-commands.md)
- [../../ux/patterns/F-019-mention-palette.md](../../ux/patterns/F-019-mention-palette.md)
