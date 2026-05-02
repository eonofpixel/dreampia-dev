---
title: i18n — Pluralization
parent: ./_index.md
related:
  - locale-strategy.md
status: draft
last_updated: 2026-05-02
---

# Pluralization

> **한 줄 요약**: 한국어는 단/복수 차이 없음. 영어 등은 ICU plural 사용.

---

## 한국어 (단순)

```
한국어:
  "1개 항목"
  "2개 항목"
  "100개 항목"
  
→ 모두 같은 형식. plural 처리 X.
```

```json
// ko.json
{
  "items_count": "{count}개 항목"
}
```

---

## 영어 (복잡)

```
영어:
  "1 item"        (singular)
  "2 items"       (plural)
  "0 items"       (zero — plural)
```

```json
// en.json (ICU MessageFormat)
{
  "items_count": "{count, plural, =0 {No items} one {# item} other {# items}}"
}
```

---

## 사용

```tsx
import { FormattedMessage } from 'react-intl';

<FormattedMessage 
  id="items_count" 
  values={{ count: 1 }}
/>
// 한국어: "1개 항목"
// 영어:   "1 item"

<FormattedMessage 
  id="items_count" 
  values={{ count: 5 }}
/>
// 한국어: "5개 항목"
// 영어:   "5 items"

<FormattedMessage 
  id="items_count" 
  values={{ count: 0 }}
/>
// 한국어: "0개 항목" (또는 "항목 없음")
// 영어:   "No items"
```

---

## 0 개 처리 (한국어 자연)

```json
// 더 자연스러운 한국어
{
  "items_count": "{count, plural, =0 {항목 없음} other {{count}개 항목}}"
}
```

→ 0 개 = "0개 항목" 보다 "항목 없음" 자연.

---

## 다른 언어

```
한국어:    plural 없음 (단순)
영어:      one / other
프랑스어:  zero / one / other  (단, 0 / 1 / 그 외)
러시아어:  one / few / many / other (1 / 2-4 / 5+ / 등)
일본어:    plural 없음 (단순)
중국어:    plural 없음 (단순)
아랍어:    zero / one / two / few / many / other (가장 복잡)
```

→ 한국어 / 일본어 / 중국어 = 단순. 우리 base = ko 라 편함.

---

## 자주 쓰는 패턴

### Item count

```json
{
  "messages": "{count, plural, =0 {메시지 없음} other {{count}개 메시지}}",
  "files": "{count, plural, =0 {파일 없음} other {{count}개 파일}}",
  "errors": "{count, plural, =0 {오류 없음} other {{count}개 오류}}"
}
```

### Time

```json
{
  "minutes_ago": "{count, plural, =0 {방금 전} other {{count}분 전}}",
  "hours_ago": "{count, plural, other {{count}시간 전}}",
  "days_ago": "{count, plural, =1 {어제} other {{count}일 전}}"
}
```

### Bytes / size

```json
{
  "size_bytes": "{count, plural, other {{count, number}바이트}}",
  "size_kb": "{count, number, ::.0}KB"
}
```

→ 한국어: 모두 same plural. ICU 가 처리 X 해도 OK.

---

## react-intl 자동 처리

```tsx
// react-intl 이 ICU 자동 컴파일 + plural 적용
<FormattedMessage 
  id="items_count" 
  values={{ count: 5 }}
/>

// 사용자 locale 기반 자동:
//   ko-KR: "5개 항목"
//   en-US: "5 items"
//   ar-SA: "5 عنصرًا"
```

---

## 단순 처리 (ICU 없이)

```typescript
// 한국어 only 면 단순
function formatItemCount(count: number, locale = 'ko'): string {
  if (locale === 'ko') {
    return count === 0 ? '항목 없음' : `${count}개 항목`;
  }
  
  return count === 0 ? 'No items' : count === 1 ? '1 item' : `${count} items`;
}
```

→ Phase 1 (ko only) 에선 ICU 없이 OK. Phase 2+ ICU 필요.

---

## 한국어 특수 (단위)

```
1, 2, 3, ...:
  ✓ "1개" "2개" (보통)
  ✓ "1 명" "2 명" (사람)
  ✓ "1 권" "2 권" (책)
  ✓ "1 마리" "2 마리" (동물)
  ✓ "1 차례" "2 차례" (순서)

→ 단어마다 단위 다름. AI 가 자연스럽게.
```

```json
{
  "users_active": "활성 사용자 {count}명",
  "books_count": "책 {count}권",
  "messages_count": "메시지 {count}개"
}
```

→ 단위는 미리 결정해서 message 에 직접 작성.

---

## 검증

```typescript
// CI: 모든 plural 메시지가 양 locale 모두에 있는지
test('Plural messages match across locales', () => {
  for (const [key, koValue] of Object.entries(koMessages)) {
    const enValue = enMessages[key];
    
    if (koValue.includes('plural') && !enValue.includes('plural')) {
      throw new Error(`${key}: Korean has plural but English doesn't`);
    }
  }
});
```

---

## 관련

- [locale-strategy.md](./locale-strategy.md)
- [korean-first.md](./korean-first.md)
