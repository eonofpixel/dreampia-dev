---
title: Components — Wiki Index
parent: ../_index.md
status: draft
last_updated: 2026-05-02
---

# Components Library

> **한 줄 요약**: Radix UI 헤드리스 + Tailwind 스타일 + Framer Motion 애니메이션.

---

## 페이지

### Primitive (원시)
- [button.md](./button.md) — Button 모든 variants
- [input.md](./input.md) — Input / Textarea
- [checkbox-radio.md](./checkbox-radio.md) — Checkbox / Radio
- [switch.md](./switch.md) — Switch (토글)
- [slider.md](./slider.md) — Slider
- [select.md](./select.md) — Native select

### Composite (조합)
- [card.md](./card.md) — Card
- [modal.md](./modal.md) — Modal / Dialog
- [tab.md](./tab.md) — Tab
- [dropdown.md](./dropdown.md) — Dropdown
- [popover.md](./popover.md) — Popover (/, @ 팔레트)
- [tooltip.md](./tooltip.md) — Tooltip
- [toast.md](./toast.md) — Toast 알림
- [progress.md](./progress.md) — Progress bar
- [spinner.md](./spinner.md) — Loading spinner
- [badge.md](./badge.md) — Badge / Chip

### Domain (Dreampia 전용)
- [chat-message.md](./chat-message.md) — 채팅 메시지 buble
- [tool-result.md](./tool-result.md) — Tool 결과 표시
- [code-block.md](./code-block.md) — 코드 블록 (syntax highlight)
- [diff-viewer.md](./diff-viewer.md) — Diff 비교 (F-032)
- [terminal-view.md](./terminal-view.md) — 터미널 (F-030)
- [tree-view.md](./tree-view.md) — 파일 트리 (F-031)
- [empty-state.md](./empty-state.md) — Empty 컴포넌트 (F-029)
- [annotation-marker.md](./annotation-marker.md) — 주석 마커 (F-021)

### Layout
- [sidebar.md](./sidebar.md) — Sidebar 컴포넌트
- [topbar.md](./topbar.md) — 상단바 (메뉴, 윈도우 컨트롤)
- [statusbar.md](./statusbar.md) — 하단 상태바

---

## 컴포넌트 명세 표준 형식

각 컴포넌트 페이지는 다음 구조:

```markdown
1. 한 줄 요약
2. Variants (variant + size + state 매트릭스)
3. Props 인터페이스
4. 시각 mockup (ASCII or 사진)
5. 사용 예시
6. Accessibility 명세
7. 관련 컴포넌트
```

---

## 우선순위 (Phase 1)

```
P0 (필수, 1주):
  ✓ Button, Input, Card, Modal, Dropdown, Toast
  ✓ Sidebar, Tab, Popover (/, @ 팔레트)
  ✓ Spinner, Progress

P0 (도메인, 2주):
  ✓ ChatMessage, ToolResult, CodeBlock, EmptyState
  
P1 (Phase 2):
  - DiffViewer, Terminal, TreeView
  - 모든 사이드 컴포넌트
```

---

## 외부 라이브러리 매핑

| Radix UI | 대응 컴포넌트 |
|----------|--------------|
| `@radix-ui/react-dialog` | Modal |
| `@radix-ui/react-popover` | Popover, Dropdown |
| `@radix-ui/react-tooltip` | Tooltip |
| `@radix-ui/react-tabs` | Tab |
| `@radix-ui/react-toast` | Toast |
| `@radix-ui/react-checkbox` | Checkbox |
| `@radix-ui/react-radio-group` | Radio |
| `@radix-ui/react-switch` | Switch |
| `@radix-ui/react-slider` | Slider |
| `@radix-ui/react-progress` | Progress |
| `@radix-ui/react-select` | Select |

→ **Headless = a11y 무료. 우리는 시각만 책임.**

---

## 관련

- [../tokens/_index.md](../tokens/_index.md) — 컴포넌트가 사용하는 토큰
- [../states/loading.md](../states/loading.md) — 로딩 상태
- [../a11y/_index.md](../a11y/_index.md) — A11y 보장
