/**
 * AuditLogStore — append-only audit trail for permission decisions and
 * tool_use outcomes (v1.0.11 SEC-3).
 *
 * Spec: docs/v1.x-roadmap.md (SEC-3), 001_init.sql (audit_log table)
 *
 * 격리
 * ────
 *  - Main process 전용 — better-sqlite3 import 때문에 renderer 에서 import X.
 *  - SessionStore.getDb() 의 동일 connection 을 공유해 WAL/FK 일관성 유지.
 *
 * Invariants
 * ──────────
 *  INV-1: append-only — recordEvent 만 INSERT. 읽기 전용 메서드만 노출.
 *  INV-2: timestamp 는 ISO8601 (호출자가 만든 값 그대로). DB index 는 timestamp DESC.
 *  INV-3: target_json 는 caller 가 이미 JSON-stringified — 이중 직렬화 방지.
 *  INV-4: id 는 INTEGER AUTOINCREMENT — schema 그대로 (architectural debt B-2 의
 *         일부, v1.3.x 에서 TEXT promote 예정).
 *
 * 흐름
 * ────
 *  ToolQueue 의 audit_sink → main/index.ts 의 closure → AuditLogStore.recordEvent
 *  SessionStore.insertGrants → main/index.ts 의 closure → AuditLogStore.recordEvent
 *
 * Storage layer ↔ tools layer 가 직접 의존하지 않도록 sink callback 패턴.
 */

import type { Database, Statement } from 'better-sqlite3';

// ────────────────────────────────────────────────────────────
// Public types
// ────────────────────────────────────────────────────────────

/**
 * 표준 event 이름. ToolQueue 가 emitAudit 할 때 사용. enum 대신 string union
 * 으로 future-proof — 새 event 추가 시 tools 모듈에서만 변경, storage 는 그대로.
 *
 * 기록 대상:
 *  - tool_use.success     : ToolQueue 가 success 결과 build 직후
 *  - tool_use.failed      : 실행 에러, INVALID_INPUT, TOOL_NOT_FOUND, SESSION_NOT_FOUND
 *  - tool_use.cancelled   : 사용자/turn 취소
 *  - tool_use.timeout     : timeout abort
 *  - permission.denied    : Queue.checkPermissions 가 차단 (level/grant/danger)
 *  - permission.granted   : SessionStore.insertGrants 가 새 grant 영속
 */
export type AuditEventName =
  | 'tool_use.success'
  | 'tool_use.failed'
  | 'tool_use.cancelled'
  | 'tool_use.timeout'
  | 'permission.denied'
  | 'permission.granted'
  | string;

export interface AuditEventInput {
  timestamp: string;
  session_id: string;
  turn_id?: string;
  event: AuditEventName;
  capability: string;
  /** caller-provided JSON. side_effects[] / ResolvedTarget / grant.target — 모두 이미 stringified. */
  target_json: string;
  decision_reason: string;
  ai_model?: string;
  ai_reason?: string;
  outcome?: string;
  error?: string;
}

export interface AuditEvent extends AuditEventInput {
  id: number;
}

export interface AuditQueryFilter {
  /** ISO8601 inclusive lower bound. */
  from?: string;
  /** ISO8601 exclusive upper bound. */
  to?: string;
  session_id?: string;
  capability?: string;
  /** prefix match — 'tool_use.' 로 모든 tool_use.* 조회 가능. */
  event_prefix?: string;
}

// ────────────────────────────────────────────────────────────
// DB row shapes (internal)
// ────────────────────────────────────────────────────────────

interface AuditRow {
  id: number;
  timestamp: string;
  session_id: string;
  turn_id: string | null;
  event: string;
  capability: string;
  target_json: string;
  decision_reason: string;
  ai_model: string | null;
  ai_reason: string | null;
  outcome: string | null;
  error: string | null;
}

function rowToEvent(row: AuditRow): AuditEvent {
  const out: AuditEvent = {
    id: row.id,
    timestamp: row.timestamp,
    session_id: row.session_id,
    event: row.event,
    capability: row.capability,
    target_json: row.target_json,
    decision_reason: row.decision_reason,
  };
  if (row.turn_id !== null) out.turn_id = row.turn_id;
  if (row.ai_model !== null) out.ai_model = row.ai_model;
  if (row.ai_reason !== null) out.ai_reason = row.ai_reason;
  if (row.outcome !== null) out.outcome = row.outcome;
  if (row.error !== null) out.error = row.error;
  return out;
}

// ────────────────────────────────────────────────────────────
// AuditLogStore
// ────────────────────────────────────────────────────────────

export class AuditLogStore {
  private readonly db: Database;
  private readonly insertStmt: Statement<[
    string,
    string,
    string | null,
    string,
    string,
    string,
    string,
    string | null,
    string | null,
    string | null,
    string | null,
  ]>;

