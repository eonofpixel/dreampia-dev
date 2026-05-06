-- down_015_extra_promote_v1.sql — v1.8.1 down.
-- 컬럼 제거. metadata_json._extra 데이터는 그대로 유지 (application 이 fallback).

ALTER TABLE sessions DROP COLUMN plan_active;
ALTER TABLE sessions DROP COLUMN permission_default_level;
