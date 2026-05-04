-- 006_cost_v1_0_12.sql — v1.0.12 (COST-1 + audit_log debt cleanup).
-- Spec: docs/v1.x-roadmap.md (COST-1, COST-2, audit_log B-2 debt)
--
-- 개요
-- ────────────
--   1. COST-1 — `usage_events.unknown_pricing` 컬럼 추가:
--      이전엔 미등록 모델도 cost = 0 으로 영속 → "싸서 0" vs "몰라서 0" 구분 X.
--      v1.0.12 부터 lookupPricing 결과가 found=false 일 때 이 플래그를 1 로 영속.
--      UI 가 "?" badge 와 stale 경고 분기에 사용.
--
--   2. v1.0.11 audit_log architectural debt 청산 — 별도 `tool_id` 컬럼:
--      v1.0.11 에선 tool_id 를 ai_model 컬럼에 backfill 했으나 의미 혼동 우려.
--      v1.0.12 에서 정식 컬럼 promote 후 이전 row 는 ai_model 그대로 보존
--      (호환). 신규 row 부터 tool_id 직접 사용.
--      Codex 권고: "audit_log/usage 동시 schema 손볼 때 같이 정리하는 게 싸다."
--
-- INV-1: ALTER TABLE ADD COLUMN 은 SQLite 에서 default 값으로 backfill — 기존
--        row 의 unknown_pricing = 0, tool_id = NULL.
-- INV-2: append-only 원칙 그대로 — UsageStore / AuditLogStore 의 read API 만
--        새 컬럼 노출.

-- ── usage_events.unknown_pricing ────────────────────────────
ALTER TABLE usage_events
    ADD COLUMN unknown_pricing INTEGER NOT NULL DEFAULT 0;

-- 미등록 모델 사용 분포 분석 + UI filter ("?" badge 강조) 용 인덱스.
-- recorded_at 와 합성해 시간 범위 + unknown 필터를 같이 빠르게 처리.
CREATE INDEX IF NOT EXISTS idx_usage_events_unknown_pricing
    ON usage_events(unknown_pricing, recorded_at)
    WHERE unknown_pricing = 1;

-- ── audit_log.tool_id ───────────────────────────────────────
ALTER TABLE audit_log
    ADD COLUMN tool_id TEXT;

-- tool_use.* event 의 tool 별 통계 (가장 많이 실패한 tool 등) 인덱스.
CREATE INDEX IF NOT EXISTS idx_audit_tool_id ON audit_log(tool_id, timestamp DESC)
    WHERE tool_id IS NOT NULL;
