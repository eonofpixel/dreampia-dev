---
title: Performance — SQLite Tuning
parent: ./_index.md
related:
  - ../session/persistence.md
  - cache.md
status: draft
last_updated: 2026-05-02
---

# SQLite Tuning

> **한 줄 요약**: WAL + 적절한 PRAGMA + 인덱스. 1GB DB 도 빠름.

---

## 필수 PRAGMA

```sql
-- WAL (Write-Ahead Logging)
-- 동시 read 가능 (writer 블록 X)
PRAGMA journal_mode = WAL;

-- Synchronous (WAL 모드에서 안전한 default)
PRAGMA synchronous = NORMAL;

-- Cache size (더 많이 메모리 사용)
PRAGMA cache_size = -64000;     -- 64MB (음수 = KB 단위)

-- Memory mapping (큰 DB 빠름)
PRAGMA mmap_size = 268435456;   -- 256MB

-- 임시 테이블 메모리에
PRAGMA temp_store = MEMORY;

-- Foreign keys 활성
PRAGMA foreign_keys = ON;

-- Auto-vacuum (DB 비대화 방지)
PRAGMA auto_vacuum = INCREMENTAL;
```

---

## 인덱스

```sql
-- 자주 검색되는 컬럼
CREATE INDEX idx_sessions_workspace ON sessions(workspace_id, archived);
CREATE INDEX idx_sessions_updated ON sessions(updated_at DESC);
CREATE INDEX idx_sessions_pinned ON sessions(pinned, updated_at DESC) WHERE pinned = 1;

-- Composite index (multi-column 검색)
CREATE INDEX idx_turns_session_seq ON turns(session_id, seq);

-- Partial index (작은 + 빠름)
CREATE INDEX idx_grants_active ON permission_grants(capability, expires_at) 
    WHERE revoked_at IS NULL;
```

### 사용 패턴 매칭

```sql
-- 좋은 query (인덱스 사용)
SELECT * FROM sessions 
WHERE workspace_id = ? AND archived = 0    -- idx_sessions_workspace
ORDER BY updated_at DESC                    -- idx_sessions_updated
LIMIT 20;

-- 나쁜 query (full scan)
SELECT * FROM sessions 
WHERE LOWER(title) LIKE ?                   -- 인덱스 X
```

---

## FTS5 (Full Text Search)

```sql
-- 채팅 메시지 검색용
CREATE VIRTUAL TABLE turns_fts USING fts5(
    content,
    content='turns',                -- external content
    content_rowid='rowid',
    tokenize='unicode61'            -- 한글 지원
);

-- Trigger 로 자동 sync
CREATE TRIGGER turns_fts_insert AFTER INSERT ON turns BEGIN
  INSERT INTO turns_fts(rowid, content) VALUES (new.rowid, new.content_json);
END;

-- 검색 (매우 빠름)
SELECT * FROM turns 
WHERE rowid IN (
  SELECT rowid FROM turns_fts WHERE turns_fts MATCH ?
)
LIMIT 20;
```

---

## 한국어 FTS5

```sql
-- 한글 tokenizer (unicode61 + 약간 customization)
CREATE VIRTUAL TABLE messages_fts USING fts5(
    content,
    tokenize='unicode61 remove_diacritics 0'    -- 한글 그대로
);

-- 검색
SELECT * FROM messages_fts 
WHERE messages_fts MATCH '서버 OR 미리보기'
ORDER BY rank;

-- 한국어 prefix 검색
SELECT * FROM messages_fts 
WHERE messages_fts MATCH '"서버"*';
```

---

## Prepared statements

```typescript
// ✗ 매번 parse (느림)
db.prepare(`SELECT * FROM sessions WHERE id = '${id}'`).get();

// ✓ Prepared (cache)
const stmt = db.prepare(`SELECT * FROM sessions WHERE id = ?`);
const session = stmt.get(id);    // 두 번째부터 빠름
```

→ better-sqlite3 가 자동 cache.

---

## Transaction (★ 큰 차이)

