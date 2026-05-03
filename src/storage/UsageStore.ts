/**
 * UsageStore — append-only token / cost telemetry persistence.
 *
 * Spec: ROADMAP.md (v0.4.0 Usage/Cost Tracking MVP)
 *
 * 격리
 * ────
 *  - Main process 전용 — better-sqlite3 import 때문에 renderer 에서 import X.
 *  - SessionStore.getDb() 의 동일 connection 을 공유해 WAL/FK 일관성 유지.
 *
 * Invariants
 * ──────────
 *  INV-1: append-only — recordEvent 만 INSERT. 읽기 전용 메서드만 노출.
 *  INV-2: input/output/cache/reasoning tokens 는 모두 NOT NULL DEFAULT 0
 *         (DB 레벨), 코드 레벨에선 number type + Math.max(0, ...) 로 음수 방지.
 *  INV-3: id 는 UUIDv7 — 시간 정렬 가능.
 *  INV-4: total_cost_usd 는 USD 6자리 round (pricing.ts).
 */

import type { Database, Statement } from 'better-sqlite3';
import { v7 as uuidv7 } from 'uuid';

// ────────────────────────────────────────────────────────────
// Public types
// ────────────────────────────────────────────────────────────

export type UsageProvider = 'claude' | 'codex' | 'mock';

export interface UsageEventInput {
  session_id: string;
  turn_id: string;
  provider: UsageProvider;
  model: string;
  input_tokens: number;
  output_tokens: number;
  cache_creation_input_tokens?: number;
  cache_read_input_tokens?: number;
  reasoning_output_tokens?: number;
  total_cost_usd: number;
  recorded_at: string;
  source?: string;
}

/**
 * Persisted usage event row. cache / reasoning 토큰은 DB 컬럼이 NOT NULL
 * DEFAULT 0 이므로 read 시 항상 number — 입력 type 의 optional 을 의도적으로
 * required 로 좁힌다.
 */
export interface UsageEvent {
  id: string;
  session_id: string;
  turn_id: string;
  provider: UsageProvider;
  model: string;
  input_tokens: number;
  output_tokens: number;
  cache_creation_input_tokens: number;
  cache_read_input_tokens: number;
  reasoning_output_tokens: number;
  total_cost_usd: number;
  recorded_at: string;
  source?: string;
}

export interface UsageRangeFilter {
  /** ISO 8601, inclusive lower bound. 미지정 시 limit 없음. */
  from?: string;
  /** ISO 8601, exclusive upper bound. 미지정 시 limit 없음. */
  to?: string;
  provider?: UsageProvider;
  model?: string;
  session_id?: string;
}

export interface UsageSummary {
  provider: UsageProvider;
  model: string;
  total_input: number;
  total_output: number;
  total_cache_creation: number;
  total_cache_read: number;
  total_reasoning: number;
  total_cost_usd: number;
  event_count: number;
}

export interface DailyUsageRow {
  /** YYYY-MM-DD UTC. */
  date: string;
  provider: UsageProvider;
  total_cost_usd: number;
  total_tokens: number;
}

// ────────────────────────────────────────────────────────────
// DB row shapes (internal)
// ────────────────────────────────────────────────────────────

interface UsageEventRow {
  id: string;
  session_id: string;
  turn_id: string;
  provider: string;
  model: string;
  input_tokens: number;
  output_tokens: number;
  cache_creation_input_tokens: number;
  cache_read_input_tokens: number;
  reasoning_output_tokens: number;
  total_cost_usd: number;
  recorded_at: string;
  source: string | null;
}

interface SummaryRow {
  provider: string;
  model: string;
  total_input: number;
  total_output: number;
  total_cache_creation: number;
  total_cache_read: number;
  total_reasoning: number;
  total_cost_usd: number;
  event_count: number;
}

interface DailyRow {
  date: string;
  provider: string;
  total_cost_usd: number;
  total_tokens: number;
}

// ────────────────────────────────────────────────────────────
// UsageStore
// ────────────────────────────────────────────────────────────

const PROVIDERS: ReadonlySet<string> = new Set(['claude', 'codex', 'mock']);

function clampInt(v: number | undefined): number {
  if (typeof v !== 'number' || !Number.isFinite(v)) return 0;
  return Math.max(0, Math.floor(v));
}

