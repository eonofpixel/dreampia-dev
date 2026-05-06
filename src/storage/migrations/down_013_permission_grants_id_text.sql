-- down_013_permission_grants_id_text.sql — v1.4.1 down.
-- TEXT id → INTEGER AUTOINCREMENT 로 되돌림.
--
-- 주의: TEXT id 가 application UUIDv7 인 row 는 INTEGER cast 시 0 이 됨 (정수
-- 파싱 실패). 본 down 은 "최후의 비상수단" — production 사용 X 권장.
-- 데이터 무결성을 위해 backup 후 manual 처리가 안전.

CREATE TABLE permission_grants_old (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
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

-- AUTOINCREMENT 가 자동 ID 부여하도록 id 컬럼 명시 X.
INSERT INTO permission_grants_old
    (session_id, capability, target_json, granted_at, granted_by,
     expires_at, revoked_at, reason, scope)
SELECT
    session_id, capability, target_json, granted_at, granted_by,
    expires_at, revoked_at, reason, scope
FROM permission_grants;

DROP INDEX IF EXISTS idx_grants_session;
DROP INDEX IF EXISTS idx_grants_active;
DROP TABLE permission_grants;
ALTER TABLE permission_grants_old RENAME TO permission_grants;

CREATE INDEX idx_grants_session ON permission_grants(session_id, capability);
CREATE INDEX idx_grants_active ON permission_grants(capability, expires_at)
    WHERE revoked_at IS NULL;
