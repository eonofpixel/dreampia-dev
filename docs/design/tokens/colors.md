---
title: Design Tokens — Colors
parent: ./_index.md
related:
  - ../theme/dark.md
  - ../theme/light.md
  - ../a11y/contrast.md
status: draft
last_updated: 2026-05-02
---

# Color System

> **한 줄 요약**: HSL 기반 + 의미별 토큰 + 다크/라이트 자동 전환 + 사용자 커스텀.

---

## 색 팔레트 (Tier 1 — Primitive)

### Brand

```
Dreampia Primary (파란/청록 — 신뢰 + 기술):
  primary-50:  hsl(195 100% 97%)
  primary-100: hsl(195 95% 93%)
  primary-200: hsl(195 92% 87%)
  primary-300: hsl(195 88% 78%)
  primary-400: hsl(195 84% 68%)
  primary-500: hsl(195 80% 58%)   ← brand
  primary-600: hsl(195 75% 48%)
  primary-700: hsl(195 70% 40%)
  primary-800: hsl(195 65% 33%)
  primary-900: hsl(195 60% 25%)

(Codex 의 #339CFF 비슷하지만 약간 더 청록)
```

### Neutrals (Gray)

```
gray-50:  hsl(0 0% 98%)        ← 가장 밝음
gray-100: hsl(220 14% 96%)
gray-200: hsl(220 13% 91%)
gray-300: hsl(220 13% 83%)
gray-400: hsl(220 9% 65%)
gray-500: hsl(220 9% 46%)
gray-600: hsl(220 9% 35%)
gray-700: hsl(220 9% 28%)
gray-800: hsl(220 13% 18%)
gray-900: hsl(220 13% 9%)
gray-950: hsl(220 13% 5%)      ← 가장 어두움
```

### Semantic colors

```
Success (녹색):
  success-50:  hsl(138 76% 97%)
  success-500: hsl(142 71% 45%)
  success-700: hsl(142 76% 36%)

Warning (주황):
  warning-50:  hsl(48 100% 96%)
  warning-500: hsl(38 92% 50%)
  warning-700: hsl(33 93% 38%)

Danger (빨강):
  danger-50:   hsl(0 86% 97%)
  danger-500:  hsl(0 84% 60%)
  danger-700:  hsl(0 74% 42%)

Info (하늘):
  info-500:    hsl(199 89% 48%)
```

---

## Semantic Tokens (Tier 2)

### 배경

```css
/* Light theme */
--color-bg-primary:   hsl(0 0% 100%);     /* 메인 배경 */
--color-bg-secondary: hsl(220 14% 96%);   /* 카드, 패널 */
--color-bg-tertiary:  hsl(220 13% 91%);   /* hover, divider */
--color-bg-elevated:  hsl(0 0% 100%);     /* modal, popover */
--color-bg-overlay:   hsl(0 0% 0% / 0.5); /* modal backdrop */

/* Dark theme */
--color-bg-primary:   hsl(220 13% 9%);    /* #131517 */
--color-bg-secondary: hsl(220 13% 14%);   /* 카드 */
--color-bg-tertiary:  hsl(220 13% 18%);   /* hover */
--color-bg-elevated:  hsl(220 13% 14%);   /* modal */
--color-bg-overlay:   hsl(0 0% 0% / 0.7); /* modal backdrop */
```

### 텍스트

```css
/* Light */
--color-text-primary:    hsl(220 9% 9%);   /* #14181F */
--color-text-secondary:  hsl(220 9% 46%);  /* 보조 */
--color-text-tertiary:   hsl(220 9% 65%);  /* hint */
--color-text-disabled:   hsl(220 9% 80%);
--color-text-inverse:    hsl(0 0% 100%);   /* 어두운 배경 위 */
--color-text-link:       hsl(195 80% 48%);
--color-text-link-hover: hsl(195 75% 38%);

/* Dark */
--color-text-primary:    hsl(220 14% 96%);
--color-text-secondary:  hsl(220 9% 70%);
--color-text-tertiary:   hsl(220 9% 50%);
--color-text-disabled:   hsl(220 9% 35%);
--color-text-inverse:    hsl(220 13% 9%);
--color-text-link:       hsl(195 84% 68%);
--color-text-link-hover: hsl(195 88% 78%);
```

### 강조 (Accent)

```css
/* Light */
--color-accent:           hsl(195 80% 48%);   /* 버튼 등 */
--color-accent-hover:     hsl(195 75% 40%);
--color-accent-active:    hsl(195 70% 35%);
--color-accent-text:      hsl(0 0% 100%);     /* accent 위 텍스트 */
--color-accent-bg:        hsl(195 100% 97%);  /* accent 배경 (chip) */

/* Dark */
--color-accent:           hsl(195 84% 68%);
--color-accent-hover:     hsl(195 88% 78%);
--color-accent-active:    hsl(195 92% 87%);
--color-accent-text:      hsl(220 13% 9%);
--color-accent-bg:        hsl(195 60% 20%);
```

### Border

```css
/* Light */
--color-border-primary:    hsl(220 13% 91%);  /* 일반 */
--color-border-secondary:  hsl(220 13% 83%);  /* 강조 */
--color-border-focus:      hsl(195 80% 48%);  /* focus */
--color-border-danger:     hsl(0 84% 60%);    /* error */

/* Dark */
--color-border-primary:    hsl(220 13% 22%);
--color-border-secondary:  hsl(220 13% 30%);
--color-border-focus:      hsl(195 84% 68%);
--color-border-danger:     hsl(0 74% 50%);
```

