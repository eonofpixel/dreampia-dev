-- down_016_metadata_extra_strict_strip.sql — v2.0.0 down.
-- Spec: docs/adr/0002-metadata-extra-legacy-optional.md
--
-- 016 은 metadata_json._extra 에서 legacy 두 필드 제거. down 은 promoted
-- column 에서 다시 _extra 에 set — pre-v1.8.4 호환 형태로 복원. column
-- 자체는 015 부터 유지되므로 동일 데이터.

-- permission.default_level 복원 (column 이 NULL 아닌 row 만).
UPDATE sessions
SET metadata_json = json_set(
    metadata_json,
    '$._extra.permission.default_level',
    permission_default_level
)
WHERE metadata_json IS NOT NULL
  AND permission_default_level IS NOT NULL;

-- plan.active 복원 — boolean 으로 set (json() wrap 으로 SQLite 가 JSON true/false 처리).
UPDATE sessions
SET metadata_json = json_set(
    metadata_json,
    '$._extra.plan.active',
    json(CASE plan_active WHEN 1 THEN 'true' ELSE 'false' END)
)
WHERE metadata_json IS NOT NULL;
