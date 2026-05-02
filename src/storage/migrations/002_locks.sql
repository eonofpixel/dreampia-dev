-- 002_locks.sql — session_locks table for multi-window leader election (SS-5).
-- Spec: docs/session/multi-window.md
--
-- 개요
-- ────────────
--   같은 세션을 여러 윈도우 (메인/미니/사이드) 가 동시에 열 수 있을 때,
--   한 시점에 최대 한 윈도우만 write 권한을 가지도록 leader election 을
--   구현하는 데 필요한 lock 테이블이다. SQLite 의 트랜잭션 + PRIMARY KEY
--   제약으로 atomic 한 acquire 를 보장한다.
--
-- Invariants enforced at this layer:
--   INV-1: 한 시점에 한 세션의 leader 는 최대 1개 (PRIMARY KEY 보장).
--   INV-2: heartbeat_at >= acquired_at (애플리케이션 코드에서 보장 — DB
--          레벨 CHECK 는 ISO8601 문자열 비교가 모든 경우에 견고하지 못해 생략).
--   INV-6: stale lock (TTL 초과) 은 새 leader 가 자동 cleanup
--          (LeaderElection.acquireLeadership 에서 처리).
--
-- Cascade
-- ───────
--   ON DELETE CASCADE 로 세션이 삭제될 때 lock 도 자동 정리된다.
--   SessionStore.deleteSession 은 명시적 cleanup 을 하지 않으므로 (이 테이블에
--   대해서만) 더블 삭제 위험은 없다.

CREATE TABLE session_locks (
    session_id TEXT PRIMARY KEY,
    leader_window_id TEXT NOT NULL,
    leader_pid INTEGER NOT NULL,
    acquired_at TEXT NOT NULL,
    heartbeat_at TEXT NOT NULL,
    ttl_seconds INTEGER NOT NULL DEFAULT 30,
    FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE
);

-- heartbeat_at 인덱스: stale lock 탐지 시 (heartbeat_at < expiry) 빠른 스캔용.
-- 멀티 세션 환경에서 만료 검사를 빠르게 만든다.
CREATE INDEX idx_locks_heartbeat ON session_locks(heartbeat_at);
