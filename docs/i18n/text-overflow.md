---
title: i18n — Text Overflow / 한영 길이 차이
parent: ./_index.md
related:
  - korean-first.md
  - ../design/typography/korean-first.md
status: draft
last_updated: 2026-05-02
---

# Text Overflow

> **한 줄 요약**: 한글이 영문보다 짧지만 시각 밀도 다름. UI fit 보장.

---

## 길이 차이

```
같은 의미:
  "Saved successfully"          (18자)
  "저장됐어요"                   (5자)  → 한국어 ↓
  
  "Get started with..."         (19자)
  "시작하기"                     (4자)
  
하지만:
  "Plan mode"                   (9자)
  "플랜 모드"                    (5자)
  
  "Workspace permissions"        (21자)
  "워크스페이스 권한"             (8자)

한국어가 영어보다 보통 30-50% 짧음.
하지만 시각 밀도는 한국어가 더 큼 (네모박스).
```

---

## UI 측정 원칙

```
원칙: 영어 길이로 max-width 잡고 한국어 fit 확인.

이유:
  ✓ 영어가 보통 더 김 → fit 어려움
  ✗ 한국어로 측정 → 영어 잘림
```

### 예시

```css
/* ✗ 한국어 기준 */
.button {
  width: 80px;     /* "저장" fit, "Save" 도 fit. 단, "취소하기" → 잘림 */
}

/* ✓ 영어 기준 */
.button {
  min-width: 100px;     /* "Cancel" fit, "취소" 도 OK */
  padding: 0 16px;
}
```

---

## 조사 / 단어 추가 길이

```
한글:
  "사용자가" (4자)
  "Dreampia가" (8자) — 외래어 + 조사

영어:
  "User"
  "Dreampia"

→ 외래어 혼용 시 길이 늘어남.
```

---

## Truncation

```css
/* 1줄 truncate */
.truncate {
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
}

/* Multi-line truncate */
.truncate-2 {
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
```

```tsx
<div className="truncate max-w-[200px]">
  매우 긴 한국어 메시지가 여기에...
</div>
```

→ Tooltip 으로 전체 표시.

---

## 한국어 word-break

```css
/* 한국어 어절 단위 break (자동) */
.text-content {
  word-break: keep-all;          /* ★ 한국어 어절 깨지지 X */
  overflow-wrap: break-word;     /* 긴 영문 단어는 깨짐 */
}
```

→ 한국 웹사이트 표준.

```html
<!-- 좋음 -->
<p>다음 단계로 넘어가시려면 [확인] 버튼을 클릭하세요.</p>
↓
다음 단계로 넘어가시려면
[확인] 버튼을 클릭하세요.
(자연스러운 어절 break)

<!-- 나쁨 (keep-all 없음) -->
다음 단계로 넘어가시려면 [확
인] 버튼을 클릭하세요.
```

---

## 긴 영문 (URL, 변수명)

```css
/* URL, 코드 등 긴 영문 단어 */
.code, .url {
  word-break: break-all;     /* 강제 break */
  overflow-wrap: anywhere;
}
```

```tsx
<code className="break-all">
  https://very-long-url-with-many-words-that-might-not-fit.com/path/to/resource
</code>
```

---

## 버튼 사이즈

```typescript
// 자동 계산 (영어 + 한국어 모두 fit)
const BUTTON_MIN_WIDTH = {
  primary: '100px',     // "확인" / "Confirm" 모두 OK
  secondary: '80px',    // "취소" / "Cancel"
  small: '60px',        // "★" / "OK"
};
```

---

## 폼 라벨

```tsx
// 영어 / 한국어 fit
<label className="min-w-[100px] text-right pr-3">
  이메일
</label>

// 또는 위/아래 layout (영어 길어도 OK)
<div>
  <label className="block text-sm mb-1">
    이메일 주소를 입력해주세요
  </label>
  <input />
</div>
```

---

## Modal 제목

```tsx
// 다양한 길이 fit
<Modal>
  <ModalHeader>
    <h2 className="text-lg font-semibold truncate">
      {title}      {/* 짧으면 "확인", 길면 "변경 사항을 저장하시겠어요?" */}
    </h2>
  </ModalHeader>
</Modal>
```

---

## 사이드바 채팅 제목

```tsx
<SidebarItem className="truncate">
  {chat.title}
</SidebarItem>

// 한국어: "서버 열고 미리보기 확인"
// 영어:   "Verify server and preview the dashboard layout"
// 두 개 모두 truncate → "서버 열고 미..."
//                       "Verify server an..."
```

---

## Toast / Notification

```
짧게 유지:
  ✓ "저장 완료"
  ✓ "Saved"
  
✗ 너무 길면 줄임:
  "변경 사항이 정상적으로 저장됐어요" → "저장 완료"
  "Successfully saved your changes" → "Saved"
```

---

## Tooltip

```tsx
// Hover 시 전체 표시
<TooltipTrigger content={fullText}>
  <span className="truncate">{fullText}</span>
</TooltipTrigger>
```

---

## 측정 / 검증

```typescript
// 빌드 시 string 길이 검증
test('All UI strings fit max widths', () => {
  for (const [key, ko] of Object.entries(koMessages)) {
    const en = enMessages[key];
    
    // 버튼 라벨
    if (key.endsWith('_button')) {
      const koLength = measureWidth(ko, 'sm');
      const enLength = measureWidth(en, 'sm');
      
      expect(Math.max(koLength, enLength)).toBeLessThan(150);
    }
  }
});
```

---

## 관련

- [korean-first.md](./korean-first.md)
- [../design/typography/korean-first.md](../design/typography/korean-first.md)
