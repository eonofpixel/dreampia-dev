/**
 * CompareStore — v0.12.0 Cross-AI Verify/Compare contract tests.
 *
 * Verifies:
 *   1. Migration 005 applies on a fresh DB (compare_runs + indices).
 *   2. createRun returns a fresh row with both sides 'pending'.
 *   3. updateSide patches partially without overwriting other fields.
 *   4. text REPLACE semantics (orchestrator drives accumulation).
 *   5. finalizeRun with both done → 'completed'.
 *   6. finalizeRun with one done + one error → 'completed' (failure isolation).
 *   7. finalizeRun with both error → 'failed'.
 *   8. finalizeRun while still streaming → stays 'running'.
 *   9. listBySession returns DESC order, capped by limit.
 *  10. deleteRun + getRun → null.
 *  11. invalid permission_level / status throws.
 *
 * Spec: ROADMAP.md (v0.12.0 I)
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import type { Database as DatabaseT } from 'better-sqlite3';
import {
  CompareStore,
  LATEST_SCHEMA_VERSION,
  SessionStore,
  type CompareRunCreateArgs,
} from '../../src/storage';

function sample(overrides: Partial<CompareRunCreateArgs> = {}): CompareRunCreateArgs {
  return {
    session_id: 'sess-1',
    prompt: 'hello world',
    workspace_root: 'C:\\workspace',
    permission_level: 'workspace_write',
    claude_model: 'claude-3-5-sonnet-20241022',
    codex_model: 'gpt-5.5',
    ...overrides,
  };
}

describe('CompareStore', () => {
  let store: SessionStore;
  let compare: CompareStore;
  let db: DatabaseT;

  beforeEach(() => {
    store = new SessionStore(':memory:');
    db = store.getDb();
    compare = new CompareStore(db);
  });

  afterEach(() => {
    store.close();
  });

  // ── Migration ─────────────────────────────────────────────────

  describe('migration', () => {
    it('applies up to LATEST_SCHEMA_VERSION (>=5 for compare)', () => {
      expect(store.getSchemaVersion()).toBeGreaterThanOrEqual(5);
      expect(store.getSchemaVersion()).toBe(LATEST_SCHEMA_VERSION);
    });

    it('creates compare_runs table with both indices', () => {
      const tableRow = db
        .prepare(
          `SELECT name FROM sqlite_master WHERE type='table' AND name='compare_runs'`
        )
        .get() as { name: string } | undefined;
      expect(tableRow?.name).toBe('compare_runs');
      const indices = db
        .prepare(
          `SELECT name FROM sqlite_master WHERE type='index' AND tbl_name='compare_runs' ORDER BY name`
        )
        .all() as Array<{ name: string }>;
      const names = indices.map((r) => r.name);
      expect(names).toContain('idx_compare_runs_session');
      expect(names).toContain('idx_compare_runs_created');
    });
  });

  // ── createRun ─────────────────────────────────────────────────

  describe('createRun', () => {
    it('returns a fresh run with both sides pending', () => {
      const run = compare.createRun(sample());
      expect(run.id).toMatch(/^[0-9a-f-]{36}$/);
      expect(run.status).toBe('running');
      expect(run.claude.status).toBe('pending');
      expect(run.codex.status).toBe('pending');
      expect(run.claude.text).toBe('');
      expect(run.codex.text).toBe('');
      expect(run.claude.model).toBe('claude-3-5-sonnet-20241022');
      expect(run.codex.model).toBe('gpt-5.5');
    });

    it('persists row that round-trips via getRun', () => {
      const created = compare.createRun(sample());
      const reloaded = compare.getRun(created.id);
      expect(reloaded).not.toBeNull();
      expect(reloaded?.id).toBe(created.id);
      expect(reloaded?.prompt).toBe('hello world');
      expect(reloaded?.permission_level).toBe('workspace_write');
    });

    it('rejects invalid permission_level', () => {
      expect(() =>
        compare.createRun(
          sample({ permission_level: 'banana' as unknown as 'workspace_write' })
        )
      ).toThrow(/permission_level/);
    });

    it('rejects empty session_id / prompt / models', () => {
      expect(() => compare.createRun(sample({ session_id: '' }))).toThrow();
      expect(() => compare.createRun(sample({ prompt: '' }))).toThrow();
      expect(() => compare.createRun(sample({ claude_model: '' }))).toThrow();
      expect(() => compare.createRun(sample({ codex_model: '' }))).toThrow();
    });
  });

  // ── updateSide ────────────────────────────────────────────────

  describe('updateSide', () => {
    it('patches only specified fields (REPLACE semantics for text)', () => {
      const run = compare.createRun(sample());
      compare.updateSide(run.id, 'claude', {
        status: 'streaming',
        text: 'partial',
        started_at: '2026-05-03T10:00:00.000Z',
      });
      const reloaded = compare.getRun(run.id);
      expect(reloaded?.claude.status).toBe('streaming');
      expect(reloaded?.claude.text).toBe('partial');
      expect(reloaded?.claude.started_at).toBe('2026-05-03T10:00:00.000Z');
      // codex side untouched.
      expect(reloaded?.codex.status).toBe('pending');
      expect(reloaded?.codex.text).toBe('');
    });

    it('text REPLACE not append — second update overwrites', () => {
      const run = compare.createRun(sample());
      compare.updateSide(run.id, 'codex', { text: 'first' });
      compare.updateSide(run.id, 'codex', { text: 'first second' });
      const reloaded = compare.getRun(run.id);
      expect(reloaded?.codex.text).toBe('first second');
    });

    it('rejects invalid status', () => {
      const run = compare.createRun(sample());
      expect(() =>
        compare.updateSide(run.id, 'claude', {
          status: 'wat' as unknown as 'streaming',
        })
      ).toThrow(/invalid status/);
    });

    it('rejects invalid side', () => {
      const run = compare.createRun(sample());
      expect(() =>
        compare.updateSide(run.id, 'banana' as unknown as 'claude', {
          status: 'done',
        })
      ).toThrow(/invalid side/);
    });
  });

  // ── finalizeRun ───────────────────────────────────────────────

  describe('finalizeRun', () => {
    it('marks completed when both sides done', () => {
      const run = compare.createRun(sample());
      compare.updateSide(run.id, 'claude', { status: 'done', text: 'a' });
      compare.updateSide(run.id, 'codex', { status: 'done', text: 'b' });
      const finalized = compare.finalizeRun(run.id);
      expect(finalized.status).toBe('completed');
    });

    it('completed when one done + one error (failure isolation)', () => {
      const run = compare.createRun(sample());
      compare.updateSide(run.id, 'claude', { status: 'done', text: 'a' });
      compare.updateSide(run.id, 'codex', { status: 'error', error: 'boom' });
      const finalized = compare.finalizeRun(run.id);
      expect(finalized.status).toBe('completed');
    });

    it('failed when both error/skipped', () => {
      const run = compare.createRun(sample());
      compare.updateSide(run.id, 'claude', { status: 'error', error: 'a' });
      compare.updateSide(run.id, 'codex', { status: 'skipped' });
      const finalized = compare.finalizeRun(run.id);
      expect(finalized.status).toBe('failed');
    });

    it('stays running when at least one side still streaming', () => {
      const run = compare.createRun(sample());
      compare.updateSide(run.id, 'claude', { status: 'streaming' });
      compare.updateSide(run.id, 'codex', { status: 'done' });
      const finalized = compare.finalizeRun(run.id);
      expect(finalized.status).toBe('running');
    });

    it('throws on missing run', () => {
      expect(() => compare.finalizeRun('does-not-exist')).toThrow(/not found/);
    });
  });

  // ── listBySession ─────────────────────────────────────────────

  describe('listBySession', () => {
    it('returns DESC by created_at and respects limit', async () => {
      const a = compare.createRun(sample({ prompt: 'a' }));
      // ensure created_at differs (ms precision in nodejs default).
      await new Promise((r) => setTimeout(r, 5));
      const b = compare.createRun(sample({ prompt: 'b' }));
      await new Promise((r) => setTimeout(r, 5));
      const c = compare.createRun(sample({ prompt: 'c' }));
      const list = compare.listBySession('sess-1');
      expect(list.length).toBe(3);
      // DESC — c first
      expect(list[0]?.id).toBe(c.id);
      expect(list[2]?.id).toBe(a.id);
      const limited = compare.listBySession('sess-1', 2);
      expect(limited.length).toBe(2);
      expect(limited[0]?.id).toBe(c.id);
      expect(limited[1]?.id).toBe(b.id);
    });

    it('returns [] for unknown session', () => {
      compare.createRun(sample());
      const list = compare.listBySession('other-session');
      expect(list).toEqual([]);
    });

    it('returns [] for empty session_id (no SQL injection)', () => {
      compare.createRun(sample());
      expect(compare.listBySession('')).toEqual([]);
    });
  });

  // ── deleteRun ─────────────────────────────────────────────────

  describe('deleteRun', () => {
    it('removes row; subsequent getRun returns null', () => {
      const run = compare.createRun(sample());
      compare.deleteRun(run.id);
      expect(compare.getRun(run.id)).toBeNull();
    });

    it('silent no-op for unknown id', () => {
      expect(() => compare.deleteRun('nope')).not.toThrow();
    });
  });
});
