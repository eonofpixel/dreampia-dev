---
title: Typography — Korean-First
parent: ../_index.md
related:
  - ../tokens/typography.md
  - ../../i18n/_index.md
status: draft
last_updated: 2026-05-02
---

# Korean-First Typography

> **한 줄 요약**: Pretendard 우선. 한글 가독성 최적화. 영문 fallback.

---

## 폰트 우선순위

```css
font-family: 
  /* 1. 한국어 우선 */
  "Pretendard Variable",
  "Pretendard",
  "Apple SD Gothic Neo",      /* macOS */
  
  /* 2. Apple system */
  -apple-system,
  BlinkMacSystemFont,
  
  /* 3. Latin 시스템 */
  "Segoe UI",                  /* Windows */
  Roboto,                      /* Android */
  
  /* 4. Generic */
  sans-serif,
  
  /* 5. Emoji */
  "Apple Color Emoji",
  "Segoe UI Emoji";
```

---

## Pretendard 선택 이유

```
✓ 한글 + 영문 일관된 타이포 (혼용 시 자연스러움)
✓ Variable font (woff2 한 파일로 모든 weight)
✓ 모든 weight 지원 (45-920)
✓ 무료 + open source (Apache 2.0)
✓ 디자이너 친화 (Figma 표준)

비교:
  Apple SD Gothic Neo: macOS 만
  맑은 고딕:           Windows 만, 디자인 평이
  Noto Sans KR:        한글 OK, 영문 약함
  Pretendard:          ★ 둘 다 우수
```

---

## 한글 vs 영문 시각 차이

```
같은 사이즈 (14px) 라도:
  영문 "Hello"      → 작아 보임 (x-height 작음)
  한글 "안녕하세요" → 적당해 보임 (네모 박스)

조정:
  영문 본문:    14px 가능
  한글 본문:    14-16px 권장
  
혼용 (현재 설정):
  16px base 사용 (한글 친화)
```

---

## Line height 조정

```
영문 line-height: 1.5 충분
한글 line-height: 1.6~1.7 권장

이유:
  한글 받침 글자 (받, 닫, 깎)
  + 자모 결합 ('의', '월' 등)
  → 위아래 공간 더 필요

본 시스템 default:
  base: line-height 1.625 (한글 친화)
  small: 1.5 (12px 메타)
  large: 1.75 (제목, 본문 길게)
```

---

## Letter spacing

```
한글:    letter-spacing: 0 (변경 X)
영문:    letter-spacing: -0.025em (큰 헤더)

CSS:
  /* 본문 한글 */
  .body-text {
    letter-spacing: 0;
  }
  
  /* 큰 영문 헤더 */
  .heading-en {
    letter-spacing: -0.025em;
  }
  
  /* CAPS LOCK 같은 강조 */
  .caps {
    letter-spacing: 0.1em;
  }
```

---

## Word break (★ 중요)

```
한글: 어절 단위 break (자동)
영문: 단어 단위 break (자동)

긴 영문 단어 (URL, 변수명):
  word-break: break-word;
  overflow-wrap: anywhere;
```

```css
.text-content {
  word-break: keep-all;          /* 한글 어절 깨지지 않음 */
  overflow-wrap: break-word;     /* 긴 영어 단어는 깨짐 */
}
```

→ 한국 웹사이트 표준: `keep-all` + `break-word`.

---

## Font weight 가이드

```
한글에 적합한 weight:
  Light (300):    ✗ 사용 X (획 너무 얇음)
  Regular (400):  ✓ 본문
  Medium (500):   ✓ 강조 (UI)
  SemiBold (600): ✓ 작은 제목
  Bold (700):     ✓ 큰 제목
  ExtraBold (800):  마케팅, 환영
  Black (900):    환영 페이지 정도

본 시스템:
  body: regular (400)
  ui (button, label): medium (500)
  heading: semibold/bold
```

→ Light weight 한글 = 안경 흐릿한 느낌.

---

## 사이즈 조정 가이드

### 영문 vs 한글 동일 시각 크기

```
영문 14px 와 시각 비슷한 한글:
  → 13~14px 가능 (한글이 약간 큼)

영문 16px 와 시각 비슷한 한글:
  → 14~15px 가능

→ 같은 14px 사용 시 한글이 살짝 큰 느낌. OK.
```

### 작은 사이즈 주의

```
한글 < 12px = 가독성 급감 (받침 식별 어려움)
영문 < 11px 는 어느 정도 OK (x-height 충분)

본 시스템 최소: 12px (xs)
```

---

## Pretendard 로딩

### CDN (간단)

```html
<link 
  rel="stylesheet" 
  href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard/dist/web/variable/pretendardvariable.css"
/>
```

### Self-hosted (성능)

```css
@font-face {
  font-family: 'Pretendard Variable';
  font-weight: 45 920;
  font-style: normal;
  font-display: swap;
  src: url('/fonts/PretendardVariable.woff2') format('woff2-variations');
  unicode-range: U+AC00-D7A3, /* 한글 */
                 U+0020-007E; /* 기본 ASCII */
}
```

→ swap = FOUT 허용 (시스템 폰트 → Pretendard 로 swap).

---

## 혼용 (한글 + 영문) 가이드

### 자연스러운 혼합

```html
<!-- 좋은 예 -->
<p>Dreampia-Dev 는 Claude Code 와 Codex CLI 를 통합한 데스크톱 앱입니다.</p>

<!-- 어색함 -->
<p>Dreampia-Dev는Claude Code와Codex CLI를통합한데스크톱앱입니다.</p>
```

→ 영문 단어 양옆에 공백 권장 (한글 가독성).

### 자동 spacing (Phase 2)

```typescript
// 한글-영문 사이 0.05em spacing 자동
function autoSpace(text: string): string {
  // 한글 ↔ 영문 경계에 zero-width space
  return text.replace(/([가-힣])([a-zA-Z])/g, '$1​$2');
}
```

---

## 한글 처리 주의사항

### 자모 결합 (NFC vs NFD)

```typescript
// macOS 파일명: NFD (자모 분리)
// Windows: NFC (조합형)

// JS 에서 정규화:
const normalized = text.normalize('NFC');
```

→ 검색, 비교 시 항상 NFC normalize.

### 정규식 (한글 매칭)

```typescript
// 한글 매칭
const koreanRegex = /[가-힣]/;
const koreanWordRegex = /[가-힣]+/g;

// 한글 + 자모
const koreanWithJamoRegex = /[㄰-㆏가-힣]/;
```

---

## 텍스트 길이

```
한글:  보통 영문보다 2~3배 짧음 (정보량)
영문:  반대로 길어짐

UI design 시:
  한글 텍스트로 측정 → 영문 fit 안 될 수도
  영문 텍스트로 측정 → 한글은 여유

✓ 영문 길이로 max-width 잡고 한글 OK 확인
```

---

## 관련

- [../tokens/typography.md](../tokens/typography.md) — 폰트 토큰
- [code-fonts.md](./code-fonts.md) — 코드 폰트
- [../../i18n/_index.md](../../i18n/_index.md) — 다국어
