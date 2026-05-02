---
title: Design System — Overview
parent: ./_index.md
related:
  - ./principles.md
  - ./tokens/_index.md
status: draft
last_updated: 2026-05-02
---

# Design System Overview

> **한 줄 요약**: Tailwind 기반 디자인 토큰 + Radix UI 헤드리스 + 자체 컴포넌트 라이브러리.

---

## 기술 선택

```
Foundation:
  - Tailwind CSS 3.4    : 유틸리티 클래스
  - Radix UI            : 헤드리스 (a11y 보장)
  - Framer Motion       : 애니메이션
  - lucide-react        : 아이콘 라이브러리
  - Pretendard          : 한국어 우선 폰트

Typography:
  - 한글:    Pretendard, Apple SD Gothic Neo
  - Latin:   -apple-system, BlinkMacSystemFont
  - 코드:    JetBrains Mono, D2Coding Ligature

색상 시스템:
  - HSL 기반 (CSS variables)
  - 다크/라이트 자동 전환
  - 사용자 커스텀 가능
```

---

## 디자인 토큰 계층

```
[원시 토큰 - Primitive]
  blue-500 = #3b82f6
  gray-100 = #f3f4f6
  ...

[의미 토큰 - Semantic]
  --color-primary       → blue-500
  --color-background    → white (light) / black (dark)
  --color-text-primary  → gray-900 / gray-50
  ...

[컴포넌트 토큰 - Component]
  --button-bg-primary           → --color-primary
  --button-text-primary         → white
  --button-bg-primary-hover     → blue-600
  ...
```

→ 컴포넌트는 절대 원시 토큰 직접 사용 X. 의미 토큰만.

상세: [tokens/_index.md](./tokens/_index.md).

---

## 컴포넌트 분류

### Primitive (원시)
```
Button, Input, Textarea, Select, Checkbox, Radio, Switch
→ Radix UI 위에 자체 스타일
```

### Composite (조합)
```
Card, Modal, Dropdown, Toast, Popover, Tooltip
→ Primitive 들을 조합
```

### Domain (도메인)
```
ChatMessage, ChatInput, ToolResult, FileTree, Terminal, DiffViewer
→ Dreampia-Dev 만의 컴포넌트
```

### Layout (레이아웃)
```
ThreePanelLayout, FloatingOverlay, MiniWindow, SettingsLayout
→ 페이지 구조
```

---

## 시각 언어

### Density

```
Comfortable (default):  16px base, 8px gap
Compact:                14px base, 4px gap
Spacious:               18px base, 12px gap

→ 사용자 설정에서 변경 가능
```

### Hierarchy

```
사이즈로 위계 표현:
  H1: 24px   가장 중요 (페이지 제목)
  H2: 20px   섹션 제목
  H3: 16px   하위 섹션
  Body: 14px 본문
  Small: 12px 메타데이터

가중치:
  bold (700):    제목
  semibold (600): 강조
  medium (500):  버튼/라벨
  regular (400): 본문
```

### Color 의미

```
Primary    → 파란/청록  : 주요 액션, 활성 상태
Success    → 녹색       : 성공, 완료
Warning    → 주황       : 주의, 모달 권한
Danger     → 빨강       : 위험, 거부, 삭제
Neutral    → 회색 톤    : 기본 텍스트, 비활성

상세: [tokens/colors.md](./tokens/colors.md).
```

---

## 일관성 체크리스트

새 UI 만들 때:

```
☐ 디자인 토큰만 사용 (raw color X)
☐ Radix UI primitive 활용
☐ 키보드만으로 접근 가능
☐ Focus 표시 명확
☐ Hover/Active/Disabled 상태 모두 정의
☐ Empty state 정의
☐ Error state 정의
☐ Loading state 정의
☐ 다크/라이트 모두 검증
☐ 한국어 + 영어 텍스트 fit
☐ Contrast 4.5:1 이상
☐ 60fps 애니메이션
```

---

## Storybook (Phase 2)

```
모든 컴포넌트 → Storybook 에 등록
  - 모든 variants
  - 모든 states
  - 인터랙션 demo
  - Accessibility 자동 체크 (axe)
```

---

## Figma (Phase 3)

```
디자인 토큰 → Figma 변수 동기화
컴포넌트 라이브러리 ↔ Figma 라이브러리
디자이너 작업 → 자동 코드 생성
```

---

## 관련

- [principles.md](./principles.md) — 7가지 원칙
- [tokens/_index.md](./tokens/_index.md) — 토큰 시스템
- [components/_index.md](./components/_index.md) — 컴포넌트 라이브러리
