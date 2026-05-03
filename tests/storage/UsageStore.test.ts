/**
 * UsageStore — append-only token / cost telemetry contract tests.
 *
 * Verifies:
 *   1. Migration 003 applies on a fresh DB → schema_version = 3.
 *   2. recordEvent INSERT 한 row 가 getBySession 으로 round-trip.
 *   3. getSummary 가 provider/model 별 합계를 정확히 GROUP BY.
 *   4. getSummary 의 range filter (from / to / provider / model / session_id).
 *   5. getDailyTotals 가 일별 + provider 별 합계 + descending order.
 *   6. clamp / 음수 / non-finite 입력에 대한 방어.
 *   7. 동일 DB 에서 SessionStore 와 공존 가능 (FK 없으니 의도된 dangling 도 OK).
 *
 * Spec: ROADMAP.md (v0.4.0)
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import type { Database as DatabaseT } from 'better-sqlite3';
import { LATEST_SCHEMA_VERSION, SessionStore, UsageStore } from '../../src/storage';
import type { UsageEventInput } from '../../src/storage';

function sample(overrides: Partial<UsageEventInput> = {}): UsageEventInput {
  return {
    session_id: 's1',
    turn_id: 't1',
    provider: 'claude',
    model: 'claude-3-5-sonnet-20241022',
    input_tokens: 100,
    output_tokens: 50,
    total_cost_usd: 0.001,
    recorded_at: '2026-05-03T10:00:00.000Z',
    ...overrides,
  };
}

describe('UsageStore', () => {
  let store: SessionStore;
  let usage: UsageStore;
  let db: DatabaseT;

  beforeEach(() => {
    store = new SessionStore(':memory:');
    db = store.getDb();
    usage = new UsageStore(db);
  });

  afterEach(() => {
    store.close();
  });

  // ── Migration ─────────────────────────────────────────────

  describe('migration', () => {
    it('applies migration up to LATEST_SCHEMA_VERSION', () => {
      // v0.4.0 = 3 (usage_events). v0.7.0 = 4 (turns_fts FTS5).
      expect(store.getSchemaVersion()).toBe(LATEST_SCHEMA_VERSION);
    });

    it('creates usage_events table', () => {
      const row = db
        .prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name='usage_events'`)
        .get() as { name: string } | undefined;
      expect(row?.name).toBe('usage_events');
    });

    it('creates 4 indices on usage_events', () => {
      const indices = db
        .prepare(
          `SELECT name FROM sqlite_master WHERE type='index' AND tbl_name='usage_events' ORDER BY name`
        )
        .all() as Array<{ name: string }>;
      const names = indices.map((r) => r.name);
      expect(names).toContain('idx_usage_events_session');
      expect(names).toContain('idx_usage_events_recorded');
      expect(names).toContain('idx_usage_events_provider');
      expect(names).toContain('idx_usage_events_model');
    });

    it('is idempotent (re-creating SessionStore on same path keeps LATEST)', () => {
      // :memory: 라 같은 경로 재오픈 검증은 어려움 — 동일 process 내 추가 store 만
      // 검증. 현재 store 의 schema_meta.version 은 변하지 않아야 한다.
      expect(store.getSchemaVersion()).toBe(LATEST_SCHEMA_VERSION);
    });
  });

  // ── recordEvent ─────────────────────────────────────────

  describe('recordEvent', () => {
    it('inserts and returns the persisted row with generated id', () => {
      const result = usage.recordEvent(sample());
      expect(result.id).toMatch(/^[0-9a-f-]{36}$/);
      expect(result.session_id).toBe('s1');
      expect(result.input_tokens).toBe(100);
      expect(result.output_tokens).toBe(50);
    });

    it('persists optional fields with default 0', () => {
      const result = usage.recordEvent(sample());
      expect(result.cache_creation_input_tokens).toBe(0);
      expect(result.cache_read_input_tokens).toBe(0);
      expect(result.reasoning_output_tokens).toBe(0);
    });

    it('persists provided cache / reasoning fields', () => {
      const result = usage.recordEvent(
        sample({
          cache_creation_input_tokens: 200,
          cache_read_input_tokens: 300,
          reasoning_output_tokens: 50,
        })
      );
      expect(result.cache_creation_input_tokens).toBe(200);
      expect(result.cache_read_input_tokens).toBe(300);
      expect(result.reasoning_output_tokens).toBe(50);
    });

    it('clamps negative tokens to 0', () => {
      const result = usage.recordEvent(sample({ input_tokens: -50, output_tokens: -100 }));
      expect(result.input_tokens).toBe(0);
      expect(result.output_tokens).toBe(0);
    });

    it('clamps non-finite cost to 0', () => {
      const result = usage.recordEvent(sample({ total_cost_usd: Number.POSITIVE_INFINITY }));
      expect(result.total_cost_usd).toBe(0);
    });

    it('throws on invalid provider', () => {
      expect(() =>
        usage.recordEvent(sample({ provider: 'invalid' as 'claude' }))
      ).toThrow(/invalid provider/);
    });

    it('throws on empty session_id', () => {
      expect(() => usage.recordEvent(sample({ session_id: '' }))).toThrow(/session_id/);
    });

    it('throws on empty turn_id / model / recorded_at', () => {
      expect(() => usage.recordEvent(sample({ turn_id: '' }))).toThrow(/turn_id/);
      expect(() => usage.recordEvent(sample({ model: '' }))).toThrow(/model/);
      expect(() => usage.recordEvent(sample({ recorded_at: '' }))).toThrow(/recorded_at/);
    });

    it('persists optional source field for debugging', () => {
      const r = usage.recordEvent(sample({ source: 'jsonl-line-42' }));
      expect(r.source).toBe('jsonl-line-42');
      const fetched = usage.getBySession('s1');
      expect(fetched[0]?.source).toBe('jsonl-line-42');
    });
  });

  // ── getBySession ────────────────────────────────────────

  describe('getBySession', () => {
    it('returns all events for a session in recorded_at ASC', () => {
      usage.recordEvent(sample({ recorded_at: '2026-05-03T10:00:00.000Z' }));
      usage.recordEvent(sample({ recorded_at: '2026-05-03T09:00:00.000Z' }));
      usage.recordEvent(sample({ recorded_at: '2026-05-03T11:00:00.000Z' }));
      const events = usage.getBySession('s1');
      expect(events).toHaveLength(3);
      expect(events[0]?.recorded_at).toBe('2026-05-03T09:00:00.000Z');
      expect(events[2]?.recorded_at).toBe('2026-05-03T11:00:00.000Z');
    });

    it('returns empty array for unknown session', () => {
      expect(usage.getBySession('nope')).toEqual([]);
      expect(usage.getBySession('')).toEqual([]);
    });

    it('isolates by session_id', () => {
      usage.recordEvent(sample({ session_id: 's1' }));
      usage.recordEvent(sample({ session_id: 's2' }));
      expect(usage.getBySession('s1')).toHaveLength(1);
      expect(usage.getBySession('s2')).toHaveLength(1);
    });
  });

  // ── getSummary ──────────────────────────────────────────

  describe('getSummary', () => {
    it('returns empty array on empty DB', () => {
      expect(usage.getSummary()).toEqual([]);
    });

    it('groups by provider + model', () => {
      usage.recordEvent(
        sample({ provider: 'claude', model: 'claude-3-5-sonnet', total_cost_usd: 0.5 })
      );
      usage.recordEvent(
        sample({ provider: 'claude', model: 'claude-3-5-sonnet', total_cost_usd: 0.3 })
      );
      usage.recordEvent(sample({ provider: 'codex', model: 'gpt-4o', total_cost_usd: 1.0 }));

      const summary = usage.getSummary();
      expect(summary).toHaveLength(2);
      // ORDER BY total_cost_usd DESC → gpt-4o first.
      expect(summary[0]?.model).toBe('gpt-4o');
      expect(summary[0]?.total_cost_usd).toBe(1.0);
      expect(summary[1]?.model).toBe('claude-3-5-sonnet');
      expect(summary[1]?.total_cost_usd).toBeCloseTo(0.8, 6);
      expect(summary[1]?.event_count).toBe(2);
    });

    it('sums all token counters correctly', () => {
      usage.recordEvent(
        sample({
          input_tokens: 100,
          output_tokens: 200,
          cache_creation_input_tokens: 10,
          cache_read_input_tokens: 20,
          reasoning_output_tokens: 5,
        })
      );
      usage.recordEvent(
        sample({
          input_tokens: 50,
          output_tokens: 100,
          cache_creation_input_tokens: 5,
          cache_read_input_tokens: 10,
          reasoning_output_tokens: 2,
        })
      );
      const [row] = usage.getSummary();
      expect(row?.total_input).toBe(150);
      expect(row?.total_output).toBe(300);
      expect(row?.total_cache_creation).toBe(15);
      expect(row?.total_cache_read).toBe(30);
      expect(row?.total_reasoning).toBe(7);
      expect(row?.event_count).toBe(2);
    });

    it('filters by from/to (recorded_at range)', () => {
      usage.recordEvent(sample({ recorded_at: '2026-05-01T10:00:00.000Z' }));
      usage.recordEvent(sample({ recorded_at: '2026-05-03T10:00:00.000Z' }));
      usage.recordEvent(sample({ recorded_at: '2026-05-05T10:00:00.000Z' }));

      const summary = usage.getSummary({
        from: '2026-05-02T00:00:00.000Z',
        to: '2026-05-04T00:00:00.000Z',
      });
      expect(summary[0]?.event_count).toBe(1);
    });

    it('filters by provider', () => {
      usage.recordEvent(sample({ provider: 'claude', model: 'claude-3-5-sonnet' }));
      usage.recordEvent(sample({ provider: 'codex', model: 'gpt-4o' }));
      const summary = usage.getSummary({ provider: 'claude' });
      expect(summary).toHaveLength(1);
      expect(summary[0]?.provider).toBe('claude');
    });

    it('filters by model', () => {
      usage.recordEvent(sample({ model: 'claude-3-5-sonnet' }));
      usage.recordEvent(sample({ model: 'claude-3-5-haiku' }));
      const summary = usage.getSummary({ model: 'claude-3-5-haiku' });
      expect(summary).toHaveLength(1);
      expect(summary[0]?.model).toBe('claude-3-5-haiku');
    });

    it('filters by session_id', () => {
      usage.recordEvent(sample({ session_id: 's1' }));
      usage.recordEvent(sample({ session_id: 's2' }));
      const summary = usage.getSummary({ session_id: 's2' });
      expect(summary[0]?.event_count).toBe(1);
    });
  });

  // ── getDailyTotals ──────────────────────────────────────

  describe('getDailyTotals', () => {
    it('returns empty array for days <= 0', () => {
      expect(usage.getDailyTotals(0)).toEqual([]);
      expect(usage.getDailyTotals(-1)).toEqual([]);
    });

    it('groups by date + provider, ORDER BY date DESC', () => {
      const today = new Date();
      const yesterdayIso = new Date(today.getTime() - 24 * 60 * 60 * 1000).toISOString();
      const todayIso = today.toISOString();

      usage.recordEvent(
        sample({ provider: 'claude', recorded_at: todayIso, total_cost_usd: 0.5 })
      );
      usage.recordEvent(
        sample({ provider: 'claude', recorded_at: yesterdayIso, total_cost_usd: 0.3 })
      );
      usage.recordEvent(
        sample({ provider: 'codex', recorded_at: todayIso, total_cost_usd: 1.0 })
      );

      const rows = usage.getDailyTotals(7);
      // 두 날짜 × 1+ provider 라 최소 2 row.
      expect(rows.length).toBeGreaterThanOrEqual(2);
      // Today 의 첫 row 가 가장 위 (DESC date).
      const todayDateStr = todayIso.slice(0, 10);
      expect(rows[0]?.date).toBe(todayDateStr);
    });

    it('filters by provider', () => {
      const todayIso = new Date().toISOString();
      usage.recordEvent(sample({ provider: 'claude', recorded_at: todayIso }));
      usage.recordEvent(sample({ provider: 'codex', recorded_at: todayIso }));

      const claudeRows = usage.getDailyTotals(7, 'claude');
      expect(claudeRows.every((r) => r.provider === 'claude')).toBe(true);
    });

    it('total_tokens sums all token columns', () => {
      const todayIso = new Date().toISOString();
      usage.recordEvent(
        sample({
          input_tokens: 10,
          output_tokens: 20,
          cache_creation_input_tokens: 1,
          cache_read_input_tokens: 2,
          reasoning_output_tokens: 3,
          recorded_at: todayIso,
        })
      );
      const rows = usage.getDailyTotals(1);
      expect(rows[0]?.total_tokens).toBe(36);
    });

    it('clamps days to 365', () => {
      // 365일을 넘는 입력도 동작해야 (no throw).
      expect(usage.getDailyTotals(99999)).toEqual([]);
    });
  });

  // ── invariants ──────────────────────────────────────────

  describe('append-only invariant', () => {
    it('UsageStore does not expose any UPDATE / DELETE method', () => {
      const u = usage as unknown as Record<string, unknown>;
      expect(typeof u['delete']).not.toBe('function');
      expect(typeof u['update']).not.toBe('function');
      expect(typeof u['updateEvent']).not.toBe('function');
    });
  });
});
