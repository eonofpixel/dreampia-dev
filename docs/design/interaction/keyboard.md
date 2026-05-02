---
title: Interaction — Keyboard
parent: ../_index.md
related:
  - ../../ux/patterns/F-025-shortcut-system.md
  - ../a11y/keyboard-only.md
status: draft
last_updated: 2026-05-02
---

# Keyboard Interaction

> **한 줄 요약**: P3 키보드 우선. 마우스 USB 빼고 사용 가능해야.

---

## 표준 키 매핑

```
Tab           다음 focus
Shift+Tab     이전 focus
Enter         primary 액션 (Form 제출, 버튼 click)
Space         button click, checkbox toggle
Esc           모달/dropdown 닫기, 입력 취소

←→            inline navigation (탭, slider)
↑↓            list navigation (dropdown, tree)
Home/End      처음/끝
PageUp/Down   큰 step (10x)
```

---

## 단축키 시스템 (F-025)

상세: [docs/ux/patterns/F-025-shortcut-system.md](../../ux/patterns/F-025-shortcut-system.md).

### 채팅 작업

```
Ctrl+Alt+P   채팅 고정
Ctrl+Alt+R   이름 바꾸기
Ctrl+Shift+A 보관
Ctrl+Shift+C 작업 디렉토리 복사
Ctrl+Alt+I   세션 ID 복사
Ctrl+Alt+L   딥링크 복사
Alt+Ctrl+N   Quick Chat
```

### 검색 / 네비

```
Ctrl+1~9     1~9번째 채팅
Ctrl+K       검색 팔레트
Ctrl+P       파일 quick open
Ctrl+Shift+P Command palette
```

### 패널 토글

```
Ctrl+\       사이드바
Ctrl+J       터미널
Ctrl+Shift+E 파일 트리
Ctrl+Shift+G git diff
F11          전체화면
```

### 입력 컨텍스트

```
/  (입력 시작) → 슬래쉬 명령 팔레트
@  (입력 안)   → 멘션 팔레트
Esc            팔레트 취소
```

---

## Hotkey 라이브러리

```
react-hotkeys-hook    - 권장 (간단 + 효율)
mousetrap             - 오래됨
```

### 사용 예시

```tsx
import { useHotkeys } from 'react-hotkeys-hook';

function App() {
  useHotkeys('ctrl+k', () => openCommandPalette(), {
    enableOnFormTags: true,    // input 안에서도
  });
  
  useHotkeys('ctrl+1, ctrl+2, ctrl+3', (e) => {
    const num = parseInt(e.key);
    activateChat(num - 1);
  });
  
  useHotkeys('escape', () => {
    if (anyModalOpen) closeModal();
    else if (paletteOpen) closePalette();
  });
}
```

---

## 한국어 IME 충돌

```
한글 모드에서 단축키 인식 안 됨 (Codex 의 알려진 이슈).

회피 방법:
  1. KeyboardEvent.code 사용 (KeyA, KeyB 등 — 물리 위치)
     ✗ event.key (한글 변환 결과)
     ✓ event.code (KeyK)
  
  2. IME composition 중 단축키 무시:
     onCompositionStart → ignoreHotkeys=true
     onCompositionEnd → ignoreHotkeys=false
```

```tsx
// 권장: code 기반
window.addEventListener('keydown', (e) => {
  if (e.ctrlKey && e.code === 'KeyK') {
    openCommandPalette();
  }
});
```

상세: [../../i18n/ime.md](../../i18n/ime.md).

---

## Focus 관리

```
원칙: 사용자가 어디 있는지 항상 알 수 있어야.

✓ Focus ring 시각적
✓ Modal 열림 시 첫 입력에 자동 focus
✓ Modal 닫힘 시 trigger 로 focus 복귀
✓ 키보드 네비 시 부드럽게 이동 (스크롤도 따라감)
```

### Focus visible

```css
/* 마우스 클릭 시 focus ring X (마우스 사용자 노이즈) */
button:focus { outline: none; }

/* 키보드 사용자에게만 표시 */
button:focus-visible {
  outline: 2px solid var(--color-border-focus);
  outline-offset: 2px;
}
```

---

## Focus trap (modal)

```tsx
import { useFocusTrap } from '@radix-ui/react-focus-guards';

// Radix Dialog 가 자동 처리:
<Dialog.Content>
  {/* Focus 가 이 안에서 순환 */}
</Dialog.Content>
```

→ Tab 으로 escape 못 함 (modal 안에서만 순환).

---

## Skip links

```tsx
function SkipLinks() {
  return (
    <a 
      href="#main-content" 
      className="
        sr-only focus:not-sr-only
        absolute top-2 left-2 z-50
        bg-bg-elevated p-2 rounded
      "
    >
      메인 컨텐츠로 건너뛰기
    </a>
  );
}
```

→ 첫 Tab 시 표시. 사이드바 등 건너뛰고 본문으로.

---

## 입력 / 폼

```
Tab          다음 필드
Shift+Tab    이전 필드
Enter        Form 제출
Esc          취소 / 닫기
Space        Checkbox toggle
```

### 자동 완성 vs 단축키

```
브라우저 자동완성: input/select 의 autocomplete attribute
스피드 단축키: 폼에서도 Cmd+Enter = 제출 (Slack 패턴)
```

```tsx
<textarea 
  onKeyDown={(e) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
      submit();
    }
  }}
/>
```

---

## 단축키 학습 곡선

### 디스커버리

```
모든 hotkey 가 UI 에 표시:

Button label:    "저장 (Ctrl+S)"
Tooltip:         "저장 (Ctrl+S)"
Menu item:       "저장      Ctrl+S"
Command palette: 모든 명령 검색 가능
```

### Hotkey 도움말 모달

```tsx
useHotkey('?', () => setHelpOpen(true));   // ? 누르면 도움말

<Modal title="단축키 도움말" open={helpOpen}>
  <HotkeyTable groups={[
    { name: '채팅', items: [...] },
    { name: '네비', items: [...] },
    // ...
  ]} />
</Modal>
```

---

## 안티 패턴

```
✗ Tab 으로 도달 불가능한 버튼
✗ Focus ring 제거 (focus-visible 도)
✗ Esc 무시 (출구 차단)
✗ 단축키만 있고 menu/UI 없음 (디스커버리 X)
✗ event.key 만 사용 (한글 IME 충돌)
✗ 모달 닫혔을 때 trigger 로 focus 안 복귀
```

---

## 관련

- [../../ux/patterns/F-025-shortcut-system.md](../../ux/patterns/F-025-shortcut-system.md)
- [../a11y/keyboard-only.md](../a11y/keyboard-only.md)
- [../../i18n/ime.md](../../i18n/ime.md) — 한국어 IME
