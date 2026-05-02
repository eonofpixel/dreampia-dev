---
title: Accessibility — Wiki Index
parent: ../_index.md
status: draft
last_updated: 2026-05-02
---

# Accessibility (A11y)

> **한 줄 요약**: WCAG 2.1 AA 통과 + 한국어 환경 특수성 대응.

---

## 페이지

- [focus.md](./focus.md) — Focus 관리
- [contrast.md](./contrast.md) — Color contrast (WCAG AA/AAA)
- [screen-reader.md](./screen-reader.md) — 스크린리더 (NVDA, VoiceOver)
- [reduced-motion.md](./reduced-motion.md) — 모션 줄이기
- [keyboard-only.md](./keyboard-only.md) — 키보드 only 사용

---

## 목표

```
Phase 1:
  ✓ WCAG 2.1 Level AA 모든 항목
  ✓ 키보드 only 100% 동작
  ✓ Contrast 4.5:1 이상
  ✓ Focus 명확
  ✓ Reduced motion 존중

Phase 2:
  ✓ 스크린리더 (NVDA, VoiceOver) 검증
  ✓ aria-* 속성 완벽
  ✓ 한국어 IME 지원

Phase 3:
  ✓ WCAG AAA 일부
  ✓ 보이스 컨트롤
  ✓ 고대비 모드
```

---

## 검증 도구

```
빌드 시:
  - eslint-plugin-jsx-a11y    : 정적 검증
  - axe-core                   : runtime 검증
  
런타임:
  - @axe-core/react            : dev 모드 자동 알림
  
QA:
  - NVDA (Windows)
  - VoiceOver (macOS)
  - Lighthouse a11y 점수
  - Manual: Tab navigation 전체 테스트
```

---

## 한국어 환경 특수성

```
1. IME 충돌
   - Composition events 처리
   - 단축키 한글 모드 인식
   - 상세: [../../i18n/ime.md](../../i18n/ime.md)

2. 한글 폰트 가독성
   - 12px 미만 X
   - 받침 글자 식별 가능 사이즈
   - line-height 1.6+

3. Screen reader 한국어
   - NVDA + 한글 음성 패키지
   - aria-label 한국어 fallback
```

---

## 관련

- [../principles.md](../principles.md) — 7가지 원칙 (P3 키보드 우선)
- [../../i18n/_index.md](../../i18n/_index.md) — 다국어
