---
title: Components — Button
parent: ./_index.md
related:
  - ../tokens/colors.md
  - ../tokens/spacing.md
  - ../states/loading.md
status: draft
last_updated: 2026-05-02
---

# Button

> **한 줄 요약**: 4 variant × 3 size × 5 state = 60 변형. 헤드리스 X (Radix 안 씀).

---

## Variants

```
[Primary]    파란 배경 + 흰 텍스트     주요 액션 (저장, 시작)
[Secondary]  회색 배경 + 진한 텍스트   보조 액션 (취소, 닫기)
[Tertiary]   투명 배경 + 텍스트만      텍스트 link 같은 (편집)
[Danger]     빨간 배경 + 흰 텍스트     위험 액션 (삭제, 거부)
```

추가:
```
[Ghost]    hover 시만 배경 표시        아이콘 버튼, 자주 안 쓰는
[Outline]  테두리만                    중립 (취소 등)
```

## Sizes

```
[xs]   24px height,  text-xs,   px-2  py-0.5    매우 작음 (chip 안)
[sm]   32px height,  text-sm,   px-3  py-1.5    표준 작은
[md]   40px height,  text-sm,   px-4  py-2      ★ 기본
[lg]   48px height,  text-base, px-6  py-3      강조
[xl]   56px height,  text-lg,   px-8  py-4      Hero CTA
```

## States

```
[default]   normal
[hover]     색 약간 진하게 + cursor pointer
[active]    더 진하게 + 살짝 눌린 느낌 (translateY 1px)
[focus]     focus ring (2px outline)
[disabled]  회색 + cursor not-allowed
[loading]   spinner + 텍스트 disabled
```

---

## Visual Mockup

```
[Primary md]
┌─────────────┐
│   저장하기  │
└─────────────┘
  bg: var(--color-accent)
  text: var(--color-accent-text)
  
[Primary md hover]
┌─────────────┐
│   저장하기  │
└─────────────┘
  bg: var(--color-accent-hover) (조금 진함)
  
[Primary md active]
┌─────────────┐
│  저장하기   │   ← 1px 아래로
└─────────────┘
  
[Primary md disabled]
┌─────────────┐
│   저장하기  │
└─────────────┘
  opacity: 0.5
  cursor: not-allowed
  
[Primary md loading]
┌─────────────┐
│ ⠋ 저장 중... │
└─────────────┘
  spinner + 텍스트 + disabled
```

---

## Props 인터페이스

```typescript
interface ButtonProps {
  variant?: 'primary' | 'secondary' | 'tertiary' | 'danger' | 'ghost' | 'outline';
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl';
  
  // States
  disabled?: boolean;
  loading?: boolean;
  
  // Content
  icon?: React.ReactNode;        // 좌측 아이콘
  iconRight?: React.ReactNode;   // 우측 아이콘
  fullWidth?: boolean;
  
  // Behavior
  type?: 'button' | 'submit' | 'reset';
  onClick?: (e: React.MouseEvent) => void;
  
  // A11y
  'aria-label'?: string;          // icon-only 시 필수
  
  // Standard
  children: React.ReactNode;
  className?: string;
}
```

---

## 구현

