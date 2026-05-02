-- 001_init.sql — initial schema for Dreampia-Dev session store
-- Spec: docs/session/persistence.md
-- Generated for SS-4. Modify only by adding new migrations (002_*, 003_*, ...).
--
-- Spec contradictions resolved at implementation time (see SessionStore.ts header):
--  1. workspaces.root UNIQUE -- but Session.workspace_id is independent of root.
--     If two sessions share the same root with different workspace_ids, the
--     second INSERT FAILS. Mitigation: workspace_id must be derived
--     deterministically from root (see common.ts WorkspaceId -- SHA256 prefix-16).
--  2. permission_grants.id INTEGER AUTOINCREMENT -- but PermissionGrant.id is
--     a string (UUIDv7) in the type system. Workaround: original string id is
--     stored inside target_json's wrapper (see SessionStore.ts header).
--  3. Several Workspace/TerminalPane/BrowserTab/Annotation fields lack columns
--     in this schema. They are stored either inside per-row JSON wrappers
--     (history_json, input_history_json, dom_meta_json, target_json) or under
--     sessions.metadata_json._extra (see SessionStore.ts header for full map).
--  4. workspaces.created_at and terminal_panes.created_at are required NOT NULL
--     here but the type system does not expose them. Synthesized from
--     session.created_at on insert; dropped on load (data is not preserved).
--
-- Future migrations should aim to resolve 1 (deterministic workspace_id) and
-- 2 (drop INTEGER AUTOINCREMENT, use TEXT PK) by promoting the JSON-wrapped
-- residual fields into proper columns.

-- ─────────────────────────────────────────────────────────────
-- workspaces 테이블 (FK 대상이므로 sessions 보다 먼저)
-- ─────────────────────────────────────────────────────────────
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

-- ─────────────────────────────────────────────────────────────
-- sessions 테이블
-- ─────────────────────────────────────────────────────────────
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

-- ─────────────────────────────────────────────────────────────
-- turns 테이블 (append-only)
-- ─────────────────────────────────────────────────────────────
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

-- ─────────────────────────────────────────────────────────────
-- worktrees 테이블
-- ─────────────────────────────────────────────────────────────
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

-- ─────────────────────────────────────────────────────────────
-- permission_grants 테이블
-- ─────────────────────────────────────────────────────────────
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

-- ─────────────────────────────────────────────────────────────
-- audit_log 테이블 (Phase 1 P0: 테이블만 생성, 자동 기록 X)
-- ─────────────────────────────────────────────────────────────
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

-- ─────────────────────────────────────────────────────────────
-- annotations 테이블
-- ─────────────────────────────────────────────────────────────
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

-- ─────────────────────────────────────────────────────────────
-- browser_tabs 테이블
-- ─────────────────────────────────────────────────────────────
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

-- ─────────────────────────────────────────────────────────────
-- terminal_panes 테이블
-- ─────────────────────────────────────────────────────────────
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

-- ─────────────────────────────────────────────────────────────
-- terminal_scrollback 테이블
-- ─────────────────────────────────────────────────────────────
CREATE TABLE terminal_scrollback (
    pane_id TEXT NOT NULL,
    line_no INTEGER NOT NULL,
    timestamp TEXT NOT NULL,
    stream TEXT CHECK(stream IN ('stdout','stderr')),
    content TEXT NOT NULL,
    PRIMARY KEY (pane_id, line_no),
    FOREIGN KEY (pane_id) REFERENCES terminal_panes(id)
);

-- ─────────────────────────────────────────────────────────────
-- plan_items 테이블 (recursive — parent_id self-reference)
-- ─────────────────────────────────────────────────────────────
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

-- ─────────────────────────────────────────────────────────────
-- schema_meta 테이블 (버전 관리)
-- ─────────────────────────────────────────────────────────────
CREATE TABLE schema_meta (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
);

INSERT INTO schema_meta (key, value) VALUES ('version', '1');
INSERT INTO schema_meta (key, value) VALUES ('app_version', '0.0.1');
-- 'initialized_at' is set in code (migrate.ts) on first run with runtime timestamp.
