---
title: i18n — Locale Strategy
parent: ./_index.md
related:
  - korean-first.md
status: draft
last_updated: 2026-05-02
---

# Locale Strategy

> **한 줄 요약**: ko 우선 → en fallback. Phase 별 언어 추가.

---

## Phase 별 지원

```
Phase 1 (MVP):
  - ko-KR (한국어, 기본)

Phase 2:
  - en-US (영어 fallback)

Phase 3:
  - ja-JP (일본어)
  - zh-CN (중국어 간체)
  - vi-VN (베트남어 — 한국 IT 협력)
  
Phase 3+:
  - es, fr, de, ... (사용자 요청 시)
```

---

## react-intl 설정

```tsx
// providers/IntlProvider.tsx
import { IntlProvider as RawProvider } from 'react-intl';

const messages = {
  'ko-KR': await import('./messages/ko.json'),
  'en-US': await import('./messages/en.json'),
};

function IntlProvider({ children }) {
  const locale = useUserLocale();
  
  return (
    <RawProvider
      locale={locale}
      defaultLocale="ko-KR"     // ★ 한국어 default
      messages={messages[locale] ?? messages['ko-KR']}
      onError={(err) => {
        // Production: 누락 번역 silent
        if (process.env.NODE_ENV === 'development') {
          console.warn('Missing translation:', err);
        }
      }}
    >
      {children}
    </RawProvider>
  );
}
```

---

## Locale 감지

```typescript
function detectUserLocale(): string {
  // 1. 사용자 명시 설정
  const settingsLocale = settings.get('locale');
  if (settingsLocale) return settingsLocale;
  
  // 2. 브라우저 / OS
  const browserLocale = navigator.language || (navigator as any).userLanguage;
  if (browserLocale) return browserLocale;
  
  // 3. Default
  return 'ko-KR';
}
```

---

## Locale switcher

```tsx
// 설정 → 일반 → 언어
<SelectField
  label="언어"
  value={locale}
  onChange={(newLocale) => {
    settings.set('locale', newLocale);
    window.location.reload();   // intl context 갱신 위해
  }}
  options={[
    { value: 'ko-KR', label: '한국어' },
    { value: 'en-US', label: 'English' },
    { value: 'ja-JP', label: '日本語', disabled: true },
  ]}
/>
```

---

## Fallback chain

```
사용자 locale: "fr-FR"
  ↓ messages 없음
ko-KR 시도 (default)
  ↓ messages 있음 (한국어)
한국어 표시
  
또는 (Phase 2+):
fr-FR → fr → en-US → en → ko-KR

→ 우리 base = ko-KR. 영어는 보조.
```

---

## 메시지 파일 구조

```
src/i18n/
  ├── messages/
  │   ├── ko.json       (★ 원본)
  │   ├── en.json
  │   ├── ja.json
  │   └── zh-CN.json
  ├── extract.ts        (코드에서 자동 추출)
  └── compile.ts        (number/plural 컴파일)
```

### messages/ko.json

```json
{
  "app.welcome": "환영합니다",
  "app.start_button": "시작하기",
  
  "session.new": "새 채팅",
  "session.archived": "보관됨",
  "session.pinned": "고정됨",
  
  "chat.input_placeholder": "메시지를 입력하세요",
  "chat.send": "전송",
  "chat.cancel": "취소",
  
  "permission.read_only": "읽기 전용",
  "permission.workspace_write": "워크스페이스 쓰기",
  "permission.full_access": "전체 접근",
  "permission.custom": "사용자 지정",
  
  "tool.shell_run": "shell 명령 실행",
  "tool.fs_read": "파일 읽기",
  
  "error.network": "네트워크 연결 확인하세요",
  "error.permission_denied": "권한이 거부됐어요",
  
  "tooltip.pin_chat": "채팅 고정",
  "tooltip.archive_chat": "채팅 보관",
  
  "shortcut.search": "검색",
  "shortcut.command_palette": "명령 팔레트"
}
```

---

## 동적 번역 (사용자 입력)

```
원칙: 사용자 데이터 자동 번역 X.

✓ UI / 메시지 / 알림 = 번역
✗ 채팅 본문 = 그대로 (사용자가 한국어 / 영어 자유)
✗ 파일명 / 코드 = 그대로
```

→ 사용자가 영어로 메시지 보내면 영어로 표시. AI 답변도 사용자 언어 따라가도록 prompt.

---

## RTL (Right-to-Left)

```
Phase 4+:
  아랍어, 히브리어 지원 시 RTL layout

CSS:
  [dir="rtl"] .sidebar { right: 0; left: auto; }
  
React:
  <html dir="rtl">

→ 한국어 / 영어 / 일본어 / 중국어 = LTR. 우선순위 낮음.
```

---

## 번역 워크플로우

```
1. 코드 작성 시 한국어 string 사용 (key 와 함께)
   <FormattedMessage id="save_button" />
   
2. ko.json 에 추가
   "save_button": "저장"
   
3. 빌드 시 누락 영어 검출
   "save_button" not in en.json → warning
   
4. 번역자가 en.json 채움
   "save_button": "Save"
   
5. CI 검증 통과 후 release
```

---

## ICU MessageFormat 활용

```json
// 복잡한 케이스
{
  "messages_count": "{count, plural, =0 {메시지 없음} one {1개 메시지} other {{count}개 메시지}}",
  
  "user_says": "{name, select, system {시스템} other {{name} 님}} 이 말합니다",
  
  "time_ago": "{minutes, plural, =0 {방금 전} one {1분 전} other {{minutes}분 전}}"
}
```

→ 한국어는 plural 단순 (단/복수 X) 이지만 ICU 호환.

---

## Validation (CI)

```typescript
// scripts/validate-i18n.ts
import koMessages from './messages/ko.json';
import enMessages from './messages/en.json';

function validate() {
  const koKeys = new Set(Object.keys(koMessages));
  const enKeys = new Set(Object.keys(enMessages));
  
  const missingInEn = [...koKeys].filter(k => !enKeys.has(k));
  const missingInKo = [...enKeys].filter(k => !koKeys.has(k));
  
  if (missingInEn.length || missingInKo.length) {
    console.error('Missing translations:', { missingInEn, missingInKo });
    process.exit(1);
  }
  
  // ICU 형식 검증
  for (const [key, value] of Object.entries(koMessages)) {
    try {
      compileICU(value);
    } catch (err) {
      console.error(`Invalid ICU in ko.${key}: ${err}`);
      process.exit(1);
    }
  }
}
```

---

## 관련

- [korean-first.md](./korean-first.md)
- [datetime.md](./datetime.md)
- [numbers.md](./numbers.md)
