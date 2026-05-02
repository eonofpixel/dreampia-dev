---
title: i18n — Keyboard Shortcuts (한글 모드)
parent: ./_index.md
related:
  - ime.md
  - ../design/interaction/keyboard.md
status: draft
last_updated: 2026-05-02
---

# Keyboard Shortcuts in Korean Mode

> **한 줄 요약**: event.code 사용. 한글 변환 무관 작동.

---

## Codex / Claude 의 알려진 issue

```
한글 입력 모드에서:
  Ctrl+K   → 'ㅎ' 인식 → 단축키 X
  Ctrl+S   → 'ㄴ' 인식 → 단축키 X

사용자가 영어 모드 전환 (한/영 키) 후 사용:
  → 매번 불편
  → Codex 개발자 풀 영어 가정 (한국 사용자 X 우선)
```

---

## Dreampia-Dev 해결

### event.code 사용

```typescript
// ✗ event.key (한글 변환)
window.addEventListener('keydown', (e) => {
  if (e.ctrlKey && e.key === 'k') {  // 한글 모드 X
    openCommandPalette();
  }
});

// ✓ event.code (물리 위치)
window.addEventListener('keydown', (e) => {
  if (e.ctrlKey && e.code === 'KeyK') {  // 한글이든 영문이든 OK
    openCommandPalette();
  }
});
```

상세: [ime.md](./ime.md).

---

## 단축키 테이블

```
Ctrl+K        → KeyK     검색 팔레트
Ctrl+P        → KeyP     파일 quick open
Ctrl+\        → Backslash 사이드바 토글
Ctrl+J        → KeyJ     터미널 토글
Ctrl+1~9      → Digit1~9 채팅 점프
F11           → F11      전체화면

Ctrl+Alt+P    → KeyP     채팅 고정
Ctrl+Alt+R    → KeyR     이름 변경
Ctrl+Alt+I    → KeyI     ID 복사
Ctrl+Alt+L    → KeyL     딥링크 복사
Ctrl+Shift+A  → KeyA     보관
Ctrl+Shift+C  → KeyC     CWD 복사
Ctrl+Shift+P  → KeyP     Command palette
```

→ 모두 event.code 사용.

---

## 함수 키 (특수)

```
F11        F11
F12        F12
Esc        Escape
Enter      Enter
Tab        Tab
Space      Space
Backspace  Backspace
Delete     Delete
```

→ 함수 키는 한글 모드 영향 X. event.key 사용 OK.

---

## 입력 컨텍스트별

```
Input / Textarea 안:
  - Tab: 다음 element (form context)
  - Enter: 줄바꿈 (textarea) / 제출 (input)
  - Esc: 입력 취소
  - 단축키 우선 막힘 (typing 우선)

Input 외:
  - 모든 단축키 작동
```

```typescript
function shouldHandleHotkey(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return true;
  
  const tag = target.tagName;
  
  if (tag === 'INPUT' || tag === 'TEXTAREA' || target.isContentEditable) {
    // Input 안에선 일부 hotkey 만 (Esc 등)
    return false;
  }
  
  return true;
}
```

---

## Command Palette (Ctrl+Shift+P)

```
모든 명령 + 단축키 검색:

Ctrl+Shift+P 누름 →
  ┌────────────────────────────────────────┐
  │ > 검색...                              │
  ├────────────────────────────────────────┤
  │ 파일 열기                Ctrl+P        │
  │ 검색                     Ctrl+K        │
  │ 사이드바 토글            Ctrl+\        │
  │ 터미널                   Ctrl+J        │
  │ 채팅 1로                 Ctrl+1        │
  │ ...                                    │
  └────────────────────────────────────────┘
```

→ 사용자가 단축키 모르더라도 명령 검색 가능.

---

## 단축키 표시

각 컴포넌트에:

```tsx
// Tooltip
<TooltipTrigger content="저장" shortcut="Ctrl+S">
  <Button>저장</Button>
</TooltipTrigger>

// Menu
<MenuItem>
  <Save className="w-4 h-4" />
  <span>저장</span>
  <kbd className="ml-auto text-xs">Ctrl+S</kbd>
</MenuItem>

// Help modal
useHotkey('?', () => setShortcutsModalOpen(true));
```

---

## OS 차이

```
Windows / Linux:
  Ctrl+S       저장
  
macOS:
  Cmd+S        저장   (Cmd = Meta key)

Cross-platform helper:
  function getModKey() {
    return navigator.platform.includes('Mac') ? 'metaKey' : 'ctrlKey';
  }
  
  if (e[getModKey()] && e.code === 'KeyS') save();
```

---

## 검증 (테스트)

```typescript
test('Ctrl+K opens palette in Korean mode', () => {
  // 한글 입력 모드 시뮬레이션
  fireEvent.keyDown(window, {
    ctrlKey: true,
    key: 'ㅎ',          // 한글 변환
    code: 'KeyK',       // 물리 위치
  });
  
  expect(screen.getByRole('searchbox')).toBeVisible();
});
```

---

## 사용자 커스텀

```
설정 → 단축키:
  채팅 고정      [Ctrl+Alt+P]    [재설정]
  이름 변경      [Ctrl+Alt+R]    [재설정]
  ...
  
  [모두 기본값으로]
```

```typescript
interface ShortcutConfig {
  action: string;
  combo: string;          // "ctrl+alt+p"
  custom?: boolean;
}

// 충돌 감지
function detectConflicts(shortcuts: ShortcutConfig[]): Conflict[] {
  const map = new Map<string, string[]>();
  
  for (const s of shortcuts) {
    const list = map.get(s.combo) ?? [];
    list.push(s.action);
    map.set(s.combo, list);
  }
  
  return Array.from(map.entries())
    .filter(([_, actions]) => actions.length > 1)
    .map(([combo, actions]) => ({ combo, actions }));
}
```

---

## 관련

- [ime.md](./ime.md)
- [../design/interaction/keyboard.md](../design/interaction/keyboard.md)
- [../ux/patterns/F-025-shortcut-system.md](../ux/patterns/F-025-shortcut-system.md)
