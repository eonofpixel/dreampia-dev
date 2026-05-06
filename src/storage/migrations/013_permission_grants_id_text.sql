-- 013_permission_grants_id_text.sql — v1.4.1 (B-2 본격 rebuild).
-- Spec: docs/v1.x-roadmap.md (P3 Schema architectural debt B-2 후속).
--
-- 개요
-- ────────────
--   v1.3.1 (009) 의 marker 위에서 실 table rebuild 수행.
--   `permission_grants.id` INTEGER AUTOINCREMENT → TEXT PRIMARY KEY.
--   기존 row 의 id 는 `target_json.id` (application-level UUIDv7) 가 있으면
--   그것을, 없으면 옛 INTEGER 를 string 으로 cast 해 보존.
--
-- SQLite 의 ALTER COLUMN type 미지원 — table rebuild 패턴.
-- (PRAGMA legacy_alter_table 사용 안 함 — atomic transaction 으로 안전.)
--
-- INV: row 수 보존. 모든 expected 컬럼 보존. 기존 indexes 재생성.

-- 1) 새 테이블 생성 — 기존 컬럼 + id TEXT.
CREATE TABLE permission_grants_new (
    id TEXT PRIMARY KEY,
    session_id TEXT NOT NULL,
    capability TEXT NOT NULL,
    target_json TEXT NOT NULL,
    granted_at TEXT NOT NULL,
    granted_by TEXT NOT NULL CHECK(granted_by IN ('user','auto','automation')),
    expires_at TEXT,
    revoked_at TEXT,
    reason TEXT,
    scope TEXT NOT NULL,
    FOREIGN KEY (session_id) REFERENCES sessions(id)
);

-- 2) 기존 데이터 복사. target_json 안에 application id 가 있으면 우선 사용.
--    JSON1 extension 은 better-sqlite3 의 SQLite 빌드에 기본 포함.
--    null / 잘못된 JSON 시 json_extract 가 NULL 반환 → COALESCE 가 fallback.
INSERT INTO permission_grants_new
    (id, session_id, capability, target_json, granted_at, granted_by,
     expires_at, revoked_at, reason, scope)
SELECT
    COALESCE(json_extract(target_json, '$.id'), CAST(id AS TEXT)) AS id,
    session_id,
    capability,
    target_json,
    granted_at,
    granted_by,
    expires_at,
    revoked_at,
    reason,
    scope
FROM permission_grants;

-- 3) 기존 indexes 제거 후 테이블 swap. SQLite RENAME 은 indexes 자동 따라가지
--    않으므로 명시적으로 drop / recreate.
DROP INDEX IF EXISTS idx_grants_session;
DROP INDEX IF EXISTS idx_grants_active;
DROP TABLE permission_grants;
ALTER TABLE permission_grants_new RENAME TO permission_grants;

-- 4) Indexes 재생성 (001_init.sql 의 정의와 동일).
CREATE INDEX idx_grants_session ON permission_grants(session_id, capability);
CREATE INDEX idx_grants_active ON permission_grants(capability, expires_at)
    WHERE revoked_at IS NULL;
