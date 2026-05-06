/**
 * SessionStore — SQLite-backed persistence for `Session` objects.
 *
 * Phase 1 P0 minimum: round-trip + meta queries. WAL pragmas applied.
 * Multi-window leader election (SS-5) is NOT implemented here; that lives
 * in `src/storage/LeaderElection.ts` (later task).
 *
 * ──────────────────────────────────────────────────────────────────────
 * Serialization model
 * ──────────────────────────────────────────────────────────────────────
 *
 * The persistence schema (docs/session/persistence.md) decomposes a Session
 * into multiple tables. Some sub-state fields don't have dedicated columns
 * in the spec; for round-trip integrity we keep them in `metadata_json`
 * under a `_extra` namespace:
 *
 *   metadata_json = {
 *     codex?:    SessionMetadata.codex   // top-level (spec: provider-specific)
 *     claude?:   SessionMetadata.claude
 *     _extra: {                          // residuals, internal to SessionStore
 *       conversation: { pending_input?, current_model, current_effort, current_mode },
 *       workspace:    { recent_files, open_files, ignore_patterns, active_worktree_id? },
 *       terminal:     { active_pane_id?, panel_open, height_px },
 *       browser:      { active_tab_id?, panel_visible, layout, partition_id },
 *       plan:         { active, browser_tool_enabled, current_item_index? },
 *       permission:   { default_level, last_denied?, temporarily_blocked_capabilities },
 *     }
 *   }
 *
 * Per-row JSON wrappers (also for round-trip):
 *   permission_grants.target_json = { id, target }
 *   browser_tabs.history_json     = { history, history_index, annotations }
 *   terminal_panes.input_history_json = { input_history, scrollback_lines }
 *   annotations.dom_meta_json     = { dom_meta, marker_index, bounding_box,
 *                                      comment_audio_uri? }
 *
 * The schema (docs/session/persistence.md) is the long-term contract; this
 * module's wrappers are an internal P0 mechanism. A future migration can
 * add proper columns and drop the wrappers.
 *
 * Spec: docs/session/persistence.md, docs/session/schema.md, docs/session/migration.md
 */

import Database from 'better-sqlite3';
import type { Database as DatabaseT, Statement } from 'better-sqlite3';
import { SessionSchema, type Session } from '@/types/session';
// v1.6.3 — fork 시 새 id 생성용.
import { newSessionId, newTurnId, nowIso } from '@/types/helpers';
import type {
  Annotation,
  Conversation,
  PendingInput,
  Reaction,
  Turn,
  TurnEdit,
} from '@/types/conversation';
import type { Workspace, WorkTree, GitState, FileRef } from '@/types/workspace';
import type { TerminalPane, TerminalState } from '@/types/terminal';
import type { BrowserState, BrowserTab } from '@/types/browser';
import type { PlanItem, PlanState } from '@/types/plan';
import type { PermissionGrant, PermissionState, GrantTarget } from '@/types/permission';
import type { ClaudeMetadata, CodexMetadata, SessionMetadata } from '@/types/session';
import type { SessionId, WorkspaceId } from '@/types/common';
import { migrate, getSchemaVersion as getSchemaVersionImpl } from './migrate';
import { extractTurnText } from './turnText';

// ────────────────────────────────────────────────────────────
// DB row shapes (internal — not exported)
// ────────────────────────────────────────────────────────────

interface SessionRow {
  id: string;
  schema_version: number;
  provider: 'claude' | 'codex';
  workspace_id: string;
  title: string;
  pinned: number;
  archived: number;
  parent_session_id: string | null;
  created_at: string;
  updated_at: string;
  metadata_json: string | null;
  // v1.4.2 (B-3 1단계) — promoted from metadata_json._extra.conversation.
  // 기존 row 는 backfill SQL 로 채워짐. 새 row 는 application 이 dual-write.
  current_model: string | null;
  current_effort: string | null;
  current_mode: string | null;
}

interface WorkspaceRow {
  id: string;
  root: string;
  name: string;
  git_state_json: string | null;
  index_status: string;
  file_count: number | null;
  indexed_at: string | null;
  created_at: string;
  is_temporary: number;
}

interface WorktreeRow {
  id: string;
  workspace_id: string;
  path: string;
  branch: string;
  is_permanent: number;
  parent_session_id: string | null;
  created_at: string;
}

interface TurnRow {
  id: string;
  session_id: string;
  seq: number;
  role: string;
  timestamp: string;
  status: string;
  content_json: string;
  tool_calls_json: string | null;
  tool_results_json: string | null;
  model: string | null;
  effort: string | null;
  edited_json: string | null;
  reactions_json: string | null;
}

interface PermissionGrantRow {
  // v1.4.1 (B-2) — INTEGER → TEXT promote. application UUIDv7 직접.
  id: string;
  session_id: string;
  capability: string;
  target_json: string;
  granted_at: string;
  granted_by: string;
  expires_at: string | null;
  revoked_at: string | null;
  reason: string | null;
  scope: string;
}

interface BrowserTabRow {
  id: string;
  session_id: string;
  title: string;
  url: string;
  favicon_uri: string | null;
  status: string;
  spawned_by: string;
  spawning_turn_id: string | null;
  last_load: string;
  history_json: string;
  annotation_mode: number;
  last_screenshot_uri: string | null;
  last_dom_dump_uri: string | null;
}

interface TerminalPaneRow {
  id: string;
  session_id: string;
  title: string;
  shell: string;
  cwd: string;
  env_json: string | null;
  status: string;
  pid: number | null;
  exit_code: number | null;
  spawned_by_ai: number;
  turn_id: string | null;
  scrollback_uri: string | null;
  input_history_json: string | null;
  created_at: string;
}

interface PlanItemRow {
  id: string;
  session_id: string;
  parent_id: string | null;
  seq: number;
  text: string;
  status: string;
  related_turns_json: string | null;
  evidence: string | null;
}

interface AnnotationRow {
  id: string;
  session_id: string;
  turn_id: string | null;
  page_url: string;
  selector: string;
  dom_meta_json: string;
  comment: string;
  screenshot_uri: string;
  created_at: string;
}

// ────────────────────────────────────────────────────────────
// metadata_json shape
// ────────────────────────────────────────────────────────────

interface MetadataExtra {
  conversation: {
    pending_input?: PendingInput;
    current_model: string;
    current_effort: Conversation['current_effort'];
    current_mode: Conversation['current_mode'];
  };
  workspace: {
    recent_files: FileRef[];
    open_files: FileRef[];
    ignore_patterns: string[];
    active_worktree_id?: string;
  };
  terminal: {
    active_pane_id?: string;
    panel_open: boolean;
    height_px: number;
  };
  browser: {
    active_tab_id?: string;
    panel_visible: boolean;
    layout: BrowserState['layout'];
    partition_id: string;
  };
  plan: {
    active: boolean;
    browser_tool_enabled: boolean;
    current_item_index?: number;
  };
  permission: {
    default_level: PermissionState['default_level'];
    last_denied?: { capability: string; ts: string };
    temporarily_blocked_capabilities: string[];
  };
}

interface StoredMetadata {
  codex?: CodexMetadata;
  claude?: ClaudeMetadata;
  _extra: MetadataExtra;
}

// ────────────────────────────────────────────────────────────
// Filter shape for listSessions
// ────────────────────────────────────────────────────────────

export interface SessionListFilter {
  workspace_id?: string;
  archived?: boolean;
  pinned?: boolean;
}

/**
 * Single result row from `searchTurns`. v0.7.0 (F-026 Chat Search).
 *
 * `snippet` contains FTS5 `<mark>...</mark>` markup around the matched terms.
 * Renderer must render it safely (split on `<mark>` / `</mark>`, never via
 * dangerouslySetInnerHTML) to avoid XSS through user-supplied turn content.
 *
 * `rank` is BM25 from FTS5 (lower = more relevant). LIKE fallback path
 * always returns 0 — caller should rely on the natural ORDER BY rank
 * the search method already provides and not re-sort.
 */
export interface TurnSearchResult {
  turn_id: string;
  session_id: string;
  role: string;
  snippet: string;
  rank: number;
  timestamp: string;
}

/**
 * Lightweight session metadata returned by `listSessions`. Omits all sub-states
 * (conversation, workspace, terminal, browser, plan, permission) for speed.
 */
export interface SessionMeta {
  id: SessionId;
  schema_version: number;
  provider: 'claude' | 'codex';
  workspace_id: WorkspaceId;
  title: string;
  pinned: boolean;
  archived: boolean;
  parent_session_id?: SessionId;
  created_at: string;
  updated_at: string;
}

// ────────────────────────────────────────────────────────────
// Helpers
// ────────────────────────────────────────────────────────────

const boolToInt = (b: boolean): 0 | 1 => (b ? 1 : 0);
const intToBool = (n: number): boolean => n !== 0;

function jsonOrNull(v: unknown): string | null {
  if (v === undefined || v === null) return null;
  return JSON.stringify(v);
}

function parseJsonOrNull<T>(s: string | null): T | undefined {
  if (s === null) return undefined;
  return JSON.parse(s) as T;
}

/**
 * v0.14.0 (A ABI Hardening) — native module 로드 실패를 사용자 친화적 메시지
 * 로 rewrap.
 *
 * 패턴:
 *   - `ERR_DLOPEN_FAILED` — Node 가 .node 파일 로드 자체를 실패 (binding 누락,
 *     symbol mismatch, OS-level dependency 누락 등).
 *   - `NODE_MODULE_VERSION` — ABI mismatch (Electron vs Node 컴파일 충돌).
 *   - 그 외 — original 메시지 그대로 throw.
 *
 * 메시지는 사용자가 보는 dialog / console 출력 양쪽에서 그대로 쓰일 수 있도록
 * 한국어 + 명령어 hint 를 포함한다. 영문은 release.md / README 참조.
 */
