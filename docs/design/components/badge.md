---
title: Components — Badge / Chip
parent: ./_index.md
related:
  - ../tokens/colors.md
status: draft
last_updated: 2026-05-02
---

# Badge

> **한 줄 요약**: 짧은 정보 (상태, 카운트, 태그). pill 모양.

---

## Variants

```
[Default]    회색 (중립)
[Primary]    파란 (accent)
[Success]    녹색
[Warning]    주황
[Danger]     빨강
[Outline]    border + transparent bg
```

## Sizes

```
[xs]  text-[10px], px-1.5 py-0
[sm]  text-xs, px-2 py-0.5  ★
[md]  text-sm, px-2.5 py-1
```

---

## Visual

```
( 새로움 )         ← default sm
( ▲ 3 )            ← primary
( ✓ 완료 )         ← success
( ⚠ 주의 )         ← warning
( ✗ 실패 )         ← danger
[ 베타 ]           ← outline (border)
```

---

## 구현

```tsx
const badgeVariants = cva(
  'inline-flex items-center gap-1 rounded-full font-medium',
  {
    variants: {
      variant: {
        default: 'bg-bg-tertiary text-text-primary',
        primary: 'bg-accent text-accent-text',
        success: 'bg-success-50 text-success-700',
        warning: 'bg-warning-50 text-warning-700',
        danger: 'bg-danger-50 text-danger-700',
        outline: 'border border-border-primary text-text-secondary',
      },
      size: {
        xs: 'text-[10px] px-1.5 py-0',
        sm: 'text-xs px-2 py-0.5',
        md: 'text-sm px-2.5 py-1',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'sm',
    },
  }
);

export function Badge({ variant, size, children, className }) {
  return (
    <span className={cn(badgeVariants({ variant, size }), className)}>
      {children}
    </span>
  );
}
```

---

## 사용 예시

```tsx
// 상태
<Badge variant="success">✓ 완료</Badge>
<Badge variant="warning">⚠ 진행 중</Badge>
<Badge variant="danger">✗ 실패</Badge>

// 카운트 (notification dot)
<div className="relative">
  <BellIcon />
  <Badge 
    variant="danger" 
    size="xs"
    className="absolute -top-1 -right-1"
  >
    3
  </Badge>
</div>

// 태그
<div className="flex gap-1">
  <Badge variant="outline">React</Badge>
  <Badge variant="outline">TypeScript</Badge>
  <Badge variant="outline">Tailwind</Badge>
</div>

// 모델 배지 (slash 명령에서)
<Badge variant="outline" size="xs">Opus</Badge>
<Badge variant="outline" size="xs">Sonnet</Badge>

// Permission level (F-027)
<Badge variant="primary">🔵 워크스페이스 쓰기</Badge>
```

---

## Removable Chip

```tsx
function Chip({ children, onRemove }) {
  return (
    <Badge variant="outline" className="pr-1">
      {children}
      <button 
        onClick={onRemove}
        className="ml-1 p-0.5 rounded hover:bg-bg-tertiary"
        aria-label={`${children} 제거`}
      >
        <X className="w-3 h-3" />
      </button>
    </Badge>
  );
}

// @ 멘션 chip
<Chip onRemove={() => removeMention('Analyst')}>
  @Analyst
</Chip>
```

---

## Accessibility

```
✓ 색만으로 의미 전달 X (텍스트 + 아이콘 함께)
✓ 카운트 = aria-label 명시 ("새 알림 3개")
✓ Removable = button + aria-label
```

---

## 관련

- [../tokens/colors.md](../tokens/colors.md) — variant 색
- [../tokens/radius.md](../tokens/radius.md) — pill 모양
