---
title: States — Success
parent: ../_index.md
related:
  - ../components/toast.md
status: draft
last_updated: 2026-05-02
---

# Success State

> **한 줄 요약**: 짧고 명확한 확인. 노이즈 X.

---

## 표현 방법

| 강도 | 예시 | 사용 |
|------|------|------|
| **Inline check** | 입력 옆 ✓ | 폼 검증 통과 |
| **Toast** | "✓ 저장 완료" 4초 | 일반 액션 |
| **Banner** | 페이지 상단 띠 | 큰 변경 (예: 업로드 완료) |
| **Animation** | check icon 나타남 | 시각 강조 |
| **Page** | 전용 success 페이지 | 결제 완료 등 |

---

## Inline Success

```tsx
<Input
  label="이메일"
  value={email}
  success={isValid}     // ✓ 우측 표시
/>
```

```
┌─────────────────────────────┐
│ test@example.com         ✓  │ ← 우측 녹색 체크
└─────────────────────────────┘
```

---

## Toast Success

```typescript
toast.success('저장 완료', { 
  description: 'src/foo.ts 변경됨',
});
```

```
┌──────────────────────────────┐
│ ✓ 저장 완료                  │
│   src/foo.ts 변경됨          │
└──────────────────────────────┘
   border-left: 4px solid green
```

---

## Banner Success

큰 작업 완료 (사용자가 명시적으로 확인 필요):

```tsx
<Banner variant="success">
  <Check className="w-4 h-4" />
  <span>마이그레이션 완료. 12개 채팅 import 됨.</span>
  <button onClick={dismiss}>×</button>
</Banner>
```

---

## Animation (강조)

체크 아이콘 그려지는 애니메이션:

```tsx
function AnimatedCheck() {
  return (
    <motion.svg viewBox="0 0 24 24" className="w-12 h-12 text-success">
      <motion.circle
        cx="12" cy="12" r="10"
        stroke="currentColor"
        strokeWidth="2"
        fill="none"
        initial={{ pathLength: 0 }}
        animate={{ pathLength: 1 }}
        transition={{ duration: 0.3 }}
      />
      <motion.path
        d="M7 12 L11 16 L17 8"
        stroke="currentColor"
        strokeWidth="2"
        fill="none"
        initial={{ pathLength: 0 }}
        animate={{ pathLength: 1 }}
        transition={{ duration: 0.2, delay: 0.2 }}
      />
    </motion.svg>
  );
}
```

→ 큰 액션 (가입 완료, 결제 완료) 에서 사용.

---

## 사용 가이드

### 언제 표시

```
✓ 사용자가 의도한 액션 완료 (저장, 보내기)
✓ 비동기 작업 완료 (다운로드, 빌드)
✓ 검증 통과 (폼 제출 가능)

✗ 자동 작업 매번 (시각 노이즈)
✗ 명백한 결과 (예: 이미 보이는 변화)
```

### 메시지 톤

```
✓ "저장 완료" (간결)
✓ "전송됐어요" (자연스러움)
✗ "Successfully saved" (영어)
✗ "Operation completed without errors" (장황)
```

---

## 사라짐 시간

```
Toast:        4초 (자동 사라짐)
Banner:       사용자 dismiss 또는 다른 액션
Inline:       사용자 입력 변경 시 즉시 사라짐
Animation:    1-2초 (한 번 재생)
```

---

## Reduced motion

```css
@media (prefers-reduced-motion: reduce) {
  .animated-check {
    animation: none;
    /* 즉시 표시 */
  }
}
```

---

## Accessibility

```
✓ Toast: role="status" (polite)
✓ Inline: aria-live="polite"
✓ Animation: aria-hidden="true" + 텍스트 별도
✓ 색 (녹색) 만으로 X (✓ 아이콘 함께)
```

---

## 관련

- [../components/toast.md](../components/toast.md)
- [../tokens/motion.md](../tokens/motion.md) — Check 애니메이션