export function rewrapNativeLoadError(err: unknown, dbPath: string): Error {
  if (!(err instanceof Error)) {
    return new Error(`SessionStore 초기화 실패 (${String(err)})`);
  }
  const msg = err.message ?? '';
  const code = (err as { code?: string }).code;
  const isAbiOrDlopen =
    code === 'ERR_DLOPEN_FAILED' ||
    /NODE_MODULE_VERSION/.test(msg) ||
    /better_sqlite3\.node/.test(msg) ||
    /A dynamic link library/.test(msg);
  if (!isAbiOrDlopen) {
    return err;
  }
  const wrapped = new Error(
    [
      'SQLite 데이터베이스 모듈 로드 실패 (ABI mismatch 가능성).',
      `  DB 경로: ${dbPath}`,
      `  원본 오류: ${msg}`,
      '',
      '해결:',
      '  1) `npm run diagnose`        — 현재 상태 출력',
      '  2) `npm run dev:rebuild`     — Electron ABI 재컴파일',
      '  3) `npm install`             — postinstall 자동 rebuild',
    ].join('\n')
  );
  // code 보존 — 호출자가 매칭할 수 있도록.
  if (code !== undefined) {
    (wrapped as { code?: string }).code = code;
  }
  return wrapped;
}

/**
 * v0.14.0 — 진단 결과 shape. SessionStore.diagnose() 가 반환.
 */
export interface SessionStoreDiagnostic {
  ok: boolean;
  schema_version: number | null;
  table_count: number | null;
  integrity_ok: boolean | null;
  wal_mode: boolean | null;
  /** quick_check 가 'ok' 아닌 경우 첫 줄 reason. */
  integrity_message?: string;
  error?: string;
}

// ────────────────────────────────────────────────────────────
// SessionStore
// ────────────────────────────────────────────────────────────

/**
 * v1.0.11 SEC-3: SessionStore 가 새 permission grant 를 영속할 때 호출되는
 * audit sink. main/index.ts 가 setPermissionGrantAuditSink 로 wire-up.
 *
 * Storage layer 가 AuditLogStore 직접 import 하지 않아 (양방향 의존 회피)
 * callback 만 받는다.
 */
export interface PermissionGrantAuditEvent {
  timestamp: string;
  session_id: string;
  capability: string;
  /** JSON: { id, target } — insertGrants 가 target_json 으로 넣는 값. */
  target_json: string;
  granted_by: string;
  scope: string;
  expires_at: string | null;
  reason: string | null;
}

export type PermissionGrantAuditSink = (event: PermissionGrantAuditEvent) => void;

export class SessionStore {
  private readonly db: DatabaseT;
  /** v1.0.11 SEC-3: insertGrants 가 새 grant 영속 시 호출. */
  private permissionGrantAuditSink: PermissionGrantAuditSink | undefined;

  /**
   * Whether the FTS5 `turns_fts` virtual table is available.
   *
   * v0.7.0 (F-026): set during migrate() — true when migration v4 succeeds,
   * false when FTS5 is unavailable in the better-sqlite3 binary or when the
   * defensive try/catch in migrate.ts trapped a CREATE error. When false:
   *   - appendTurn / clearTurns / deleteSession / insertTurns SKIP the FTS
   *     sync inserts and deletes (no harm — table doesn't exist).
   *   - searchTurns falls back to LIKE substring search on `content_json`.
   */
  private readonly fts5Enabled: boolean;

  // Prepared statements (created lazily on first use, cached for perf)
  private stmts: {
    insertWorkspace?: Statement;
    insertSession?: Statement;
    insertWorktree?: Statement;
    insertTurn?: Statement;
    insertGrant?: Statement;
    insertBrowserTab?: Statement;
    insertTerminalPane?: Statement;
    insertPlanItem?: Statement;
    insertAnnotation?: Statement;
    selectSession?: Statement;
    selectWorkspace?: Statement;
    selectWorktreesByWs?: Statement;
    selectTurnsBySession?: Statement;
    selectGrantsBySession?: Statement;
    selectBrowserTabsBySession?: Statement;
    selectTerminalPanesBySession?: Statement;
    selectPlanItemsBySession?: Statement;
    selectAnnotationsBySessionTurn?: Statement;
    deleteAnnotationsBySession?: Statement;
    deleteGrantsBySession?: Statement;
    deleteTerminalScrollbackBySession?: Statement;
    deleteTerminalPanesBySession?: Statement;
    deleteBrowserTabsBySession?: Statement;
    deleteTurnsBySession?: Statement;
    deleteWorktreesBySession?: Statement;
    deleteSession?: Statement;
    bumpUpdatedAt?: Statement;
    nextTurnSeq?: Statement;
    sessionExists?: Statement;
  } = {};

  constructor(dbPath: string) {
    // v0.14.0 (A ABI Hardening) — better-sqlite3 는 native module 이라 ABI 가
    // 다르거나 binding 자체가 빠지면 `new Database(...)` 가 throw 한다. 사용자
    // 가 stack trace 로 추정하기 어려우므로 명시적 hint 가 담긴 Error 로 rewrap.
    try {
      this.db = new Database(dbPath);
    } catch (err) {
      throw rewrapNativeLoadError(err, dbPath);
    }

    // Pragmas BEFORE migrations: WAL must be set on a non-empty DB but
    // foreign_keys etc. are session-level and apply immediately.
    this.db.pragma('journal_mode = WAL');
    this.db.pragma('synchronous = NORMAL');
    this.db.pragma('cache_size = -64000');
    this.db.pragma('mmap_size = 268435456');
    this.db.pragma('foreign_keys = ON');

    migrate(this.db);

    // v0.7.0 (F-026) — detect whether the FTS5 turns_fts virtual table exists.
    // Truth source is sqlite_master, not just LATEST_SCHEMA_VERSION, because
    // migrate() may have skipped the CREATE on FTS5-less builds (graceful
    // degrade path).
    const ftsCheck = this.db
      .prepare(`SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'turns_fts'`)
      .get() as { name: string } | undefined;
    this.fts5Enabled = ftsCheck !== undefined;
  }

  // ────────────────────────────────────────────────────────────
  // Lifecycle
  // ────────────────────────────────────────────────────────────

  close(): void {
    this.db.close();
  }

  /**
   * v1.0.11 SEC-3: 새 permission grant 영속 시 호출될 audit sink 등록.
   *
   * main/index.ts 가 AuditLogStore 와 SessionStore 둘 다 만든 후 wire-up.
   * 미설정 시 audit 미기록 (테스트 / 격리 환경 호환). throw 시 console.error
   * 로 떨어지고 grant insertion 은 그대로 진행.
   */
  setPermissionGrantAuditSink(sink: PermissionGrantAuditSink | undefined): void {
    this.permissionGrantAuditSink = sink;
  }

  getSchemaVersion(): number {
    return getSchemaVersionImpl(this.db);
  }

  /**
   * Return the underlying better-sqlite3 handle.
   *
   * For advanced use only — currently the LeaderElection class needs to share
   * the same connection so its lock writes participate in the same WAL stream
   * and FK pragma. Callers MUST NOT close the handle from outside; use
   * `SessionStore.close()` instead.
   *
   * NOTE: this leaks an internal abstraction in service of pragmatism.
   * A future refactor could replace this with composition (LeaderElection
   * owned by SessionStore) once the IPC layer matures.
   */
  getDb(): DatabaseT {
    return this.db;
  }

  /**
   * v0.14.0 (A ABI Hardening) — 사용자 자가 진단용. Settings → 진단 탭과
   * `app:diagnose` IPC 가 호출.
   *
   * 검사:
   *   - schema_version (migrate 이후 LATEST 와 비교)
   *   - 테이블 개수 (sqlite_master)
   *   - PRAGMA quick_check (integrity)
   *   - PRAGMA journal_mode (WAL active 여부)
   *
   * 어떤 검사도 throw 하지 않는다 — 모든 실패는 `SessionStoreDiagnostic.error`
   * 또는 individual 필드 null 로 표현한다. 진단 도구 자체가 부수효과를 일으키면
   * 안 되므로 read-only.
   */
  diagnose(): SessionStoreDiagnostic {
    try {
      const schema_version = this.getSchemaVersion();
      const tableRow = this.db
        .prepare(
          `SELECT COUNT(*) AS n FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'`
        )
        .get() as { n: number } | undefined;
      const table_count = tableRow !== undefined ? tableRow.n : null;

      // PRAGMA quick_check — fast subset of integrity_check. 모든 행이 'ok' 면
      // 무결성 통과. 첫 행만 검사해 'ok' 여부 판정.
      let integrity_ok: boolean | null = null;
      let integrity_message: string | undefined;
      try {
        const rows = this.db.pragma('quick_check') as Array<{ quick_check?: string } | string>;
        const first = rows[0];
        const value =
          typeof first === 'string'
            ? first
            : first !== undefined && typeof first === 'object'
              ? (first.quick_check ?? '')
              : '';
        integrity_ok = value === 'ok';
        if (!integrity_ok && value.length > 0) {
          integrity_message = value;
        }
      } catch (err) {
        integrity_ok = false;
        integrity_message = err instanceof Error ? err.message : String(err);
      }

      let wal_mode: boolean | null = null;
      try {
        const journalRows = this.db.pragma('journal_mode') as Array<{ journal_mode?: string } | string>;
        const j = journalRows[0];
        const journalValue =
          typeof j === 'string'
            ? j
            : j !== undefined && typeof j === 'object'
              ? (j.journal_mode ?? '')
              : '';
        wal_mode = journalValue.toLowerCase() === 'wal';
      } catch {
        wal_mode = null;
      }

      const result: SessionStoreDiagnostic = {
        ok: integrity_ok === true && wal_mode === true,
        schema_version,
        table_count,
        integrity_ok,
        wal_mode,
      };
      if (integrity_message !== undefined) {
        result.integrity_message = integrity_message;
      }
      return result;
    } catch (err) {
      return {
        ok: false,
        schema_version: null,
        table_count: null,
        integrity_ok: null,
        wal_mode: null,
        error: err instanceof Error ? err.message : String(err),
      };
    }
  }

