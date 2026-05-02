---
title: Typography — Sizes & Hierarchy
parent: ../_index.md
related:
  - ../tokens/typography.md
status: draft
last_updated: 2026-05-02
---

# Typography Sizes & Hierarchy

> **한 줄 요약**: 위계 표현. UI 14px / Body 16px / 한국어 친화 line-height.

---

## Size Scale (실용)

```
12px    xs       작은 메타 (시간, 카운트)
14px    sm       UI (버튼, 라벨, 메뉴)  ★
16px    base     본문 (한글 친화)        ★
18px    lg       강조 본문, 작은 제목
20px    xl       H3 (섹션 제목)
24px    2xl      H2 (페이지 제목)
30px    3xl      H1 (큰 제목)
36px    4xl      Hero (환영)
```

---

## Hierarchy 적용

```
페이지:
  H1 (30px bold)        페이지 제목
  H2 (24px bold)        주요 섹션
  H3 (20px semibold)    하위 섹션
  H4 (18px semibold)    카드 / 작은 섹션
  Body (16px regular)   본문
  Small (14px regular)  부 본문
  Caption (12px)        메타데이터
```

---

## 컴포넌트별 적용

```
Button:        14px medium
Input:         16px regular  (모바일 zoom 방지)
Label:         14px medium
Hint:          12px regular
Tooltip:       12px regular
Badge:         12px medium
Code (block):  13-14px monospace
Code inline:   14px (or inherit) monospace

Sidebar 메뉴: 14px medium
채팅 메시지:  16px regular  (편한 reading)
타임스탬프:   12px regular text-tertiary
```

---

## Tailwind 매핑

```javascript
fontSize: {
  xs: ['0.75rem', { lineHeight: '1rem' }],            // 12 / 16
  sm: ['0.875rem', { lineHeight: '1.25rem' }],        // 14 / 20
  base: ['1rem', { lineHeight: '1.625rem' }],          // 16 / 26 (한글 친화)
  lg: ['1.125rem', { lineHeight: '1.75rem' }],        // 18 / 28
  xl: ['1.25rem', { lineHeight: '1.875rem' }],        // 20 / 30
  '2xl': ['1.5rem', { lineHeight: '2rem' }],          // 24 / 32
  '3xl': ['1.875rem', { lineHeight: '2.25rem' }],     // 30 / 36
  '4xl': ['2.25rem', { lineHeight: '2.5rem' }],       // 36 / 40
}
```

---

## Density 모드 (사용자 설정)

```
Compact:
  base: 14px
  sm: 12px
  → 더 많은 정보 표시

Comfortable (★ 기본):
  base: 16px
  sm: 14px

Spacious:
  base: 18px
  sm: 16px
  → 큰 글씨, 시니어 친화
```

---

## 적용 예시

### 사이드바 채팅 항목

```tsx
<button className="text-sm font-medium px-3 py-2">  {/* 14px */}
  서버 열고 미리보기 확인
</button>
```

### 채팅 메시지

```tsx
<div className="text-base leading-relaxed">  {/* 16px / 1.625 */}
  사용자 또는 AI 응답...
</div>
```

### 페이지 제목

```tsx
<h1 className="text-3xl font-bold mb-2">    {/* 30px bold */}
  설정
</h1>
<p className="text-sm text-text-secondary mb-6">  {/* 14px gray */}
  계정 및 환경 설정
</p>
```

### 메타데이터

```tsx
<time className="text-xs text-text-tertiary">  {/* 12px tertiary */}
  방금 전
</time>
```

---

## 한글 vs 영문 시각 차이

```
"안녕하세요" 14px = 시각적으로 적당
"Hello" 14px = 약간 작아 보임 (x-height)

조정:
  영문 only UI: 14px 그대로 OK
  한글 우선: 14px = OK (한글 약간 큰 느낌 자연스러움)
  혼용: 16px base 권장
```

→ 본 시스템은 16px base 사용.

---

## 작은 사이즈 주의

```
한글 < 12px:
  - 받침 글자 식별 어려움
  - 시니어 사용자 unreadable
  - WCAG 권장: 12px 이상

본 시스템 최소: 12px (xs)
```

---

## 큰 사이즈 (Heading)

```
영문 큰 헤더:
  letter-spacing: -0.025em (조밀하게)

한글 큰 헤더:
  letter-spacing: 0 (그대로)
  단, 가중치 (bold) 강조
```

---

## Web vs Print

```
웹: 16px base (브라우저 기본)
인쇄: 12pt base (16px ≈ 12pt at 96dpi)

본 시스템 = 웹 only.
```

---

## Accessibility

```
✓ 사용자 폰트 사이즈 변경 존중 (rem 사용)
✓ 본문 minimum 14px 권장
✓ Heading 위계 명확 (h1 → h2 → h3 순서)
✓ 색만으로 위계 X (사이즈 + weight 함께)
```

```css
/* rem 사용 (브라우저 base 16px 따름) */
body {
  font-size: 1rem;     /* = 16px (default) */
}

/* 사용자가 브라우저 기본 폰트 sizing 변경 시 자동 적용 */
```

---

## 관련

- [../tokens/typography.md](../tokens/typography.md) — 폰트 토큰
- [korean-first.md](./korean-first.md) — 한글 가이드
- [code-fonts.md](./code-fonts.md) — 코드 폰트
