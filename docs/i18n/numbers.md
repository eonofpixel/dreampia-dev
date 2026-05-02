---
title: i18n — Numbers / Currency / Units
parent: ./_index.md
status: draft
last_updated: 2026-05-02
---

# Numbers, Currency & Units

> **한 줄 요약**: Intl.NumberFormat. 한국 단위 (만, 억). KRW.

---

## Intl.NumberFormat

```typescript
const formatter = new Intl.NumberFormat('ko-KR');

formatter.format(1234567);
// "1,234,567"

formatter.format(1234.56);
// "1,234.56"
```

---

## 한국 만/억 단위 (큰 수)

```typescript
function formatKoreanNumber(n: number): string {
  if (n >= 1e8) return `${(n / 1e8).toFixed(1)}억`;
  if (n >= 1e4) return `${(n / 1e4).toFixed(1)}만`;
  return n.toLocaleString('ko-KR');
}

formatKoreanNumber(1234567);
// "123.5만"

formatKoreanNumber(123456789);
// "1.2억"

formatKoreanNumber(1234);
// "1,234"
```

→ 사용자 익숙한 단위.

---

## 통화 (KRW)

```typescript
new Intl.NumberFormat('ko-KR', {
  style: 'currency',
  currency: 'KRW',
}).format(12345);
// "₩12,345"

// 또는 직접
function formatKRW(amount: number): string {
  return `${formatKoreanNumber(amount)}원`;
}

formatKRW(12345);
// "1.2만원"
```

---

## 사용 예시

### 토큰 / 비용 (AI 호출)

```typescript
function formatTokens(tokens: number): string {
  if (tokens >= 1e6) return `${(tokens / 1e6).toFixed(1)}M`;
  if (tokens >= 1e3) return `${(tokens / 1e3).toFixed(1)}K`;
  return tokens.toString();
}

formatTokens(1234567);    // "1.2M"
formatTokens(72725);      // "72.7K"

function formatCost(usd: number): string {
  return `$${usd.toFixed(2)}`;
  // 또는 KRW: ₩{formatKoreanNumber(usd * 1300)}
}
```

### Bytes

```typescript
function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 ** 3) return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
  return `${(bytes / 1024 ** 3).toFixed(1)} GB`;
}

formatBytes(2456);          // "2.4 KB"
formatBytes(131488954);     // "125.4 MB"
```

### Duration

```typescript
function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}초`;
  if (ms < 3_600_000) return `${Math.floor(ms / 60_000)}분 ${Math.floor((ms % 60_000) / 1000)}초`;
  return `${Math.floor(ms / 3_600_000)}시간 ${Math.floor((ms % 3_600_000) / 60_000)}분`;
}

formatDuration(456);        // "456ms"
formatDuration(8200);       // "8.2초"
formatDuration(140000);     // "2분 20초"
formatDuration(3760000);    // "1시간 2분"
```

### Percentage

```typescript
function formatPercent(value: number, decimals = 0): string {
  return `${(value * 100).toFixed(decimals)}%`;
}

formatPercent(0.725);       // "73%"
formatPercent(0.725, 1);    // "72.5%"
```

---

## react-intl

```tsx
import { FormattedNumber } from 'react-intl';

<FormattedNumber 
  value={12345} 
  style="currency" 
  currency="KRW" 
/>
// "₩12,345"

<FormattedNumber 
  value={0.725} 
  style="percent" 
  minimumFractionDigits={1} 
/>
// "72.5%"
```

---

## ICU MessageFormat

```json
// messages/ko.json
{
  "tokens_used": "{count, plural, =0 {토큰 없음} other {{count, number}개 토큰}}",
  "cost": "{currency, select, KRW {{amount, number}원} USD {${amount, number}} other {{amount}}}",
}
```

```tsx
<FormattedMessage
  id="tokens_used"
  values={{ count: 72725 }}
/>
// "72,725개 토큰"
```

---

## 단위 변환

```typescript
// 환율 (옵션 — 사용 X 권장)
function usdToKrw(usd: number): number {
  return usd * 1330;   // 환율 (실시간 X)
}

// AI 비용은 USD 만 (정확성)
// 또는 둘 다 표시: "$12.40 (≈₩16,500)"
```

---

## 정렬 (Collation)

```typescript
// 한글 + 영문 정렬
const items = ['apple', '바나나', 'cherry', '딸기'];

items.sort((a, b) => a.localeCompare(b, 'ko-KR'));
// ['바나나', '딸기', 'apple', 'cherry'] — 한글 먼저
```

→ 사용자 locale 따름.

---

## 관련

- [korean-first.md](./korean-first.md)
- [datetime.md](./datetime.md)