  // ────────────────────────────────────────────────────────────
  // Public API — write
  // ────────────────────────────────────────────────────────────

  createSession(session: Session): void {
    // Validate before persisting (fail fast).
    SessionSchema.parse(session);

    const tx = this.db.transaction((s: Session) => {
      this.upsertWorkspace(s);
      this.insertSessionRow(s);
      this.insertWorktrees(s);
      this.insertTurns(s);
      this.insertGrants(s);
      this.insertBrowserTabs(s);
      this.insertTerminalPanes(s);
      this.insertPlanItems(s);
      this.insertTurnAnnotations(s);
    });

    tx(session);
  }

  /**
   * v1.6.3 — Parent-child session fork. 새 session 을 생성하면서 parent 의
   * conversation context (turns) 를 복사해 "이 시점에서 대화 분기" 시나리오
   * 를 지원.
   *
   * 동작:
   *  - parent 세션 fetch (없으면 throw).
   *  - 새 session 생성:
   *    - id = newSessionId().
   *    - parent_session_id = parentId.
   *    - workspace / permission / browser / terminal / plan 은 parent 의
   *      현재 상태 복사 (별도 row 들이지만 parent 와 독립적으로 progress).
   *    - conversation.turns = parent 의 첫 N 개 turn (옵션 truncateAt) 또는
   *      전체. truncateAt 이 turn id 라면 그 turn 까지 (포함) 복사.
   *  - createSession 호출 → 모든 child rows insert.
   *
   * @returns 새 session id.
   */
  forkSession(
    parentId: SessionId,
    options: {
      title?: string;
      truncateAt?: string;
    } = {}
  ): SessionId {
    const parent = this.getSession(parentId);
    if (parent === null) {
      throw new Error(`Parent session ${parentId} not found`);
    }
    const newId = newSessionId();
    const now = nowIso();

    // Conversation 자르기. truncateAt 가 있으면 그 turn 까지 (포함). 없으면
    // 전체 복사.
    let turns = parent.conversation.turns;
    if (options.truncateAt !== undefined) {
      const idx = turns.findIndex((t) => t.id === options.truncateAt);
      if (idx >= 0) {
        turns = turns.slice(0, idx + 1);
      }
    }

    // Turn id 들은 globally unique 이어야 하므로 새 id 부여. content 는 동일.
    const newTurns = turns.map((t) => ({
      ...t,
      id: newTurnId(),
    }));

    const fork: Session = {
      ...parent,
      id: newId,
      created_at: now,
      updated_at: now,
      parent_session_id: parentId,
      title: options.title ?? `${parent.title} (fork)`,
      conversation: {
        ...parent.conversation,
        turns: newTurns,
      },
      // permission grants 는 deep copy — 같은 reference 공유 X.
      permission: {
        ...parent.permission,
        grants: parent.permission.grants.map((g) => ({ ...g, session_id: newId })),
      },
      // browser tabs / terminal panes 도 새 session 의 것이므로 reset 권고.
      // 안전한 default: 빈 list 로 시작 (기존 tabs 는 parent 가 계속 가짐).
      browser: { ...parent.browser, tabs: [] },
      terminal: { ...parent.terminal, panes: [] },
    };

    this.createSession(fork);
    return newId;
  }

  /**
   * v1.1.0 SEC-2 full: 단일 grant 추가 — 사용자가 'always' 응답 시 호출.
   *
   * insertGrants 와 다르게 단일 row INSERT + audit 자동 발행 (sink 가
   * 설정돼있으면). createSession 의 bulk 와 분리해 race 회피 + caller
   * 가 await 후 조회 가능.
   */
  addPermissionGrant(grant: import('../types/permission').PermissionGrant): void {
    if (!this.stmts.insertGrant) {
      // v1.4.1 (B-2) — id 컬럼 직접 명시. 이전엔 INTEGER AUTOINCREMENT 라
      // application UUIDv7 가 target_json 안에만 있었지만 이제 PK 로 승격.
      this.stmts.insertGrant = this.db.prepare(
        `INSERT INTO permission_grants
         (id, session_id, capability, target_json, granted_at, granted_by, expires_at, revoked_at, reason, scope)
         VALUES (@id, @session_id, @capability, @target_json, @granted_at, @granted_by, @expires_at, @revoked_at, @reason, @scope)`
      );
    }
    // target_json 은 backwards compat 으로 id 를 계속 포함 (기존 read path 가
    // json_extract 으로 의존). 후속 슬롯에서 점진 제거.
    const targetJson = JSON.stringify({ id: grant.id, target: grant.target });
    this.stmts.insertGrant.run({
      id: grant.id,
      session_id: grant.session_id,
      capability: grant.capability,
      target_json: targetJson,
      granted_at: grant.granted_at,
      granted_by: grant.granted_by,
      expires_at: grant.expires_at ?? null,
      revoked_at: grant.revoked_at ?? null,
      reason: grant.reason ?? null,
      scope: grant.scope,
    });

    // v1.0.11 SEC-3: audit 자동.
    const sink = this.permissionGrantAuditSink;
    if (sink !== undefined) {
      try {
        sink({
          timestamp: grant.granted_at,
          session_id: grant.session_id,
          capability: grant.capability,
          target_json: targetJson,
          granted_by: grant.granted_by,
          scope: grant.scope,
          expires_at: grant.expires_at ?? null,
          reason: grant.reason ?? null,
        });
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error(`[SessionStore.addPermissionGrant] audit sink failed: ${msg}`);
      }
    }
  }

  /**
   * v1.1.0 SEC-2 full: grant revoke. revoked_at 설정 — Resolver 의
   * findActiveGrants 가 자동 제외.
   *
   * @param grantId permission_grants.target_json 의 id 필드 (UUID).
   * @returns true 면 1개 row update, false 면 미발견.
   */
  revokePermissionGrant(grantId: string, revokedAt: string): boolean {
    // v1.4.1 (B-2) — id 가 PK 로 승격 → `WHERE id = ?` 직접 매칭. 이전엔
    // json_extract(target_json, '$.id') 였음. 동일 결과 + 인덱스 활용.
    const result = this.db
      .prepare(
        `UPDATE permission_grants
         SET revoked_at = @revoked_at
         WHERE revoked_at IS NULL
           AND id = @grant_id`
      )
      .run({ revoked_at: revokedAt, grant_id: grantId });
    return result.changes > 0;
  }

  /**
   * v1.1.0 SEC-2 full: active grant 목록 조회 (revoked_at IS NULL).
   *
   * UI 의 Settings > 권한 패널이 list view 로 표시 + revoke 버튼.
   */
  listActivePermissionGrants(
    sessionId: import('@/types').SessionId
  ): Array<{
    id: string;
    capability: string;
    target_json: string;
    granted_at: string;
    granted_by: string;
    scope: string;
    expires_at: string | null;
    reason: string | null;
  }> {
    const rows = this.db
      .prepare(
        `SELECT capability, target_json, granted_at, granted_by, expires_at, reason, scope
         FROM permission_grants
         WHERE session_id = @session_id AND revoked_at IS NULL
         ORDER BY granted_at DESC`
      )
      .all({ session_id: sessionId }) as Array<{
        capability: string;
        target_json: string;
        granted_at: string;
        granted_by: string;
        expires_at: string | null;
        reason: string | null;
        scope: string;
      }>;
    return rows.map((r) => {
      let id = '';
      try {
        const parsed = JSON.parse(r.target_json) as { id?: string };
        id = typeof parsed.id === 'string' ? parsed.id : '';
      } catch {
        // ignore parse error
      }
      return { ...r, id };
    });
  }

  appendTurn(sessionId: SessionId, turn: Turn): void {
    const tx = this.db.transaction((sid: string, t: Turn) => {
      const exists = this.getSessionExistsStmt().get(sid) as { id: string } | undefined;
      if (!exists) {
        throw new Error(`Cannot append turn: session ${sid} not found`);
      }

      const seq = this.nextSeq(sid);
      this.getInsertTurnStmt().run({
        id: t.id,
        session_id: sid,
        seq,
        role: t.role,
        timestamp: t.timestamp,
        status: t.status,
        content_json: JSON.stringify(t.content),
        tool_calls_json: jsonOrNull(t.tool_calls),
        tool_results_json: jsonOrNull(t.tool_results),
        model: t.model ?? null,
        effort: t.effort ?? null,
        edited_json: jsonOrNull(t.edited),
        reactions_json: jsonOrNull(t.reactions),
      });

      // v0.7.0 (F-026) — sync FTS5 index. Only insert when there's actually
      // human-readable text to index (skip pure-tool / image / file turns).
      this.indexTurnFts(sid, t);

      // Insert turn-level annotations (if any)
      if (t.annotations && t.annotations.length > 0) {
        for (const a of t.annotations) {
          this.getInsertAnnotationStmt().run({
            id: a.id,
            session_id: sid,
            turn_id: t.id,
            page_url: a.page_url,
            selector: a.selector,
            dom_meta_json: JSON.stringify({
              dom_meta: a.dom_meta,
              marker_index: a.marker_index,
              bounding_box: a.bounding_box,
              ...(a.comment_audio_uri !== undefined && {
                comment_audio_uri: a.comment_audio_uri,
              }),
            }),
            comment: a.comment,
            screenshot_uri: a.screenshot_uri,
            created_at: a.created_at,
          });
        }
      }

      // Bump session.updated_at to turn timestamp (only if newer).
      // Params: new timestamp, session id, threshold (same as new timestamp).
      this.getBumpUpdatedAtStmt().run(t.timestamp, sid, t.timestamp);
    });

    tx(sessionId, turn);
  }

