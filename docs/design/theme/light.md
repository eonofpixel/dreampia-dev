---
title: Theme — Light
parent: ../_index.md
related:
  - dark.md
  - ../tokens/colors.md
status: draft
last_updated: 2026-05-02
---

# Light Theme

> **한 줄 요약**: 깔끔한 라이트. 흰색 우선. 미니멀.

---

## 배경 위계

```
Layer 1 (body):       hsl(0 0% 100%)         완전 흰색
Layer 2 (main):       hsl(0 0% 100%)         흰색 (같음)
Layer 3 (card):       hsl(220 14% 96%)       매우 옅은 회색
Layer 4 (hover):      hsl(220 13% 91%)       옅은 회색
Layer 5 (elevated):   hsl(0 0% 100%)         흰색 (그림자로 elevation)
```

→ 다크와 반대: 깊이감 = **그림자** (배경 차이는 미세).

---

## 텍스트

```
Primary:    hsl(220 9% 9%)     거의 검정
Secondary:  hsl(220 9% 46%)    회색
Tertiary:   hsl(220 9% 65%)    옅은 회색
Disabled:   hsl(220 9% 80%)    매우 옅음
Inverse:    hsl(0 0% 100%)     흰색 (액센트 위 등)
```

---

## Accent

```
Default:   hsl(195 80% 48%)   ← 라이트에서 약간 어둡게
Hover:     hsl(195 75% 40%)
Active:    hsl(195 70% 35%)
```

→ 다크 대비 **어둡게** (흰 배경 위 contrast).

---

## Semantic

```
Success:  hsl(142 71% 45%)
Warning:  hsl(38 92% 50%)
Danger:   hsl(0 84% 60%)
Info:     hsl(199 89% 48%)
```

---

## Shadow

라이트 테마는 그림자가 핵심:

```css
--shadow-sm:    0 1px 3px hsl(220 13% 9% / 0.1);
--shadow-base:  0 4px 6px hsl(220 13% 9% / 0.07);
--shadow-md:    0 10px 15px hsl(220 13% 9% / 0.1);
--shadow-lg:    0 20px 25px hsl(220 13% 9% / 0.1);
--shadow-xl:    0 25px 50px hsl(220 13% 9% / 0.25);
```

→ 검은 그림자 (alpha 조정).

---

## Border

```
Subtle:    hsl(220 13% 91%)
Standard:  hsl(220 13% 83%)
Strong:    hsl(220 9% 65%)
Focus:     hsl(195 80% 48%)
```

---

## 코드 syntax (vsCode Light+ 패턴)

```
keyword:   hsl(280 60% 50%)   보라
string:    hsl(110 50% 35%)   녹색
number:    hsl(20 80% 45%)    주황
comment:   hsl(220 9% 50%)    회색
function:  hsl(0 80% 50%)     빨강
variable:  hsl(220 9% 9%)     검정
type:      hsl(195 80% 40%)   파랑
```

---

## 사용 시나리오

```
라이트 테마 적합:
  ✓ 밝은 환경 (사무실, 야외)
  ✓ 인쇄 / 캡처 (스크린샷)
  ✓ 발표 자료
  ✓ 시각 장애 사용자 (일부)

다크보다 라이트 선호 사용자:
  - 약 10-30% (개발자 풀 기준)
  - 시니어 사용자 비율 더 높음
```

---

## 가독성

```
Light:   흰 배경 + 검은 텍스트 = 최대 contrast
         코드 reading 도 OK (vsCode Light 도 인기)

Dark:    검은 배경 + 흰 텍스트 = 코드 친화
         야간 / 어두운 환경

→ 사용자 환경 / 시간대에 따라.
```

---

## 시간대 자동 (Phase 2)

```typescript
// 시스템 다크모드 따라가기 (이미 지원)
matchMedia('(prefers-color-scheme: dark)')

// 추가: 시간대 따라 (Phase 2)
function autoThemeBySchedule() {
  const hour = new Date().getHours();
  return hour >= 6 && hour < 18 ? 'light' : 'dark';
}
```

---

## 관련

- [../tokens/colors.md](../tokens/colors.md)
- [dark.md](./dark.md)
- [customization.md](./customization.md)
