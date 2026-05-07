/**
 * CompareStore — persistence for v0.12.0 Cross-AI Verify/Compare runs.
 *
 * Spec: ROADMAP.md (v0.12.0 I — Cross-AI Verify/Compare MVP)
 *
 * 격리
 * ────
 *   - Main process 전용 — better-sqlite3 import 때문에 renderer 에서 import X.
 *   - SessionStore.getDb() 의 동일 connection 을 공유해 WAL/FK 일관성 유지.
 *   - usage_events 와 동일하게 sessions 와 FK 를 의도적으로 두지 않는다 —
 *     compare 가 dangling 되어도 (예: 세션 삭제 후 cleanup 이 늦었을 때)
 *     기록 자체는 보존돼야 한다.
 *
 * Invariants
 * ──────────
 *   INV-1: id 는 UUIDv7 — 시간 정렬 가능.
 *   INV-2: 한 row 가 항상 양쪽 (claude / codex) 의 상태를 함께 보유. 양쪽이
 *          모두 terminal 이 됐을 때 finalizeRun 이 overall status 결정.
 *   INV-3: status ∈ {'running', 'completed', 'failed'}.
 *   INV-4: side status ∈ {'pending', 'streaming', 'done', 'error', 'skipped'}.
 *   INV-5: text 는 누적된 assistant 텍스트. 빈 문자열은 valid (error / skipped
 *          시에도 빈 문자열). NULL 은 row 가 막 만들어진 직후만.
 */

import type { Database, Statement } from 'better-sqlite3';
import { v7 as uuidv7 } from 'uuid';
import type { PermissionLevel } from '@/types/permission';

// ────────────────────────────────────────────────────────────
// Public types
// ────────────────────────────────────────────────────────────

export type CompareRunStatus = 'running' | 'completed' | 'failed';

export type CompareSideStatus = 'pending' | 'streaming' | 'done' | 'error' | 'skipped';

/**
 * 한 side (claude 또는 codex) 의 streaming 상태 + 누적 결과.
 *
 * `text` 는 누적된 assistant 텍스트 (text_delta 들의 합). `error` 는 사용자에게
 * 표시할 한국어/영어 메시지로, error / skipped 상태에서만 의미 있다.
 */
export interface CompareSideResult {
  status: CompareSideStatus;
  model: string | null;
  text: string;
  error: string | null;
  started_at: string | null;
  finished_at: string | null;
}

export interface CompareRun {
  id: string;
  session_id: string;
  prompt: string;
  workspace_root: string;
  permission_level: PermissionLevel;
  created_at: string;
  status: CompareRunStatus;
  claude: CompareSideResult;
  codex: CompareSideResult;
}

export interface CompareRunCreateArgs {
  session_id: string;
  prompt: string;
  workspace_root: string;
  permission_level: PermissionLevel;
  claude_model: string;
  codex_model: string;
}

export type CompareSide = 'claude' | 'codex';

/**
 * Partial patch applied to one side. Any subset of fields may be set; absent
 * fields are left unchanged. Setting `text` REPLACES the accumulated text —
 * orchestrator typically does this to keep the row in sync with its in-memory
 * accumulator after each delta.
 */
export interface CompareSidePatch {
  status?: CompareSideStatus;
  model?: string | null;
  text?: string;
  error?: string | null;
  started_at?: string | null;
  finished_at?: string | null;
}

// ────────────────────────────────────────────────────────────
// DB row shape (internal)
// ────────────────────────────────────────────────────────────

interface CompareRunRow {
  id: string;
  session_id: string;
  prompt: string;
  workspace_root: string;
  permission_level: string;
  created_at: string;
  status: string;
  claude_status: string | null;
  claude_model: string | null;
  claude_text: string | null;
  claude_error: string | null;
  claude_started_at: string | null;
  claude_finished_at: string | null;
  codex_status: string | null;
  codex_model: string | null;
  codex_text: string | null;
  codex_error: string | null;
  codex_started_at: string | null;
  codex_finished_at: string | null;
}

// ────────────────────────────────────────────────────────────
// Helpers
// ────────────────────────────────────────────────────────────

const RUN_STATUSES: ReadonlySet<CompareRunStatus> = new Set(['running', 'completed', 'failed']);

const SIDE_STATUSES: ReadonlySet<CompareSideStatus> = new Set([
  'pending',
  'streaming',
  'done',
  'error',
  'skipped',
]);

const PERMISSION_LEVELS: ReadonlySet<PermissionLevel> = new Set([
  'read_only',
  'workspace_write',
  'full_access',
  'custom',
]);

function parseRunStatus(s: string): CompareRunStatus {
  return RUN_STATUSES.has(s as CompareRunStatus) ? (s as CompareRunStatus) : 'running';
}

function parseSideStatus(s: string | null): CompareSideStatus {
  if (s === null) return 'pending';
  return SIDE_STATUSES.has(s as CompareSideStatus) ? (s as CompareSideStatus) : 'pending';
}