  /**
   * v0.5.0 (F-018) — `/clear` 슬래시 명령. 현재 세션의 모든 turn 을 삭제.
   *
   * 의도적으로 destructive 한 작업 — 사용자가 명시적으로 호출했을 때만 실행.
   * Append-only 설계가 아닌 이유: 사용자가 "처음부터 다시 시작" 을 원할 때
   * 새 session 을 만드는 것보다 의미가 있다 (= 같은 workspace + 같은 모델 +
   * 같은 권한으로, conversation 만 비움).
   *
   * Turn-level annotations 도 함께 삭제 (FK 가 turns 를 가리키지 않더라도
   * `session_id + turn_id` 조합으로 orphan 이 되므로). updated_at 도 갱신.
   */
  clearTurns(id: SessionId): void {
    const tx = this.db.transaction((sid: string) => {
      const exists = this.getSessionExistsStmt().get(sid) as { id: string } | undefined;
      if (!exists) {
        throw new Error(`Cannot clear turns: session ${sid} not found`);
      }
      // Annotations 가 turn-level 로 붙어 있을 수 있어 같이 삭제 (session_id 로
      // 묶인 모든 annotation 을 비우면 browser-tab annotation 까지 사라지지만,
      // /clear 의 사용자 의도는 "이 세션의 메시지+그에 따른 모든 흔적 정리"
      // 이므로 OK).
      this.getDeleteAnnotationsBySessionStmt().run(sid);
      this.getDeleteTurnsBySessionStmt().run(sid);
      // v0.7.0 (F-026) — keep turns_fts in lockstep with turns table.
      this.deleteTurnsFtsForSession(sid);
      const now = new Date().toISOString();
      // updated_at 은 무조건 새 시각으로 — bump 가 아니라 force.
      this.db.prepare(`UPDATE sessions SET updated_at = ? WHERE id = ?`).run(now, sid);
    });

    tx(id);
  }

  /**
   * v0.5.0 (F-018) — `/model <name>` 슬래시 명령용. session 의
   * conversation.current_model / current_effort / current_mode 를 갱신.
   *
   * 이 값들은 metadata_json 의 _extra.conversation 에 저장돼 있다 — 즉시
   * 직접 SQL 로 update 가 어려워 session 전체를 read → patch → write 하는
   * 식이지만, write 는 sessions 행의 metadata_json 만 갱신하면 된다 (turns /
   * 다른 자식 row 는 건드리지 않는다).
   */
  updateConversation(
    id: SessionId,
    patch: {
      current_model?: string;
      current_effort?: Conversation['current_effort'];
      current_mode?: Conversation['current_mode'];
    }
  ): void {
    const row = this.getSelectSessionStmt().get(id) as SessionRow | undefined;
    if (!row) {
      throw new Error(`Cannot update conversation: session ${id} not found`);
    }
    if (
      patch.current_model === undefined &&
      patch.current_effort === undefined &&
      patch.current_mode === undefined
    ) {
      return;
    }
    const meta = this.parseMetadata(row.metadata_json);
    const next: StoredMetadata = {
      ...meta,
      _extra: {
        ...meta._extra,
        conversation: {
          ...meta._extra.conversation,
          ...(patch.current_model !== undefined && { current_model: patch.current_model }),
          ...(patch.current_effort !== undefined && { current_effort: patch.current_effort }),
          ...(patch.current_mode !== undefined && { current_mode: patch.current_mode }),
        },
      },
    };
    const now = new Date().toISOString();
    // v1.4.2 (B-3 1단계) — column 도 함께 갱신 (dual-write).
    this.db
      .prepare(
        `UPDATE sessions
         SET metadata_json = ?, updated_at = ?,
             current_model = ?, current_effort = ?, current_mode = ?
         WHERE id = ?`
      )
      .run(
        JSON.stringify(next),
        now,
        next._extra.conversation.current_model,
        next._extra.conversation.current_effort,
        next._extra.conversation.current_mode,
        id
      );
  }

  /**
   * v0.8.0 — 세션의 permission.default_level 을 갱신.
   *
   * conversation 처럼 default_level 도 metadata_json 의 _extra.permission 에
   * 저장돼 있어 sessions 행의 metadata_json 만 갱신하면 된다 (turns / 자식 row
   * 는 그대로). updated_at 도 새 시각으로 force update.
   *
   * Permission grants 자체는 별도 테이블이라 이 메서드로 변경되지 않는다 —
   * 그건 향후 grant API 의 책임. 이 메서드는 "이 세션의 기본 권한 preset"
   * 만 바꾼다.
   */
  updatePermission(
    id: SessionId,
    patch: {
      default_level?: PermissionState['default_level'];
    }
  ): void {
    const row = this.getSelectSessionStmt().get(id) as SessionRow | undefined;
    if (!row) {
      throw new Error(`Cannot update permission: session ${id} not found`);
    }
    if (patch.default_level === undefined) {
      return;
    }
    const meta = this.parseMetadata(row.metadata_json);
    const next: StoredMetadata = {
      ...meta,
      _extra: {
        ...meta._extra,
        permission: {
          ...meta._extra.permission,
          default_level: patch.default_level,
        },
      },
    };
    const now = new Date().toISOString();
    this.db
      .prepare(`UPDATE sessions SET metadata_json = ?, updated_at = ? WHERE id = ?`)
      .run(JSON.stringify(next), now, id);
  }

  updateSessionMeta(
    id: SessionId,
    patch: { title?: string; pinned?: boolean; archived?: boolean }
  ): void {
    const fields: string[] = [];
    const values: (string | number)[] = [];

    if (patch.title !== undefined) {
      fields.push('title = ?');
      values.push(patch.title);
    }
    if (patch.pinned !== undefined) {
      fields.push('pinned = ?');
      values.push(boolToInt(patch.pinned));
    }
    if (patch.archived !== undefined) {
      fields.push('archived = ?');
      values.push(boolToInt(patch.archived));
    }

    if (fields.length === 0) return;

    const now = new Date().toISOString();
    fields.push('updated_at = ?');
    values.push(now);
    values.push(id);

    const sql = `UPDATE sessions SET ${fields.join(', ')} WHERE id = ?`;
    const result = this.db.prepare(sql).run(...values);
    if (result.changes === 0) {
      throw new Error(`Cannot update meta: session ${id} not found`);
    }
  }

  /**
   * v1.1.11 (Workspace UX): per-session sticky workspace lock toggle.
   *
   * - locked=true: ChatHeader 의 🔒 toggle ON. drift / auto-new-chat prompt
   *   대상에서 제외 — 본 세션은 자기 workspace 에 고정.
   * - locked=false: 잠금 해제 → drift 검사 정상 발화.
   *
   * @returns true 면 session row 갱신, false 면 not found.
   */
  setWorkspaceLocked(id: SessionId, locked: boolean): boolean {
    const now = new Date().toISOString();
    const result = this.db
      .prepare(
        `UPDATE sessions
         SET workspace_locked = ?, updated_at = ?
         WHERE id = ?`
      )
      .run(locked ? 1 : 0, now, id);
    return result.changes > 0;
  }

  /** v1.1.11: 잠긴 세션 ID 목록 — boot-time workspace 복귀 흐름. */
  listLockedSessions(): SessionId[] {
    const rows = this.db
      .prepare(`SELECT id FROM sessions WHERE workspace_locked = 1`)
      .all() as Array<{ id: string }>;
    return rows.map((r) => r.id as SessionId);
  }

  /** v1.1.11: 특정 세션의 lock 상태 read. */
  getWorkspaceLocked(id: SessionId): boolean {
    const row = this.db
      .prepare(`SELECT workspace_locked AS locked FROM sessions WHERE id = ?`)
      .get(id) as { locked: number } | undefined;
    if (row === undefined) return false;
    return row.locked === 1;
  }

  deleteSession(id: SessionId): void {
    const tx = this.db.transaction((sid: string) => {
      // Delete in FK-safe order (children before parents).
      this.getDeleteAnnotationsBySessionStmt().run(sid);
      this.getDeleteGrantsBySessionStmt().run(sid);
      this.deletePlanItemsForSession(sid);
      this.getDeleteTerminalScrollbackBySessionStmt().run(sid);
      this.getDeleteTerminalPanesBySessionStmt().run(sid);
      this.getDeleteBrowserTabsBySessionStmt().run(sid);
      this.getDeleteTurnsBySessionStmt().run(sid);
      // v0.7.0 (F-026) — drop FTS5 entries alongside the turns rows.
      this.deleteTurnsFtsForSession(sid);
      // Orphan worktrees: parent_session_id has no FK constraint, so we must
      // explicitly delete them before removing the session row.
      // (Architect SS-4 finding #2)
      this.getDeleteWorktreesBySessionStmt().run(sid);
      const result = this.getDeleteSessionStmt().run(sid);
      if (result.changes === 0) {
        throw new Error(`Cannot delete: session ${sid} not found`);
      }
    });

    tx(id);
  }

  // ────────────────────────────────────────────────────────────
  // Public API — read
  // ────────────────────────────────────────────────────────────

  getSession(id: SessionId): Session | null {
    const row = this.getSelectSessionStmt().get(id) as SessionRow | undefined;
    if (!row) return null;

    const session = this.assembleSession(row);
    return SessionSchema.parse(session);
  }

  listSessions(filter?: SessionListFilter): SessionMeta[] {
    const where: string[] = [];
    const params: (string | number)[] = [];

    if (filter?.workspace_id !== undefined) {
      where.push('workspace_id = ?');
      params.push(filter.workspace_id);
    }
    if (filter?.archived !== undefined) {
      where.push('archived = ?');
      params.push(boolToInt(filter.archived));
    }
    if (filter?.pinned !== undefined) {
      where.push('pinned = ?');
      params.push(boolToInt(filter.pinned));
    }

    const whereClause = where.length > 0 ? `WHERE ${where.join(' AND ')}` : '';
    const sql = `SELECT * FROM sessions ${whereClause} ORDER BY updated_at DESC`;

    const rows = this.db.prepare(sql).all(...params) as SessionRow[];

    return rows.map((r) => this.rowToMeta(r));
  }

