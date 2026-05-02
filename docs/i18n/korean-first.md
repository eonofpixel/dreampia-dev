---
title: i18n — Korean-First Strategy
parent: ./_index.md
related:
  - locale-strategy.md
  - ime.md
  - ../design/typography/korean-first.md
status: draft
last_updated: 2026-05-02
---

# Korean-First Strategy

> **한 줄 요약**: 모든 string 한국어 우선. 영어는 fallback. 차별화 핵심.

---

## 왜?

```
Codex / Claude Desktop:
  - 영어 우선 + 한국어 번역
  - 한국어 일부 누락
  - 한국어 어색함 (기계 번역 느낌)

Dreampia-Dev 차별화:
  - 한국어 우선 작성
  - 자연스러운 톤
  - 한국 개발자 친화
```

---

## 작성 우선순위

```
1. 한국어 원본 작성
   "저장됐어요" (자연스러움)
   
2. 영어 번역
   "Saved"
   
3. 일본어, 중국어 (Phase 3)
   "保存しました" / "已保存"
```

→ 영어 → 한국어 (X). 한국어 → 영어 (O).

---

## react-intl 사용

```tsx
// messages/ko.json (한국어 원본)
{
  "save": "저장됐어요",
  "saved_with_count": "{count}개 항목이 저장됐어요",
  "permission_request": "{name} 가 다음을 수행하려 합니다:",
  "save_button": "저장",
  "cancel_button": "취소",
}

// messages/en.json (영어 번역)
{
  "save": "Saved",
  "saved_with_count": "{count, plural, one {# item saved} other {# items saved}}",
  "permission_request": "{name} wants to:",
  "save_button": "Save",
  "cancel_button": "Cancel",
}
```

```tsx
import { FormattedMessage } from 'react-intl';

<button>
  <FormattedMessage id="save_button" />
</button>

<p>
  <FormattedMessage 
    id="saved_with_count" 
    values={{ count: 3 }}
  />
</p>
```

---

## 한국어 톤 가이드

### 격식 (Formal vs Informal)

```
✓ 정중 (default):
  "저장됐어요"
  "다음 단계로 진행할까요?"
  "오류가 발생했어요"
  
✗ 너무 formal:
  "저장되었습니다."
  "다음 단계로 진행하시겠습니까?"
  
✗ 너무 informal:
  "저장!"
  "다음 ㄱㄱ"
```

→ "~요" 끝맺음 + 친근하지만 정중. Naver / Toss 톤.

### 동사형 vs 명사형

```
액션 (버튼):  
  ✓ "저장" (명사형) — 짧고 명확
  ✗ "저장하기" — 너무 길

상태 / 결과:
  ✓ "저장됐어요" (수동형)
  ✗ "저장 완료"
```

### 완곡 표현

```
✓ "다음을 시도해보세요"
✗ "다음을 해야 합니다"

✓ "이 작업은 위험할 수 있어요"
✗ "이 작업은 위험합니다"
```

→ 사용자에게 강요 X.

---

## 영어 fallback

```typescript
// react-intl
const messages = {
  'ko-KR': koMessages,
  'en-US': enMessages,
};

// 사용자 locale 따라
const userLocale = navigator.language;   // "ko-KR"

// Fallback chain:
//   ko-KR → ko → en-US → en
const matchedMessages = matchLocale(userLocale, messages);
```

### 누락 한국어

```typescript
// CI 검증: 모든 한국어 key 가 영어에도 있어야 (vice versa)
function validateLocales() {
  const koKeys = Object.keys(koMessages);
  const enKeys = Object.keys(enMessages);
  
  const missingInEn = koKeys.filter(k => !enKeys.includes(k));
  const missingInKo = enKeys.filter(k => !koKeys.includes(k));
  
  if (missingInEn.length || missingInKo.length) {
    throw new Error(`Missing translations: ${missingInEn}, ${missingInKo}`);
  }
}
```

---

## 문화적 고려

### 이름 / 호칭

```
한국어:
  "홍길동 님" (높임)
  "사용자" (default)
  "홍길동" (이름만 — informal)

UI:
  Welcome: "{name} 님, 환영합니다"
  Toast: "{name} 님에게 메시지 전송됐어요"
```

### 날짜 / 시간

```
한국어:
  "2026년 5월 2일" (긴 형식)
  "5월 2일 (금)"
  "방금 전" / "1시간 전"

영어:
  "May 2, 2026"
  "Just now"
```

상세: [datetime.md](./datetime.md).

### 숫자 / 통화

```
한국어 (10,000):
  "1만원"
  "10,000원"
  
영어:
  "$10,000"
```

상세: [numbers.md](./numbers.md).

---

## 모음 / 자음 결합

```
조사 (을/를, 이/가, 은/는):
  자모 결합 따라 다름

예:
  "사용자가" (자음 끝)
  "Dreampia가" (모음 끝)
  
react-intl 한계: 자동 처리 X
→ 수동 작성 또는 helper:
```

```typescript
// 한국어 조사 helper
function withParticle(noun: string, type: '을/를' | '이/가' | '은/는'): string {
  const lastChar = noun.charCodeAt(noun.length - 1);
  const hasFinal = (lastChar - 0xAC00) % 28 !== 0;
  
  switch (type) {
    case '을/를': return noun + (hasFinal ? '을' : '를');
    case '이/가': return noun + (hasFinal ? '이' : '가');
    case '은/는': return noun + (hasFinal ? '은' : '는');
  }
}

// 사용
withParticle('사용자', '이/가');   // "사용자가"
withParticle('파일', '을/를');     // "파일을"
```

→ 또는 모든 조사 미리 처리한 message 사용:
```json
{
  "user_clicked": "{name} 님이 클릭하셨어요",   // 항상 "님이"
}
```

---

## 약어 / 외래어

```
일관성 유지:
  "AI" (영어 그대로)
  "Codex" / "Claude" (브랜드)
  "MCP" (이미 약어)
  "권한" (한국어)
  "도구" / "툴" (선택)

Glossary 작성:
  - AI       → "AI" 그대로
  - Plugin   → "플러그인"
  - Skill    → "스킬"
  - Workspace → "워크스페이스"
  - Session  → "세션"
  - Agent    → "에이전트"
```

---

## 메시지 길이

```
한국어: 보통 영어보다 짧음.
  "Saved successfully" (18자)
  "저장됐어요" (5자)

UI fit:
  한국어 max-width 잡으면 영어 잘림
  → 영어 길이로 max-width 잡고 한국어 OK 확인
```

상세: [text-overflow.md](./text-overflow.md).

---

## Validation

```typescript
// 빌드 시 검증
test('All keys have Korean translation', () => {
  for (const key of Object.keys(enMessages)) {
    expect(koMessages[key]).toBeDefined();
    expect(koMessages[key]).not.toEqual(enMessages[key]);   // 영어 그대로 X
  }
});

test('Korean messages have natural tone', () => {
  for (const value of Object.values(koMessages)) {
    // 어색한 패턴 검출
    expect(value).not.toMatch(/하시겠습니까\?\s*$/);   // 너무 formal
    expect(value).not.toMatch(/^[A-Z]/);              // 영어 시작 X
  }
});
```

---

## 관련

- [locale-strategy.md](./locale-strategy.md)
- [ime.md](./ime.md)
- [../design/typography/korean-first.md](../design/typography/korean-first.md)