function parsePermissionLevel(s: string): PermissionLevel {
  return PERMISSION_LEVELS.has(s as PermissionLevel) ? (s as PermissionLevel) : 'workspace_write';
}

function rowToRun(row: CompareRunRow): CompareRun {
  return {
    id: row.id,
    session_id: row.session_id,
    prompt: row.prompt,
    workspace_root: row.workspace_root,
    permission_level: parsePermissionLevel(row.permission_level),
    created_at: row.created_at,
    status: parseRunStatus(row.status),
    claude: {
      status: parseSideStatus(row.claude_status),
      model: row.claude_model,
      text: row.claude_text ?? '',
      error: row.claude_error,
      started_at: row.claude_started_at,
      finished_at: row.claude_finished_at,
    },
    codex: {
      status: parseSideStatus(row.codex_status),
      model: row.codex_model,
      text: row.codex_text ?? '',
      error: row.codex_error,
      started_at: row.codex_started_at,
      finished_at: row.codex_finished_at,
    },
  };
}

/**
 * 양쪽 status 를 보고 overall status 를 결정.
 *
 *   - 한쪽이라도 streaming/pending → 'running'
 *   - 둘 다 done → 'completed'
 *   - 둘 다 error → 'failed'
 *   - 한쪽 done + 한쪽 error/skipped → 'completed' (실패 격리: 한쪽 결과로 OK)
 *   - 그 외 (불완전 transition) → 'running' default
 */
function deriveOverallStatus(
  claude: CompareSideStatus,
  codex: CompareSideStatus
): CompareRunStatus {
  const terminal = (s: CompareSideStatus): boolean =>
    s === 'done' || s === 'error' || s === 'skipped';
  if (!terminal(claude) || !terminal(codex)) return 'running';
  // 양쪽 모두 terminal — 적어도 한쪽이 done 이면 completed.
  if (claude === 'done' || codex === 'done') return 'completed';
  // 양쪽 모두 error / skipped 면 failed.
  return 'failed';
}

// ────────────────────────────────────────────────────────────
// CompareStore
// ────────────────────────────────────────────────────────────

export class CompareStore {
  private readonly db: Database;

  private readonly insertStmt: Statement;
  private readonly selectStmt: Statement;
  private readonly listStmt: Statement;
  private readonly deleteStmt: Statement;
  private readonly setOverallStatusStmt: Statement;

  constructor(db: Database) {
    this.db = db;
    this.insertStmt = db.prepare(
      `INSERT INTO compare_runs (
        id, session_id, prompt, workspace_root, permission_level,
        created_at, status,
        claude_status, claude_model, claude_text, claude_error,
        claude_started_at, claude_finished_at,
        codex_status, codex_model, codex_text, codex_error,
        codex_started_at, codex_finished_at
      ) VALUES (
        @id, @session_id, @prompt, @workspace_root, @permission_level,
        @created_at, @status,
        @claude_status, @claude_model, @claude_text, @claude_error,
        @claude_started_at, @claude_finished_at,
        @codex_status, @codex_model, @codex_text, @codex_error,
        @codex_started_at, @codex_finished_at
      )`
    );
    this.selectStmt = db.prepare(`SELECT * FROM compare_runs WHERE id = ?`);
    this.listStmt = db.prepare(
      `SELECT * FROM compare_runs WHERE session_id = ?
       ORDER BY created_at DESC LIMIT ?`
    );
    this.deleteStmt = db.prepare(`DELETE FROM compare_runs WHERE id = ?`);
    this.setOverallStatusStmt = db.prepare(`UPDATE compare_runs SET status = ? WHERE id = ?`);
  }

  // ── write ─────────────────────────────────────────────────────

  /**
   * 새 compare run 1건 영속. 양쪽 side 는 'pending' 상태로 초기화.
   *
   * 사전 검증:
   *   - session_id / prompt / workspace_root / *_model 은 모두 non-empty
   *   - permission_level 은 valid enum
   *
   * 반환된 row 는 in-memory representation — DB row 와 동일.
   */
  createRun(args: CompareRunCreateArgs): CompareRun {
    if (args.session_id.length === 0) {
      throw new Error('CompareStore.createRun: session_id must be non-empty');
    }
    if (args.prompt.length === 0) {
      throw new Error('CompareStore.createRun: prompt must be non-empty');
    }
    if (args.workspace_root.length === 0) {
      throw new Error('CompareStore.createRun: workspace_root must be non-empty');
    }
    if (!PERMISSION_LEVELS.has(args.permission_level)) {
      throw new Error(
        `CompareStore.createRun: invalid permission_level '${args.permission_level}'`
      );
    }
    if (args.claude_model.length === 0) {
      throw new Error('CompareStore.createRun: claude_model must be non-empty');
    }
    if (args.codex_model.length === 0) {
      throw new Error('CompareStore.createRun: codex_model must be non-empty');
    }

    const id = uuidv7();
    const now = new Date().toISOString();

    this.insertStmt.run({
      id,
      session_id: args.session_id,
      prompt: args.prompt,
      workspace_root: args.workspace_root,
      permission_level: args.permission_level,
      created_at: now,
      status: 'running' satisfies CompareRunStatus,
      claude_status: 'pending' satisfies CompareSideStatus,
      claude_model: args.claude_model,
      claude_text: '',
      claude_error: null,
      claude_started_at: null,
      claude_finished_at: null,
      codex_status: 'pending' satisfies CompareSideStatus,
      codex_model: args.codex_model,
      codex_text: '',
      codex_error: null,
      codex_started_at: null,
      codex_finished_at: null,
    });

    return {
      id,
      session_id: args.session_id,
      prompt: args.prompt,
      workspace_root: args.workspace_root,
      permission_level: args.permission_level,
      created_at: now,
      status: 'running',
      claude: {
        status: 'pending',
        model: args.claude_model,
        text: '',
        error: null,
        started_at: null,
        finished_at: null,
      },
      codex: {
        status: 'pending',
        model: args.codex_model,
        text: '',
        error: null,
        started_at: null,
        finished_at: null,
      },
    };
  }