  /**
   * v0.7.0 (F-026 Chat Search) — full-text search over the human-readable
   * portion of all turns across all sessions.
   *
   * Strategy:
   *   - When FTS5 is available, runs `turns_fts MATCH ?` with a phrase query
   *     (the input is treated as a single string — quotes are escaped, the
   *     query is wrapped in `"..."`) and BM25-ordered.
   *   - When FTS5 is unavailable OR the FTS query throws (rare — invalid
   *     internal token sequences), falls back to LIKE substring search on
   *     the raw `content_json`. Results are timestamp-DESC ordered.
   *
   * `query` is trimmed; empty input returns []. Default `limit` 50, hard
   * upper bound enforced by the IPC schema (100).
   *
   * Snippets contain `<mark>...</mark>` markup (FTS5) or a 80-char window
   * around the match (LIKE). Renderer must SAFELY render — split on the
   * markup, never use innerHTML.
   */
  searchTurns(query: string, limit = 50): TurnSearchResult[] {
    const q = query.trim();
    if (q.length === 0) return [];
    if (this.fts5Enabled) {
      try {
        return this.searchTurnsFTS5(q, limit);
      } catch {
        // FTS5 query syntax error (extremely unusual once we phrase-quote)
        // — fall through to LIKE so the user still gets matches.
      }
    }
    return this.searchTurnsLike(q, limit);
  }

  // ────────────────────────────────────────────────────────────
  // Internal — insert helpers
  // ────────────────────────────────────────────────────────────

  private upsertWorkspace(s: Session): void {
    const ws = s.workspace;
    if (!this.stmts.insertWorkspace) {
      this.stmts.insertWorkspace = this.db.prepare(
        `INSERT INTO workspaces
         (id, root, name, git_state_json, index_status, file_count, indexed_at, created_at, is_temporary)
         VALUES (@id, @root, @name, @git_state_json, @index_status, @file_count, @indexed_at, @created_at, @is_temporary)
         ON CONFLICT(id) DO UPDATE SET
           root = excluded.root,
           name = excluded.name,
           git_state_json = excluded.git_state_json,
           index_status = excluded.index_status,
           file_count = excluded.file_count,
           indexed_at = excluded.indexed_at,
           is_temporary = excluded.is_temporary`
      );
    }

    this.stmts.insertWorkspace.run({
      id: s.workspace_id,
      root: ws.root,
      name: ws.name,
      git_state_json: jsonOrNull(ws.git_state),
      index_status: ws.index_status,
      file_count: ws.file_count ?? null,
      indexed_at: ws.index_at ?? null,
      created_at: s.created_at, // synthesize from session
      is_temporary: boolToInt(ws.is_temporary),
    });
  }

  private insertSessionRow(s: Session): void {
    if (!this.stmts.insertSession) {
      // v1.4.2 (B-3 1단계) — current_model/effort/mode 컬럼 dual-write.
      this.stmts.insertSession = this.db.prepare(
        `INSERT INTO sessions
         (id, schema_version, provider, workspace_id, title, pinned, archived,
          parent_session_id, created_at, updated_at, metadata_json,
          current_model, current_effort, current_mode)
         VALUES (@id, @schema_version, @provider, @workspace_id, @title, @pinned, @archived,
                 @parent_session_id, @created_at, @updated_at, @metadata_json,
                 @current_model, @current_effort, @current_mode)`
      );
    }

    const meta = this.buildStoredMetadata(s);

    this.stmts.insertSession.run({
      id: s.id,
      schema_version: s.schema_version,
      provider: s.provider,
      workspace_id: s.workspace_id,
      title: s.title,
      pinned: boolToInt(s.pinned),
      archived: boolToInt(s.archived),
      parent_session_id: s.parent_session_id ?? null,
      created_at: s.created_at,
      updated_at: s.updated_at,
      metadata_json: JSON.stringify(meta),
      current_model: s.conversation.current_model,
      current_effort: s.conversation.current_effort,
      current_mode: s.conversation.current_mode,
    });
  }

  private insertWorktrees(s: Session): void {
    const list = s.workspace.worktrees;
    if (list.length === 0) return;

    if (!this.stmts.insertWorktree) {
      this.stmts.insertWorktree = this.db.prepare(
        `INSERT INTO worktrees
         (id, workspace_id, path, branch, is_permanent, parent_session_id, created_at)
         VALUES (@id, @workspace_id, @path, @branch, @is_permanent, @parent_session_id, @created_at)
         ON CONFLICT(id) DO UPDATE SET
           path = excluded.path,
           branch = excluded.branch,
           is_permanent = excluded.is_permanent,
           parent_session_id = excluded.parent_session_id`
      );
    }

    for (const w of list) {
      this.stmts.insertWorktree.run({
        id: w.id,
        workspace_id: s.workspace_id,
        path: w.path,
        branch: w.branch,
        is_permanent: boolToInt(w.is_permanent),
        parent_session_id: w.parent_session_id ?? null,
        created_at: w.created_at,
      });
    }
  }

  private insertTurns(s: Session): void {
    const turns = s.conversation.turns;
    if (turns.length === 0) return;

    const insertTurn = this.getInsertTurnStmt();

    for (let i = 0; i < turns.length; i += 1) {
      const t = turns[i]!;
      insertTurn.run({
        id: t.id,
        session_id: s.id,
        seq: i,
        role: t.role,
        timestamp: t.timestamp,
        status: t.status,
        content_json: JSON.stringify(t.content),
        tool_calls_json: jsonOrNull(t.tool_calls),
        tool_results_json: jsonOrNull(t.tool_results),
        model: t.model ?? null,
        effort: t.effort ?? null,
        edited_json: jsonOrNull(t.edited),
        reactions_json: jsonOrNull(t.reactions),
      });
      // v0.7.0 (F-026) — sync FTS5 index for each indexable turn.
      this.indexTurnFts(s.id, t);
    }
  }

  private insertGrants(s: Session): void {
    const grants = s.permission.grants;
    if (grants.length === 0) return;

    if (!this.stmts.insertGrant) {
      // v1.4.1 (B-2) — id 컬럼 직접.
      this.stmts.insertGrant = this.db.prepare(
        `INSERT INTO permission_grants
         (id, session_id, capability, target_json, granted_at, granted_by, expires_at, revoked_at, reason, scope)
         VALUES (@id, @session_id, @capability, @target_json, @granted_at, @granted_by, @expires_at, @revoked_at, @reason, @scope)`
      );
    }

    for (const g of grants) {
      const targetJson = JSON.stringify({ id: g.id, target: g.target });
      this.stmts.insertGrant.run({
        id: g.id,
        session_id: s.id,
        capability: g.capability,
        target_json: targetJson,
        granted_at: g.granted_at,
        granted_by: g.granted_by,
        expires_at: g.expires_at ?? null,
        revoked_at: g.revoked_at ?? null,
        reason: g.reason ?? null,
        scope: g.scope,
      });

      // v1.0.11 SEC-3: 새로 영속되는 grant 마다 audit 발행. createSession 의
      // 부트스트랩 grants 도 포함 — "이 세션은 이런 권한을 갖고 시작했다" 가
      // audit trail 에 남도록. revoked_at 가 미리 채워져 있으면 (이전 세션
      // 복원 등) 의미 약하지만 invariant 단순성을 위해 일관 발행.
      const sink = this.permissionGrantAuditSink;
      if (sink !== undefined) {
        try {
          sink({
            timestamp: g.granted_at,
            session_id: s.id,
            capability: g.capability,
            target_json: targetJson,
            granted_by: g.granted_by,
            scope: g.scope,
            expires_at: g.expires_at ?? null,
            reason: g.reason ?? null,
          });
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          console.error(`[SessionStore] permission grant audit sink failed: ${msg}`);
        }
      }
    }
  }

  private insertBrowserTabs(s: Session): void {
    const tabs = s.browser.tabs;
    if (tabs.length === 0) return;

    if (!this.stmts.insertBrowserTab) {
      this.stmts.insertBrowserTab = this.db.prepare(
        `INSERT INTO browser_tabs
         (id, session_id, title, url, favicon_uri, status, spawned_by, spawning_turn_id,
          last_load, history_json, annotation_mode, last_screenshot_uri, last_dom_dump_uri)
         VALUES (@id, @session_id, @title, @url, @favicon_uri, @status, @spawned_by, @spawning_turn_id,
                 @last_load, @history_json, @annotation_mode, @last_screenshot_uri, @last_dom_dump_uri)`
      );
    }

    for (const tab of tabs) {
      this.stmts.insertBrowserTab.run({
        id: tab.id,
        session_id: s.id,
        title: tab.title,
        url: tab.url,
        favicon_uri: tab.favicon_uri ?? null,
        status: tab.status,
        spawned_by: tab.spawned_by,
        spawning_turn_id: tab.spawning_turn_id ?? null,
        last_load: tab.last_load,
        history_json: JSON.stringify({
          history: tab.history,
          history_index: tab.history_index,
          annotations: tab.annotations,
        }),
        annotation_mode: boolToInt(tab.annotation_mode),
        last_screenshot_uri: tab.last_screenshot_uri ?? null,
        last_dom_dump_uri: tab.last_dom_dump_uri ?? null,
      });
    }
  }

  private insertTerminalPanes(s: Session): void {
    const panes = s.terminal.panes;
    if (panes.length === 0) return;

    if (!this.stmts.insertTerminalPane) {
      this.stmts.insertTerminalPane = this.db.prepare(
        `INSERT INTO terminal_panes
         (id, session_id, title, shell, cwd, env_json, status, pid, exit_code,
          spawned_by_ai, turn_id, scrollback_uri, input_history_json, created_at)
         VALUES (@id, @session_id, @title, @shell, @cwd, @env_json, @status, @pid, @exit_code,
                 @spawned_by_ai, @turn_id, @scrollback_uri, @input_history_json, @created_at)`
      );
    }

    for (const p of panes) {
      this.stmts.insertTerminalPane.run({
        id: p.id,
        session_id: s.id,
        title: p.title,
        shell: p.shell,
        cwd: p.cwd,
        env_json: JSON.stringify(p.env),
        status: p.status,
        pid: p.pid ?? null,
        exit_code: p.exit_code ?? null,
        spawned_by_ai: boolToInt(p.spawned_by_ai),
        turn_id: p.turn_id ?? null,
        scrollback_uri: p.scrollback_uri ?? null,
        input_history_json: JSON.stringify({
          input_history: p.input_history,
          scrollback_lines: p.scrollback_lines,
        }),
        created_at: s.created_at, // synthesize
      });
    }
  }

