---
title: Session State — Persistence (저장소)
parent: ./_index.md
related:
  - ./schema.md
  - ./multi-window.md
  - ./migration.md
status: draft
last_updated: 2026-05-02
---

# Persistence (저장소)

> **한 줄 요약**: SQLite 메인 + JSON export + 파일 시스템 layout. WAL mode + 멀티 윈도우 안전.

---

## 저장소 선택

### 비교

| 옵션 | 트랜잭션 | 인덱스 | 검색 | 동시성 | 큰 blob | 결정 |
|------|---------|--------|------|--------|---------|------|
| **SQLite** | ✓ | ✓ | FTS5 | ✓ (WAL) | △ (별도 분리) | **메인** |
| JSON 파일 | ✗ | ✗ | ✗ | ✗ | ✓ | Export 용 |
| LevelDB | ✗ | △ | ✗ | △ | ✓ | 사용 X |
| IndexedDB | ✓ | ✓ | △ | △ | ✓ | Renderer 캐시만 |

### 결정: **SQLite 메인 + JSON export 지원**

**라이브러리**:
- `better-sqlite3` (synchronous, 빠름, native binding)
- 또는 `node:sqlite` (Node 22+ 내장)

---

## SQLite Schema

### sessions 테이블

```sql
CREATE TABLE sessions (
    id TEXT PRIMARY KEY,                    -- UUIDv7
    schema_version INTEGER NOT NULL,
    provider TEXT NOT NULL CHECK(provider IN ('claude','codex')),
    workspace_id TEXT NOT NULL,
    title TEXT NOT NULL,
    pinned INTEGER DEFAULT 0,
    archived INTEGER DEFAULT 0,
    parent_session_id TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    metadata_json TEXT,                     -- provider-specific
    FOREIGN KEY (parent_session_id) REFERENCES sessions(id),
    FOREIGN KEY (workspace_id) REFERENCES workspaces(id)
);

CREATE INDEX idx_sessions_workspace ON sessions(workspace_id, archived);
CREATE INDEX idx_sessions_updated ON sessions(updated_at DESC);
CREATE INDEX idx_sessions_pinned ON sessions(pinned, updated_at DESC) WHERE pinned = 1;
```

### turns 테이블 (append-only)

```sql
CREATE TABLE turns (
    id TEXT PRIMARY KEY,
    session_id TEXT NOT NULL,
    seq INTEGER NOT NULL,                   -- 세션 내 순서
    role TEXT NOT NULL,
    timestamp TEXT NOT NULL,
    status TEXT NOT NULL,
    content_json TEXT NOT NULL,             -- ContentBlock[]
    tool_calls_json TEXT,
    tool_results_json TEXT,
    model TEXT,
    effort TEXT,
    edited_json TEXT,
    reactions_json TEXT,
    FOREIGN KEY (session_id) REFERENCES sessions(id)
);

CREATE UNIQUE INDEX idx_turns_session_seq ON turns(session_id, seq);
CREATE INDEX idx_turns_timestamp ON turns(timestamp);
```

### workspaces 테이블

```sql
CREATE TABLE workspaces (
    id TEXT PRIMARY KEY,
    root TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    git_state_json TEXT,
    index_status TEXT NOT NULL,
    file_count INTEGER,
    indexed_at TEXT,
    created_at TEXT NOT NULL,
    is_temporary INTEGER DEFAULT 0
);

CREATE INDEX idx_workspaces_root ON workspaces(root);
```

### worktrees 테이블

```sql
CREATE TABLE worktrees (
    id TEXT PRIMARY KEY,
    workspace_id TEXT NOT NULL,
    path TEXT NOT NULL,
    branch TEXT NOT NULL,
    is_permanent INTEGER NOT NULL,
    parent_session_id TEXT,
    created_at TEXT NOT NULL,
    FOREIGN KEY (workspace_id) REFERENCES workspaces(id)
);
```

### permission_grants 테이블

```sql
CREATE TABLE permission_grants (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id TEXT NOT NULL,
    capability TEXT NOT NULL,
    target_json TEXT NOT NULL,
    granted_at TEXT NOT NULL,
    granted_by TEXT NOT NULL CHECK(granted_by IN ('user','auto','automation')),
    expires_at TEXT,                         -- NULL = 영구
    revoked_at TEXT,
    reason TEXT,
    scope TEXT NOT NULL,
    FOREIGN KEY (session_id) REFERENCES sessions(id)
);

CREATE INDEX idx_grants_session ON permission_grants(session_id, capability);
CREATE INDEX idx_grants_active ON permission_grants(capability, expires_at) 
    WHERE revoked_at IS NULL;
```

### audit_log 테이블