  /**
   * 한 side (claude 또는 codex) 의 부분 patch 적용. 미지정 필드는 변경 없음.
   *
   * Patch 의 `text` 는 REPLACE 시맨틱 — append 가 아니다. 호출자 (orchestrator)
   * 가 자체 누적 버퍼를 보유하다 매 delta 마다 통째로 저장한다.
   */
  updateSide(runId: string, side: CompareSide, patch: CompareSidePatch): void {
    if (runId.length === 0) {
      throw new Error('CompareStore.updateSide: runId must be non-empty');
    }
    if (side !== 'claude' && side !== 'codex') {
      throw new Error(`CompareStore.updateSide: invalid side '${side}'`);
    }
    const fields: string[] = [];
    const values: unknown[] = [];
    if (patch.status !== undefined) {
      if (!SIDE_STATUSES.has(patch.status)) {
        throw new Error(`CompareStore.updateSide: invalid status '${patch.status}'`);
      }
      fields.push(`${side}_status = ?`);
      values.push(patch.status);
    }
    if (patch.model !== undefined) {
      fields.push(`${side}_model = ?`);
      values.push(patch.model);
    }
    if (patch.text !== undefined) {
      fields.push(`${side}_text = ?`);
      values.push(patch.text);
    }
    if (patch.error !== undefined) {
      fields.push(`${side}_error = ?`);
      values.push(patch.error);
    }
    if (patch.started_at !== undefined) {
      fields.push(`${side}_started_at = ?`);
      values.push(patch.started_at);
    }
    if (patch.finished_at !== undefined) {
      fields.push(`${side}_finished_at = ?`);
      values.push(patch.finished_at);
    }
    if (fields.length === 0) return;
    values.push(runId);
    const sql = `UPDATE compare_runs SET ${fields.join(', ')} WHERE id = ?`;
    this.db.prepare(sql).run(...values);
  }

  /**
   * 양쪽 side 의 status 를 본 후 overall status 를 결정해 영속.
   *
   * 양쪽이 아직 terminal 이 아니면 'running' 으로 유지. 한쪽이라도 done 이면
   * 'completed', 둘 다 error/skipped 면 'failed'. 결과 row 를 반환.
   */
  finalizeRun(runId: string): CompareRun {
    const run = this.getRun(runId);
    if (run === null) {
      throw new Error(`CompareStore.finalizeRun: run ${runId} not found`);
    }
    const overall = deriveOverallStatus(run.claude.status, run.codex.status);
    if (overall !== run.status) {
      this.setOverallStatusStmt.run(overall, runId);
    }
    return { ...run, status: overall };
  }

  /**
   * 한 row 삭제. 존재하지 않는 id 는 silent no-op (DELETE 의 자연스러운 의미).
   */
  deleteRun(runId: string): void {
    if (runId.length === 0) return;
    this.deleteStmt.run(runId);
  }

  // ── read ──────────────────────────────────────────────────────

  getRun(runId: string): CompareRun | null {
    if (runId.length === 0) return null;
    const row = this.selectStmt.get(runId) as CompareRunRow | undefined;
    if (row === undefined) return null;
    return rowToRun(row);
  }

  /**
   * 한 세션에 속한 compare run 을 created_at DESC 순서로 반환.
   *
   * limit 은 양수. 0 이하 또는 NaN 은 default 20.
   */
  listBySession(sessionId: string, limit = 20): CompareRun[] {
    if (sessionId.length === 0) return [];
    const safeLimit =
      typeof limit === 'number' && Number.isFinite(limit) && limit > 0 ? Math.floor(limit) : 20;
    const rows = this.listStmt.all(sessionId, safeLimit) as CompareRunRow[];
    return rows.map(rowToRun);
  }
}
