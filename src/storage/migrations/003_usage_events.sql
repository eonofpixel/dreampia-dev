-- 003_usage_events.sql — append-only token/cost telemetry table for v0.4.0.
-- Spec: ROADMAP.md (v0.4.0 Usage/Cost Tracking MVP)
--
-- 개요
-- ────────────
--   Provider 별 (claude/codex/mock) 매 turn 의 token usage + estimated cost 를
--   누적 기록한다. 사용자가 "오늘/7일/30일" 단위로 얼마나 썼고 얼마가 들었는지
--   즉시 확인할 수 있어야 v1.0 의 신뢰 단계로 진입 가능 (Codex 권고).
--
--   - INSERT-only — UPDATE / DELETE 는 store 레벨에서 노출 X.
--   - session_id / turn_id 는 sessions / turns 의 ID 와 동일 의미를 갖지만
--     FK 는 의도적으로 추가하지 않는다 (cross-process 안전성:
--     usage 를 쓰는 시점에 sessions 가 일시적으로 다른 트랜잭션에 lock
--     걸려 있을 수 있고, 또 외부 import 시 dangling reference 도 허용해야 함).
--   - 비용은 UTC ISO 시각 + provider 별 model 단위로 GROUP BY 가능하도록
--     인덱스 3개 (recorded_at / provider+recorded_at / model+recorded_at).
--
-- INV-1: input_tokens / output_tokens 등 모든 카운터는 NOT NULL DEFAULT 0
--        — JSONL 에서 누락된 필드도 0 으로 안전 fallback.
-- INV-2: total_cost_usd 는 USD, 6자리 소수까지 round (pricing.ts 에서 계산).
-- INV-3: append-only — UsageStore.recordEvent 만 INSERT 하고 그 외 mutation X.

CREATE TABLE IF NOT EXISTS usage_events (
    id TEXT PRIMARY KEY,                                    -- UUIDv7
    session_id TEXT NOT NULL,                               -- references sessions.id (no FK by design)
    turn_id TEXT NOT NULL,                                  -- references turns.id
    provider TEXT NOT NULL,                                 -- 'claude' | 'codex' | 'mock'
    model TEXT NOT NULL,                                    -- e.g. 'claude-3-5-sonnet-20241022'
    input_tokens INTEGER NOT NULL DEFAULT 0,
    output_tokens INTEGER NOT NULL DEFAULT 0,
    cache_creation_input_tokens INTEGER NOT NULL DEFAULT 0, -- Claude prompt-cache 작성
    cache_read_input_tokens INTEGER NOT NULL DEFAULT 0,     -- Claude / Codex (cached_input_tokens)
    reasoning_output_tokens INTEGER NOT NULL DEFAULT 0,     -- Codex reasoning 전용
    total_cost_usd REAL NOT NULL DEFAULT 0,
    recorded_at TEXT NOT NULL,                              -- ISO 8601 UTC
    source TEXT                                              -- optional debug ref (e.g. raw JSONL line)
);

CREATE INDEX IF NOT EXISTS idx_usage_events_session ON usage_events(session_id, recorded_at);
CREATE INDEX IF NOT EXISTS idx_usage_events_recorded ON usage_events(recorded_at);
CREATE INDEX IF NOT EXISTS idx_usage_events_provider ON usage_events(provider, recorded_at);
CREATE INDEX IF NOT EXISTS idx_usage_events_model ON usage_events(model, recorded_at);