  private insertPlanItems(s: Session): void {
    const items = s.plan.checklist;
    if (!items || items.length === 0) return;

    if (!this.stmts.insertPlanItem) {
      this.stmts.insertPlanItem = this.db.prepare(
        `INSERT INTO plan_items
         (id, session_id, parent_id, seq, text, status, related_turns_json, evidence)
         VALUES (@id, @session_id, @parent_id, @seq, @text, @status, @related_turns_json, @evidence)`
      );
    }

    const insertRecursive = (arr: PlanItem[], parentId: string | null): void => {
      for (let i = 0; i < arr.length; i += 1) {
        const item = arr[i]!;
        this.stmts.insertPlanItem!.run({
          id: item.id,
          session_id: s.id,
          parent_id: parentId,
          seq: i,
          text: item.text,
          status: item.status,
          related_turns_json: JSON.stringify(item.related_turns),
          evidence: item.evidence ?? null,
        });
        if (item.sub_items && item.sub_items.length > 0) {
          insertRecursive(item.sub_items, item.id);
        }
      }
    };

    insertRecursive(items, null);
  }

  private insertTurnAnnotations(s: Session): void {
    for (const t of s.conversation.turns) {
      if (!t.annotations || t.annotations.length === 0) continue;
      for (const a of t.annotations) {
        this.getInsertAnnotationStmt().run({
          id: a.id,
          session_id: s.id,
          turn_id: t.id,
          page_url: a.page_url,
          selector: a.selector,
          dom_meta_json: JSON.stringify({
            dom_meta: a.dom_meta,
            marker_index: a.marker_index,
            bounding_box: a.bounding_box,
            ...(a.comment_audio_uri !== undefined && {
              comment_audio_uri: a.comment_audio_uri,
            }),
          }),
          comment: a.comment,
          screenshot_uri: a.screenshot_uri,
          created_at: a.created_at,
        });
      }
    }
  }

  // ────────────────────────────────────────────────────────────
  // Internal — load helpers
  // ────────────────────────────────────────────────────────────

  private assembleSession(row: SessionRow): unknown {
    const meta = this.parseMetadata(row.metadata_json);
    const wsRow = this.getSelectWorkspaceStmt().get(row.workspace_id) as WorkspaceRow | undefined;
    if (!wsRow) {
      throw new Error(`Workspace ${row.workspace_id} missing for session ${row.id}`);
    }

    const worktrees = this.loadWorktrees(row.workspace_id);
    // v1.4.2 (B-3) — column 우선, JSON fallback. 마이그레이션 직후 기존 row 는
    // 둘 다 채워져 있고, 새 row 는 dual-write.
    const conversation = this.loadConversation(row.id, {
      ...meta._extra.conversation,
      current_model: row.current_model ?? meta._extra.conversation.current_model,
      current_effort:
        (row.current_effort as Conversation['current_effort'] | null) ??
        meta._extra.conversation.current_effort,
      current_mode:
        (row.current_mode as Conversation['current_mode'] | null) ??
        meta._extra.conversation.current_mode,
    });
    const grants = this.loadGrants(row.id);
    const tabs = this.loadBrowserTabs(row.id);
    const panes = this.loadTerminalPanes(row.id);
    const planItems = this.loadPlanItems(row.id);

    const workspace = this.buildWorkspace(wsRow, worktrees, meta._extra.workspace);
    const terminal = this.buildTerminalState(panes, meta._extra.terminal);
    const browser = this.buildBrowserState(tabs, meta._extra.browser);
    const plan = this.buildPlanState(planItems, meta._extra.plan);
    const permission = this.buildPermissionState(grants, meta._extra.permission);

    const session: Record<string, unknown> = {
      id: row.id,
      schema_version: row.schema_version,
      created_at: row.created_at,
      updated_at: row.updated_at,
      provider: row.provider,
      workspace_id: row.workspace_id,
      title: row.title,
      pinned: intToBool(row.pinned),
      archived: intToBool(row.archived),
      conversation,
      workspace,
      terminal,
      browser,
      plan,
      permission,
      metadata: this.buildSessionMetadata(meta),
    };

    if (row.parent_session_id !== null) {
      session['parent_session_id'] = row.parent_session_id;
    }

    return session;
  }

  private parseMetadata(raw: string | null): StoredMetadata {
    if (raw === null) {
      throw new Error('Session row has NULL metadata_json (corrupt DB)');
    }
    return JSON.parse(raw) as StoredMetadata;
  }

  private buildStoredMetadata(s: Session): StoredMetadata {
    const extra: MetadataExtra = {
      conversation: {
        ...(s.conversation.pending_input !== undefined && {
          pending_input: s.conversation.pending_input,
        }),
        current_model: s.conversation.current_model,
        current_effort: s.conversation.current_effort,
        current_mode: s.conversation.current_mode,
      },
      workspace: {
        recent_files: s.workspace.recent_files,
        open_files: s.workspace.open_files,
        ignore_patterns: s.workspace.ignore_patterns,
        ...(s.workspace.active_worktree_id !== undefined && {
          active_worktree_id: s.workspace.active_worktree_id,
        }),
      },
      terminal: {
        ...(s.terminal.active_pane_id !== undefined && {
          active_pane_id: s.terminal.active_pane_id,
        }),
        panel_open: s.terminal.panel_open,
        height_px: s.terminal.height_px,
      },
      browser: {
        ...(s.browser.active_tab_id !== undefined && {
          active_tab_id: s.browser.active_tab_id,
        }),
        panel_visible: s.browser.panel_visible,
        layout: s.browser.layout,
        partition_id: s.browser.partition_id,
      },
      plan: {
        active: s.plan.active,
        browser_tool_enabled: s.plan.browser_tool_enabled,
        ...(s.plan.current_item_index !== undefined && {
          current_item_index: s.plan.current_item_index,
        }),
      },
      permission: {
        default_level: s.permission.default_level,
        ...(s.permission.last_denied !== undefined && {
          last_denied: s.permission.last_denied,
        }),
        temporarily_blocked_capabilities: s.permission.temporarily_blocked_capabilities,
      },
    };

    const stored: StoredMetadata = { _extra: extra };
    if (s.metadata.codex !== undefined) stored.codex = s.metadata.codex;
    if (s.metadata.claude !== undefined) stored.claude = s.metadata.claude;
    return stored;
  }

  private buildSessionMetadata(stored: StoredMetadata): SessionMetadata {
    const out: SessionMetadata = {};
    if (stored.codex !== undefined) out.codex = stored.codex;
    if (stored.claude !== undefined) out.claude = stored.claude;
    return out;
  }

  private loadWorktrees(workspaceId: string): WorkTree[] {
    if (!this.stmts.selectWorktreesByWs) {
      this.stmts.selectWorktreesByWs = this.db.prepare(
        `SELECT * FROM worktrees WHERE workspace_id = ?`
      );
    }
    const rows = this.stmts.selectWorktreesByWs.all(workspaceId) as WorktreeRow[];
    return rows.map((r) => {
      const w: Record<string, unknown> = {
        id: r.id,
        path: r.path,
        branch: r.branch,
        is_permanent: intToBool(r.is_permanent),
        created_at: r.created_at,
      };
      if (r.parent_session_id !== null) {
        w['parent_session_id'] = r.parent_session_id;
      }
      return w as WorkTree;
    });
  }

  private buildWorkspace(
    row: WorkspaceRow,
    worktrees: WorkTree[],
    extra: MetadataExtra['workspace']
  ): Workspace {
    const ws: Record<string, unknown> = {
      root: row.root,
      name: row.name,
      worktrees,
      recent_files: extra.recent_files,
      open_files: extra.open_files,
      ignore_patterns: extra.ignore_patterns,
      index_status: row.index_status,
      is_temporary: intToBool(row.is_temporary),
    };
    if (extra.active_worktree_id !== undefined) {
      ws['active_worktree_id'] = extra.active_worktree_id;
    }
    if (row.git_state_json !== null) {
      ws['git_state'] = JSON.parse(row.git_state_json) as GitState;
    }
    if (row.indexed_at !== null) {
      ws['index_at'] = row.indexed_at;
    }
    if (row.file_count !== null) {
      ws['file_count'] = row.file_count;
    }
    return ws as Workspace;
  }

  private loadConversation(sessionId: string, extra: MetadataExtra['conversation']): Conversation {
    if (!this.stmts.selectTurnsBySession) {
      this.stmts.selectTurnsBySession = this.db.prepare(
        `SELECT * FROM turns WHERE session_id = ? ORDER BY seq ASC`
      );
    }
    const rows = this.stmts.selectTurnsBySession.all(sessionId) as TurnRow[];

    const turns: Turn[] = rows.map((r) => {
      const t: Record<string, unknown> = {
        id: r.id,
        role: r.role,
        timestamp: r.timestamp,
        status: r.status,
        content: JSON.parse(r.content_json),
      };
      const tc = parseJsonOrNull<unknown>(r.tool_calls_json);
      if (tc !== undefined) t['tool_calls'] = tc;
      const tr = parseJsonOrNull<unknown>(r.tool_results_json);
      if (tr !== undefined) t['tool_results'] = tr;
      if (r.model !== null) t['model'] = r.model;
      if (r.effort !== null) t['effort'] = r.effort;
      const ed = parseJsonOrNull<TurnEdit[]>(r.edited_json);
      if (ed !== undefined) t['edited'] = ed;
      const re = parseJsonOrNull<Reaction[]>(r.reactions_json);
      if (re !== undefined) t['reactions'] = re;

      // Load turn-level annotations
      const turnAnnotations = this.loadAnnotationsForTurn(sessionId, r.id);
      if (turnAnnotations.length > 0) {
        t['annotations'] = turnAnnotations;
      }
      return t as Turn;
    });

    const conv: Record<string, unknown> = {
      turns,
      current_model: extra.current_model,
      current_effort: extra.current_effort,
      current_mode: extra.current_mode,
    };
    if (extra.pending_input !== undefined) {
      conv['pending_input'] = extra.pending_input;
    }
    return conv as Conversation;
  }