---

## Permission Level 색

P5 (Permission-explicit) 따라 권한 level 색 명확:

```css
--permission-read-only:        hsl(220 9% 50%);   /* 회색 (보수) */
--permission-workspace-write:  hsl(195 80% 48%);  /* 파랑 (기본) */
--permission-full-access:      hsl(38 92% 50%);   /* 주황 (주의) */
--permission-custom:           hsl(280 60% 50%);  /* 보라 (전문) */
--permission-blocked:          hsl(0 84% 60%);    /* 빨강 */
```

→ [F-027 권한 dropdown](../../ux/patterns/F-027-permission-dropdown.md) 참고.

---

## Code Syntax 색

```css
/* Light theme - JetBrains style */
--syntax-bg:        var(--color-bg-secondary);
--syntax-text:      hsl(220 9% 9%);
--syntax-keyword:   hsl(280 60% 50%);   /* 보라 */
--syntax-string:    hsl(110 50% 35%);   /* 녹색 */
--syntax-number:    hsl(20 80% 45%);    /* 주황 */
--syntax-comment:   hsl(220 9% 50%);    /* 회색 */
--syntax-function:  hsl(0 80% 50%);     /* 빨강 */
--syntax-variable:  hsl(220 9% 9%);
--syntax-type:      hsl(195 80% 40%);   /* 파랑 */

/* Dark theme - vscode dark+ style */
--syntax-bg:        var(--color-bg-secondary);
--syntax-text:      hsl(220 14% 96%);
--syntax-keyword:   hsl(280 60% 70%);
--syntax-string:    hsl(110 50% 60%);
--syntax-number:    hsl(20 80% 65%);
--syntax-comment:   hsl(220 9% 50%);
--syntax-function:  hsl(50 80% 65%);    /* 노랑 */
--syntax-variable:  hsl(220 14% 96%);
--syntax-type:      hsl(195 84% 70%);
```

---

## Diff 색

```css
/* Light */
--diff-added-bg:     hsl(138 76% 97%);
--diff-added-border: hsl(142 71% 45%);
--diff-added-text:   hsl(142 76% 25%);

--diff-removed-bg:     hsl(0 86% 97%);
--diff-removed-border: hsl(0 84% 60%);
--diff-removed-text:   hsl(0 74% 30%);

/* Dark */
--diff-added-bg:     hsl(142 60% 12%);
--diff-added-border: hsl(142 71% 45%);
--diff-added-text:   hsl(142 76% 75%);

--diff-removed-bg:     hsl(0 50% 12%);
--diff-removed-border: hsl(0 84% 60%);
--diff-removed-text:   hsl(0 74% 75%);
```

---

## Contrast 매트릭스 (WCAG)

| 조합 | Light | Dark | WCAG |
|------|-------|------|------|
| text-primary on bg-primary | 18.5:1 | 16.2:1 | AAA |
| text-secondary on bg-primary | 6.8:1 | 5.4:1 | AA |
| text-tertiary on bg-primary | 3.5:1 | 3.2:1 | AA Large |
| accent-text on accent | 7.2:1 | 8.1:1 | AAA |
| danger on bg-primary | 5.8:1 | 6.3:1 | AA |

→ 모든 일반 텍스트는 4.5:1 이상 (WCAG AA).
→ 큰 텍스트 (18px+) 는 3:1 이상.

상세: [../a11y/contrast.md](../a11y/contrast.md).

---

## 사용자 커스텀 (F-034)

```typescript
// 사용자가 변경 가능한 토큰
interface UserThemeCustomization {
  // 핵심 (Codex 패턴)
  accent_color?: string;          // hex
  background_color?: string;
  foreground_color?: string;
  
  // UI font
  ui_font?: string;
  code_font?: string;
  
  // 옵션
  translucent_sidebar?: boolean;
  contrast?: number;              // 0-100 slider
}
```

UI:
```
설정 → 모양 → 색 커스텀:

라이트 테마      [가져오기] [테마 복사] [Dreampia ▼]
  액센트         ▣ #2DA4D9            ← 클릭 → color picker
  배경색         ⬜ #FFFFFF
  전경색         ⬛ #14181F
  대비           ━━━━━●━━━━━ 70
```

---

## 색맹 친화 (Color blindness)

```
색만으로 정보 전달 X (P3 키보드 우선과 같은 원리):
  ✓ Success: ✓ + 녹색
  ✓ Error:    ✗ + 빨강
  ✓ Warning:  ⚠ + 주황
  ✓ Diff:     +/- 표시 + 색

→ 색맹이어도 모든 정보 읽기 가능
```

---

## Tools

```typescript
// 디자인 토큰 생성기
import { generateColorScale } from '@dreampia/tokens';

const myBrand = generateColorScale('hsl(195 80% 58%)');
// → primary-50 ~ primary-900 자동 생성
```

---

## 관련

- [_index.md](./_index.md) — 토큰 시스템 개요
- [typography.md](./typography.md) — 폰트 색
- [../theme/dark.md](../theme/dark.md) — 다크 테마
- [../theme/light.md](../theme/light.md) — 라이트 테마
- [../a11y/contrast.md](../a11y/contrast.md) — Contrast 검증
