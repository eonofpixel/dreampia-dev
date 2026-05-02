---
title: Information Architecture — Wiki Index
parent: ../../README.md
status: draft
last_updated: 2026-05-02
---

# Information Architecture (IA)

> **한 줄 요약**: 정보 / 화면 / 흐름의 지도. 사용자 mental model 과 일치.

---

## 페이지

- [overview.md](./overview.md) — IA 철학 + 원칙
- [sidebar.md](./sidebar.md) — 사이드바 구조 상세
- [chat-flow.md](./chat-flow.md) — 채팅 메시지 흐름
- [preview-panel.md](./preview-panel.md) — 미리보기 패널 구조
- [settings-hierarchy.md](./settings-hierarchy.md) — 12개 설정 카테고리
- [onboarding.md](./onboarding.md) — 첫 실행 흐름
- [first-run.md](./first-run.md) — Workspace 최초 진입
- [empty-app-state.md](./empty-app-state.md) — 빈 상태 모음

---

## 사용자 mental model

```
사용자 이해:
  "Codex / Claude 를 한 앱에서 쓰고 싶다"
  "채팅 여러 개 동시 진행"
  "결과 (코드, 미리보기) 옆에 둠"
  "설정은 한 곳에 통합"

→ 우리 IA = 이 mental model 충족
```

---

## 정보 layers

```
[Top]   App-level (전역 설정, 사용자)
   ↓
[Mid]   Workspace-level (프로젝트, git, MCP)
   ↓
[Low]   Session-level (채팅, 권한, 도구)
   ↓
[Bottom] Turn-level (메시지, tool calls)
```

상세: [overview.md](./overview.md).

---

## 관련

- [../session/_index.md](../session/_index.md) — Session 데이터 모델
- [../design/_index.md](../design/_index.md) — Design system
