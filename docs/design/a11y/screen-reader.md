---
title: A11y — Screen Reader
parent: ./_index.md
related:
  - focus.md
  - keyboard-only.md
status: draft
last_updated: 2026-05-02
---

# Screen Reader Support

> **한 줄 요약**: NVDA + VoiceOver + JAWS 모두 동작. 한국어 음성 포함.

---

## 핵심 ARIA 속성

```
role               컴포넌트 종류 (button, dialog, etc.)
aria-label         스크린리더용 라벨
aria-labelledby    다른 element 의 텍스트로 라벨
aria-describedby   추가 설명 (hint, error)
aria-hidden        장식 element (읽지 않음)
aria-live          동적 컨텐츠 (자동 알림)
aria-expanded      토글 상태 (button, accordion)
aria-current       현재 위치 (nav, page)
aria-pressed       누름 상태 (toggle button)
aria-checked       checkbox / radio
aria-selected      tab / option
aria-disabled      비활성
aria-busy          로딩 중
```

---

## 자주 쓰는 패턴

### Icon-only button

```tsx
<button aria-label="설정 열기">
  <Settings aria-hidden="true" />
</button>
```

→ aria-label 필수. icon 자체는 aria-hidden.

### Form label

```tsx
<label htmlFor="email">이메일</label>
<input id="email" type="email" aria-describedby="email-hint email-error" />
<p id="email-hint">회사 이메일을 사용하세요</p>
{error && <p id="email-error" className="text-danger">{error}</p>}
```

### Dynamic content (loading, success)

```tsx
<div aria-live="polite">
  {loading ? '로딩 중...' : null}
</div>

<div aria-live="assertive" role="alert">
  {error ? `오류: ${error}` : null}
</div>
```

→ polite: 사용자 작업 끝나고 읽음. assertive: 즉시.

### Modal dialog

```tsx
<div role="dialog" aria-labelledby="modal-title" aria-describedby="modal-desc" aria-modal="true">
  <h2 id="modal-title">저장하시겠어요?</h2>
  <p id="modal-desc">변경 사항이 영구히 저장됩니다.</p>
  ...
</div>
```

→ Radix UI Dialog 가 자동 처리.

### Tabs

```tsx
<div role="tablist">
  <button role="tab" aria-selected={active} aria-controls="panel-1">
    탭 1
  </button>
</div>

<div role="tabpanel" id="panel-1">
  내용
</div>
```

### Tree (file tree)

```tsx
<div role="tree">
  <div role="treeitem" aria-expanded="true" aria-level="1">
    📁 src
    <div role="group">
      <div role="treeitem" aria-level="2">📄 foo.ts</div>
    </div>
  </div>
</div>
```

---

## sr-only 패턴

screen reader 만 읽음 (시각 hidden):

```css
.sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border-width: 0;
}
```

```tsx
// Heading 시각적 숨김 + 스크린리더 navigation 가능
<h2 className="sr-only">채팅 목록</h2>
<ul>
  {chats.map(...)}
</ul>
```

---

## 한국어 스크린리더

### NVDA (Windows)

```
설치: nvaccess.org
한국어 음성: 시스템에 설치된 한국어 TTS 사용 (Windows 기본)
```

### VoiceOver (macOS)

```
Cmd+F5 토글
한국어 자동 (시스템 언어 따름)
```

### 한국어 라벨 우선

```tsx
// ✓ 좋음
<button aria-label="새 채팅 만들기">+</button>

// ✗ 나쁨 (한국어 환경 사용자에게 영어 label)
<button aria-label="Create new chat">+</button>
```

---

## 한글 발음 도움 (Phase 2)

```tsx
// 약어, 영어가 한국어 환경에서 잘못 읽힘
<span aria-label="씨에스에스">CSS</span>
<span aria-label="자바스크립트">JS</span>
```

---

## Live region 패턴

```tsx
function StatusAnnouncer({ message, priority = 'polite' }) {
  return (
    <div 
      aria-live={priority}
      aria-atomic="true"     // 메시지 전체 다시 읽음
      className="sr-only"
    >
      {message}
    </div>
  );
}

// 사용
<StatusAnnouncer message={loadingMessage} />
<StatusAnnouncer message={errorMessage} priority="assertive" />
```

→ Toast / Banner 자동 사용.

---

## 테스트

### 수동 테스트

```
1. NVDA 켜기 (Insert+Q)
2. 마우스 끄고 키보드만 사용
3. 모든 페이지 navigate
4. 모든 버튼 / 링크 접근 가능 확인
5. Form 작성 가능 확인
6. Modal 열고 닫기
```

### 자동 테스트

```typescript
import { axe, toHaveNoViolations } from 'jest-axe';

expect.extend(toHaveNoViolations);

test('Button has no a11y violations', async () => {
  const { container } = render(<Button>저장</Button>);
  const results = await axe(container);
  expect(results).toHaveNoViolations();
});
```

---

## 개발 시 자동 알림

```tsx
// dev 모드에서 a11y 위반 시 console 경고
import React from 'react';

if (process.env.NODE_ENV !== 'production') {
  import('@axe-core/react').then(({ default: axe }) => {
    axe(React, ReactDOM, 1000);
  });
}
```

---

## 관련

- [focus.md](./focus.md) — Focus 관리
- [keyboard-only.md](./keyboard-only.md)
