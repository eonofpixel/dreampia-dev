# Session State Contract — Dreampia-Dev

> **이 문서는 위키로 분리되었습니다.**
>
> **새 진입점**: [docs/session/_index.md](./docs/session/_index.md)

---

## 왜 분리했나?

원본 974줄 단일 파일 → AI/사용자가 한 주제 찾기 어려움 + 토큰 낭비.
위키 스타일 (12 파일, 평균 200줄) 로 분리:

- 토큰 효율 (한 주제 = 한 파일만 로드)
- 검색성 (`grep` 정확 매칭)
- 안정 링크 (`[grants](./grants.md)`)
- 점진 업데이트 (작은 diff)

상세 동기: [README.md](./README.md) 참고.

---

## 빠른 참조

| 주제 | 위키 페이지 |
|------|-------------|
| 7가지 불변 원칙 | [docs/session/principles.md](./docs/session/principles.md) |
| Top-level Session 인터페이스 | [docs/session/schema.md](./docs/session/schema.md) |
| 대화 (Turn, ContentBlock, Annotation) | [docs/session/conversation.md](./docs/session/conversation.md) |
| 워크스페이스 (Worktree, GitState) | [docs/session/workspace.md](./docs/session/workspace.md) |
| 터미널 (TerminalPane, replay) | [docs/session/terminal.md](./docs/session/terminal.md) |
| 브라우저 (tabs, partition 격리) | [docs/session/browser.md](./docs/session/browser.md) |
| Plan 모드 (체크리스트, read-only) | [docs/session/plan.md](./docs/session/plan.md) |
| SQLite + 파일 시스템 layout | [docs/session/persistence.md](./docs/session/persistence.md) |
| 멀티 윈도우 leader election | [docs/session/multi-window.md](./docs/session/multi-window.md) |
| Claude ↔ Codex adapter | [docs/session/cross-ai-sync.md](./docs/session/cross-ai-sync.md) |
| Schema 마이그레이션 + Zod | [docs/session/migration.md](./docs/session/migration.md) |
| 완성된 JSON 예시 + Export/Import | [docs/session/examples.md](./docs/session/examples.md) |

---

## 작업 항목 (Phase 1)

| ID | 작업 | 산출물 | 참고 페이지 |
|----|------|--------|------------|
| SS-1 | TypeScript types | `src/types/Session.ts` | schema, conversation, workspace, ... |
| SS-2 | Zod schema | `src/types/SessionSchema.ts` | migration |
| SS-3 | SQLite migration | `src/storage/migrations/001_init.sql` | persistence |
| SS-4 | SessionStore | `src/storage/SessionStore.ts` | persistence |
| SS-5 | Multi-window leader election | `src/storage/LeaderElection.ts` | multi-window |
| SS-6 | Provider adapters | `src/providers/*.ts` | cross-ai-sync |
| SS-7 | Export/Import | `src/io/SessionIO.ts` | examples |
| SS-8 | Validation tests | `tests/session/*.test.ts` | migration |

**총 예상 시간**: 2주 (1인 fulltime)

---

## 관련

- [docs/session/_index.md](./docs/session/_index.md) — 위키 홈
- [PERMISSION_MODEL.md](./PERMISSION_MODEL.md) — 다음 분리 대상
- [TOOL_ORCHESTRATION.md](./TOOL_ORCHESTRATION.md) — 다음 분리 대상
- [CODEX_SELF_ADVICE.md](./CODEX_SELF_ADVICE.md) — 이 영역 우선순위 1번 근거

---

**Status**: Wiki 로 분리 완료 (2026-05-02). 원본은 git history 에 보존.
