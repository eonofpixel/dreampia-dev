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
  id: number;
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

// ────────────────────────────────────────────────────────────
// SessionStore
// ────────────────────────────────────────────────────────────

export class SessionStore {
  private readonly db: DatabaseT;

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
    this.db = new Database(dbPath);

    // Pragmas BEFORE migrations: WAL must be set on a non-empty DB but
    // foreign_keys etc. are session-level and apply immediately.
    this.db.pragma('journal_mode = WAL');
    this.db.pragma('synchronous = NORMAL');
    this.db.pragma('cache_size = -64000');
    this.db.pragma('mmap_size = 268435456');
    this.db.pragma('foreign_keys = ON');

    migrate(this.db);
  }

  // ────────────────────────────────────────────────────────────
  // Lifecycle
  // ────────────────────────────────────────────────────────────

  close(): void {
    this.db.close();
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
      this.stmts.insertSession = this.db.prepare(
        `INSERT INTO sessions
         (id, schema_version, provider, workspace_id, title, pinned, archived,
          parent_session_id, created_at, updated_at, metadata_json)
         VALUES (@id, @schema_version, @provider, @workspace_id, @title, @pinned, @archived,
                 @parent_session_id, @created_at, @updated_at, @metadata_json)`
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
    }
  }

  private insertGrants(s: Session): void {
    const grants = s.permission.grants;
    if (grants.length === 0) return;

    if (!this.stmts.insertGrant) {
      this.stmts.insertGrant = this.db.prepare(
        `INSERT INTO permission_grants
         (session_id, capability, target_json, granted_at, granted_by, expires_at, revoked_at, reason, scope)
         VALUES (@session_id, @capability, @target_json, @granted_at, @granted_by, @expires_at, @revoked_at, @reason, @scope)`
      );
    }

    for (const g of grants) {
      this.stmts.insertGrant.run({
        session_id: s.id,
        capability: g.capability,
        target_json: JSON.stringify({ id: g.id, target: g.target }),
        granted_at: g.granted_at,
        granted_by: g.granted_by,
        expires_at: g.expires_at ?? null,
        revoked_at: g.revoked_at ?? null,
        reason: g.reason ?? null,
        scope: g.scope,
      });
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
    const conversation = this.loadConversation(row.id, meta._extra.conversation);
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
      const g: Record<string, unknown> = {
        id: wrap.id,
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
}
