-- 014_conversation_columns_promote.sql — v1.4.2 (B-3 첫 단계).
-- Spec: docs/v1.x-roadmap.md (P3 Schema architectural debt B-3 후속).
--
-- 개요
-- ────────────
--   v1.3.2 (010) 의 marker 위에서 첫 namespace 부터 promote.
--   `metadata_json._extra.conversation` 의 3 필드를 정식 컬럼으로:
--     - current_model TEXT
--     - current_effort TEXT (high|medium|low|...)
--     - current_mode TEXT (standard|...)
--
-- 본 마이그레이션은 column 추가 + json_extract 으로 backfill. application
-- 코드는 dual-write (column + _extra) 로 transition. 향후 v1.4.2.x 에서
-- _extra.conversation 제거 예정.
--
-- INV: row 수 보존. 기존 metadata_json 변경 X.

-- 1) 컬럼 추가 (NULL 허용 — 기존 row 의 _extra 가 비어있을 가능성).
ALTER TABLE sessions ADD COLUMN current_model TEXT;
ALTER TABLE sessions ADD COLUMN current_effort TEXT;
ALTER TABLE sessions ADD COLUMN current_mode TEXT;

-- 2) Backfill — metadata_json 의 _extra.conversation 에서 추출.
--    json_extract 가 없거나 NULL 이면 column 도 NULL (application 이 default
--    fallback).
UPDATE sessions
SET
    current_model = json_extract(metadata_json, '$._extra.conversation.current_model'),
    current_effort = json_extract(metadata_json, '$._extra.conversation.current_effort'),
    current_mode = json_extract(metadata_json, '$._extra.conversation.current_mode')
WHERE metadata_json IS NOT NULL;
