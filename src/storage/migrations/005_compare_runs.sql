-- 005_compare_runs.sql — Cross-AI Verify/Compare runs persistence (v0.12.0 I).
-- Spec: ROADMAP.md (v0.12.0 I Cross-AI Verify/Compare MVP — Codex 권고)
--
-- 개요
-- ────────────
--   v1.0 차별화 기능. 사용자가 동일 prompt 를 Claude / Codex 양쪽으로 동시에
--   실행해 응답을 나란히 비교한다. MVP 범위 (Codex 정의):
--     1. 동일 prompt 양쪽 실행
--     2. 결과 저장
--     3. side-by-side diff
--     4. 실패 격리 (한쪽 실패해도 다른 쪽 계속)
--
--   - **One row per run** — 양쪽 결과가 한 행에 나란히 저장된다.
--     별도 child 테이블을 만들지 않은 이유: 항상 정확히 2개의 side (claude /
--     codex) 만 다루므로 row 가 폭주할 일이 없고, 단일 SELECT 로 양쪽 상태를
--     즉시 가져오기 위함이다.
--   - **No FK to sessions** — usage_events 와 동일 정책. compare run 은
--     원본 세션과 강하게 결합돼 있지만, 세션이 일시적으로 lock 되어 있거나
--     테스트 환경에서 dangling reference 가 허용돼야 한다.
--   - **status 컬럼 3개** — overall (`status`) + side 별 2개 (`claude_status`,
--     `codex_status`). overall 은 양쪽이 모두 terminal 상태가 됐을 때만
--     'completed' 또는 'failed' 로 finalize 된다. orchestrator 의
--     `finalizeRun` 이 양쪽 상태를 보고 결정한다.
--
-- INV-1: id 는 UUIDv7 — 시간 정렬 가능.
-- INV-2: status ∈ {'running', 'completed', 'failed'}.
-- INV-3: claude_status / codex_status ∈ {'pending', 'streaming', 'done',
--        'error', 'skipped'} 또는 NULL (run 이 막 만들어진 직후).
-- INV-4: claude_text / codex_text 는 누적된 assistant text. 빈 문자열이
--        normal — error 또는 skipped 인 경우에도 빈 문자열로 저장 (NOT NULL
--        하지 않도록 nullable 유지 — backwards-compat).

CREATE TABLE IF NOT EXISTS compare_runs (
    id TEXT PRIMARY KEY,                       -- UUIDv7
    session_id TEXT NOT NULL,                  -- session this compare was launched from (no FK by design)
    prompt TEXT NOT NULL,                      -- the prompt sent to both providers
    workspace_root TEXT NOT NULL,
    permission_level TEXT NOT NULL,            -- 'read_only' | 'workspace_write' | 'full_access' | 'custom'
    created_at TEXT NOT NULL,                  -- ISO 8601 UTC
    status TEXT NOT NULL,                      -- 'running' | 'completed' | 'failed'
    -- claude side
    claude_status TEXT,                        -- 'pending' | 'streaming' | 'done' | 'error' | 'skipped'
    claude_model TEXT,
    claude_text TEXT,                          -- accumulated assistant text
    claude_error TEXT,
    claude_started_at TEXT,
    claude_finished_at TEXT,
    -- codex side
    codex_status TEXT,
    codex_model TEXT,
    codex_text TEXT,
    codex_error TEXT,
    codex_started_at TEXT,
    codex_finished_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_compare_runs_session ON compare_runs(session_id, created_at);
CREATE INDEX IF NOT EXISTS idx_compare_runs_created ON compare_runs(created_at);
