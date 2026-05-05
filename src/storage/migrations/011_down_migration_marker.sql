-- 011_down_migration_marker.sql — v1.3.3 (B-4).
-- Spec: docs/v1.x-roadmap.md (P3 Schema architectural debt B-4).
--
-- 개요
-- ────────────
--   B-4 — Down-migration 부재 청산. SQLite 는 down 이 native 미지원이라
--   application layer 가 explicit `down_<version>` SQL 파일 + revertTo(N) API
--   를 제공해야. 본 commit 은 forward marker — 실 down SQL 파일은 v1.4.x
--   에서 backfill.
--
-- INV: schema 변경 없음.

SELECT 1;
