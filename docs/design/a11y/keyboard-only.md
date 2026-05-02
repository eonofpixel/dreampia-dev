---
title: A11y — Keyboard-Only Use
parent: ./_index.md
related:
  - ../interaction/keyboard.md
  - focus.md
status: draft
last_updated: 2026-05-02
---

# Keyboard-Only Use

> **한 줄 요약**: 마우스 USB 빼고 모든 기능 사용 가능. P3 의 핵심.

---

## 시험 시나리오

```
실제로 마우스 사용 X 하고 모든 기능 시도:

1. 새 채팅 만들기
2. 모델 선택 (drop down)
3. 메시지 입력 + 전송
4. 슬래쉬 명령 사용
5. @ 멘션 사용
6. 사이드바 채팅 전환
7. 검색 (Ctrl+K)
8. 권한 dropdown 변경
9. 설정 페이지 이동
10. 다크/라이트 토글
11. 자동화 만들기
12. 백업 / 복원
```

→ 모두 키보드만으로 가능해야.

---

## 표준 매핑

상세: [../interaction/keyboard.md](../interaction/keyboard.md).

```
Tab            다음 element
Shift+Tab      이전
Enter          primary 액션
Space          button click, toggle
Esc            취소 / 닫기
←→↑↓           navigation (list, tree, slider)
Home/End       처음/끝
Page Up/Down   큰 단위
```

---

## 단축키 (F-025)

```
패널 토글:
  Ctrl+\         사이드바
  Ctrl+J         터미널
  Ctrl+Shift+E   파일 트리
  F11            전체화면

검색 / 네비:
  Ctrl+K         검색 팔레트
  Ctrl+P         파일 quick open
  Ctrl+Shift+P   command palette
  Ctrl+1~9       채팅 점프

채팅 작업:
  Ctrl+Alt+P     고정
  Ctrl+Alt+R     이름 변경
  Ctrl+Shift+A   보관

그 외 모든 메뉴 단축키 표시 (학습 도움)
```

---

## 키보드 user 우선 디자인

### Tab order 자연스럽게

```
원칙: DOM 순서 = 시각 순서

✓ 좋음:
  좌상 → 우상 → 좌하 → 우하 (Z-pattern)
  
✗ 나쁨:
  CSS grid 로 순서 바꿈 → DOM 과 다름
  → 키보드 사용자 혼란
```

### Skip links

```tsx
// 첫 Tab 시 표시
<a href="#main" className="skip-link">메인 컨텐츠로 건너뛰기</a>
<a href="#chat-input" className="skip-link">채팅 입력으로</a>
```

### Focus visible 명확

```css
/* 키보드 사용자에게만 outline */
:focus-visible {
  outline: 2px solid var(--color-border-focus);
  outline-offset: 2px;
}
```

---

## 단축키 학습 곡선

### 디스커버리

```
사용자가 단축키 발견하는 방법:

1. Tooltip 에 표시
   "저장 (Ctrl+S)"

2. 메뉴에 표시
   "📌 채팅 고정      Ctrl+Alt+P"

3. Command palette 검색
   Ctrl+Shift+P → 모든 명령 + 단축키

4. 도움말 모달
   ? 누름 → 전체 단축키 표시
```

### Cheat sheet

```tsx
// ? 누르면 도움말
useHotkey('?', () => setShortcutsModalOpen(true), {
  enabled: !isInputFocused,    // input 안에선 X
});

<Modal open={shortcutsModalOpen} title="키보드 단축키">
  <ShortcutsTable groups={SHORTCUT_GROUPS} />
</Modal>
```

---

## 일반 작업 시 키보드 흐름

### 새 채팅 시작

```
Ctrl+N         새 채팅 (또는 Alt+Ctrl+N for quick)
Tab            (만약 사이드바에 focus 있으면) 입력으로
타이핑         메시지 입력
Enter          전송
```

### 슬래쉬 명령

```
Tab            입력창 focus
/              팔레트 열림
타이핑         filter
↑↓             선택
Enter          실행
Esc            취소
```

### 사이드바 채팅 전환

```
Ctrl+1         첫 번째 채팅
Ctrl+2         두 번째
...

또는:
Ctrl+\         사이드바 열기 (focus)
↑↓             채팅 navigate
Enter          선택
```

---

## 자주 빠뜨리는 곳

```
✗ 드래그 only 기능 (탭 reorder, panel resize)
   → 키보드 대안 필수 (←→ 또는 dedicated hotkey)

✗ Hover only 정보 (tooltip, popover)
   → focus 시도 표시되어야

✗ 마우스 관련 액션 (right-click)
   → context menu 키 또는 Shift+F10 지원

✗ Modal 안에서 Tab escape
   → focus trap 필수
```

---

## 검증 체크리스트

```
☐ 마우스 끄고 메인 작업 5개 완료
☐ 모든 버튼 / 링크 Tab 도달 가능
☐ Focus ring 시각적
☐ 단축키 디스커버리 (tooltip/menu)
☐ Modal focus trap
☐ Skip links
☐ 사이드바 / 패널 토글 키보드
☐ 한국어 IME 충돌 X (시험)
```

---

## 한국어 IME 특수성

```
한글 모드에서 단축키:
  ✓ Ctrl + 영문 letter  → 정상
  ✗ /, @ 등 특수문자  → 한글 변환

해결:
  - event.code 사용 (KeyA 같은 물리 위치)
  - IME composition 중 단축키 무시
  - / @ 트리거 시 영문 강제
```

상세: [../../i18n/ime.md](../../i18n/ime.md).

---

## 관련

- [../interaction/keyboard.md](../interaction/keyboard.md)
- [focus.md](./focus.md)
- [../../ux/patterns/F-025-shortcut-system.md](../../ux/patterns/F-025-shortcut-system.md)
- [../../i18n/ime.md](../../i18n/ime.md)
