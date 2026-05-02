---
title: A11y — Focus Management
parent: ./_index.md
related:
  - keyboard-only.md
  - ../interaction/keyboard.md
status: draft
last_updated: 2026-05-02
---

# Focus Management

> **한 줄 요약**: 사용자가 어디 있는지 항상 알 수 있게. focus-visible 우선.

---

## Focus ring

```css
/* 마우스 클릭 시 X (노이즈) */
button:focus { outline: none; }

/* 키보드 사용자에게만 */
button:focus-visible {
  outline: 2px solid var(--color-border-focus);
  outline-offset: 2px;
  border-radius: var(--radius-base);   /* 컴포넌트 같은 radius */
}
```

→ 모든 interactive element 에 적용.

---

## Focus order (Tab 순서)

```
표준: DOM 순서 따라 (자연스러움).

원칙:
  ✓ 좌→우, 위→아래 일반 reading 순서
  ✗ tabIndex 큰 숫자 (12, 13...) - 안티패턴
  
사용:
  tabIndex=0:    Tab 도달 가능 (자연 순서)
  tabIndex=-1:   programmatic focus 만 (Tab 불가)
  tabIndex=1+:   사용 X (DOM 순서 깨짐)
```

---

## Skip links

긴 메뉴 / 사이드바 건너뛰기:

```tsx
function SkipLinks() {
  return (
    <a 
      href="#main-content" 
      className="
        sr-only focus:not-sr-only
        absolute top-2 left-2 z-50
        bg-bg-elevated p-2 rounded shadow-md
      "
    >
      메인 컨텐츠로 건너뛰기
    </a>
  );
}

// 본문 시작점
<main id="main-content" tabIndex={-1}>
  ...
</main>
```

→ 첫 Tab 누름 → "건너뛰기" 표시 → Enter → main 으로 점프.

---

## Auto-focus (Modal, Popover)

```tsx
import { useRef, useEffect } from 'react';

function Modal({ open }) {
  const firstFieldRef = useRef<HTMLInputElement>(null);
  
  useEffect(() => {
    if (open) {
      // 열림 시 첫 입력 자동 focus
      firstFieldRef.current?.focus();
    }
  }, [open]);
  
  return (
    <Dialog>
      <Input ref={firstFieldRef} />
      ...
    </Dialog>
  );
}
```

→ Radix UI Dialog 가 자동 처리 (`autoFocus` 옵션).

---

## Focus 복귀

```tsx
function Modal({ open, onClose }) {
  // Modal 닫힘 시 trigger 로 focus 복귀
  // → Radix UI 자동 처리
  
  return (
    <Dialog.Root open={open} onOpenChange={onClose}>
      ...
    </Dialog.Root>
  );
}

// 수동 처리:
function CustomModal() {
  const triggerRef = useRef<HTMLButtonElement>(null);
  
  const close = () => {
    setOpen(false);
    triggerRef.current?.focus();    // 수동 복귀
  };
}
```

---

## Focus trap

```tsx
import { FocusTrap } from '@radix-ui/react-focus-scope';

<FocusTrap loop trapped>
  <Modal>
    {/* Tab 이 이 안에서만 순환 */}
    {/* Shift+Tab 도 마찬가지 */}
  </Modal>
</FocusTrap>
```

→ Modal, Drawer, Floating chat 등에 사용.

---

## Focus indicators in dark theme

```css
/* 다크 테마에선 outline 더 진하게 */
:root[data-theme="dark"] :focus-visible {
  outline: 2px solid var(--color-border-focus);
  outline-offset: 2px;
  
  /* 추가 glow 효과 (옵션) */
  box-shadow: 0 0 0 4px hsl(var(--color-accent) / 0.2);
}
```

---

## 키보드 navigation 패턴

```
Single tab stop (group):
  - Tab 으로 group 진입
  - 그 안은 ←→↑↓ 로 이동
  - Tab 으로 group 다음 element

예: Radio group
  Tab → 첫 radio focus
  ↑↓ → 다른 radio
  Tab → 다음 group

예: Tab 컴포넌트
  Tab → 활성 tab focus
  ←→ → 다른 tab
  Tab → tab 컨텐츠로 (다른 group)
```

---

## Roving tabindex (구현)

```tsx
function RadioGroup({ options, value, onChange }) {
  const [focusedIdx, setFocusedIdx] = useState(0);
  
  return (
    <div role="radiogroup" onKeyDown={handleKeyDown}>
      {options.map((opt, i) => (
        <button
          key={opt.value}
          role="radio"
          aria-checked={value === opt.value}
          tabIndex={i === focusedIdx ? 0 : -1}    // 한 element 만 tab 가능
          onClick={() => onChange(opt.value)}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
  
  function handleKeyDown(e) {
    if (e.key === 'ArrowDown') {
      const next = (focusedIdx + 1) % options.length;
      setFocusedIdx(next);
      ...
    }
  }
}
```

---

## 디버깅

```javascript
// 현재 focus element 확인
console.log(document.activeElement);

// Focus 변경 모니터링
document.addEventListener('focusin', (e) => {
  console.log('Focused:', e.target);
});
```

```css
/* 모든 focusable element 표시 (개발) */
[tabindex], button, a, input, select, textarea {
  outline: 1px dashed red !important;
}
```

---

## 검증 체크리스트

```
☐ Tab 으로 모든 액션 도달 가능
☐ Focus ring 명확히 보임 (focus-visible)
☐ Modal 열림 시 적절한 element 자동 focus
☐ Modal 닫힘 시 trigger 로 복귀
☐ Skip link 있음
☐ tabIndex > 0 사용 X
☐ Focus trap 있음 (modal, drawer)
☐ Roving tabindex (radio, tab, menu)
```

---

## 관련

- [keyboard-only.md](./keyboard-only.md) — 마우스 없이 사용
- [../interaction/keyboard.md](../interaction/keyboard.md) — 단축키
