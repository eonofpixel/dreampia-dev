---
title: Design Tokens — Typography
parent: ./_index.md
related:
  - ../typography/korean-first.md
  - ../typography/sizes.md
status: draft
last_updated: 2026-05-02
---

# Typography

> **한 줄 요약**: Pretendard (한국어) + Apple system 폰트 fallback + JetBrains Mono (코드).

---

## Font Stack

### UI Sans-serif

```css
--font-sans: 
  /* Korean priority */
  "Pretendard Variable",
  "Pretendard",
  "Apple SD Gothic Neo",
  
  /* Apple */
  -apple-system,
  BlinkMacSystemFont,
  
  /* Latin */
  "Segoe UI",
  Roboto,
  "Helvetica Neue",
  Arial,
  
  /* Generic */
  sans-serif,
  
  /* Emoji (last) */
  "Apple Color Emoji",
  "Segoe UI Emoji",
  "Segoe UI Symbol";
```

**이유**:
- Pretendard 가 한글 + 영문 모두 자연스러움
- Apple SD Gothic Neo = macOS 네이티브 한글
- 시스템 폰트로 fallback (성능)

상세: [../typography/korean-first.md](../typography/korean-first.md).

### Code Mono

```css
--font-mono:
  /* 한국어 코드 친화 */
  "D2Coding Ligature",
  "D2Coding",
  
  /* 인기 영문 코드 폰트 */
  "JetBrains Mono",
  "Fira Code",
  "Cascadia Code",
  
  /* OS 기본 */
  Menlo,
  Monaco,
  Consolas,
  "Liberation Mono",
  monospace;
```

**왜 D2Coding 우선?**
- 한국어 식별자 (변수명) 가독성 우수
- 0 / O 구별 명확
- 한글 주석 정렬 정확

### Display (제목)

```css
--font-display:
  /* 같은 stack 사용. 차후 큰 제목용 별도 폰트 도입 가능 */
  var(--font-sans);
```

---

## Size Scale

```css
--text-xs:   0.75rem;    /* 12px */
--text-sm:   0.875rem;   /* 14px */
--text-base: 1rem;       /* 16px - body default */
--text-lg:   1.125rem;   /* 18px */
--text-xl:   1.25rem;    /* 20px - H3 */
--text-2xl:  1.5rem;     /* 24px - H2 */
--text-3xl:  1.875rem;   /* 30px - H1 */
--text-4xl:  2.25rem;    /* 36px */
--text-5xl:  3rem;       /* 48px */
```

### 의미별 적용

```css
/* Heading */
--font-h1: var(--text-3xl);     /* 30px */
--font-h2: var(--text-2xl);     /* 24px */
--font-h3: var(--text-xl);      /* 20px */
--font-h4: var(--text-lg);      /* 18px */

/* Body */
--font-body: var(--text-base);   /* 16px */
--font-body-sm: var(--text-sm);  /* 14px */

/* Meta */
--font-caption: var(--text-xs);  /* 12px - 시간/메타 */

/* UI */
--font-button: var(--text-sm);   /* 14px - 버튼 */
--font-input: var(--text-base);  /* 16px - 입력 (16px 가 모바일 zoom 방지) */
--font-label: var(--text-sm);    /* 14px - 폼 라벨 */
```

---

## Line Height

```css
--leading-none:    1;        /* 단일 라인 (헤더) */
--leading-tight:   1.25;     /* 제목 */
--leading-snug:    1.375;    /* 부 제목 */
--leading-normal:  1.5;      /* 본문 (기본) */
--leading-relaxed: 1.625;    /* 긴 본문 */
--leading-loose:   2;        /* 매우 여유 */
```

### 한국어 line-height 고려

```
영어: 1.5 OK
한글: 1.6~1.7 권장 (받침 글자 때문에 더 여유 필요)

→ 한글 본문 우선 → leading-relaxed (1.625) default
```

---

## Font Weight

```css
--font-normal:    400;      /* 본문 */
--font-medium:    500;      /* UI (버튼, 라벨) */
--font-semibold:  600;      /* 강조, 작은 제목 */
--font-bold:      700;      /* 큰 제목 */
--font-extrabold: 800;      /* 마케팅, 환영 */
```

### 한글 가중치 주의

