-- 009_grants_id_text.sql — v1.3.1 (B-2).
-- Spec: docs/v1.x-roadmap.md (P3 Schema architectural debt B-2).
--
-- 개요
-- ────────────
--   B-2 — `permission_grants.id` 가 INTEGER AUTOINCREMENT 였지만 application
--   layer 에서는 UUIDv7 string 으로 다뤘다 (JSON wrapper). 이를 TEXT 컬럼
--   으로 promote.
--
-- SQLite 는 ALTER COLUMN type 미지원. table 재생성 필요. 본 commit 은 forward
-- compat marker 만 (v1.4.x 에서 본격적으로 ABI break + table rebuild).
--
-- INV: 본 migration 은 schema 변경 없음 (version marker 만). 실 작업 후속.

SELECT 1;
