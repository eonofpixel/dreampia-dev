-- 008_workspace_id_deterministic.sql — v1.3.0 (B-1).
-- Spec: docs/v1.x-roadmap.md (P3 Schema architectural debt B-1).
--
-- 개요
-- ────────────
--   B-1 — `workspace_id` 가 INSERT 시 random UUIDv7 였던 것을 결정성 있는
--   `sha256(workspaces.root)[:16]` 으로 promote.
--
-- 본 commit 은 backfill 단계 — 기존 row 의 workspace_id 는 유지 (UNIQUE 제약
-- 보존). 신규 row 부터 application code 가 결정성 ID 사용 (별도 PR).
-- 본 SQL 은 forward-compatibility hint 로 column comment 만 (SQLite 는 column
-- comment 미지원 → no-op + version bump).
--
-- INV: 본 migration 은 schema 변경 없음. 단지 schema_version 7 → 8 bump 로
--      후속 application 코드가 본 버전부터 결정성 ID 사용한다는 마커.

-- SQLite 는 -- 로 주석만 가능. 실 schema 변경 X — version marker 만.
SELECT 1;
