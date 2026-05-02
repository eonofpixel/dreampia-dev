---
title: Design Tokens — Border Radius
parent: ./_index.md
status: draft
last_updated: 2026-05-02
---

# Border Radius

> **한 줄 요약**: 일관된 모서리. 컴포넌트 크기에 비례.

---

## Scale

```css
--radius-none:  0;
--radius-xs:    0.125rem;     /* 2px */
--radius-sm:    0.25rem;      /* 4px - small inputs */
--radius-base:  0.375rem;     /* 6px - default */
--radius-md:    0.5rem;       /* 8px - cards */
--radius-lg:    0.75rem;      /* 12px - large cards */
--radius-xl:    1rem;         /* 16px - modal */
--radius-2xl:   1.5rem;       /* 24px - hero */
--radius-full:  9999px;       /* 완전 둥글 (avatar, pill) */
```

---

## 의미별 사용

```css
/* 작은 요소 */
--radius-input:    var(--radius-base);    /* 6px */
--radius-button:   var(--radius-base);    /* 6px */
--radius-checkbox: var(--radius-xs);      /* 2px */
--radius-radio:    var(--radius-full);    /* 원 */

/* 중간 요소 */
--radius-card:     var(--radius-md);      /* 8px */
--radius-tab:      var(--radius-md);      /* 8px (top) */
--radius-toast:    var(--radius-md);      /* 8px */

/* 큰 요소 */
--radius-modal:    var(--radius-xl);      /* 16px */
--radius-popover:  var(--radius-md);      /* 8px */
--radius-tooltip:  var(--radius-base);    /* 6px */

/* 특수 */
--radius-avatar:   var(--radius-full);
--radius-badge:    var(--radius-full);    /* pill */
--radius-chip:     var(--radius-full);    /* pill */
```

---

## 일관성 규칙

```
원칙: 컴포넌트가 클수록 radius 도 큼.
  Button (32-40px height) → 6px
  Card (100-300px) → 8px
  Modal (full screen) → 16px

비례 (rule of thumb):
  radius ≈ height / 5
  radius >= 4px (너무 작으면 안 보임)
  radius <= 24px (너무 크면 어색)
```

### 예외: Pill 모양

```
완전 둥근 모서리 (border-radius: 9999px) =
  - Badge / Chip (작은 정보)
  - Avatar (사람)
  - "Plan 모드" 같은 mode indicator
```

---

## Tailwind 매핑

```javascript
borderRadius: {
  none: '0',
  xs: 'var(--radius-xs)',
  sm: 'var(--radius-sm)',
  DEFAULT: 'var(--radius-base)',
  md: 'var(--radius-md)',
  lg: 'var(--radius-lg)',
  xl: 'var(--radius-xl)',
  '2xl': 'var(--radius-2xl)',
  full: 'var(--radius-full)',
},
```

---

## 사용 예시

```tsx
// Button
<button className="rounded">버튼</button>           {/* 6px */}

// Card
<div className="rounded-md p-4">카드</div>          {/* 8px */}

// Modal
<div className="rounded-xl p-6">모달</div>          {/* 16px */}

// Avatar
<img className="rounded-full w-10 h-10" />          {/* 원 */}

// Pill badge
<span className="rounded-full px-2 py-0.5 text-xs">
  새로움
</span>

// Tab (top corners only)
<button className="rounded-t-md">탭</button>
```

---

## 부분 radius

```css
/* 한쪽만 */
.tab-active {
  border-top-left-radius: var(--radius-md);
  border-top-right-radius: var(--radius-md);
  border-bottom-left-radius: 0;
  border-bottom-right-radius: 0;
}

/* Tailwind */
.rounded-t-md         { 위 둘 다 8px }
.rounded-tl-md        { 좌상만 8px }
```

### Stacked items

```
연결된 항목 모음 (radio group, segment):

[버튼1] [버튼2] [버튼3]
   ↑               ↑
   왼쪽 끝만        오른쪽 끝만
   rounded-l       rounded-r

가운데는 rounded-none.
```

---

## Outline 과의 관계

Focus ring 도 같은 radius:

```css
.button:focus-visible {
  outline: 2px solid var(--color-border-focus);
  outline-offset: 2px;
  border-radius: var(--radius-button);   /* 같은 radius */
}
```

→ Outline 도 둥글게 따라가서 자연스러움.

---

## 관련

- [_index.md](./_index.md) — 토큰 시스템
- [../components/button.md](../components/button.md) — Button radius 적용
- [../components/card.md](../components/card.md) — Card radius
