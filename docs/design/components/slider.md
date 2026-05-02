---
title: Components — Slider
parent: ./_index.md
related:
  - ../tokens/colors.md
status: draft
last_updated: 2026-05-02
---

# Slider

> **한 줄 요약**: 범위 값 선택. 대비 슬라이더 (F-034) + 다른 설정.

---

## Variants

```
[Single]    하나의 thumb (값 1개)
[Range]     두 thumb (범위)
[Stepped]   tick mark 있음 (1, 5, 10 등)
```

## Sizes

```
[sm]  track h-1, thumb 12px
[md]  track h-1.5, thumb 16px  ★
[lg]  track h-2, thumb 20px
```

---

## Visual

```
[Single]
━━━━━━●━━━━━━━━━━━  값 표시 (위)
0          50         100

[Range]
━━━━━●━━━━━━●━━━━━
20            70

[Stepped]
━━━━━●━━━━━
│  │  │  │  │
0  25 50 75 100
```

---

## 구현

```tsx
import * as Slider from '@radix-ui/react-slider';

export function SliderField({ value, onChange, min = 0, max = 100, step = 1, label, showValue = true }) {
  return (
    <div>
      {label && (
        <div className="flex justify-between text-sm mb-2">
          <label className="font-medium">{label}</label>
          {showValue && <span className="text-text-secondary">{value}</span>}
        </div>
      )}
      
      <Slider.Root
        value={[value]}
        onValueChange={(v) => onChange(v[0])}
        min={min}
        max={max}
        step={step}
        className="relative flex items-center w-full h-5 cursor-pointer"
      >
        <Slider.Track className="relative grow h-1.5 bg-bg-tertiary rounded-full">
          <Slider.Range className="absolute h-full bg-accent rounded-full" />
        </Slider.Track>
        
        <Slider.Thumb
          className={cn(
            'block w-4 h-4 bg-white rounded-full',
            'border-2 border-accent shadow-sm',
            'focus:outline-none focus:ring-2 focus:ring-accent/30',
            'cursor-grab active:cursor-grabbing'
          )}
          aria-label={label}
        />
      </Slider.Root>
    </div>
  );
}
```

---

## Range Slider

```tsx
<Slider.Root value={[min, max]} onValueChange={setRange}>
  <Slider.Track>
    <Slider.Range />
  </Slider.Track>
  <Slider.Thumb /> {/* min */}
  <Slider.Thumb /> {/* max */}
</Slider.Root>
```

---

## 사용 예시

### 대비 (F-034 모양)

```tsx
<SliderField
  label="대비"
  value={contrast}
  onChange={setContrast}
  min={0}
  max={100}
/>
```

### 폰트 크기

```tsx
<SliderField
  label="폰트 크기"
  value={fontSize}
  onChange={setFontSize}
  min={12}
  max={20}
  step={1}
  showValue
/>
```

### 효력 강도 (F-028 — 또는 dropdown 으로)

```tsx
// 5단계 stepped slider
<SliderField
  label="효력"
  value={effortIdx}
  onChange={setEffortIdx}
  min={0}
  max={4}
  step={1}
  showValue={false}
/>
<div className="flex justify-between text-xs text-text-tertiary">
  <span>최소</span>
  <span>낮음</span>
  <span>중간</span>
  <span>높음</span>
  <span>매우 높음</span>
</div>
```

---

## 키보드

```
←→         step 만큼 변경
↑↓         step 만큼 변경
PgUp/PgDn  큰 step (10x)
Home       min
End        max
```

---

## Accessibility

```
✓ role="slider"
✓ aria-valuenow, aria-valuemin, aria-valuemax
✓ aria-label 또는 aria-labelledby
✓ Tab focus + 키보드 조정
✓ 값 변화 시 aria-live 알림
```

---

## 관련

- [../tokens/motion.md](../tokens/motion.md) — Thumb hover 애니메이션
