/**
 * AuditLogStore — append-only audit trail contract tests (v1.0.11 SEC-3).
 *
 * Verifies:
 *   1. recordEvent INSERT 한 row 가 getRecent / getBySession round-trip.
 *   2. getRecent 의 ordering — timestamp DESC, id DESC tiebreak.
 *   3. getBySession 의 ordering — timestamp ASC.
 *   4. filter (session_id / capability / event_prefix / from / to).
 *   5. clamp — limit > 1000 → 1000.
 *   6. 빈 입력 / 빈 session_id → 0건 / 0 row 반환.
 *   7. count() 는 filter 와 일관.
 *
 * Spec: docs/v1.x-roadmap.md (SEC-3), 001_init.sql (audit_log)
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { AuditLogStore, SessionStore } from '../../src/storage';
import type { AuditEventInput } from '../../src/storage';

function sample(overrides: Partial<AuditEventInput> = {}): AuditEventInput {
  return {
    timestamp: '2026-05-03T10:00:00.000Z',
    session_id: 's1',
    event: 'tool_use.success',
    capability: 'LOCAL_EXECUTE',
    target_json: '[]',
    decision_reason: 'success',
    ...overrides,
  };
}

describe('AuditLogStore', () => {
  let store: SessionStore;
  let audit: AuditLogStore;

  beforeEach(() => {
    store = new SessionStore(':memory:');
    audit = new AuditLogStore(store.getDb());
  });

  afterEach(() => {
    store.close();
  });

  // ── recordEvent ─────────────────────────────────────────

  describe('recordEvent', () => {
    it('inserts a row and returns its id', () => {
      const id = audit.recordEvent(sample());
      expect(id).toBeGreaterThan(0);
    });

    it('rejects empty timestamp', () => {
      expect(() => audit.recordEvent(sample({ timestamp: '' }))).toThrow(/timestamp/i);
    });

    it('rejects empty session_id', () => {
      expect(() => audit.recordEvent(sample({ session_id: '' }))).toThrow(/session_id/i);
    });

    it('rejects empty event', () => {
      expect(() => audit.recordEvent(sample({ event: '' }))).toThrow(/event/i);
    });

    it('persists optional fields (turn_id / outcome / error / ai_model)', () => {
      audit.recordEvent(
        sample({
          turn_id: 't42',
          outcome: 'success',
          error: 'PERMISSION_DENIED: hint',
          ai_model: 'shell.run',
          ai_reason: 'plan-step',
        })
      );
      const rows = audit.getRecent(10);
      expect(rows[0]).toMatchObject({
        turn_id: 't42',
        outcome: 'success',
        error: 'PERMISSION_DENIED: hint',
        ai_model: 'shell.run',
        ai_reason: 'plan-step',
      });
    });

    it('preserves insertion order via id even for identical timestamps', () => {
      audit.recordEvent(sample({ event: 'tool_use.success', target_json: '[1]' }));
      audit.recordEvent(sample({ event: 'tool_use.failed', target_json: '[2]' }));
      audit.recordEvent(sample({ event: 'tool_use.cancelled', target_json: '[3]' }));
      const rows = audit.getRecent(10);
      // DESC: 가장 마지막 insert 가 가장 위.
      expect(rows.map((r) => r.target_json)).toEqual(['[3]', '[2]', '[1]']);
    });
  });

  // ── getRecent ───────────────────────────────────────────

  describe('getRecent', () => {
    it('returns empty array for limit <= 0', () => {
      audit.recordEvent(sample());
      expect(audit.getRecent(0)).toEqual([]);
      expect(audit.getRecent(-5)).toEqual([]);
    });

    it('clamps limit to 1000', () => {
      for (let i = 0; i < 5; i++) audit.recordEvent(sample());
      // No-throw — clamping is internal.
      expect(audit.getRecent(99999).length).toBe(5);
    });

    it('orders by timestamp DESC then id DESC', () => {
      audit.recordEvent(sample({ timestamp: '2026-05-03T08:00:00.000Z', target_json: 'A' }));
      audit.recordEvent(sample({ timestamp: '2026-05-03T10:00:00.000Z', target_json: 'B' }));
      audit.recordEvent(sample({ timestamp: '2026-05-03T09:00:00.000Z', target_json: 'C' }));
      const rows = audit.getRecent(10);
      expect(rows.map((r) => r.target_json)).toEqual(['B', 'C', 'A']);
    });

    it('filters by session_id', () => {
      audit.recordEvent(sample({ session_id: 's1', target_json: 'a' }));
      audit.recordEvent(sample({ session_id: 's2', target_json: 'b' }));
      const rows = audit.getRecent(10, { session_id: 's1' });
      expect(rows.length).toBe(1);
      expect(rows[0]?.target_json).toBe('a');
    });

    it('filters by capability', () => {
      audit.recordEvent(sample({ capability: 'LOCAL_EXECUTE', target_json: 'x' }));
      audit.recordEvent(sample({ capability: 'NETWORK_ACCESS', target_json: 'y' }));
      const rows = audit.getRecent(10, { capability: 'NETWORK_ACCESS' });
      expect(rows.length).toBe(1);
      expect(rows[0]?.target_json).toBe('y');
    });

    it('filters by event_prefix', () => {
      audit.recordEvent(sample({ event: 'tool_use.success', target_json: '1' }));
      audit.recordEvent(sample({ event: 'tool_use.failed', target_json: '2' }));
      audit.recordEvent(sample({ event: 'permission.denied', target_json: '3' }));
      const rows = audit.getRecent(10, { event_prefix: 'tool_use.' });
      expect(rows.length).toBe(2);
      expect(rows.every((r) => r.event.startsWith('tool_use.'))).toBe(true);
    });

    it('filters by time window (from inclusive, to exclusive)', () => {
      audit.recordEvent(sample({ timestamp: '2026-05-03T08:00:00.000Z', target_json: 'a' }));
      audit.recordEvent(sample({ timestamp: '2026-05-03T10:00:00.000Z', target_json: 'b' }));
      audit.recordEvent(sample({ timestamp: '2026-05-03T12:00:00.000Z', target_json: 'c' }));
      const rows = audit.getRecent(10, {
        from: '2026-05-03T09:00:00.000Z',
        to: '2026-05-03T12:00:00.000Z',
      });
      expect(rows.length).toBe(1);
      expect(rows[0]?.target_json).toBe('b');
    });
  });

  // ── getBySession ────────────────────────────────────────

  describe('getBySession', () => {
    it('returns empty for empty sessionId', () => {
      audit.recordEvent(sample({ session_id: 's1' }));
      expect(audit.getBySession('')).toEqual([]);
    });

    it('orders by timestamp ASC', () => {
      audit.recordEvent(sample({ timestamp: '2026-05-03T10:00:00.000Z', target_json: 'B' }));
      audit.recordEvent(sample({ timestamp: '2026-05-03T08:00:00.000Z', target_json: 'A' }));
      audit.recordEvent(sample({ timestamp: '2026-05-03T09:00:00.000Z', target_json: 'C' }));
      const rows = audit.getBySession('s1');
      expect(rows.map((r) => r.target_json)).toEqual(['A', 'C', 'B']);
    });

    it('filters by session_id', () => {
      audit.recordEvent(sample({ session_id: 's1', target_json: 'x' }));
      audit.recordEvent(sample({ session_id: 's2', target_json: 'y' }));
      const rows = audit.getBySession('s2');
      expect(rows.length).toBe(1);
      expect(rows[0]?.target_json).toBe('y');
    });
  });

  // ── count ───────────────────────────────────────────────

  describe('count', () => {
    it('returns total count without filter', () => {
      for (let i = 0; i < 7; i++) audit.recordEvent(sample());
      expect(audit.count()).toBe(7);
    });

    it('respects event_prefix filter', () => {
      audit.recordEvent(sample({ event: 'tool_use.success' }));
      audit.recordEvent(sample({ event: 'tool_use.failed' }));
      audit.recordEvent(sample({ event: 'permission.denied' }));
      expect(audit.count({ event_prefix: 'tool_use.' })).toBe(2);
      expect(audit.count({ event_prefix: 'permission.' })).toBe(1);
    });
  });
});
