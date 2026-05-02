---
title: Interaction — Click
parent: ../_index.md
related:
  - hover.md
  - keyboard.md
status: draft
last_updated: 2026-05-02
---

# Click Patterns

> **한 줄 요약**: 100ms 이내 시각 응답. 누른 느낌 (active state).

---

## Active state

```css
.button:active {
  transform: translateY(1px);     /* 1px 아래 */
  background: var(--color-accent-active);   /* 더 진한 */
  transition: all 50ms ease-out;
}
```

→ 사용자가 "눌렀다" 인지.

---

## Click 영역 크기

### 최소 44px (WCAG)

```
✓ 좋음: 44×44px 이상
✗ 나쁨: 24×24px (작아서 클릭 어려움)

작은 아이콘 버튼:
  visual: 16×16px
  + padding: 14px (총 44×44 클릭 영역)
```

### 작은 컴포넌트 (Checkbox 등)

```css
.checkbox-wrapper {
  /* 시각 16×16, 클릭 44×44 */
  padding: 14px;
  margin: -14px;
}
```

---

## Double click

```
일반적으로 사용 X (사용자 혼란):
  ✗ 트리뷰 확장 = 더블클릭
  ✓ 트리뷰 확장 = 단일클릭 (chevron) 또는 enter

예외:
  ✓ 파일 열기 (탐색기 패턴)
  ✓ 텍스트 단어 선택 (브라우저 기본)
```

---

## Long press (Phase 2)

```
터치 환경:
  - 200ms+ 누르고 있음 = context menu (우클릭 대체)

데스크톱:
  - 거의 사용 X (우클릭으로 충분)
```

---

## Right click (Context menu)

```tsx
import * as ContextMenu from '@radix-ui/react-context-menu';

<ContextMenu.Root>
  <ContextMenu.Trigger>
    <FileItem />
  </ContextMenu.Trigger>
  
  <ContextMenu.Content>
    <ContextMenu.Item onSelect={open}>열기</ContextMenu.Item>
    <ContextMenu.Item onSelect={rename}>이름 변경</ContextMenu.Item>
    <ContextMenu.Item onSelect={delete} className="text-danger">
      삭제
    </ContextMenu.Item>
  </ContextMenu.Content>
</ContextMenu.Root>
```

→ 사이드바 채팅 우클릭 = 12개 메뉴 (라운드 4 발견).

---

## Click vs Mouseup

```
Click:    완전한 click (down + up 같은 element)
Mouseup:  드래그 시작 후도 trigger 가능

권장: onClick 사용 (드래그 false trigger 방지).
```

---

## Click outside (close modal/dropdown)

```tsx
useClickOutside(ref, () => setOpen(false));

// 또는 Radix UI 가 자동 처리:
<Popover.Content onPointerDownOutside={() => setOpen(false)} />
```

→ Modal, Dropdown, Popover 표준 동작.

### 예외: 항상 열려있어야 하는 경우

```tsx
<Modal modal={true}>     {/* 외부 클릭 무시 */}
  Critical action
</Modal>
```

---

## Loading 중 중복 click 방지

```tsx
function SaveButton() {
  const [saving, setSaving] = useState(false);
  
  const handleClick = async () => {
    if (saving) return;          // 중복 방지
    setSaving(true);
    try { await save(); }
    finally { setSaving(false); }
  };
  
  return (
    <Button onClick={handleClick} loading={saving} disabled={saving}>
      저장
    </Button>
  );
}
```

---

## 시각 피드백 timeline

```
0ms:     사용자 mouse down
100ms:   active state 표시 (배경 진해짐, 살짝 눌림)
~        click 발생
~        UI 변화 (loading 표시 또는 결과)
4초:     toast 알림 (선택)
```

---

## Mobile / Touch (참고)

```
Touch 시:
  - hover state 없음
  - active state 즉시 (300ms 지연 X with touch-action: manipulation)
  - 더 큰 클릭 영역 필요 (44px+)

우리 = 데스크톱 only 이므로 큰 이슈 X.
```

---

## 관련

- [hover.md](./hover.md)
- [keyboard.md](./keyboard.md) — Enter/Space 도 click 같음
- [../components/button.md](../components/button.md) — Button click 처리
