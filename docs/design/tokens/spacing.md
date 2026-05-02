---
title: Design Tokens — Spacing
parent: ./_index.md
related:
  - ../components/_index.md
  - ../layout/grid.md
status: draft
last_updated: 2026-05-02
---

# Spacing System

> **한 줄 요약**: 4px base + Fibonacci-like progression. 일관된 시각 호흡.

---

## Scale

```css
--space-0:    0;            /* 0 */
--space-px:   1px;          /* 1px */
--space-0_5:  0.125rem;     /* 2px */
--space-1:    0.25rem;      /* 4px */
--space-1_5:  0.375rem;     /* 6px */
--space-2:    0.5rem;       /* 8px */
--space-2_5:  0.625rem;     /* 10px */
--space-3:    0.75rem;      /* 12px */
--space-3_5:  0.875rem;     /* 14px */
--space-4:    1rem;         /* 16px */
--space-5:    1.25rem;      /* 20px */
--space-6:    1.5rem;       /* 24px */
--space-7:    1.75rem;      /* 28px */
--space-8:    2rem;         /* 32px */
--space-9:    2.25rem;      /* 36px */
--space-10:   2.5rem;       /* 40px */
--space-11:   2.75rem;      /* 44px */
--space-12:   3rem;         /* 48px */
--space-14:   3.5rem;       /* 56px */
--space-16:   4rem;         /* 64px */
--space-20:   5rem;         /* 80px */
--space-24:   6rem;         /* 96px */
--space-28:   7rem;         /* 112px */
--space-32:   8rem;         /* 128px */
--space-40:   10rem;        /* 160px */
--space-48:   12rem;        /* 192px */
--space-56:   14rem;        /* 224px */
--space-64:   16rem;        /* 256px */
```

---

## 의미별 사용

### 컴포넌트 내부 padding

```css
--padding-input:   var(--space-3) var(--space-4);    /* 12px 16px */
--padding-button:  var(--space-2) var(--space-4);    /* 8px 16px */
--padding-card:    var(--space-4);                    /* 16px */
--padding-modal:   var(--space-6);                    /* 24px */
--padding-section: var(--space-8);                    /* 32px */
```

### 컴포넌트 사이 gap

```css
--gap-tight:    var(--space-2);    /* 8px - 같은 그룹 */
--gap-default:  var(--space-4);    /* 16px - 일반 */
--gap-relaxed:  var(--space-6);    /* 24px - 다른 그룹 */
--gap-section:  var(--space-12);   /* 48px - 섹션 사이 */
```

### Layout

```css
--layout-sidebar-width:  17.875rem;    /* 286px (Codex 동일) */
--layout-chat-width:     46.875rem;    /* 750px */
--layout-preview-min:    32rem;        /* 512px */
--layout-header-height:  3rem;         /* 48px */
--layout-footer-height:  2.5rem;       /* 40px - statusbar */
```

상세: [../layout/grid.md](../layout/grid.md).

---

## 8-point Grid

기본 원칙: 모든 값은 4의 배수, 가능하면 8의 배수.

```
✓ 좋음:  4, 8, 12, 16, 20, 24, 32, 40, 48, 64
✗ 피함:  3, 5, 7, 11, 13, 18, 23 (이상 값)
```

이유:
- 일관성 (시각 grid 형성)
- 디바이스 픽셀 정렬 (sub-pixel 흐림 방지)
- 디자이너 ↔ 개발자 소통 쉬움

예외:
- 1px (border)
- 2px (focus ring offset)
- 6px / 14px (Tailwind 와의 호환)

---

## 한국어 텍스트 호흡

```
한글은 영문보다 시각 밀도 높음:

영문 단락 사이:  margin-y: 16px (space-4)
한글 단락 사이:  margin-y: 24px (space-6)  ← 더 여유

영문 라벨 + 입력:  gap: 4px (space-1)
한글 라벨 + 입력:  gap: 6px (space-1.5)   ← 약간 여유
```

→ 본 시스템은 한글 우선이므로 default 가 더 여유.

---

## Density 모드

사용자가 변경 가능:

```typescript
type DensityMode = 'compact' | 'comfortable' | 'spacious';

// 적용
const DENSITY_MULTIPLIERS = {
  compact: 0.75,        // 75%
  comfortable: 1,       // default
  spacious: 1.25,       // 125%
};

function applyDensity(mode: DensityMode) {
  const root = document.documentElement;
  const mult = DENSITY_MULTIPLIERS[mode];
  
  // 모든 spacing 토큰 곱셈
  for (let i = 0; i <= 16; i++) {
    const val = parseFloat(getComputedStyle(root).getPropertyValue(`--space-${i}`));
    root.style.setProperty(`--space-${i}`, `${val * mult}rem`);
  }
}
```

UI:
```
설정 → 모양 → 밀도:
  ◯ Compact      (정보 많이)
  ⦿ Comfortable  (기본값)
  ◯ Spacious     (눈 편하게)
```

---

## Tailwind 매핑

기본 Tailwind 와 동일 (Tailwind 도 4px base):

```
p-1   = padding: 4px
p-2   = padding: 8px
p-3   = padding: 12px
p-4   = padding: 16px

gap-2 = gap: 8px
gap-4 = gap: 16px

m-auto = margin: auto
mx-4   = margin-left: 16px, margin-right: 16px
```

---

## 사용 예시

### Card

```tsx
<div className="p-4 rounded-lg bg-bg-secondary">
  <h3 className="text-lg font-semibold mb-2">  {/* mb-2 = 8px */}
    제목
  </h3>
  <p className="text-base leading-relaxed">
    본문...
  </p>
</div>
```

### Form

```tsx
<form className="space-y-6">  {/* 24px gap */}
  <div>
    <label className="block text-sm mb-1.5">이름</label>  {/* 6px gap */}
    <input className="w-full p-3" />
  </div>
  
  <div>
    <label className="block text-sm mb-1.5">이메일</label>
    <input className="w-full p-3" />
  </div>
  
  <button className="px-4 py-2">저장</button>
</form>
```

### List

```tsx
<ul className="space-y-2">  {/* 8px - 같은 그룹 */}
  <li className="px-4 py-3">항목 1</li>
  <li className="px-4 py-3">항목 2</li>
</ul>
```

---

## 검증

```typescript
// scripts/validate-spacing.ts
import { execSync } from 'child_process';

function validateSpacing() {
  // 모든 spacing 값이 4의 배수
  const values = parseAllSpacingFromCSS();
  
  for (const v of values) {
    if (v % 4 !== 0 && v !== 1 && v !== 2 && v !== 6 && v !== 14) {
      throw new Error(`Spacing ${v} is not multiple of 4`);
    }
  }
}
```

---

## 관련

- [_index.md](./_index.md) — 토큰 시스템 개요
- [../components/_index.md](../components/_index.md) — 컴포넌트 적용
- [../layout/grid.md](../layout/grid.md) — Layout grid