```tsx
import { forwardRef } from 'react';
import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';

const buttonVariants = cva(
  // Base classes
  'inline-flex items-center justify-center gap-2 ' +
  'font-medium rounded ' +
  'transition-all duration-100 ease-out ' +
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-accent ' +
  'disabled:pointer-events-none disabled:opacity-50',
  {
    variants: {
      variant: {
        primary: 
          'bg-accent text-accent-text hover:bg-accent-hover active:bg-accent-active',
        secondary: 
          'bg-bg-tertiary text-text-primary hover:bg-bg-tertiary/80',
        tertiary: 
          'bg-transparent text-text-primary hover:bg-bg-tertiary',
        danger: 
          'bg-danger text-white hover:bg-danger/90',
        ghost: 
          'bg-transparent text-text-primary hover:bg-bg-tertiary/50',
        outline: 
          'bg-transparent border border-border-primary hover:bg-bg-tertiary/50 text-text-primary',
      },
      size: {
        xs: 'h-6 px-2 text-xs',
        sm: 'h-8 px-3 text-sm',
        md: 'h-10 px-4 text-sm',
        lg: 'h-12 px-6 text-base',
        xl: 'h-14 px-8 text-lg',
      },
      fullWidth: {
        true: 'w-full',
      },
    },
    defaultVariants: {
      variant: 'primary',
      size: 'md',
    },
  }
);

interface Props extends 
  React.ButtonHTMLAttributes<HTMLButtonElement>,
  VariantProps<typeof buttonVariants> {
  loading?: boolean;
  icon?: React.ReactNode;
  iconRight?: React.ReactNode;
}

export const Button = forwardRef<HTMLButtonElement, Props>(
  ({ variant, size, fullWidth, loading, icon, iconRight, children, disabled, className, ...props }, ref) => {
    return (
      <button
        ref={ref}
        className={cn(buttonVariants({ variant, size, fullWidth }), className)}
        disabled={disabled || loading}
        {...props}
      >
        {loading ? (
          <Spinner size={size === 'xs' ? 'xs' : 'sm'} />
        ) : icon}
        {children}
        {iconRight}
      </button>
    );
  }
);

Button.displayName = 'Button';
```

---

## 사용 예시

### 기본

```tsx
<Button onClick={handleSave}>저장</Button>
```

### Variants

```tsx
<Button variant="primary">주요 액션</Button>
<Button variant="secondary">보조</Button>
<Button variant="tertiary">텍스트 같은</Button>
<Button variant="danger">삭제</Button>
<Button variant="ghost">고스트</Button>
<Button variant="outline">테두리</Button>
```

### Sizes

```tsx
<Button size="xs">XS</Button>
<Button size="sm">SM</Button>
<Button size="md">MD</Button>
<Button size="lg">LG</Button>
<Button size="xl">XL</Button>
```

### States

```tsx
<Button disabled>비활성</Button>
<Button loading>저장 중...</Button>
```

### 아이콘

```tsx
<Button icon={<Plus />}>추가</Button>
<Button iconRight={<ChevronRight />}>다음</Button>
<Button icon={<Save />} iconRight={<Check />}>완료</Button>

// Icon-only (aria-label 필수!)
<Button variant="ghost" size="sm" aria-label="설정 열기">
  <Settings />
</Button>
```

### Full width

```tsx
<Button fullWidth>전체 너비 버튼</Button>
```

---

## Accessibility

### 필수 보장

```
✓ Tab 으로 포커스 가능
✓ Enter / Space 로 클릭 가능
✓ focus-visible ring (키보드 사용자)
✓ disabled 시 pointer-events: none
✓ 아이콘 only 면 aria-label 필수
✓ loading 상태도 disabled 처럼 처리
```

### Screen reader

```tsx
// loading 상태
<Button loading aria-live="polite">
  {loading ? '저장 중...' : '저장'}
</Button>

// Icon-only
<Button aria-label="설정 열기">
  <Settings aria-hidden="true" />
</Button>
```

### Contrast

```
모든 variant 가 WCAG AA 통과:
  primary on bg-primary:    7.2:1 ✓ AAA
  secondary text:           5.8:1 ✓ AA
  danger:                   5.4:1 ✓ AA
  
hover 상태도 충분한 차이 (3:1+)
```

---

## 키보드 동작

```
Tab           포커스 이동
Shift+Tab     포커스 역방향
Enter / Space 클릭
```

---

## 일반적인 안티 패턴

```
✗ 단일 페이지에 primary 버튼 여러 개
   → 가장 중요한 1개만 primary, 나머지 secondary

✗ Icon-only 버튼에 aria-label 누락
   → 스크린리더 사용자 사용 X

✗ Disabled 상태에 tooltip 없음
   → "왜 비활성인지" 모름. tooltip 으로 사유 표시

✗ Loading 중 사용자가 다시 클릭
   → loading 시 disabled 자동 적용 필수
```

---

## 관련

- [../tokens/colors.md](../tokens/colors.md) — variant 색
- [../tokens/spacing.md](../tokens/spacing.md) — padding 값
- [../tokens/radius.md](../tokens/radius.md) — 모서리
- [../states/loading.md](../states/loading.md) — Loading 상태
- [spinner.md](./spinner.md) — Spinner 컴포넌트
