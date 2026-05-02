---
title: States — Disabled
parent: ../_index.md
related:
  - ../components/button.md
status: draft
last_updated: 2026-05-02
---

# Disabled State

> **한 줄 요약**: 시각적 비활성. 항상 "왜?" 명시.

---

## 시각

```
[Default]                [Disabled]
┌───────────┐           ┌───────────┐
│  저장     │   →       │  저장     │
└───────────┘           └───────────┘
                          opacity: 0.5
                          cursor: not-allowed
                          pointer-events: none
```

---

## Tailwind 패턴

```tsx
<button 
  disabled
  className="
    disabled:opacity-50 
    disabled:cursor-not-allowed 
    disabled:pointer-events-none
  "
>
  저장
</button>
```

---

## 사유 명시 (★ 중요)

Disabled 만 하면 사용자 혼란. 항상 사유 표시:

### 방법 1: Tooltip

```tsx
<TooltipTrigger content="이메일 입력 후 활성화">
  <Button disabled>가입</Button>
</TooltipTrigger>
```

### 방법 2: Hint text 옆

```tsx
<div>
  <Button disabled>저장</Button>
  <span className="text-sm text-text-tertiary ml-2">
    변경 사항 없음
  </span>
</div>
```

### 방법 3: Inline error

```tsx
{!hasChanges && (
  <p className="text-sm text-text-tertiary">변경 사항이 없어 저장할 수 없습니다.</p>
)}
<Button disabled={!hasChanges}>저장</Button>
```

---

## Disabled 가 아닌 더 나은 방법들

### 1. 경고 모달 (사용자 액션 가능)

```
사용자: [삭제] 클릭 (사용 안 함)
       ↓
       모달: "이 항목 삭제하시겠어요?"
       
→ Disabled 보다 사용자 의도 확인.
```

### 2. 안내 + 가이드

```
사용자: 양식 미완성 + [제출] 클릭
       ↓
       각 빈 필드에 빨간 표시 + 첫 빈 필드로 스크롤
       
→ "왜 안 됐는지" 즉시 알 수 있음.
```

### 3. 기능 제한 (downgrade)

```
무료 사용자가 프리미엄 기능 시도:
       ↓
       Modal: "프리미엄 가입 필요"
       
→ Disabled 가 아니라 다른 흐름.
```

---

## Loading 과 Disabled

```tsx
// Loading 시도 disabled (중복 클릭 방지)
<Button loading={saving} disabled={saving || !hasChanges}>
  {saving ? '저장 중...' : '저장'}
</Button>
```

---

## 폼에서

```tsx
<form>
  <Input label="이메일" value={email} onChange={setEmail} />
  <Input label="비밀번호" type="password" value={pw} onChange={setPw} />
  
  <Button 
    type="submit" 
    disabled={!isFormValid}
  >
    가입
  </Button>
  
  {!isFormValid && (
    <p className="text-sm text-text-tertiary">
      모든 필드를 입력하세요.
    </p>
  )}
</form>
```

---

## Accessibility

```
✓ disabled 속성 (aria-disabled 자동)
✓ Tab 으로 스킵 (focusable X)
  - 단, "왜 disabled" 알 수 있어야 함
  - 옵션: aria-disabled="true" + tabIndex 유지
✓ 색만으로 X (cursor 변화 + opacity)
✓ 스크린리더 = "비활성화됨" 자동 읽음
```

### aria-disabled vs disabled

```tsx
// disabled 속성: 키보드 focus X (Tab 스킵)
<button disabled>...</button>

// aria-disabled: 시각만 disabled, focus 가능
<button aria-disabled="true" onClick={(e) => e.preventDefault()}>...</button>

// 사용자 사유 알기 위해 후자 권장 (focus + tooltip 가능)
```

---

## Form 검증 시점

```
실시간 검증 X (입력하는 동안 disabled 해제 X):
  사용자가 짜증남.

지연 검증 (debounce 500ms):
  사용자 입력 멈춘 후 검증.
  Disabled 해제 매끄러움.

제출 시점 검증:
  Submit 시도 → 에러 표시.
  Submit 자체는 disabled X.
```

---

## 관련

- [../components/button.md](../components/button.md)
- [loading.md](./loading.md) — Loading 시 disabled
