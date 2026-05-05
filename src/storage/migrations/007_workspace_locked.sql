-- 007_workspace_locked.sql — v1.1.11 Workspace UX (sticky lock).
-- Spec: docs/v1.x-roadmap.md (P1 v1.1.x Workspace UX).
--
-- 개요
-- ────────────
--   Per-session sticky workspace lock. ChatHeader 의 🔒 toggle 로 사용자가 본
--   세션을 특정 workspace 에 고정. 다음 부팅 시 (또는 폴더 변경 후) 잠긴 세션
--   은 자기 workspace 로 복귀. 잠금 해제 시에만 drift / auto-new-chat prompt
--   대상이 됨.
--
-- INV-1: ALTER TABLE ADD COLUMN — 기존 row 는 default 0 (잠금 X).
-- INV-2: 0 = unlocked / 1 = locked. boolean.
-- INV-3: 본 컬럼은 sessions.workspace.root 와 별도 — workspace.root 가 lock 의
--        대상. 사용자가 toggle 시 Renderer 가 IPC `session/set-workspace-locked`
--        호출 → SessionStore.updateSessionWorkspaceLock(id, locked).

ALTER TABLE sessions
    ADD COLUMN workspace_locked INTEGER NOT NULL DEFAULT 0;

-- 잠긴 세션만 빨리 식별하기 위한 partial index. drift 검사 / boot 복귀 흐름.
CREATE INDEX IF NOT EXISTS idx_sessions_workspace_locked
    ON sessions(workspace_locked)
    WHERE workspace_locked = 1;
