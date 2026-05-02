---
title: Design Tokens — Elevation (Shadow + Z-index)
parent: ./_index.md
related:
  - ../theme/dark.md
status: draft
last_updated: 2026-05-02
---

# Elevation

> **한 줄 요약**: Shadow 깊이 + Z-index 계층. 다크/라이트 자동 조정.

---

## Shadow Tokens

### Light theme

```css
--shadow-none:  none;
--shadow-xs:    0 1px 2px hsl(220 13% 9% / 0.05);
--shadow-sm:    0 1px 3px hsl(220 13% 9% / 0.1), 
                0 1px 2px hsl(220 13% 9% / 0.06);
--shadow-base:  0 4px 6px hsl(220 13% 9% / 0.07), 
                0 2px 4px hsl(220 13% 9% / 0.06);
--shadow-md:    0 10px 15px hsl(220 13% 9% / 0.1), 
                0 4px 6px hsl(220 13% 9% / 0.05);
--shadow-lg:    0 20px 25px hsl(220 13% 9% / 0.1), 
                0 10px 10px hsl(220 13% 9% / 0.04);
--shadow-xl:    0 25px 50px hsl(220 13% 9% / 0.25);
--shadow-inner: inset 0 2px 4px hsl(220 13% 9% / 0.06);
```

### Dark theme

```css
/* 다크 테마는 그림자 더 진하게 (배경과 대비) */
--shadow-xs:    0 1px 2px hsl(0 0% 0% / 0.5);
--shadow-sm:    0 1px 3px hsl(0 0% 0% / 0.7);
--shadow-base:  0 4px 6px hsl(0 0% 0% / 0.6);
--shadow-md:    0 10px 15px hsl(0 0% 0% / 0.7);
--shadow-lg:    0 20px 25px hsl(0 0% 0% / 0.8);
--shadow-xl:    0 25px 50px hsl(0 0% 0% / 0.9);
```

→ 다크에서는 흰 outline 추가하기도 함:
```css
--shadow-elevated-dark: 
  0 0 0 1px hsl(220 13% 30%),  /* outline */
  0 4px 6px hsl(0 0% 0% / 0.6);
```

---

## 의미별 Elevation

```css
/* Resting (default) */
--elevation-card:        var(--shadow-sm);

/* Hovering */
--elevation-card-hover:  var(--shadow-base);

/* Floating */
--elevation-popover:     var(--shadow-md);
--elevation-dropdown:    var(--shadow-md);
--elevation-tooltip:     var(--shadow-base);

/* Modal */
--elevation-modal:       var(--shadow-xl);

/* Dragging */
--elevation-dragging:    var(--shadow-lg);
```

---

## Z-index Stack (★ 매우 중요)

```css
--z-base:           0;
--z-raised:         1;
--z-dropdown:       1000;
--z-sticky:         1100;
--z-overlay:        1200;     /* modal backdrop */
--z-modal:          1300;
--z-popover:        1400;
--z-tooltip:        1500;
--z-toast:          1600;
--z-floating-chat:  1700;     /* F-015 floating overlay */
--z-debug:          9999;
```

### 충돌 방지 규칙

```
원칙:
  1. 항상 var(--z-*) 만 사용 (z-index: 100 직접 X)
  2. 같은 layer 안에선 후순위가 위
  3. Modal 안 popover = z-popover (modal 보다 위)
  4. Toast = 항상 위 (사용자 알림)
```

---

## 시각 매트릭스

```
[화면 표면]
    ↓
[base elements]            z=0
    ↓
[raised cards]             z=1     shadow-sm
    ↓
[sticky headers]           z=1100
    ↓
[modal backdrop]           z=1200  overlay
    ↓
[modal content]            z=1300  shadow-xl
    ↓
[popover/dropdown]         z=1400  shadow-md
    ↓
[tooltip]                  z=1500  shadow-base
    ↓
[toast]                    z=1600  shadow-md
    ↓
[floating chat overlay]    z=1700  shadow-lg (F-015)
```

---

## 적용 예시

### Card hover

```tsx
<div className="
  bg-bg-secondary rounded-lg
  shadow-sm hover:shadow-base
  transition-shadow duration-100
">
  Card content
</div>
```

### Modal

```tsx
<div className="fixed inset-0 z-[1200] bg-bg-overlay" />
<div className="
  fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2
  z-[1300]
  bg-bg-elevated rounded-xl shadow-xl
  p-6
">
  Modal content
</div>
```

### Floating chat (F-015)

```tsx
<div className="
  fixed bottom-0 left-1/4 right-1/4
  z-[1700]
  bg-bg-elevated/90 backdrop-blur
  rounded-t-xl shadow-lg
">
  Chat overlay
</div>
```

### Dragging (visual feedback)

```tsx
<motion.div
  whileDrag={{
    scale: 1.05,
    boxShadow: 'var(--shadow-lg)',
  }}
>
  Draggable
</motion.div>
```

---

## Tailwind 매핑

```javascript
// tailwind.config.ts
boxShadow: {
  xs: 'var(--shadow-xs)',
  sm: 'var(--shadow-sm)',
  DEFAULT: 'var(--shadow-base)',
  md: 'var(--shadow-md)',
  lg: 'var(--shadow-lg)',
  xl: 'var(--shadow-xl)',
  inner: 'var(--shadow-inner)',
  none: 'none',
},

zIndex: {
  base: 'var(--z-base)',
  raised: 'var(--z-raised)',
  dropdown: 'var(--z-dropdown)',
  sticky: 'var(--z-sticky)',
  overlay: 'var(--z-overlay)',
  modal: 'var(--z-modal)',
  popover: 'var(--z-popover)',
  tooltip: 'var(--z-tooltip)',
  toast: 'var(--z-toast)',
  'floating-chat': 'var(--z-floating-chat)',
  debug: 'var(--z-debug)',
},
```

---

## 다크 테마 특별 처리

다크 테마에선 그림자만으로 부족 → outline + 약간의 highlight:

```css
:root[data-theme="dark"] .elevated {
  box-shadow: 
    0 0 0 1px hsl(220 13% 22%),       /* subtle outline */
    var(--shadow-md);
}

/* 또는 inner highlight (top edge 강조) */
:root[data-theme="dark"] .card {
  background: linear-gradient(
    to bottom,
    hsl(220 13% 16%),
    hsl(220 13% 14%)
  );
}
```

---

## Backdrop blur (translucent)

```css
/* F-015 floating chat 같은 곳 */
.translucent {
  background: hsl(var(--color-bg-elevated) / 0.85);
  backdrop-filter: blur(10px);
  -webkit-backdrop-filter: blur(10px);   /* Safari */
}
```

→ Codex 의 "반투명 사이드바" 옵션과 호환.

성능 주의: `backdrop-filter` = paint 비용 큼. 큰 영역에 사용 자제.

---

## 검증

```typescript
// 모든 z-index 가 토큰 사용하는지
function validateZIndex() {
  const grep = execSync('grep -r "z-index:" src/').toString();
  if (grep.match(/z-index:\s*\d+/)) {
    throw new Error('Hardcoded z-index found. Use tokens.');
  }
}
```

---

## 관련

- [colors.md](./colors.md) — Shadow 색
- [../theme/dark.md](../theme/dark.md) — 다크 테마 elevation
- [../components/modal.md](../components/modal.md) — Modal elevation 사용
