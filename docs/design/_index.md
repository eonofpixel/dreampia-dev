---
title: Design System — Wiki Index
parent: ../../README.md
status: draft
last_updated: 2026-05-02
---

# Design System (디자인 시스템) — Wiki Home

> **한 줄 요약**: 최고 사용성 + 일관된 시각 언어 + 한국어 우선 + 다크/라이트 + 완벽한 a11y.
>
> **목적**: Dreampia-Dev 의 모든 UI 결정의 단일 진실. 컴포넌트·토큰·인터랙션·상태·접근성 통합.

---

## 페이지 목록

### Foundation
- [overview.md](./overview.md) — 디자인 철학 + 우선순위
- [principles.md](./principles.md) — 7가지 불변 원칙

### Tokens (디자인 토큰 — 모든 컴포넌트의 base)
- [tokens/_index.md](./tokens/_index.md) — 토큰 시스템 전체
- [tokens/colors.md](./tokens/colors.md) — 색 팔레트
- [tokens/typography.md](./tokens/typography.md) — 타이포그래피 (한국어 우선)
- [tokens/spacing.md](./tokens/spacing.md) — 간격 / 패딩
- [tokens/motion.md](./tokens/motion.md) — 애니메이션 / easing
- [tokens/elevation.md](./tokens/elevation.md) — shadow / z-index
- [tokens/radius.md](./tokens/radius.md) — 모서리
- [tokens/breakpoints.md](./tokens/breakpoints.md) — 반응형

### Components
- [components/_index.md](./components/_index.md) — 컴포넌트 라이브러리 전체
- [components/button.md](./components/button.md) — Button 모든 변형
- [components/input.md](./components/input.md) — Input / Textarea
- [components/card.md](./components/card.md) — Card
- [components/modal.md](./components/modal.md) — Modal / Dialog
- [components/tab.md](./components/tab.md) — Tab
- [components/sidebar.md](./components/sidebar.md) — Sidebar 컴포넌트
- [components/dropdown.md](./components/dropdown.md) — Dropdown / Select
- [components/toast.md](./components/toast.md) — Toast 알림
- [components/tooltip.md](./components/tooltip.md) — Tooltip
- [components/popover.md](./components/popover.md) — Popover (/, @ 팔레트)
- [components/badge.md](./components/badge.md) — Badge / Chip
- [components/checkbox-radio.md](./components/checkbox-radio.md) — Checkbox / Radio
- [components/switch.md](./components/switch.md) — Switch (토글)
- [components/slider.md](./components/slider.md) — Slider
- [components/progress.md](./components/progress.md) — Progress
- [components/spinner.md](./components/spinner.md) — Loading spinner
- [components/code-block.md](./components/code-block.md) — Code block
- [components/diff-viewer.md](./components/diff-viewer.md) — Diff viewer
- [components/terminal-view.md](./components/terminal-view.md) — Terminal pane
- [components/tree-view.md](./components/tree-view.md) — File tree
- [components/empty-state.md](./components/empty-state.md) — Empty 컴포넌트

### States (상태 표현)
- [states/loading.md](./states/loading.md) — 로딩 상태
- [states/empty.md](./states/empty.md) — 빈 상태
- [states/error.md](./states/error.md) — 에러 상태
- [states/success.md](./states/success.md) — 성공 상태
- [states/disabled.md](./states/disabled.md) — 비활성

### Interaction
- [interaction/hover.md](./interaction/hover.md) — Hover 패턴
- [interaction/click.md](./interaction/click.md) — Click / Tap
- [interaction/drag.md](./interaction/drag.md) — Drag & Drop
- [interaction/keyboard.md](./interaction/keyboard.md) — 키보드 인터랙션
- [interaction/scroll.md](./interaction/scroll.md) — Scroll 동작
- [interaction/animation.md](./interaction/animation.md) — 애니메이션 패턴

### Layout
- [layout/grid.md](./layout/grid.md) — 그리드 시스템
- [layout/3panel.md](./layout/3panel.md) — 3-패널 상세 (F-013 구현)
- [layout/floating-overlay.md](./layout/floating-overlay.md) — Floating chat (F-015)
- [layout/panels.md](./layout/panels.md) — 패널 토글 매트릭스

### Typography
- [typography/korean-first.md](./typography/korean-first.md) — 한국어 우선 폰트 stack
- [typography/code-fonts.md](./typography/code-fonts.md) — 코드 폰트 (D2Coding, JetBrains)
- [typography/sizes.md](./typography/sizes.md) — 크기 / line-height

### Theme
- [theme/dark.md](./theme/dark.md) — 다크 테마
- [theme/light.md](./theme/light.md) — 라이트 테마
- [theme/customization.md](./theme/customization.md) — 사용자 정의

### Accessibility
- [a11y/_index.md](./a11y/_index.md) — A11y 개요
- [a11y/focus.md](./a11y/focus.md) — Focus 관리
- [a11y/contrast.md](./a11y/contrast.md) — Contrast 규칙 (WCAG AA/AAA)
- [a11y/screen-reader.md](./a11y/screen-reader.md) — 스크린리더
- [a11y/reduced-motion.md](./a11y/reduced-motion.md) — 모션 줄이기
- [a11y/keyboard-only.md](./a11y/keyboard-only.md) — 키보드 only

---

## 우선순위 (Phase 별)

### Phase 1 (MVP)
```
필수:
  - tokens/* 모두 (foundation)
  - components/{button, input, card, modal, sidebar, tab, dropdown}
  - states/{loading, empty, error}
  - layout/{grid, 3panel}
  - typography/korean-first
  - theme/{dark, light}
  - a11y/{focus, contrast, keyboard-only}
```

### Phase 2 (확장)
```
- 모든 components 완성
- 모든 interactions
- theme/customization
- a11y/{screen-reader, reduced-motion}
```

### Phase 3 (고도화)
```
- 사용자 테마 marketplace
- 모션 디자인 가이드
- 다국어 typography
```

---

## 디자인 철학

```
1. 시각 우선 (Visual-first)
   미리보기가 가장 큰 영역. 텍스트는 보조.

2. 한국어 우선 (Korean-first)
   기본 언어 = 한국어. 영어는 fallback.

3. 키보드 우선 (Keyboard-first)
   모든 기능 키보드만으로 접근 가능.

4. 다크 우선 (Dark-first)
   기본 테마 = 다크. 라이트는 사용자 선택.

5. 정밀한 권한 표시 (Permission-explicit)
   AI 가 무엇을 할 수 있는지 항상 명확히.

6. 빠른 피드백 (Fast-feedback)
   100ms 이하 응답. 60fps 유지.

7. 우아한 실패 (Graceful failure)
   에러도 디자인. 사용자가 다음 행동 알 수 있게.
```

---

## 외부 reference

- [Material Design 3](https://m3.material.io/)
- [Tailwind CSS](https://tailwindcss.com/)
- [Radix UI](https://www.radix-ui.com/)
- [shadcn/ui](https://ui.shadcn.com/)
- [Apple HIG](https://developer.apple.com/design/human-interface-guidelines/)

---

## 관련

- [docs/ux/_index.md](../ux/_index.md) — UX 패턴 (28개)
- [docs/i18n/_index.md](../i18n/_index.md) — 다국어
- [docs/performance/_index.md](../performance/_index.md) — 성능