```sql
CREATE TABLE audit_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    timestamp TEXT NOT NULL,
    session_id TEXT NOT NULL,
    turn_id TEXT,
    event TEXT NOT NULL,
    capability TEXT NOT NULL,
    target_json TEXT NOT NULL,
    decision_reason TEXT NOT NULL,
    ai_model TEXT,
    ai_reason TEXT,
    outcome TEXT,
    error TEXT
);

CREATE INDEX idx_audit_session ON audit_log(session_id, timestamp DESC);
CREATE INDEX idx_audit_capability ON audit_log(capability, timestamp DESC);
```

### annotations 테이블

```sql
CREATE TABLE annotations (
    id TEXT PRIMARY KEY,
    session_id TEXT NOT NULL,
    turn_id TEXT,
    page_url TEXT NOT NULL,
    selector TEXT NOT NULL,
    dom_meta_json TEXT NOT NULL,
    comment TEXT NOT NULL,
    screenshot_uri TEXT NOT NULL,
    created_at TEXT NOT NULL,
    FOREIGN KEY (session_id) REFERENCES sessions(id)
);

CREATE INDEX idx_annotations_session ON annotations(session_id);
CREATE INDEX idx_annotations_url ON annotations(page_url);
```

### browser_tabs 테이블

```sql
CREATE TABLE browser_tabs (
    id TEXT PRIMARY KEY,
    session_id TEXT NOT NULL,
    title TEXT NOT NULL,
    url TEXT NOT NULL,
    favicon_uri TEXT,
    status TEXT NOT NULL,
    spawned_by TEXT NOT NULL,
    spawning_turn_id TEXT,
    last_load TEXT NOT NULL,
    history_json TEXT NOT NULL,
    annotation_mode INTEGER DEFAULT 0,
    last_screenshot_uri TEXT,
    last_dom_dump_uri TEXT,
    FOREIGN KEY (session_id) REFERENCES sessions(id)
);

CREATE INDEX idx_browser_tabs_session ON browser_tabs(session_id);
```

### terminal_panes 테이블

```sql
CREATE TABLE terminal_panes (
    id TEXT PRIMARY KEY,
    session_id TEXT NOT NULL,
    title TEXT NOT NULL,
    shell TEXT NOT NULL,
    cwd TEXT NOT NULL,
    env_json TEXT,
    status TEXT NOT NULL,
    pid INTEGER,
    exit_code INTEGER,
    spawned_by_ai INTEGER NOT NULL,
    turn_id TEXT,
    scrollback_uri TEXT,
    input_history_json TEXT,
    created_at TEXT NOT NULL,
    FOREIGN KEY (session_id) REFERENCES sessions(id)
);
```

### terminal_scrollback 테이블

```sql
CREATE TABLE terminal_scrollback (
    pane_id TEXT NOT NULL,
    line_no INTEGER NOT NULL,
    timestamp TEXT NOT NULL,
    stream TEXT CHECK(stream IN ('stdout','stderr')),
    content TEXT NOT NULL,
    PRIMARY KEY (pane_id, line_no),
    FOREIGN KEY (pane_id) REFERENCES terminal_panes(id)
);
```

### plan_items 테이블

```sql
CREATE TABLE plan_items (
    id TEXT PRIMARY KEY,
    session_id TEXT NOT NULL,
    parent_id TEXT,                          -- nested
    seq INTEGER NOT NULL,
    text TEXT NOT NULL,
    status TEXT NOT NULL,
    related_turns_json TEXT,
    evidence TEXT,
    FOREIGN KEY (session_id) REFERENCES sessions(id),
    FOREIGN KEY (parent_id) REFERENCES plan_items(id)
);
```

### schema_meta 테이블 (버전 관리)

```sql
CREATE TABLE schema_meta (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
);

INSERT INTO schema_meta (key, value) VALUES ('version', '1');
INSERT INTO schema_meta (key, value) VALUES ('app_version', '0.1.0');
INSERT INTO schema_meta (key, value) VALUES ('initialized_at', '2026-05-02T...');
```

---

## 파일 시스템 layout

```
%APPDATA%\Dreampia-Dev\
├── sessions.sqlite              ← 메인 DB (위 schema)
├── sessions.sqlite-wal          ← WAL mode (concurrent reads)
├── sessions.sqlite-shm          ← Shared memory
│
├── blobs\                       ← 큰 blob (스크린샷, 터미널 dump 등)
│   └── {hash[0:2]}\{hash}.bin   ← 2단계 hash dir (10K+ 파일 대응)
│
├── workspaces\                  ← 작업 디렉토리 인덱스 (workspace_id 별)
│   └── {workspace_id}\
│       ├── index.db             ← FTS5 파일 검색
│       └── .codex-cache\        ← Codex 호환
│
├── Partitions\                  ← Electron 브라우저 partition (격리)
│   └── codex-browser-app-{session_id}\
│       ├── Cookies
│       ├── Local Storage\
│       └── ...
│
├── exports\                     ← Markdown export 결과
├── crashes\                     ← 크래시 덤프
├── logs\                        ← 앱 로그 (sentry 별개)
│   └── YYYY\MM\DD\dreampia-{guid}-{pid}.log
└── settings.json                ← 앱 전역 설정 (비-세션)
```

