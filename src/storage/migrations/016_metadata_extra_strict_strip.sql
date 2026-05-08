-- 016_metadata_extra_strict_strip.sql — v2.0.0 (ADR-0002 implementation).
-- Spec: docs/adr/0002-metadata-extra-legacy-optional.md
--
-- 개요
-- ────────────
--   v1.8.4 부터 buildStoredMetadata 는 plan.active / permission.default_level
--   을 _extra 에 직렬화하지 않음 (column 만 source). 그러나 schema 의
--   `.optional()` 가 pre-v1.8.4 row 호환을 위해 유지됨.
--
--   v2.0.0 의 strict removal 흐름:
--     1. 모든 row 의 metadata_json._extra 에서 두 필드 제거 (본 migration).
--     2. metadataExtraSchema.ts 에서 두 필드 삭제 (Phase B 코드 변경).
--     3. extraSchemaContract.test.ts 가 두 필드 strict reject 검증.
--
-- INV: row 수 보존. 컬럼 (permission_default_level / plan_active) 변경 X.
--      migration 015 이후 모든 row 는 이미 두 컬럼에 정확한 값 보유.

-- 두 필드 동시 strip — json_remove 가 path 부재 시 no-op (idempotent).
-- WHERE 로 변경이 필요한 row 만 좁힘 (write 비용 절감).
UPDATE sessions
SET metadata_json = json_remove(
    json_remove(metadata_json, '$._extra.plan.active'),
    '$._extra.permission.default_level'
)
WHERE metadata_json IS NOT NULL
  AND (
      json_extract(metadata_json, '$._extra.plan.active') IS NOT NULL
      OR json_extract(metadata_json, '$._extra.permission.default_level') IS NOT NULL
  );