```
영문은 Light (300) 도 보기 좋음.
한글은 weight 400 미만 = 읽기 어려움 (얇은 획).

→ 우리는 light weight 사용 X (Pretendard 의 light 도 자제).
```

---

## Letter Spacing

```css
--tracking-tighter: -0.05em;
--tracking-tight:   -0.025em;
--tracking-normal:  0;          /* 기본 */
--tracking-wide:    0.025em;
--tracking-wider:   0.05em;
--tracking-widest:  0.1em;       /* CAPS LOCK 같은 강조 */
```

### 한글은 거의 항상 normal

```
영문: 큰 헤더 = tighter (-0.025em)
한글: 모든 사이즈 = normal (0)

→ 한글 자모 간격은 폰트가 결정. CSS letter-spacing 추가 X.
```

---

## Tailwind 매핑

```javascript
// tailwind.config.ts
fontFamily: {
  sans: ['var(--font-sans)'],
  mono: ['var(--font-mono)'],
  display: ['var(--font-display)'],
},

fontSize: {
  xs: ['var(--text-xs)', { lineHeight: '1rem' }],
  sm: ['var(--text-sm)', { lineHeight: '1.25rem' }],
  base: ['var(--text-base)', { lineHeight: '1.625rem' }],  // 한글 friendly
  lg: ['var(--text-lg)', { lineHeight: '1.75rem' }],
  xl: ['var(--text-xl)', { lineHeight: '1.875rem' }],
  '2xl': ['var(--text-2xl)', { lineHeight: '2rem' }],
  '3xl': ['var(--text-3xl)', { lineHeight: '2.25rem' }],
},
```

---

## 사용 예시

```tsx
// Button
<button className="font-medium text-sm">
  저장
</button>

// Heading
<h1 className="text-3xl font-bold leading-tight">
  Dreampia 에 오신 걸 환영합니다
</h1>

// Body (긴 한글 본문)
<p className="text-base leading-relaxed">
  Codex 와 Claude 를 한 번에 사용하세요...
</p>

// Code
<code className="font-mono text-sm">
  npm install dreampia-dev
</code>
```

---

## 한국어 vs 영어 사이즈 차이

```
영문 14px 와 한글 14px = 시각 크기 다름:
  영문: 작아 보임
  한글: 적당해 보임

→ 같은 sizing 사용 가능. 단, 시각 호흡 다름:
  영문 본문 = 줄 간격 조금 좁아도 OK
  한글 본문 = 줄 간격 1.6+ 권장
```

상세: [../typography/korean-first.md](../typography/korean-first.md).

---

## 한국어 wrap / overflow

```css
/* 한글은 wrap 안 됨 (긴 단어 X). 단, 외래어 (URL 등) 처리 필요 */
.text-content {
  word-break: break-word;
  overflow-wrap: break-word;
}

/* 한글-영문 혼합 */
.text-mixed {
  word-spacing: 0.05em;       /* 영문 단어 간격 */
}
```

---

## 폰트 로딩 전략

```html
<!-- preconnect for CDN -->
<link rel="preconnect" href="https://cdn.jsdelivr.net">

<!-- Pretendard Variable (단일 파일) -->
<link 
  rel="preload" 
  href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard/dist/web/variable/pretendardvariable.css"
  as="style"
>

<style>
  @font-face {
    font-family: 'Pretendard Variable';
    font-weight: 45 920;
    font-style: normal;
    font-display: swap;
    src: url('...') format('woff2-variations');
  }
</style>
```

→ font-display: swap (FOUT 허용 — 폰트 로드 전엔 fallback 사용)

---

## 빌드 시 검증

```typescript
// scripts/validate-typography.ts
import { execSync } from 'child_process';

function validate() {
  // 1. 모든 컴포넌트가 토큰만 사용
  const grep = execSync('grep -r "font-family:" src/').toString();
  if (grep.match(/font-family:\s*"/)) {
    throw new Error('Hardcoded font-family found. Use tokens.');
  }
  
  // 2. Pretendard 로드 확인
  // ...
}
```

---

## 관련

- [colors.md](./colors.md) — 텍스트 색
- [../typography/korean-first.md](../typography/korean-first.md) — 한국어 우선 상세
- [../typography/code-fonts.md](../typography/code-fonts.md) — 코드 폰트
- [../typography/sizes.md](../typography/sizes.md) — 사이즈 적용
