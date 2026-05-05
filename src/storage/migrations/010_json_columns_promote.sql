-- 010_json_columns_promote.sql — v1.3.2 (B-3).
-- Spec: docs/v1.x-roadmap.md (P3 Schema architectural debt B-3).
--
-- 개요
-- ────────────
--   B-3 — JSON-wrapped 잔여 필드 (history_json / target_json /
--   metadata_json._extra) 를 정식 컬럼으로 promote. multi-step migration —
--   본 commit 은 forward marker 만.
--
-- INV: schema 변경 없음. 본 버전 이후 새 기록은 promoted column 사용.

SELECT 1;