### Codex 와의 호환성

```
Codex 가 쓰는 경로:
  C:\Users\{user}\AppData\Local\Packages\OpenAI.Codex_2p2nqsd0c76g0\
  └── LocalCache\Roaming\Codex\

Dreampia-Dev 는:
  C:\Users\{user}\AppData\Roaming\Dreampia-Dev\
  
→ 완전 분리 (Codex 데이터 손상 위험 X)
→ 사용자 마이그레이션 옵션: "Codex 세션 가져오기" (Phase 2+)
```

---

## WAL (Write-Ahead Logging) 모드

```sql
PRAGMA journal_mode = WAL;
PRAGMA synchronous = NORMAL;       -- WAL 모드에서 안전한 default
PRAGMA cache_size = -64000;        -- 64 MB cache
PRAGMA mmap_size = 268435456;      -- 256 MB mmap (큰 DB 빠름)
```

**WAL 의 장점**:
- 동시 read 다중 가능 (writer 블록 X)
- 멀티 윈도우 환경에 적합 → [multi-window.md](./multi-window.md)
- Crash safe (atomic commit)

---

## Blob 저장 (스크린샷, 큰 파일)

### Why 별도?

```
SQLite 안에 BLOB 저장:
  ✓ 트랜잭션 안전
  ✗ vacuum 안 하면 DB 비대화
  ✗ 큰 BLOB 은 row 분할 → 성능 저하
  ✗ 바이너리 backup 어려움
```

### Content-addressable storage

```typescript
async function storeBlob(data: Buffer): Promise<Uri> {
  // SHA256 해시 = 파일명
  const hash = createHash('sha256').update(data).digest('hex');
  
  // 2단계 디렉토리 (네임스페이스 분산)
  const dir = path.join(BLOBS_DIR, hash.slice(0, 2));
  const file = path.join(dir, `${hash}.bin`);
  
  if (!fs.existsSync(file)) {
    await fs.promises.mkdir(dir, { recursive: true });
    await fs.promises.writeFile(file, data);
  }
  
  return `blob://sha256/${hash}`;
}
```

**장점**:
- 같은 데이터 = 같은 hash = 자동 dedup
- DB row 는 URI 만 저장 (가벼움)
- Hash 검증으로 무결성 보장

**Cleanup**: 90일 동안 어떤 row 도 참조 X 인 blob → garbage collection.

---

## Backup & Restore

### 자동 백업

```typescript
// 매일 1회 (앱 시작 시 체크)
async function autoBackup() {
  const today = new Date().toISOString().slice(0, 10);
  const backupPath = path.join(BACKUPS_DIR, `${today}.sqlite.gz`);
  
  if (!fs.existsSync(backupPath)) {
    await sqliteOnlineBackup(DB_PATH, backupPath);
    await pruneOldBackups({ keepDays: 30 });
  }
}
```

### 사용자 백업 (수동)

```
설정 → 백업 / 복원:
  [전체 백업 만들기]   ← .dreampia-backup.zip 생성
  [복원하기]            ← .zip 받아서 복원
```

**.dreampia-backup.zip 구조**:
```
backup-2026-05-02.zip
├── manifest.json           (version, created_at, included_sessions)
├── sessions.sqlite
├── blobs/                  (참조되는 것만)
└── workspaces/             (옵션)
```

---

## 검증 (Invariants)

```
INV-1: schema_meta.version 은 코드의 LATEST_SCHEMA_VERSION 과 일치 (또는 마이그레이션 필요)
INV-2: 모든 FK 참조는 실제 존재
INV-3: turns.seq 는 세션 내 unique + monotonic
INV-4: blobs/ 안 파일은 hash 검증 통과
INV-5: 90일 이상된 archived 세션의 blob 도 유지 (사용자 복구 가능성)
```

---

## 성능 목표 (Phase 1)

```
세션 로드:        < 100ms (인덱스 + cache 활용)
턴 추가:          < 10ms (insert + invalidate cache)
검색 (FTS5):      < 500ms for 10K turns
백업 생성:        < 5초 for 1GB DB
시작 시 검증:     < 200ms (schema_meta + count check)
```

---

## 관련

- [schema.md](./schema.md) — 매핑되는 TypeScript schema
- [multi-window.md](./multi-window.md) — WAL + leader election
- [migration.md](./migration.md) — schema_meta.version 사용
- [examples.md](./examples.md) — 실제 데이터 예시
