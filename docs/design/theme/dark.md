---
title: Theme — Dark
parent: ../_index.md
related:
  - ../tokens/colors.md
  - light.md
status: draft
last_updated: 2026-05-02
---

# Dark Theme (★ 기본값)

> **한 줄 요약**: 개발자 친화 다크. 적당한 contrast. 코드 가독성 우수.

---

## 배경 위계

```
Layer 1 (가장 어두움):     hsl(220 13% 5%)    body
Layer 2 (메인):            hsl(220 13% 9%)    main bg
Layer 3 (카드):            hsl(220 13% 14%)   card, sidebar
Layer 4 (hover):           hsl(220 13% 18%)   button hover
Layer 5 (elevated):        hsl(220 13% 22%)   modal, popover
```

→ 깊이감 = 더 밝은 배경 (counter-intuitive 하지만 표준).

---

## 텍스트

```
Primary:    hsl(220 14% 96%)   거의 흰색
Secondary:  hsl(220 9% 70%)    중간 회색
Tertiary:   hsl(220 9% 50%)    옅은 회색 (hint)
Disabled:   hsl(220 9% 35%)    매우 옅음
Inverse:    hsl(220 13% 9%)    어두운 배경 위 (액센트 버튼 등)
```

---

## Accent (파랑/청록)

```
Default:   hsl(195 84% 68%)   ← 다크에서 더 밝게
Hover:     hsl(195 88% 78%)
Active:    hsl(195 92% 87%)
```

→ 라이트 테마 대비 **더 밝게** (어두운 배경 위 가독성).

---

## Semantic colors (다크 조정)

```
Success:  hsl(142 71% 55%)    더 밝게
Warning:  hsl(38 92% 60%)
Danger:   hsl(0 84% 70%)
Info:     hsl(199 89% 60%)

→ 어두운 배경 위 가독성 위해 lightness 증가
```

---

## Border

```
Subtle:    hsl(220 13% 22%)    배경과 살짝 차이
Standard:  hsl(220 13% 30%)
Strong:    hsl(220 13% 40%)
Focus:     hsl(195 84% 68%)    (accent 와 같음)
```

---

## Shadow

다크 테마에선 그림자만으로 부족 → outline 추가:

```css
:root[data-theme="dark"] .elevated {
  box-shadow: 
    0 0 0 1px hsl(220 13% 22%),       /* subtle outline */
    0 4px 6px hsl(0 0% 0% / 0.6);
}
```

→ 라이트는 그림자만, 다크는 그림자 + outline 조합.

---

## 코드 syntax (vsCode Dark+ 패턴)

```
keyword:   hsl(280 60% 70%)   보라
string:    hsl(110 50% 60%)   녹색
number:    hsl(20 80% 65%)    주황
comment:   hsl(220 9% 50%)    회색
function:  hsl(50 80% 65%)    노랑
variable:  hsl(220 14% 96%)   흰색
type:      hsl(195 84% 70%)   파랑
```

---

## 적용

```css
:root[data-theme="dark"] {
  --color-bg-primary: hsl(220 13% 9%);
  --color-bg-secondary: hsl(220 13% 14%);
  /* ... 모든 토큰 */
}
```

---

## 트랜지션 (light → dark)

```css
* {
  transition: background-color 200ms, color 200ms, border-color 200ms;
}

/* 단, 너무 많은 transition = 노이즈. body level 만 적용 */
```

---

## 시스템 다크 모드 따라가기

```typescript
function useThemePreference() {
  const [theme, setTheme] = useState<'light' | 'dark' | 'system'>('system');
  
  useEffect(() => {
    if (theme === 'system') {
      const mq = window.matchMedia('(prefers-color-scheme: dark)');
      const apply = () => setEffectiveTheme(mq.matches ? 'dark' : 'light');
      
      apply();
      mq.addEventListener('change', apply);
      return () => mq.removeEventListener('change', apply);
    }
    
    setEffectiveTheme(theme);
  }, [theme]);
}
```

UI:
```
설정 → 모양:
  ◯ 라이트
  ⦿ 다크          ★ 기본
  ◯ 시스템 따라가기
```

---

## 관련

- [../tokens/colors.md](../tokens/colors.md) — 색 토큰
- [light.md](./light.md) — 라이트 테마
- [customization.md](./customization.md) — 사용자 정의
