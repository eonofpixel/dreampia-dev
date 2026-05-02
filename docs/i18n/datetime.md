---
title: i18n — Date / Time Formatting
parent: ./_index.md
related:
  - korean-first.md
status: draft
last_updated: 2026-05-02
---

# Date & Time Formatting

> **한 줄 요약**: date-fns + ko locale. 상대 시간 + 절대 시간.

---

## 라이브러리

```bash
npm install date-fns
```

```typescript
import { format, formatDistance, formatRelative } from 'date-fns';
import { ko, enUS } from 'date-fns/locale';
```

---

## 한국어 포맷

### 절대 시간

```typescript
import { format } from 'date-fns';
import { ko } from 'date-fns/locale';

const date = new Date('2026-05-02T22:30:00');

format(date, 'yyyy년 M월 d일', { locale: ko });
// "2026년 5월 2일"

format(date, 'yyyy년 M월 d일 (EEEE) a h:mm', { locale: ko });
// "2026년 5월 2일 (금요일) 오후 10:30"

format(date, 'PPpp', { locale: ko });
// "2026년 5월 2일 EEEE 오후 10:30:00"

format(date, 'MM/dd HH:mm');
// "05/02 22:30"
```

### 상대 시간

```typescript
import { formatDistance, formatDistanceToNow } from 'date-fns';
import { ko } from 'date-fns/locale';

formatDistanceToNow(date, { locale: ko, addSuffix: true });
// "방금 전" / "5분 전" / "1시간 전" / "어제" / "3일 전"

formatRelative(date, new Date(), { locale: ko });
// "오늘 오후 3:30" / "어제 오후 3:30" / "지난 화요일 오후 3:30"
```

---

## 사용자 보기 가이드

```
< 1분:        "방금 전"
< 1시간:      "5분 전"
< 24시간:     "3시간 전"
어제:         "어제"
< 1주일:      "3일 전" / "지난 화요일 오후 3:30"
< 1달:        "3주 전"
< 1년:        "3개월 전"
1년 이상:     "2026-05-02"
```

---

## 사용자 정의 포맷

```typescript
function smartFormat(date: Date, locale = 'ko'): string {
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMin = diffMs / 1000 / 60;
  const diffHour = diffMin / 60;
  const diffDay = diffHour / 24;
  
  if (locale === 'ko') {
    if (diffMin < 1) return '방금 전';
    if (diffMin < 60) return `${Math.floor(diffMin)}분 전`;
    if (diffHour < 24) return `${Math.floor(diffHour)}시간 전`;
    if (diffDay < 7) return formatDistance(date, now, { locale: ko, addSuffix: true });
    if (diffDay < 365) return format(date, 'M월 d일', { locale: ko });
    return format(date, 'yyyy-MM-dd');
  }
  
  // en fallback
  return formatDistance(date, now, { locale: enUS, addSuffix: true });
}
```

---

## Tooltip 으로 정확한 시간

```tsx
function Timestamp({ date }: { date: Date }) {
  const relative = smartFormat(date);
  const absolute = format(date, 'yyyy년 M월 d일 a h:mm:ss', { locale: ko });
  
  return (
    <TooltipTrigger content={absolute}>
      <time dateTime={date.toISOString()}>
        {relative}
      </time>
    </TooltipTrigger>
  );
}
```

→ Hover 시 정확한 시간 표시.

---

## Real-time 갱신

```tsx
function LiveTimestamp({ date }: { date: Date }) {
  const [, forceUpdate] = useReducer(x => x + 1, 0);
  
  useEffect(() => {
    // 매 분 자동 갱신 (분 단위 변경)
    const interval = setInterval(forceUpdate, 60_000);
    return () => clearInterval(interval);
  }, []);
  
  return <Timestamp date={date} />;
}
```

→ "5분 전" → 1분 후 "6분 전" 으로 자동 변경.

---

## Timezone

```typescript
// 사용자 timezone 자동 (브라우저)
const userTz = Intl.DateTimeFormat().resolvedOptions().timeZone;
// "Asia/Seoul"

// date-fns-tz
import { utcToZonedTime, format } from 'date-fns-tz';

const utcDate = new Date('2026-05-02T13:30:00Z');   // UTC
const seoulDate = utcToZonedTime(utcDate, 'Asia/Seoul');
format(seoulDate, 'yyyy-MM-dd HH:mm zzz', { timeZone: 'Asia/Seoul' });
// "2026-05-02 22:30 KST"
```

---

## 한국어 특수 형식

### 음력 (Phase 3+)

```
설/추석 등 한국어 환경 특수:
  음력 → 양력 변환 라이브러리
  
구현 우선순위 낮음. Phase 3+ 검토.
```

### "올해" / "이번 주" / "이번 달"

```typescript
function isThisYear(date: Date): boolean {
  return date.getFullYear() === new Date().getFullYear();
}

function isThisWeek(date: Date): boolean {
  const now = new Date();
  const startOfWeek = new Date(now);
  startOfWeek.setDate(now.getDate() - now.getDay());
  startOfWeek.setHours(0, 0, 0, 0);
  return date >= startOfWeek;
}
```

---

## 날짜 입력 (DatePicker — Phase 2)

```tsx
import { DayPicker } from 'react-day-picker';
import { ko } from 'date-fns/locale';

<DayPicker
  locale={ko}
  weekStartsOn={0}        // 일요일 시작 (한국어)
  formatters={{
    formatCaption: (date, options) => format(date, 'yyyy년 M월', options),
    formatWeekdayName: (day) => '일월화수목금토'[day.getDay()],
  }}
/>
```

---

## 사이드바 그룹화

```typescript
// 채팅 시간별 그룹화
function groupChatsByTime(chats: Chat[]) {
  const today = new Date();
  
  return {
    pinned: chats.filter(c => c.pinned),
    today: chats.filter(c => isSameDay(c.updated_at, today)),
    yesterday: chats.filter(c => isYesterday(c.updated_at)),
    thisWeek: chats.filter(c => isThisWeek(c.updated_at) && !isSameDay(c.updated_at, today) && !isYesterday(c.updated_at)),
    thisMonth: chats.filter(c => isThisMonth(c.updated_at) && !isThisWeek(c.updated_at)),
    older: chats.filter(c => /* ... */),
  };
}
```

UI:
```
오늘 (5)
어제 (3)
이번 주 (12)
이번 달 (28)
지난 채팅
```

---

## 관련

- [korean-first.md](./korean-first.md)
- [numbers.md](./numbers.md)
