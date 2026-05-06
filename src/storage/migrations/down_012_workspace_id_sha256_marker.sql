-- down_012_workspace_id_sha256_marker.sql — v1.4.0 down.
-- 012 의 up 이 schema 변경 없이 SELECT 1 marker 였으므로 down 도 no-op.
-- application code 의 sha256 utility 는 import 자체로는 schema 영향 없음.

SELECT 1;
