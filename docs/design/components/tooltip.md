---
title: Components — Tooltip
parent: ./_index.md
related:
  - popover.md
status: draft
last_updated: 2026-05-02
---

# Tooltip

> **한 줄 요약**: 짧은 정보 hover 표시. 키보드 focus 시도 표시.

---

## Variants

```
[Standard]    회색 배경 + 흰 텍스트
[Subtle]      bg-secondary + 흰 (다크) / 검은 (라이트)
```

## Trigger

```
[hover]       300ms 지연 후 표시
[focus]       즉시 (키보드 사용자)
[long-press]  터치 (Phase 2)
```

---

## Visual Mockup

```
[버튼] ← 호버
   ↓ 300ms
   ┌──────────────┐
   │ 도움말 텍스트 │
   └──────┬───────┘
          ▼
        [버튼]
```

---

## 구현

```tsx
import * as Tooltip from '@radix-ui/react-tooltip';

export function TooltipProvider({ children, delay = 300 }) {
  return (
    <Tooltip.Provider delayDuration={delay} skipDelayDuration={500}>
      {children}
    </Tooltip.Provider>
  );
}

export function TooltipTrigger({ content, children, side = 'top', shortcut }) {
  return (
    <Tooltip.Root>
      <Tooltip.Trigger asChild>{children}</Tooltip.Trigger>
      
      <Tooltip.Portal>
        <Tooltip.Content
          side={side}
          sideOffset={6}
          className={cn(
            'z-[1500]',
            'bg-text-primary text-bg-primary',     // inverted
            'px-2 py-1 rounded text-xs',
            'shadow-base',
            'data-[state=delayed-open]:animate-in',
            'data-[state=delayed-open]:fade-in-0',
            'data-[state=delayed-open]:zoom-in-95',
          )}
        >
          {content}
          {shortcut && (
            <kbd className="ml-2 px-1 py-0.5 text-[10px] bg-bg-overlay rounded">
              {shortcut}
            </kbd>
          )}
          <Tooltip.Arrow className="fill-text-primary" />
        </Tooltip.Content>
      </Tooltip.Portal>
    </Tooltip.Root>
  );
}
```

---

## 사용 예시

```tsx
// 단순
<TooltipTrigger content="채팅 고정">
  <Button variant="ghost" size="sm" aria-label="고정">
    <Pin className="w-4 h-4" />
  </Button>
</TooltipTrigger>

// 단축키 표시
<TooltipTrigger content="저장" shortcut="Ctrl+S">
  <Button>저장</Button>
</TooltipTrigger>

// 풍부한 컨텐츠
<TooltipTrigger content={
  <div>
    <div className="font-medium">권한: 워크스페이스 쓰기</div>
    <div className="text-xs opacity-80 mt-1">
      작업 디렉토리 안 파일 수정 가능
    </div>
  </div>
}>
  <Badge>🔵 워크스페이스</Badge>
</TooltipTrigger>
```

---

## 사용 가이드

### 언제 사용

```
✓ Icon-only 버튼의 의미 설명
✓ 단축키 표시
✓ 짧은 도움말 (한 문장)
✓ Badge / 약자 풀이
```

### 사용 X

```
✗ 긴 본문 (1줄 이상은 popover/modal)
✗ 클릭 가능 컨텐츠 (마우스 떠나면 사라짐)
✗ 폼 검증 (inline error 사용)
✗ 모바일 only (터치 X)
```

---

## Touch / 모바일

```
터치 환경:
  - hover 없음 → tooltip 표시 X (기본)
  - long-press 옵션 (Phase 2)
  - 또는 별도 (i) info 버튼
```

→ Dreampia-Dev = Desktop only 이므로 큰 이슈 X.

---

## Accessibility

```
✓ aria-describedby 자동 (Radix)
✓ Focus 시도 표시 (키보드 사용자)
✓ 빠르게 dismiss (Esc)
✓ Screen reader 가 읽을 수 있음 (vs visual only)
```

---

## 성능

```
모든 버튼에 tooltip = 메모리 비용.
→ Radix UI 의 lazy 활용 (실제 hover 시만 렌더)
→ 또는 단일 Tooltip 인스턴스 + 동적 anchor (Phase 2)
```

---

## 안티 패턴

```
✗ 같은 정보를 label/aria-label 에도 + tooltip 에도 (중복)
✗ 마우스가 멀어진 후도 표시 유지
✗ 너무 빠른 등장 (50ms — 노이즈)
✗ 너무 느린 등장 (1000ms — 사용자 포기)
```

→ 권장 delay: 300ms (Material Design 표준).

---

## 관련

- [popover.md](./popover.md) — 더 큰 floating UI
- [../tokens/elevation.md](../tokens/elevation.md) — z-index
