---
title: F-013 — 3-패널 레이아웃
parent: ../_index.md
priority: P0
phase: Phase 1
status: complete
last_updated: 2026-05-02
---

# F-013: 3-패널 레이아웃

> **한 줄 요약**: 사이드바 + 채팅 + 미리보기. 미리보기가 가장 넓음 (시각 우선).

---

## 시각 mockup

```
┌──────────┬──────────────────┬────────────────────────────────────┐
│ Sidebar  │   채팅 (Center)   │   미리보기 (Preview)                │
│ ~286px   │   ~750px          │   ~1054px (가장 큼)                 │
├──────────┼──────────────────┼────────────────────────────────────┤
│ 새 채팅   │ 대화 제목         │ [검토] [페이지명] [+]              │
│ 검색      │ AI/사용자 메시지  │ ← → ↻  URL                          │
│ 플러그인  │ 입력 박스         │                                    │
│ 자동화    │ 모델 선택         │ 실제 웹사이트 렌더링                │
│ 프로젝트  │                   │                                    │
│ 채팅들    │                   │                                    │
│ 설정      │                   │                                    │
└──────────┴──────────────────┴────────────────────────────────────┘
```

## 핵심 특징

- **시각 우선**: 미리보기 영역이 가장 넓음 (~1054px)
- **사이드바**: 메뉴 + 컨텍스트
- **채팅**: 중간 폭 (~750px)
- **resize 가능**: 각 패널 폭 사용자 조정

## 비교

```
일반 채팅앱: 채팅이 가장 넓음
Codex/Dreampia: 미리보기가 가장 넓음 ← 차별화
```

→ 사용자가 코드/UI 보면서 작업 → 미리보기 가시성 중요.

## 구현 (Phase 1)

```typescript
// React + CSS Grid
<div className="grid grid-cols-[286px_750px_1fr]">
  <Sidebar />
  <ChatPanel />
  <PreviewPanel />
</div>

// 사용자 resize 시 LocalStorage 저장
const [sidebarWidth, setSidebarWidth] = useLocalStorage('layout.sidebar_px', 286);
```

## 출처

- [docs/findings/rounds-1-2-live-ui.md](../../findings/rounds-1-2-live-ui.md)