  private loadAnnotationsForTurn(sessionId: string, turnId: string): Annotation[] {
    if (!this.stmts.selectAnnotationsBySessionTurn) {
      this.stmts.selectAnnotationsBySessionTurn = this.db.prepare(
        `SELECT * FROM annotations WHERE session_id = ? AND turn_id = ? ORDER BY created_at ASC`
      );
    }
    const rows = this.stmts.selectAnnotationsBySessionTurn.all(
      sessionId,
      turnId
    ) as AnnotationRow[];

    return rows.map((r) => {
      const wrapper = JSON.parse(r.dom_meta_json) as {
        dom_meta: Annotation['dom_meta'];
        marker_index: number;
        bounding_box: Annotation['bounding_box'];
        comment_audio_uri?: string;
      };
      const a: Record<string, unknown> = {
        id: r.id,
        marker_index: wrapper.marker_index,
        selector: r.selector,
        bounding_box: wrapper.bounding_box,
        screenshot_uri: r.screenshot_uri,
        dom_meta: wrapper.dom_meta,
        comment: r.comment,
        page_url: r.page_url,
        created_at: r.created_at,
      };
      if (wrapper.comment_audio_uri !== undefined) {
        a['comment_audio_uri'] = wrapper.comment_audio_uri;
      }
      return a as Annotation;
    });
  }

  private loadGrants(sessionId: string): PermissionGrant[] {
    if (!this.stmts.selectGrantsBySession) {
      this.stmts.selectGrantsBySession = this.db.prepare(
        `SELECT * FROM permission_grants WHERE session_id = ? ORDER BY id ASC`
      );
    }
    const rows = this.stmts.selectGrantsBySession.all(sessionId) as PermissionGrantRow[];

    return rows.map((r) => {
      const wrap = JSON.parse(r.target_json) as {
        id: string;
        target: GrantTarget;
      };
      // v1.4.1 (B-2) — `r.id` 가 이제 application id (TEXT). 기존 row 는
      // migration 이 target_json.id 로 backfill 했으므로 둘이 동일. 안전망:
      // r.id 가 falsy 한 경우 wrap.id 로 fallback.
      const g: Record<string, unknown> = {
        id: r.id || wrap.id,
        session_id: sessionId,
        capability: r.capability,
        target: wrap.target,
        scope: r.scope,
        granted_at: r.granted_at,
        granted_by: r.granted_by,
      };
      if (r.expires_at !== null) g['expires_at'] = r.expires_at;
      if (r.revoked_at !== null) g['revoked_at'] = r.revoked_at;
      if (r.reason !== null) g['reason'] = r.reason;
      return g as PermissionGrant;
    });
  }

  private buildPermissionState(
    grants: PermissionGrant[],
    extra: MetadataExtra['permission']
  ): PermissionState {
    const ps: Record<string, unknown> = {
      grants,
      default_level: extra.default_level,
      temporarily_blocked_capabilities: extra.temporarily_blocked_capabilities,
    };
    if (extra.last_denied !== undefined) {
      ps['last_denied'] = extra.last_denied;
    }
    return ps as PermissionState;
  }

  private loadBrowserTabs(sessionId: string): BrowserTab[] {
    if (!this.stmts.selectBrowserTabsBySession) {
      this.stmts.selectBrowserTabsBySession = this.db.prepare(
        `SELECT * FROM browser_tabs WHERE session_id = ?`
      );
    }
    const rows = this.stmts.selectBrowserTabsBySession.all(sessionId) as BrowserTabRow[];

    return rows.map((r) => {
      const wrap = JSON.parse(r.history_json) as {
        history: BrowserTab['history'];
        history_index: number;
        annotations: Annotation[];
      };
      const tab: Record<string, unknown> = {
        id: r.id,
        title: r.title,
        url: r.url,
        status: r.status,
        last_load: r.last_load,
        history: wrap.history,
        history_index: wrap.history_index,
        annotation_mode: intToBool(r.annotation_mode),
        annotations: wrap.annotations,
        spawned_by: r.spawned_by,
      };
      if (r.favicon_uri !== null) tab['favicon_uri'] = r.favicon_uri;
      if (r.spawning_turn_id !== null) tab['spawning_turn_id'] = r.spawning_turn_id;
      if (r.last_screenshot_uri !== null) tab['last_screenshot_uri'] = r.last_screenshot_uri;
      if (r.last_dom_dump_uri !== null) tab['last_dom_dump_uri'] = r.last_dom_dump_uri;
      return tab as BrowserTab;
    });
  }

  private buildBrowserState(tabs: BrowserTab[], extra: MetadataExtra['browser']): BrowserState {
    const bs: Record<string, unknown> = {
      tabs,
      panel_visible: extra.panel_visible,
      layout: extra.layout,
      partition_id: extra.partition_id,
    };
    if (extra.active_tab_id !== undefined) {
      bs['active_tab_id'] = extra.active_tab_id;
    }
    return bs as BrowserState;
  }

  private loadTerminalPanes(sessionId: string): TerminalPane[] {
    if (!this.stmts.selectTerminalPanesBySession) {
      this.stmts.selectTerminalPanesBySession = this.db.prepare(
        `SELECT * FROM terminal_panes WHERE session_id = ?`
      );
    }
    const rows = this.stmts.selectTerminalPanesBySession.all(sessionId) as TerminalPaneRow[];

    return rows.map((r) => {
      const wrap = JSON.parse(r.input_history_json ?? '{}') as {
        input_history: string[];
        scrollback_lines: number;
      };
      const env = r.env_json !== null ? (JSON.parse(r.env_json) as Record<string, string>) : {};
      const p: Record<string, unknown> = {
        id: r.id,
        title: r.title,
        shell: r.shell,
        cwd: r.cwd,
        env,
        status: r.status,
        scrollback_lines: wrap.scrollback_lines,
        input_history: wrap.input_history,
        spawned_by_ai: intToBool(r.spawned_by_ai),
      };
      if (r.pid !== null) p['pid'] = r.pid;
      if (r.exit_code !== null) p['exit_code'] = r.exit_code;
      if (r.scrollback_uri !== null) p['scrollback_uri'] = r.scrollback_uri;
      if (r.turn_id !== null) p['turn_id'] = r.turn_id;
      return p as TerminalPane;
    });
  }

  private buildTerminalState(
    panes: TerminalPane[],
    extra: MetadataExtra['terminal']
  ): TerminalState {
    const ts: Record<string, unknown> = {
      panes,
      panel_open: extra.panel_open,
      height_px: extra.height_px,
    };
    if (extra.active_pane_id !== undefined) {
      ts['active_pane_id'] = extra.active_pane_id;
    }
    return ts as TerminalState;
  }

  private loadPlanItems(sessionId: string): PlanItem[] {
    if (!this.stmts.selectPlanItemsBySession) {
      this.stmts.selectPlanItemsBySession = this.db.prepare(
        `SELECT * FROM plan_items WHERE session_id = ? ORDER BY parent_id IS NULL DESC, parent_id ASC, seq ASC`
      );
    }
    const rows = this.stmts.selectPlanItemsBySession.all(sessionId) as PlanItemRow[];

    if (rows.length === 0) return [];

    // Group rows by parent_id (NULL = top level)
    const byParent = new Map<string | null, PlanItemRow[]>();
    for (const r of rows) {
      const key = r.parent_id;
      const arr = byParent.get(key) ?? [];
      arr.push(r);
      byParent.set(key, arr);
    }
    // Sort each group by seq
    for (const arr of byParent.values()) {
      arr.sort((a, b) => a.seq - b.seq);
    }

    const buildSubtree = (parentId: string | null): PlanItem[] => {
      const children = byParent.get(parentId) ?? [];
      return children.map((r) => {
        const item: Record<string, unknown> = {
          id: r.id,
          text: r.text,
          status: r.status,
          related_turns:
            r.related_turns_json !== null ? (JSON.parse(r.related_turns_json) as string[]) : [],
        };
        const subs = buildSubtree(r.id);
        if (subs.length > 0) item['sub_items'] = subs;
        if (r.evidence !== null) item['evidence'] = r.evidence;
        return item as PlanItem;
      });
    };

    return buildSubtree(null);
  }

  private buildPlanState(items: PlanItem[], extra: MetadataExtra['plan']): PlanState {
    const ps: Record<string, unknown> = {
      active: extra.active,
      browser_tool_enabled: extra.browser_tool_enabled,
    };
    if (items.length > 0) ps['checklist'] = items;
    if (extra.current_item_index !== undefined) {
      ps['current_item_index'] = extra.current_item_index;
    }
    return ps as PlanState;
  }

  private rowToMeta(r: SessionRow): SessionMeta {
    const meta: SessionMeta = {
      id: r.id as SessionId,
      schema_version: r.schema_version,
      provider: r.provider,
      workspace_id: r.workspace_id as WorkspaceId,
      title: r.title,
      pinned: intToBool(r.pinned),
      archived: intToBool(r.archived),
      created_at: r.created_at,
      updated_at: r.updated_at,
    };
    if (r.parent_session_id !== null) {
      meta.parent_session_id = r.parent_session_id as SessionId;
    }
    return meta;
  }

  // ────────────────────────────────────────────────────────────
  // Statement getters (lazy init)
  // ────────────────────────────────────────────────────────────