```typescript
// ✗ 100 inserts = 100 fsync (매우 느림)
for (const turn of turns) {
  db.prepare('INSERT INTO turns ...').run(turn);
}

// ✓ Transaction (한 번 fsync)
db.transaction((turns) => {
  const stmt = db.prepare('INSERT INTO turns ...');
  for (const turn of turns) {
    stmt.run(turn);
  }
})(turns);
```

→ 100배 빨라질 수 있음.

---

## Batch operations

```typescript
// 여러 row 한번에
const insertMany = db.transaction((rows) => {
  for (const row of rows) {
    insertStmt.run(row);
  }
});

insertMany(allRows);   // atomic + fast
```

---

## VACUUM

```sql
-- 정기 cleanup
PRAGMA incremental_vacuum(1000);   -- 1000 페이지 회수

-- 대규모 (앱 종료 시 또는 idle)
VACUUM;
```

→ 비대화된 DB 압축. 큰 작업이므로 idle 시점에.

---

## ANALYZE

```sql
-- query planner 통계 업데이트
ANALYZE;
```

→ 데이터 분포 변경 시 (대량 insert/delete 후).

---

## EXPLAIN QUERY PLAN

```sql
EXPLAIN QUERY PLAN
SELECT * FROM sessions 
WHERE workspace_id = 'ws-xxx' AND archived = 0
ORDER BY updated_at DESC LIMIT 20;

-- 결과:
-- SEARCH sessions USING INDEX idx_sessions_workspace (workspace_id=? AND archived=?)
-- USE TEMP B-TREE FOR ORDER BY  ← ★ 비효율 (인덱스 사용 X)

-- 해결: composite index
CREATE INDEX idx_better ON sessions(workspace_id, archived, updated_at DESC);
```

---

## Connection pooling

```typescript
// better-sqlite3: 단일 connection (synchronous)
const db = new Database('sessions.sqlite', { 
  fileMustExist: false,
  timeout: 5000,
});

// node-sqlite3: pool (async)
import sqlite3 from 'sqlite3';
import { open } from 'sqlite';

const db = await open({
  filename: 'sessions.sqlite',
  driver: sqlite3.Database,
});
```

→ better-sqlite3 권장 (single-process Electron 앱).

---

## 큰 결과 처리

```typescript
// ✗ 모든 row 메모리에
const all = db.prepare('SELECT * FROM turns').all();   // 100K rows = OOM

// ✓ Iterator (메모리 효율)
const stmt = db.prepare('SELECT * FROM turns');
for (const row of stmt.iterate()) {
  process(row);
}
```

---

## Backup

```typescript
// Hot backup (live DB)
async function onlineBackup(srcPath: string, destPath: string) {
  const src = new Database(srcPath, { readonly: true });
  const dest = new Database(destPath);
  
  await src.backup(destPath);
  
  src.close();
  dest.close();
}

// 또는 builtin
db.backup('backup.sqlite').then(() => {
  console.log('Backup complete');
});
```

---

## Schema migration 성능

```sql
-- ✗ ALTER TABLE 큰 테이블 (slow)
ALTER TABLE turns ADD COLUMN new_field TEXT;

-- ✓ Atomic 작은 변경
BEGIN;
ALTER TABLE turns ADD COLUMN new_field TEXT;
UPDATE schema_meta SET value = '2' WHERE key = 'version';
COMMIT;
```

---

## 측정

```typescript
// Slow query 로깅
const ORIGINAL_PREPARE = db.prepare;

db.prepare = function(sql) {
  const stmt = ORIGINAL_PREPARE.call(this, sql);
  const originalRun = stmt.run;
  
  stmt.run = function(...args) {
    const start = performance.now();
    const result = originalRun.apply(this, args);
    const duration = performance.now() - start;
    
    if (duration > 50) {
      console.warn(`Slow query (${duration}ms): ${sql}`);
    }
    
    return result;
  };
  
  return stmt;
};
```

---

## 관련

- [../session/persistence.md](../session/persistence.md) — Schema 정의
- [memory.md](./memory.md)
- [cache.md](./cache.md)