function rowToEvent(row: UsageEventRow): UsageEvent {
  const provider: UsageProvider = PROVIDERS.has(row.provider)
    ? (row.provider as UsageProvider)
    : 'mock';
  const evt: UsageEvent = {
    id: row.id,
    session_id: row.session_id,
    turn_id: row.turn_id,
    provider,
    model: row.model,
    input_tokens: row.input_tokens,
    output_tokens: row.output_tokens,
    cache_creation_input_tokens: row.cache_creation_input_tokens,
    cache_read_input_tokens: row.cache_read_input_tokens,
    reasoning_output_tokens: row.reasoning_output_tokens,
    total_cost_usd: row.total_cost_usd,
    recorded_at: row.recorded_at,
  };
  if (row.source !== null) evt.source = row.source;
  return evt;
}

export class UsageStore {
  private readonly db: Database;
  private readonly insertStmt: Statement<[
    string, string, string, string, string,
    number, number, number, number, number,
    number, string, string | null,
  ]>;

  constructor(db: Database) {
    this.db = db;
    this.insertStmt = db.prepare(
      `INSERT INTO usage_events (
        id, session_id, turn_id, provider, model,
        input_tokens, output_tokens, cache_creation_input_tokens,
        cache_read_input_tokens, reasoning_output_tokens,
        total_cost_usd, recorded_at, source
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    );
  }

  // ── write ─────────────────────────────────────────────────────

  /**
   * 새 usage event 1건 영속.
   *
   * 음수 토큰은 0 으로 clamp. 가격은 호출자가 이미 round 했어야 함.
   * 반환값은 영속된 row (id 포함) — 테스트 / 디버그용.
   */
  recordEvent(input: UsageEventInput): UsageEvent {
    if (!PROVIDERS.has(input.provider)) {
      throw new Error(`UsageStore.recordEvent: invalid provider '${input.provider}'`);
    }
    if (input.session_id.length === 0) {
      throw new Error('UsageStore.recordEvent: session_id must be non-empty');
    }
    if (input.turn_id.length === 0) {
      throw new Error('UsageStore.recordEvent: turn_id must be non-empty');
    }
    if (input.model.length === 0) {
      throw new Error('UsageStore.recordEvent: model must be non-empty');
    }
    if (input.recorded_at.length === 0) {
      throw new Error('UsageStore.recordEvent: recorded_at must be non-empty');
    }

    const id = uuidv7();
    const row: UsageEvent = {
      id,
      session_id: input.session_id,
      turn_id: input.turn_id,
      provider: input.provider,
      model: input.model,
      input_tokens: clampInt(input.input_tokens),
      output_tokens: clampInt(input.output_tokens),
      cache_creation_input_tokens: clampInt(input.cache_creation_input_tokens),
      cache_read_input_tokens: clampInt(input.cache_read_input_tokens),
      reasoning_output_tokens: clampInt(input.reasoning_output_tokens),
      total_cost_usd:
        typeof input.total_cost_usd === 'number' && Number.isFinite(input.total_cost_usd)
          ? Math.max(0, input.total_cost_usd)
          : 0,
      recorded_at: input.recorded_at,
    };
    if (input.source !== undefined) row.source = input.source;

    this.insertStmt.run(
      row.id,
      row.session_id,
      row.turn_id,
      row.provider,
      row.model,
      row.input_tokens,
      row.output_tokens,
      row.cache_creation_input_tokens,
      row.cache_read_input_tokens,
      row.reasoning_output_tokens,
      row.total_cost_usd,
      row.recorded_at,
      row.source ?? null
    );
    return row;
  }

  // ── read ──────────────────────────────────────────────────────

  /**
   * Provider + model 별 누적 합계.
   *
   * range.from / to 미지정 시 전체 기간. provider / model / session_id 미지정
   * 시 전체. 결과는 total_cost_usd DESC, model ASC.
   */
  getSummary(range: UsageRangeFilter = {}): UsageSummary[] {
    const wheres: string[] = [];
    const params: unknown[] = [];
    if (range.from !== undefined) {
      wheres.push('recorded_at >= ?');
      params.push(range.from);
    }
    if (range.to !== undefined) {
      wheres.push('recorded_at < ?');
      params.push(range.to);
    }
    if (range.provider !== undefined) {
      wheres.push('provider = ?');
      params.push(range.provider);
    }
    if (range.model !== undefined) {
      wheres.push('model = ?');
      params.push(range.model);
    }
    if (range.session_id !== undefined) {
      wheres.push('session_id = ?');
      params.push(range.session_id);
    }
    const whereSql = wheres.length > 0 ? `WHERE ${wheres.join(' AND ')}` : '';
    const sql = `
      SELECT
        provider,
        model,
        COALESCE(SUM(input_tokens), 0)                AS total_input,
        COALESCE(SUM(output_tokens), 0)               AS total_output,
        COALESCE(SUM(cache_creation_input_tokens), 0) AS total_cache_creation,
        COALESCE(SUM(cache_read_input_tokens), 0)     AS total_cache_read,
        COALESCE(SUM(reasoning_output_tokens), 0)     AS total_reasoning,
        COALESCE(SUM(total_cost_usd), 0)              AS total_cost_usd,
        COUNT(*)                                      AS event_count
      FROM usage_events
      ${whereSql}
      GROUP BY provider, model
      ORDER BY total_cost_usd DESC, model ASC
    `;
    const rows = this.db.prepare(sql).all(...params) as SummaryRow[];
    return rows.map((r) => ({
      provider: PROVIDERS.has(r.provider) ? (r.provider as UsageProvider) : 'mock',
      model: r.model,
      total_input: r.total_input,
      total_output: r.total_output,
      total_cache_creation: r.total_cache_creation,
      total_cache_read: r.total_cache_read,
      total_reasoning: r.total_reasoning,
      total_cost_usd: r.total_cost_usd,
      event_count: r.event_count,
    }));
  }

  /**
   * 최근 N 일 동안의 일별 비용 / 토큰 합계.
   *
   * days <= 0 이면 빈 배열. days 가 너무 크면 (>365) 365 로 clamp.
   * 결과는 date DESC, provider ASC.
   */
  getDailyTotals(days: number, provider?: UsageProvider): DailyUsageRow[] {
    if (days <= 0) return [];
    const clamped = Math.min(Math.floor(days), 365);
    const fromIso = new Date(Date.now() - clamped * 24 * 60 * 60 * 1000).toISOString();

    const wheres: string[] = ['recorded_at >= ?'];
    const params: unknown[] = [fromIso];
    if (provider !== undefined) {
      wheres.push('provider = ?');
      params.push(provider);
    }
    const whereSql = `WHERE ${wheres.join(' AND ')}`;
    const sql = `
      SELECT
        substr(recorded_at, 1, 10) AS date,
        provider,
        COALESCE(SUM(total_cost_usd), 0) AS total_cost_usd,
        COALESCE(SUM(input_tokens + output_tokens
                     + cache_creation_input_tokens
                     + cache_read_input_tokens
                     + reasoning_output_tokens), 0) AS total_tokens
      FROM usage_events
      ${whereSql}
      GROUP BY date, provider
      ORDER BY date DESC, provider ASC
    `;
    const rows = this.db.prepare(sql).all(...params) as DailyRow[];
    return rows.map((r) => ({
      date: r.date,
      provider: PROVIDERS.has(r.provider) ? (r.provider as UsageProvider) : 'mock',
      total_cost_usd: r.total_cost_usd,
      total_tokens: r.total_tokens,
    }));
  }

  /**
   * 단일 세션의 모든 usage event.
   *
   * 결과는 recorded_at ASC (시간 순). 디버그 / "왜 이렇게 비싸지?" 분석용.
   */
  getBySession(session_id: string): UsageEvent[] {
    if (session_id.length === 0) return [];
    const rows = this.db
      .prepare(
        `SELECT id, session_id, turn_id, provider, model,
                input_tokens, output_tokens, cache_creation_input_tokens,
                cache_read_input_tokens, reasoning_output_tokens,
                total_cost_usd, recorded_at, source
         FROM usage_events
         WHERE session_id = ?
         ORDER BY recorded_at ASC, id ASC`
      )
      .all(session_id) as UsageEventRow[];
    return rows.map(rowToEvent);
  }
}
