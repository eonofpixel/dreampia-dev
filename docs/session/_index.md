---
title: Session State — Wiki Index
parent: ../../README.md
status: draft
last_updated: 2026-05-02
---

# Session State (세션 상태) — Wiki Home

> **한 줄 요약**: 대화·워크스페이스·터미널·브라우저·플랜·권한을 단일 세션 상태로 통합하는 contract 의 위키 진입점.
>
> **Codex 자체 조언**: *"클론 품질은 UI보다 이 상태 모델에서 갈립니다"* — [출처](../../CODEX_SELF_ADVICE.md)

---

## 페이지 목록

### Foundation (기초)
- [principles.md](./principles.md) — 7가지 불변 원칙 (default-deny, append-only, single source of truth 등)
- [schema.md](./schema.md) — Top-level `Session` 인터페이스 + lifecycle 이벤트

### Sub-states (서브 스키마)
- [conversation.md](./conversation.md) — `Turn`, `ContentBlock`, `Annotation`
- [workspace.md](./workspace.md) — `Workspace`, `WorkTree`, `GitState`
- [terminal.md](./terminal.md) — `TerminalPane`, replay 지원
- [browser.md](./browser.md) — `BrowserState`, in-app/external backends
- [plan.md](./plan.md) — Plan 모드 (checklist + browser tool)

### Infrastructure (인프라)
- [persistence.md](./persistence.md) — SQLite schema + 파일 시스템 layout
- [multi-window.md](./multi-window.md) — 멀티 윈도우 leader election
- [cross-ai-sync.md](./cross-ai-sync.md) — Claude ↔ Codex provider adapter
- [migration.md](./migration.md) — Schema 버전 관리 + Zod validation

### Reference
- [examples.md](./examples.md) — 완성된 세션 JSON + Export/Import 형식

---

## 빠른 답변

| 질문 | 페이지 |
|------|--------|
| 세션이 뭐야? | [schema.md](./schema.md) |
| 메시지가 어떻게 저장돼? | [conversation.md](./conversation.md) |
| 어떤 DB 쓰는 거야? | [persistence.md](./persistence.md) |
| 같은 세션이 여러 윈도우에서 열리면? | [multi-window.md](./multi-window.md) |
| Claude 와 Codex 메시지 어떻게 호환? | [cross-ai-sync.md](./cross-ai-sync.md) |
| 옛날 버전 데이터 어떻게 읽어? | [migration.md](./migration.md) |
| 실제 JSON 예시 보여줘 | [examples.md](./examples.md) |

---

## Phase 1 작업 항목 (구현 매핑)

| ID | 작업 | 산출물 | 참고 페이지 |
|----|------|--------|------------|
| SS-1 | TypeScript types 정의 | `src/types/Session.ts` | [schema.md](./schema.md), [conversation.md](./conversation.md), [workspace.md](./workspace.md) ... |
| SS-2 | Zod schema 작성 | `src/types/SessionSchema.ts` | [migration.md](./migration.md) |
| SS-3 | SQLite migration | `src/storage/migrations/001_init.sql` | [persistence.md](./persistence.md) |
| SS-4 | SessionStore 구현 | `src/storage/SessionStore.ts` | [persistence.md](./persistence.md) |
| SS-5 | Multi-window leader election | `src/storage/LeaderElection.ts` | [multi-window.md](./multi-window.md) |
| SS-6 | Provider adapters | `src/providers/{Claude,Codex}Adapter.ts` | [cross-ai-sync.md](./cross-ai-sync.md) |
| SS-7 | Export/Import | `src/io/SessionIO.ts` | [examples.md](./examples.md) |
| SS-8 | Validation tests | `tests/session/*.test.ts` | [migration.md](./migration.md) |

**총 예상 시간**: 2주 (1인 fulltime)

---

## 관련 (외부)

- [PERMISSION_MODEL.md](../../PERMISSION_MODEL.md) — 권한 contract (세션의 `permission` 서브 스키마 상세)
- [TOOL_ORCHESTRATION.md](../../TOOL_ORCHESTRATION.md) — Tool 실행 contract
- [CODEX_SELF_ADVICE.md](../../CODEX_SELF_ADVICE.md) — 이 영역이 우선순위 1번인 이유
- [DEEP_EXPLORATION_FINDINGS.md](../../DEEP_EXPLORATION_FINDINGS.md) — UX 발견 사항

---

**Status**: 초안 v0.1. Phase 1 구현 전 critic 검토 권장.
