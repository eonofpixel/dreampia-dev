---
title: Typography — Code Fonts
parent: ../_index.md
related:
  - korean-first.md
  - ../tokens/typography.md
status: draft
last_updated: 2026-05-02
---

# Code Fonts

> **한 줄 요약**: D2Coding (한글 친화) > JetBrains Mono > 시스템 mono.

---

## Font Stack

```css
--font-mono:
  /* 1. 한글 친화 코드 폰트 */
  "D2Coding Ligature",
  "D2Coding",
  
  /* 2. 인기 영문 코드 폰트 */
  "JetBrains Mono",
  "Fira Code",
  "Cascadia Code",
  
  /* 3. OS 기본 */
  Menlo,             /* macOS */
  Monaco,            /* macOS */
  Consolas,          /* Windows */
  "Liberation Mono", /* Linux */
  monospace;
```

---

## D2Coding 우선 이유

```
✓ 한글 식별자 (변수명) 가독성 우수
✓ 0 / O 명확 구별 (slash)
✓ 한글 주석 정렬 정확 (등폭)
✓ 무료 + 오픈소스 (네이버)
✓ Ligature 버전 (=> != >= 등 합성)
```

---

## 비교

```
JetBrains Mono:
  ✓ 영문 가장 우수
  ✗ 한글 fallback (다른 폰트 사용)
  ✗ 정렬 어긋남 가능

D2Coding:
  ✓ 한글 + 영문 동일 폰트 (정렬 정확)
  ✓ 한글 식별자 깔끔
  △ 영문 단독은 JetBrains 보다 약간 나쁨

Fira Code:
  ✓ Ligature 우수
  ✗ 한글 fallback
```

→ 한국어 우선 환경 = D2Coding 권장.

---

## Ligature 사용

```javascript
// Without ligature (D2Coding)
() => {
  if (x !== null) {
    return x >= 10
  }
}

// With ligature (D2Coding Ligature)
( ) ⇒ {
  if (x ≢ null) {
    return x ⩾ 10
  }
}
```

```css
/* CSS */
.code-with-ligature {
  font-family: "D2Coding Ligature", monospace;
  font-feature-settings: "calt", "liga";
}
```

→ 사용자 호불호. 설정에서 toggle 가능.

---

## Font 로딩

### Self-hosted (권장)

```css
@font-face {
  font-family: 'D2Coding Ligature';
  font-weight: 400 700;
  font-style: normal;
  font-display: swap;
  src: url('/fonts/D2CodingLigatureNerd.woff2') format('woff2');
}

@font-face {
  font-family: 'JetBrains Mono';
  font-weight: 400 700;
  src: url('/fonts/JetBrainsMonoVariable.woff2') format('woff2-variations');
}
```

### CDN

```html
<link href="https://cdn.jsdelivr.net/gh/joungkyun/font-d2coding/d2coding.css" rel="stylesheet">
```

---

## 코드 사이즈

```
인라인 코드:    14px (text-sm)
코드 블록:      13-14px (가독성 + 코드 양)
터미널:         13px (D2Coding) 또는 14px (JetBrains)
큰 코드 데모:   16px+
```

---

## Line height

```
영문 코드 line-height: 1.5
한글 주석 line-height: 1.6+

→ 코드 + 한글 주석 혼용 = 1.6 이 적절
```

```css
.code-block {
  font-family: var(--font-mono);
  font-size: 13px;
  line-height: 1.6;
}
```

---

## Tab vs Space

```
Default rendering:
  tab-size: 2 (대부분 코드 base)
  
사용자 정의:
  설정 → 코드 → tab-size: 2/4/8
```

```css
pre {
  tab-size: 2;
}
```

---

## Syntax highlighting

상세: [../components/code-block.md](../components/code-block.md).

```typescript
// prism-react-renderer 사용
import { Highlight, themes } from 'prism-react-renderer';

const theme = darkMode ? themes.vsDark : themes.vsLight;

<Highlight code={code} language="typescript" theme={theme}>
  {/* ... */}
</Highlight>
```

---

## 한글 식별자 처리

```typescript
// 한글 변수명 가능 (TypeScript)
const 사용자 = '홍길동';
const 작업디렉토리 = '/c/dev/foo';

function 안녕하세요() {
  return `환영합니다, ${사용자}!`;
}

// D2Coding 으로 깔끔히 정렬됨
```

→ 일부 회사 코딩 컨벤션. 우리는 권장 X 지만 지원.

---

## 사용자 커스텀

```
설정 → 모양 → 코드 글꼴:
  ◉ D2Coding Ligature (한글 친화)
  ○ JetBrains Mono
  ○ Fira Code
  ○ Cascadia Code
  ○ 시스템 기본
  ○ 사용자 지정: [          ]   ← font-family 직접 입력
```

---

## 관련

- [korean-first.md](./korean-first.md) — 한글 폰트 stack
- [../tokens/typography.md](../tokens/typography.md) — 폰트 토큰
- [../components/code-block.md](../components/code-block.md) — Code block
- [../components/terminal-view.md](../components/terminal-view.md) — Terminal
