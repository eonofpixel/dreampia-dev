---
title: Components — Card
parent: ./_index.md
related:
  - ../tokens/elevation.md
  - ../tokens/radius.md
status: draft
last_updated: 2026-05-02
---

# Card

> **한 줄 요약**: 컨테이너 컴포넌트. 정보 그룹화 + clickable 옵션.

---

## Variants

```
[Standard]    bg-secondary + radius-md + shadow-sm
[Outlined]    border + radius-md (shadow X)
[Elevated]    bg-elevated + shadow-base
[Interactive] hover 시 elevation 증가 + cursor pointer
[Embedded]    채팅 안 카드 (F-022 임베디드 카드)
```

## Padding

```
[compact]  p-3 (12px)
[default]  p-4 (16px)  ★
[relaxed]  p-6 (24px)
```

---

## Visual Mockup

```
[Standard]
┌────────────────────────────┐
│ 제목                       │
│ 본문 내용...               │
│                            │
│ [액션] [액션 2]            │
└────────────────────────────┘

[Embedded - F-022]
┌────────────────────────────┐
│ 🌐 웹 미리보기      [열기] │
│    웹사이트                │
└────────────────────────────┘
```

---

## 구현

```tsx
const cardVariants = cva(
  'rounded-md transition-shadow duration-100',
  {
    variants: {
      variant: {
        standard: 'bg-bg-secondary shadow-sm',
        outlined: 'border border-border-primary',
        elevated: 'bg-bg-elevated shadow',
        interactive: 'bg-bg-secondary shadow-sm hover:shadow cursor-pointer',
        embedded: 'bg-bg-secondary border border-border-primary',
      },
      padding: {
        compact: 'p-3',
        default: 'p-4',
        relaxed: 'p-6',
      },
    },
    defaultVariants: {
      variant: 'standard',
      padding: 'default',
    },
  }
);

export function Card({ variant, padding, className, children, ...props }) {
  return (
    <div className={cn(cardVariants({ variant, padding }), className)} {...props}>
      {children}
    </div>
  );
}

// Sub-components
export function CardHeader({ children }) {
  return <div className="mb-3">{children}</div>;
}

export function CardTitle({ children }) {
  return <h3 className="text-lg font-semibold">{children}</h3>;
}

export function CardDescription({ children }) {
  return <p className="text-sm text-text-secondary mt-0.5">{children}</p>;
}

export function CardContent({ children }) {
  return <div>{children}</div>;
}

export function CardFooter({ children }) {
  return <div className="mt-4 flex items-center justify-end gap-2">{children}</div>;
}
```

---

## 사용 예시

```tsx
<Card>
  <CardHeader>
    <CardTitle>설정</CardTitle>
    <CardDescription>계정 관련 정보</CardDescription>
  </CardHeader>
  <CardContent>
    {/* ... */}
  </CardContent>
  <CardFooter>
    <Button variant="secondary">취소</Button>
    <Button variant="primary">저장</Button>
  </CardFooter>
</Card>

// Interactive (clickable)
<Card variant="interactive" onClick={() => navigate('/detail')}>
  <CardTitle>클릭 가능한 카드</CardTitle>
</Card>

// Embedded (F-022)
<EmbeddedCard
  kind="web_preview"
  title="웹 미리보기"
  url="http://localhost:3000/dashboard"
  onOpen={() => switchTab('preview')}
/>
```

---

## 임베디드 카드 (Domain)

```tsx
function EmbeddedCard({ kind, title, url, thumbnail, onOpen }) {
  return (
    <Card variant="embedded" padding="compact">
      <div className="flex items-center gap-3">
        <Icon kind={kind} className="w-5 h-5 text-accent" />
        <div className="flex-1">
          <div className="font-medium">{title}</div>
          <div className="text-xs text-text-tertiary truncate">{url}</div>
        </div>
        <Button size="sm" onClick={onOpen}>열기</Button>
      </div>
      
      {thumbnail && (
        <img src={thumbnail} alt="" className="mt-2 rounded w-full" />
      )}
    </Card>
  );
}

const KIND_ICONS = {
  web_preview: '🌐',
  image: '🖼',
  pdf: '📄',
  chart: '📊',
};
```

---

## Accessibility

```
✓ Interactive variant 은 role="button" + tabIndex
✓ Title = 의미 있는 heading (h3 적절)
✓ 클릭 영역 충분 (44px 이상)
```

```tsx
// Interactive 카드
<Card 
  variant="interactive"
  role="button"
  tabIndex={0}
  onClick={handleClick}
  onKeyDown={(e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      handleClick();
    }
  }}
>
  ...
</Card>
```

---

## 관련

- [../tokens/elevation.md](../tokens/elevation.md) — Shadow tokens
- [../tokens/radius.md](../tokens/radius.md) — Radius
- [../../ux/patterns/F-022-embedded-card.md](../../ux/patterns/F-022-embedded-card.md) — 임베디드 카드 패턴
