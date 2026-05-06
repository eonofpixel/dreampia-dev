-- 015_extra_promote_v1.sql — v1.8.1 (B-3 2단계).
-- Spec: docs/extra-namespace-audit.md (P1 — permission.default_level + plan.active).
--
-- 개요
-- ────────────
--   v1.4.2 (014) 가 conversation 컬럼을 promote 한 것에 이어, 본 마이그레이션은
--   audit 의 P1 권고에 따라 가장 자주 read 되는 두 _extra 필드를 promote:
--     - sessions.permission_default_level TEXT
--         (read_only|workspace_write|full_access|custom)
--     - sessions.plan_active INTEGER (0|1)
--
-- v1.8.0 audit 결과 (docs/extra-namespace-audit.md):
--   permission.default_level — Resolver / streaming / UI render 매 사용 (very high)
--   plan.active — Resolver hot path (매 permission 결정마다)
--
-- 본 마이그레이션은 column 추가 + json_extract 으로 backfill. application
-- 코드는 dual-write (column + _extra) 로 transition. 향후 슬롯에서
-- _extra 측 read 제거 후 _extra 필드 제거.
--
-- INV: row 수 보존. 기존 metadata_json 변경 X.

-- 1) 컬럼 추가. permission_default_level 은 NULL 허용 (legacy row 의 _extra
--    가 비어있을 가능성). plan_active 는 boolean — NOT NULL DEFAULT 0.
ALTER TABLE sessions ADD COLUMN permission_default_level TEXT;
ALTER TABLE sessions ADD COLUMN plan_active INTEGER NOT NULL DEFAULT 0;

-- 2) Backfill — metadata_json 의 _extra.{permission.default_level, plan.active}
--    에서 추출. JSON 이 NULL/누락이면 column 도 NULL/0 (application 이 default
--    fallback).
UPDATE sessions
SET
    permission_default_level =
        json_extract(metadata_json, '$._extra.permission.default_level'),
    plan_active = CASE
        WHEN json_extract(metadata_json, '$._extra.plan.active') IN (1, 'true', true) THEN 1
        ELSE 0
    END
WHERE metadata_json IS NOT NULL;