  private getInsertTurnStmt(): Statement {
    if (!this.stmts.insertTurn) {
      this.stmts.insertTurn = this.db.prepare(
        `INSERT INTO turns
         (id, session_id, seq, role, timestamp, status, content_json,
          tool_calls_json, tool_results_json, model, effort, edited_json, reactions_json)
         VALUES (@id, @session_id, @seq, @role, @timestamp, @status, @content_json,
                 @tool_calls_json, @tool_results_json, @model, @effort, @edited_json, @reactions_json)`
      );
    }
    return this.stmts.insertTurn;
  }

  private getInsertAnnotationStmt(): Statement {
    if (!this.stmts.insertAnnotation) {
      this.stmts.insertAnnotation = this.db.prepare(
        `INSERT INTO annotations
         (id, session_id, turn_id, page_url, selector, dom_meta_json, comment, screenshot_uri, created_at)
         VALUES (@id, @session_id, @turn_id, @page_url, @selector, @dom_meta_json, @comment, @screenshot_uri, @created_at)`
      );
    }
    return this.stmts.insertAnnotation;
  }

  private getSelectSessionStmt(): Statement {
    if (!this.stmts.selectSession) {
      this.stmts.selectSession = this.db.prepare(`SELECT * FROM sessions WHERE id = ?`);
    }
    return this.stmts.selectSession;
  }

  private getSelectWorkspaceStmt(): Statement {
    if (!this.stmts.selectWorkspace) {
      this.stmts.selectWorkspace = this.db.prepare(`SELECT * FROM workspaces WHERE id = ?`);
    }
    return this.stmts.selectWorkspace;
  }

  private getSessionExistsStmt(): Statement {
    if (!this.stmts.sessionExists) {
      this.stmts.sessionExists = this.db.prepare(`SELECT id FROM sessions WHERE id = ?`);
    }
    return this.stmts.sessionExists;
  }

  private getBumpUpdatedAtStmt(): Statement {
    if (!this.stmts.bumpUpdatedAt) {
      // Bump only if the new timestamp is strictly later than the current one.
      // Params: newTs, sessionId, threshold (same as newTs).
      this.stmts.bumpUpdatedAt = this.db.prepare(
        `UPDATE sessions SET updated_at = ? WHERE id = ? AND updated_at < ?`
      );
    }
    return this.stmts.bumpUpdatedAt;
  }

  private nextSeq(sessionId: string): number {
    if (!this.stmts.nextTurnSeq) {
      this.stmts.nextTurnSeq = this.db.prepare(
        `SELECT COALESCE(MAX(seq), -1) + 1 AS seq FROM turns WHERE session_id = ?`
      );
    }
    const row = this.stmts.nextTurnSeq.get(sessionId) as { seq: number };
    return row.seq;
  }

  private getDeleteAnnotationsBySessionStmt(): Statement {
    if (!this.stmts.deleteAnnotationsBySession) {
      this.stmts.deleteAnnotationsBySession = this.db.prepare(
        `DELETE FROM annotations WHERE session_id = ?`
      );
    }
    return this.stmts.deleteAnnotationsBySession;
  }

  private getDeleteGrantsBySessionStmt(): Statement {
    if (!this.stmts.deleteGrantsBySession) {
      this.stmts.deleteGrantsBySession = this.db.prepare(
        `DELETE FROM permission_grants WHERE session_id = ?`
      );
    }
    return this.stmts.deleteGrantsBySession;
  }

  /**
   * Delete all plan_items for a session using a recursive CTE.
   *
   * The previous implementation used a leaves-first iterative loop capped at
   * 16 iterations. Any tree deeper than 16 levels would silently leave orphan
   * rows, causing the subsequent `DELETE FROM sessions` to fail with
   * SQLITE_CONSTRAINT_FOREIGNKEY. The whole transaction rolled back, so no
   * data corruption occurred, but the caller saw a confusing FK error.
   *
   * The recursive CTE has no depth cap: it collects every descendant in one
   * pass and deletes them all at once, regardless of nesting depth.
   * (Architect SS-4 finding #1)
   */
  private deletePlanItemsForSession(sessionId: string): void {
    this.db
      .prepare(
        `
      WITH RECURSIVE descendants(id) AS (
        SELECT id FROM plan_items WHERE session_id = ? AND parent_id IS NULL
        UNION ALL
        SELECT p.id FROM plan_items p
        INNER JOIN descendants d ON p.parent_id = d.id
      )
      DELETE FROM plan_items WHERE id IN (SELECT id FROM descendants)
    `
      )
      .run(sessionId);
  }

  private getDeleteTerminalScrollbackBySessionStmt(): Statement {
    if (!this.stmts.deleteTerminalScrollbackBySession) {
      this.stmts.deleteTerminalScrollbackBySession = this.db.prepare(
        `DELETE FROM terminal_scrollback
         WHERE pane_id IN (SELECT id FROM terminal_panes WHERE session_id = ?)`
      );
    }
    return this.stmts.deleteTerminalScrollbackBySession;
  }

  private getDeleteTerminalPanesBySessionStmt(): Statement {
    if (!this.stmts.deleteTerminalPanesBySession) {
      this.stmts.deleteTerminalPanesBySession = this.db.prepare(
        `DELETE FROM terminal_panes WHERE session_id = ?`
      );
    }
    return this.stmts.deleteTerminalPanesBySession;
  }

  private getDeleteBrowserTabsBySessionStmt(): Statement {
    if (!this.stmts.deleteBrowserTabsBySession) {
      this.stmts.deleteBrowserTabsBySession = this.db.prepare(
        `DELETE FROM browser_tabs WHERE session_id = ?`
      );
    }
    return this.stmts.deleteBrowserTabsBySession;
  }

  private getDeleteTurnsBySessionStmt(): Statement {
    if (!this.stmts.deleteTurnsBySession) {
      this.stmts.deleteTurnsBySession = this.db.prepare(`DELETE FROM turns WHERE session_id = ?`);
    }
    return this.stmts.deleteTurnsBySession;
  }

  private getDeleteWorktreesBySessionStmt(): Statement {
    if (!this.stmts.deleteWorktreesBySession) {
      this.stmts.deleteWorktreesBySession = this.db.prepare(
        `DELETE FROM worktrees WHERE parent_session_id = ?`
      );
    }
    return this.stmts.deleteWorktreesBySession;
  }

  private getDeleteSessionStmt(): Statement {
    if (!this.stmts.deleteSession) {
      this.stmts.deleteSession = this.db.prepare(`DELETE FROM sessions WHERE id = ?`);
    }
    return this.stmts.deleteSession;
  }

  // ────────────────────────────────────────────────────────────
  // v0.7.0 (F-026) — FTS5 sync helpers
  // ────────────────────────────────────────────────────────────

  /**
   * Insert one row into `turns_fts` if the turn has indexable text.
   *
   * Called from inside an existing transaction (appendTurn / insertTurns) so
   * the turns row and the FTS row are committed atomically. No-op when FTS5
   * is unavailable or extracted text is empty.
   */
  private indexTurnFts(sessionId: string, turn: Turn): void {
    if (!this.fts5Enabled) return;
    const body = extractTurnText(turn.content);
    if (body.length === 0) return;
    this.db
      .prepare(
        `INSERT INTO turns_fts(turn_id, session_id, role, body) VALUES (?, ?, ?, ?)`
      )
      .run(turn.id, sessionId, turn.role, body);
  }

  /**
   * Drop all FTS5 entries for a session. Called from clearTurns +
   * deleteSession. No-op when FTS5 is unavailable.
   */
  private deleteTurnsFtsForSession(sessionId: string): void {
    if (!this.fts5Enabled) return;
    this.db.prepare(`DELETE FROM turns_fts WHERE session_id = ?`).run(sessionId);
  }

  /**
   * FTS5 search path. Wraps the input as a phrase query (`"..."`) so user
   * spaces don't accidentally produce boolean AND/OR semantics. Quotes in
   * the input are doubled per FTS5 escaping rules.
   *
   * BM25 rank: lower number = better match. Results joined to `turns` for
   * the timestamp (used by Sidebar to show relative time).
   */
  private searchTurnsFTS5(q: string, limit: number): TurnSearchResult[] {
    const escaped = q.replace(/"/g, '""');
    const ftsQuery = `"${escaped}"`;
    const rows = this.db
      .prepare(
        `SELECT
           f.turn_id  AS turn_id,
           f.session_id AS session_id,
           f.role     AS role,
           snippet(turns_fts, 3, '<mark>', '</mark>', '…', 24) AS snippet,
           rank       AS rank,
           t.timestamp AS timestamp
         FROM turns_fts f
         INNER JOIN turns t ON t.id = f.turn_id
         WHERE turns_fts MATCH ?
         ORDER BY rank
         LIMIT ?`
      )
      .all(ftsQuery, limit) as TurnSearchResult[];
    return rows;
  }

  /**
   * LIKE fallback when FTS5 is unavailable. Searches the raw content_json,
   * which contains the same human text plus JSON wrapper bytes — false
   * positives (matching e.g. `"text":` literally) are unlikely for typical
   * user queries but possible.
   *
   * Snippet is built via `substr` around the first match position. timestamp
   * DESC is the closest analog to BM25 ordering ("most recent first").
   */
  private searchTurnsLike(q: string, limit: number): TurnSearchResult[] {
    const like = `%${q}%`;
    const rows = this.db
      .prepare(
        `SELECT
           id   AS turn_id,
           session_id,
           role,
           substr(content_json, max(1, instr(content_json, ?) - 20), 80) AS snippet,
           0    AS rank,
           timestamp
         FROM turns
         WHERE content_json LIKE ?
         ORDER BY timestamp DESC
         LIMIT ?`
      )
      .all(q, like, limit) as TurnSearchResult[];
    return rows;
  }

  /**
   * Test-only escape hatch — lets a test simulate "FTS5 unavailable" without
   * a custom build. Marked `@internal`; not exported via storage/index.ts.
   * @internal
   */
  __forceLikeFallbackForTests(): void {
    (this as unknown as { fts5Enabled: boolean }).fts5Enabled = false;
  }
}
