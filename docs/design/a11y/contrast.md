---
title: A11y — Contrast (WCAG)
parent: ./_index.md
related:
  - ../tokens/colors.md
  - ../theme/customization.md
status: draft
last_updated: 2026-05-02
---

# Color Contrast

> **한 줄 요약**: WCAG AA 4.5:1 (text), 3:1 (큰 text). 자동 검증.

---

## WCAG 기준

```
Level AA (필수):
  Normal text: 4.5:1
  Large text (18px+ or 14px+ bold): 3:1
  UI components (border, focus): 3:1
  
Level AAA (권장):
  Normal text: 7:1
  Large text: 4.5:1
```

---

## 본 시스템 기본 contrast

### Light theme

```
Pair                                Ratio    Level
────────────────────────────────────────────────
text-primary on bg-primary         18.5:1   AAA ✓
text-secondary on bg-primary        6.8:1   AA  ✓
text-tertiary on bg-primary         3.5:1   AA Large ✓
accent-text on accent               7.2:1   AAA ✓
danger on bg-primary                5.8:1   AA  ✓
success on bg-primary               5.4:1   AA  ✓
```

### Dark theme

```
text-primary on bg-primary         16.2:1   AAA ✓
text-secondary on bg-primary        5.4:1   AA  ✓
text-tertiary on bg-primary         3.2:1   AA Large ✓
accent-text on accent               8.1:1   AAA ✓
```

→ 모든 본문 텍스트 = AA 통과. 일부 = AAA.

---

## 검증 코드

```typescript
// 빌드 시 자동 검증
import { getContrast } from 'polished';

function validateAllPairs() {
  const issues: string[] = [];
  
  // 모든 색 pair 검증
  const pairs = [
    ['--color-text-primary', '--color-bg-primary'],
    ['--color-text-secondary', '--color-bg-primary'],
    // ...
  ];
  
  for (const [fg, bg] of pairs) {
    for (const theme of ['light', 'dark']) {
      const fgValue = resolveCssVar(fg, theme);
      const bgValue = resolveCssVar(bg, theme);
      const ratio = getContrast(fgValue, bgValue);
      
      if (ratio < 4.5) {
        issues.push(`${theme}: ${fg} on ${bg} = ${ratio.toFixed(2)}:1 (< 4.5)`);
      }
    }
  }
  
  return issues;
}
```

---

## 사용자 커스텀 검증

사용자가 색 변경 시 자동 검증:

```tsx
function ThemeColorPicker({ value, onChange, background }) {
  const ratio = getContrast(value, background);
  const wcag = ratio >= 7 ? 'AAA' : ratio >= 4.5 ? 'AA' : 'fail';
  
  return (
    <div>
      <input type="color" value={value} onChange={(e) => onChange(e.target.value)} />
      
      <div className={cn(
        'text-xs mt-1',
        wcag === 'fail' && 'text-danger',
        wcag === 'AA' && 'text-warning',
        wcag === 'AAA' && 'text-success',
      )}>
        Contrast: {ratio.toFixed(1)}:1 ({wcag === 'fail' ? '미달' : wcag})
      </div>
    </div>
  );
}
```

---

## 비-텍스트 contrast

```
Border / divider:   3:1 (UI components)
Focus ring:         3:1 with adjacent color
Icons (decorative): 적용 X (정보 X)
Icons (informative): 3:1 (기능적 의미 가지면)

예:
  ✓ Border 4:1 = OK
  ✗ Border 1.5:1 = 안 보임
```

---

## 색만으로 정보 X

```
WCAG 1.4.1: Use of Color
  
  ✓ 좋음:
    Success: ✓ + 녹색
    Error:   ✗ + 빨강
    Required: * 표시 + 빨강 라벨
    
  ✗ 나쁨:
    "빨간 글자가 에러" 만 표시 (색맹 X)
    "녹색 / 빨강 dot" 만 (정보 부족)
```

---

## 큰 텍스트 정의

```
Large text (3:1 OK):
  - 18px 이상
  - 또는 14px + bold (700+)

Normal text (4.5:1 필요):
  - 18px 미만 + regular/medium
```

→ Tailwind 매핑:
```
text-lg (18px) regular = 큰 텍스트
text-sm (14px) bold = 큰 텍스트
text-sm (14px) regular = 일반 텍스트 (4.5:1 필요)
```

---

## Disabled 텍스트

```
Disabled state 는 contrast 요구 없음 (WCAG 1.4.3 예외):
  
  Light: text-disabled (3:1 미만 OK)
  Dark: text-disabled (3:1 미만 OK)

단, 사용자가 인지 가능해야 (회색 처리 + cursor not-allowed).
```

---

## 다크모드 특이사항

```
다크 모드 contrast 주의:
  - 너무 흰 텍스트 = 눈부심 (피로)
  - hsl(220 14% 96%) 사용 (완전 흰색 X)
  
  → contrast 유지하면서 부드럽게
```

---

## High Contrast Mode

```typescript
// OS 의 forced-colors 모드 감지
const isHighContrast = window.matchMedia('(forced-colors: active)').matches;

// 자동 적응
@media (forced-colors: active) {
  /* 시스템 색 강제 사용 */
  button {
    border: 1px solid CanvasText;
  }
}
```

---

## 도구

```
검증:
  - Chrome DevTools: Lighthouse a11y
  - axe DevTools (확장)
  - WAVE
  - Stark (Figma 플러그인)

자동:
  - eslint-plugin-jsx-a11y
  - axe-core (CI 통합)
```

---

## 관련

- [../tokens/colors.md](../tokens/colors.md) — 색 토큰
- [../theme/customization.md](../theme/customization.md) — 사용자 커스텀 검증
