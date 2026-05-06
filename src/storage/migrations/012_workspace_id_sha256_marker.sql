-- 012_workspace_id_sha256_marker.sql — v1.4.0 (B-1 backfill foundation).
-- Spec: docs/v1.x-roadmap.md (P3 Schema architectural debt B-1 후속).
--
-- 개요
-- ────────────
--   v1.3.0 (마이그레이션 008) 의 marker 위에 application-code utility 도입:
--     - workspaceIdForSha256(path) — 새 sha256-기반 deterministic id.
--     - isLegacyFnvWorkspaceId(id, path) — 백필 대상 판별.
--     - backfillWorkspaceIdsToSha256(db) JS helper (opt-in, atomic).
--
--   본 SQL 은 schema 변경 X — 그저 schema_version bump 마커. 후속 commit 이
--   application code 의 default 를 sha256 으로 전환할 수 있음을 표시.
--
-- INV: schema 변경 0. 백필 helper 는 사용자 / 부팅 코드가 explicit 호출.

SELECT 1;