  constructor(db: Database) {
    this.db = db;
    this.insertStmt = db.prepare(
      `INSERT INTO audit_log (
        timestamp, session_id, turn_id, event, capability, target_json,
        decision_reason, ai_model, ai_reason, outcome, error
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    );
  }

  // ── write ─────────────────────────────────────────────────────

  /**
   * 새 audit event 1건 영속.
   *
   * 모든 필드는 caller 가 valid 하다고 가정 — Queue / SessionStore 가 이미 검증.
   * timestamp 빈 문자열만 방어 (DB index 가 의미 있게 동작하도록).
   *
   * 반환값은 lastInsertRowid 로 만든 row id — 같은 connection 내 deterministic.
   */
  recordEvent(input: AuditEventInput): number {
    if (input.timestamp.length === 0) {
      throw new Error('AuditLogStore.recordEvent: timestamp must be non-empty');
    }
    if (input.session_id.length === 0) {
      throw new Error('AuditLogStore.recordEvent: session_id must be non-empty');
    }
    if (input.event.length === 0) {
      throw new Error('AuditLogStore.recordEvent: event must be non-empty');
    }
    const info = this.insertStmt.run(
      input.timestamp,
      input.session_id,
      input.turn_id ?? null,
      input.event,
      input.capability,
      input.target_json,
      input.decision_reason,
      input.ai_model ?? null,
      input.ai_reason ?? null,
      input.outcome ?? null,
      input.error ?? null
    );
    // better-sqlite3 returns bigint when rowid > 2^32; 우리 INTEGER PK 는 충분히 안전.
    return Number(info.lastInsertRowid);
  }

  // ── read ──────────────────────────────────────────────────────

  /**
   * 최근 audit event N개. timestamp DESC, id DESC tiebreak.
   *
   * limit <= 0 → 빈 배열. limit > 1000 → 1000 으로 clamp (UI viewer 용).
   * filter 미지정 시 전체 기간/모든 세션.
   */
  getRecent(limit: number, filter: AuditQueryFilter = {}): AuditEvent[] {
    if (limit <= 0) return [];
    const clamped = Math.min(Math.floor(limit), 1000);

    const wheres: string[] = [];
    const params: unknown[] = [];
    if (filter.from !== undefined) {
      wheres.push('timestamp >= ?');
      params.push(filter.from);
    }
    if (filter.to !== undefined) {
      wheres.push('timestamp < ?');
      params.push(filter.to);
    }
    if (filter.session_id !== undefined) {
      wheres.push('session_id = ?');
      params.push(filter.session_id);
    }
    if (filter.capability !== undefined) {
      wheres.push('capability = ?');
      params.push(filter.capability);
    }
    if (filter.event_prefix !== undefined) {
      wheres.push('event LIKE ?');
      // SQL escape — '%'/'_' 가 prefix 안에 있으면 의도와 다른 매칭. 우리 caller
      // (UI 필터) 는 'tool_use.' 같은 dot-prefix 만 보내므로 LIKE 직결로 충분.
      params.push(`${filter.event_prefix}%`);
    }
    const whereSql = wheres.length > 0 ? `WHERE ${wheres.join(' AND ')}` : '';
    const sql = `
      SELECT id, timestamp, session_id, turn_id, event, capability, target_json,
             decision_reason, ai_model, ai_reason, outcome, error
      FROM audit_log
      ${whereSql}
      ORDER BY timestamp DESC, id DESC
      LIMIT ?
    `;
    const rows = this.db.prepare(sql).all(...params, clamped) as AuditRow[];
    return rows.map(rowToEvent);
  }

  /**
   * 단일 세션의 모든 audit event — 시간 순서 (오래된 것 먼저).
   *
   * 디버그 / "이 세션에서 무슨 일이 있었나" 분석용. 결과는 timestamp ASC, id ASC.
   */
  getBySession(sessionId: string, limit: number = 500): AuditEvent[] {
    if (sessionId.length === 0) return [];
    const clamped = Math.max(1, Math.min(Math.floor(limit), 5000));
    const rows = this.db
      .prepare(
        `SELECT id, timestamp, session_id, turn_id, event, capability, target_json,
                decision_reason, ai_model, ai_reason, outcome, error
         FROM audit_log
         WHERE session_id = ?
         ORDER BY timestamp ASC, id ASC
         LIMIT ?`
      )
      .all(sessionId, clamped) as AuditRow[];
    return rows.map(rowToEvent);
  }

  /** 총 count — UI 페이지네이션 용. */
  count(filter: AuditQueryFilter = {}): number {
    const wheres: string[] = [];
    const params: unknown[] = [];
    if (filter.from !== undefined) {
      wheres.push('timestamp >= ?');
      params.push(filter.from);
    }
    if (filter.to !== undefined) {
      wheres.push('timestamp < ?');
      params.push(filter.to);
    }
    if (filter.session_id !== undefined) {
      wheres.push('session_id = ?');
      params.push(filter.session_id);
    }
    if (filter.capability !== undefined) {
      wheres.push('capability = ?');
      params.push(filter.capability);
    }
    if (filter.event_prefix !== undefined) {
      wheres.push('event LIKE ?');
      params.push(`${filter.event_prefix}%`);
    }
    const whereSql = wheres.length > 0 ? `WHERE ${wheres.join(' AND ')}` : '';
    const row = this.db
      .prepare(`SELECT COUNT(*) AS c FROM audit_log ${whereSql}`)
      .get(...params) as { c: number };
    return row.c;
  }
}
