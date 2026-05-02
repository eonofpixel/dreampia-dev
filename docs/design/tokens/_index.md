---
title: Design Tokens — Wiki Index
parent: ../_index.md
status: draft
last_updated: 2026-05-02
---

# Design Tokens

> **한 줄 요약**: 모든 시각 결정의 단일 진실. CSS variables 기반 + Tailwind config 통합.

---

## 페이지

- [colors.md](./colors.md) — 색 팔레트 (HSL, 의미별)
- [typography.md](./typography.md) — 타이포그래피 (한국어 우선)
- [spacing.md](./spacing.md) — 간격 / 패딩 (4px 기준)
- [motion.md](./motion.md) — 애니메이션 timing + easing
- [elevation.md](./elevation.md) — Shadow + z-index
- [radius.md](./radius.md) — 모서리 둥글기
- [breakpoints.md](./breakpoints.md) — 반응형 breakpoint

---

## 토큰 계층 (3-tier)

### Tier 1: Primitive (원시)

```css
/* 가공 X 원시 값 */
--blue-50: 213 100% 96%;
--blue-100: 214 95% 93%;
--blue-200: 213 97% 87%;
--blue-300: 212 96% 78%;
--blue-400: 213 94% 68%;
--blue-500: 217 91% 60%;     /* base */
--blue-600: 221 83% 53%;
--blue-700: 224 76% 48%;
--blue-800: 226 71% 40%;
--blue-900: 224 64% 33%;
```

→ Tailwind 의 default + 우리만의 추가.

### Tier 2: Semantic (의미)

```css
/* Light theme */
:root {
  --color-bg-primary: hsl(0 0% 100%);
  --color-bg-secondary: hsl(220 14% 96%);
  --color-bg-tertiary: hsl(220 13% 91%);
  
  --color-text-primary: hsl(220 9% 9%);
  --color-text-secondary: hsl(220 9% 46%);
  --color-text-tertiary: hsl(220 9% 65%);
  
  --color-accent: hsl(var(--blue-500));
  --color-accent-hover: hsl(var(--blue-600));
  
  --color-success: hsl(142 71% 45%);
  --color-warning: hsl(38 92% 50%);
  --color-danger: hsl(0 84% 60%);
}

/* Dark theme */
:root[data-theme="dark"] {
  --color-bg-primary: hsl(220 13% 9%);
  --color-bg-secondary: hsl(220 13% 14%);
  --color-bg-tertiary: hsl(220 13% 18%);
  
  --color-text-primary: hsl(220 14% 96%);
  --color-text-secondary: hsl(220 9% 70%);
  --color-text-tertiary: hsl(220 9% 50%);
  
  --color-accent: hsl(var(--blue-400));
  --color-accent-hover: hsl(var(--blue-300));
  /* ... */
}
```

### Tier 3: Component (컴포넌트)

```css
/* Button 의 토큰 */
.button-primary {
  --button-bg: var(--color-accent);
  --button-text: hsl(0 0% 100%);
  --button-bg-hover: var(--color-accent-hover);
  --button-bg-disabled: var(--color-bg-tertiary);
  --button-text-disabled: var(--color-text-tertiary);
}
```

→ 컴포넌트는 항상 Tier 2/3 만 사용. Tier 1 직접 X.

---

## Tailwind 통합

`tailwind.config.ts`:

```typescript
import type { Config } from 'tailwindcss';

export default {
  content: ['./src/**/*.{ts,tsx}'],
  darkMode: ['class', '[data-theme="dark"]'],
  theme: {
    extend: {
      colors: {
        // Primitive (Tier 1) - 직접 사용 자제
        // ...
        
        // Semantic (Tier 2) - 컴포넌트에서 사용
        bg: {
          primary: 'var(--color-bg-primary)',
          secondary: 'var(--color-bg-secondary)',
          tertiary: 'var(--color-bg-tertiary)',
        },
        text: {
          primary: 'var(--color-text-primary)',
          secondary: 'var(--color-text-secondary)',
          tertiary: 'var(--color-text-tertiary)',
        },
        accent: {
          DEFAULT: 'var(--color-accent)',
          hover: 'var(--color-accent-hover)',
        },
        success: 'var(--color-success)',
        warning: 'var(--color-warning)',
        danger: 'var(--color-danger)',
      },
      
      fontFamily: {
        sans: ['var(--font-sans)'],
        mono: ['var(--font-mono)'],
        display: ['var(--font-display)'],
      },
      
      spacing: {
        // 4px 기준 (4, 8, 12, 16, 20, 24, 32, 40, 48, 64, 80, 96)
      },
      
      // ...
    },
  },
} satisfies Config;
```

---

## 사용자 정의

```typescript
// 사용자가 색 변경 가능 (F-034 모양 설정)
function applyUserTheme(custom: ThemeCustomization) {
  const root = document.documentElement;
  
  if (custom.accent) {
    root.style.setProperty('--color-accent', custom.accent);
  }
  
  // ... 다른 토큰들
}

// Codex 패턴 따라:
//   - 액센트 색
//   - 배경색
//   - 전경색
//   - UI 글꼴
//   - 코드 글꼴
//   - 반투명 사이드바 toggle
//   - 대비 slider
```

---

## 명명 규칙

```
색상:    --color-{semantic}-{variant}
글꼴:    --font-{role}
크기:    --size-{step}
간격:    --space-{step}
반경:    --radius-{step}
그림자:  --shadow-{step}
지속:    --duration-{name}
가속:    --easing-{name}
```

---

## Validate

```typescript
// 빌드 시 자동 검증:
//   - 모든 컴포넌트는 Tier 2/3 토큰만 사용
//   - 모든 토큰은 valid HSL/RGB/etc
//   - 다크/라이트 모두 정의됨
//   - Contrast 4.5:1 이상

import { validateTokens } from './scripts/validate-tokens';
validateTokens();  // 빌드 단계
```

---

## 관련

- [colors.md](./colors.md) — 색 시스템 상세
- [typography.md](./typography.md) — 타이포그래피
- [../theme/dark.md](../theme/dark.md) — 다크 테마 적용
- [../theme/light.md](../theme/light.md) — 라이트 테마 적용
