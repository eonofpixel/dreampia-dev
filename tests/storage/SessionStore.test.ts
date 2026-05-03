/**
 * Contract tests — SessionStore round-trip + behavior.
 *
 * Verifies:
 *   1. Migrations apply on a fresh DB (schema_version = 1).
 *   2. Each of 8 valid fixtures round-trips: parse → store → load → equals.
 *   3. WAL mode is active.
 *   4. listSessions filters and sorts correctly.
 *   5. appendTurn persists the turn and bumps updated_at.
 *   6. updateSessionMeta updates only specified fields.
 *   7. deleteSession removes all child rows.
 *   8. Errors on duplicate id and missing parent.
 *
 * Spec: docs/session/persistence.md, docs/session/migration.md
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { SessionStore, LATEST_SCHEMA_VERSION } from '@/storage';
import { SessionSchema, type Session } from '@/types/session';
import type { Turn } from '@/types/conversation';
import type { SessionId } from '@/types/common';
import { tmpdir } from 'node:os';
import { mkdtempSync, rmSync, existsSync } from 'node:fs';
import { join as pathJoin } from 'node:path';
import type { PlanItem } from '@/types/plan';

// ────────────────────────────────────────────────────────────
// Fixture helpers
// ────────────────────────────────────────────────────────────

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURES_DIR = join(__dirname, '..', 'fixtures', 'sessions');

function loadFixture(name: string): Session {
  const path = join(FIXTURES_DIR, name);
  const raw = JSON.parse(readFileSync(path, 'utf-8'));
  return SessionSchema.parse(raw);
}

function listFixtures(): string[] {
  return readdirSync(FIXTURES_DIR)
    .filter((f) => f.endsWith('.json'))
    .sort();
}

// ────────────────────────────────────────────────────────────
// Suite
// ────────────────────────────────────────────────────────────

describe('SessionStore', () => {
  let store: SessionStore;

  beforeEach(() => {
    store = new SessionStore(':memory:');
  });

  afterEach(() => {
    store.close();
  });

  // ── Migrations ──────────────────────────────────────────────

  describe('migrations', () => {
    it('apply on a fresh DB and report schema_version = LATEST', () => {
      expect(store.getSchemaVersion()).toBe(LATEST_SCHEMA_VERSION);
      // 1 → 2 in SS-5 (002_locks.sql), 2 → 3 in v0.4.0 (003_usage_events.sql),
      // 3 → 4 in v0.7.0 (004_fts5_turns.sql for chat search).
      expect(store.getSchemaVersion()).toBe(4);
    });

    it('are idempotent — re-opening the same DB does not reapply', () => {
      // Insert a session into the in-memory DB and re-run migrate by
      // reopening would lose state since it is :memory:. Instead,
      // verify the constructor itself is idempotent: calling migrate via
      // a second SessionStore on the same path is what real apps do.
      // For :memory: we can only assert the version stays stable.
      expect(store.getSchemaVersion()).toBe(4);
    });

    it('creates session_locks table at v2 (SS-5)', () => {
      const dbAccessor = store as unknown as {
        db: { prepare: (s: string) => { get: (...a: unknown[]) => unknown } };
      };
      const row = dbAccessor.db
        .prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name='session_locks'`)
        .get() as { name: string } | undefined;
      expect(row?.name).toBe('session_locks');
    });
  });

  // ── WAL mode ────────────────────────────────────────────────

  describe('WAL mode', () => {
    it('journal_mode is wal (or memory for :memory: DB)', () => {
      // Cast: pragma() return type is unknown for simple:false.
      const mode = (
        store as unknown as { db: { pragma: (s: string, o?: unknown) => string } }
      ).db.pragma('journal_mode', { simple: true });
      // :memory: SQLite databases force journal_mode='memory' regardless of
      // the WAL pragma. On disk-backed DBs the same code returns 'wal'.
      expect(['wal', 'memory']).toContain(mode);
    });
  });

  // ── Round-trip per fixture ──────────────────────────────────

  describe('round-trip valid fixtures', () => {
    const fixtures = listFixtures();

    it('found 8 valid fixtures', () => {
      expect(fixtures.length).toBe(8);
    });

    for (const file of fixtures) {
      it(`round-trips ${file}`, () => {
        const original = loadFixture(file);

        // Side-fork fixtures reference a parent session via FK. Insert
        // the parent first so the FOREIGN KEY constraint is satisfied.
        if (original.parent_session_id !== undefined) {
          // Fixture 07 references fixture 05's session as parent.
          const parent = loadFixture('05-with-browser.json');
          if (parent.id === original.parent_session_id) {
            store.createSession(parent);
          }
        }

        store.createSession(original);

        const reloaded = store.getSession(original.id);
        expect(reloaded).not.toBeNull();
        expect(reloaded).toEqual(original);
      });
    }
  });

  // ── createSession invariants ────────────────────────────────

  describe('createSession', () => {
    it('rejects duplicate session ids', () => {
      const session = loadFixture('01-empty.json');
      store.createSession(session);
      expect(() => store.createSession(session)).toThrow();
    });

    it('persists session that survives reopen via second instance', () => {
      // Cannot reopen an in-memory DB directly. We assert that getSession
      // returns the same shape immediately after createSession.
      const session = loadFixture('02-single-turn.json');
      store.createSession(session);
      const reloaded = store.getSession(session.id);
      expect(reloaded).toEqual(session);
    });

    it('returns null for missing session id', () => {
      const ghost = '019d0000-0000-7000-8000-ffffffffffff' as SessionId;
      expect(store.getSession(ghost)).toBeNull();
    });
  });

  // ── appendTurn ──────────────────────────────────────────────

  describe('appendTurn', () => {
    it('appends a new turn at end of conversation', () => {
      const session = loadFixture('02-single-turn.json');
      store.createSession(session);

      const newTurn: Turn = {
        id: '019d0001-0000-7000-8000-000000000099' as Turn['id'],
        role: 'user',
        timestamp: '2026-05-02T01:01:00.000Z',
        status: 'completed',
        content: [{ type: 'text', text: '추가 메시지' }],
      };

      store.appendTurn(session.id, newTurn);

      const reloaded = store.getSession(session.id);
      expect(reloaded).not.toBeNull();
      expect(reloaded!.conversation.turns.length).toBe(session.conversation.turns.length + 1);
      const last = reloaded!.conversation.turns[reloaded!.conversation.turns.length - 1];
      expect(last).toEqual(newTurn);
    });

    it('bumps session.updated_at when new turn timestamp is newer', () => {
      const session = loadFixture('02-single-turn.json');
      store.createSession(session);

      const futureTs = '2099-01-01T00:00:00.000Z';
      const newTurn: Turn = {
        id: '019d0001-0000-7000-8000-0000000000aa' as Turn['id'],
        role: 'user',
        timestamp: futureTs,
        status: 'completed',
        content: [{ type: 'text', text: 'future' }],
      };

      store.appendTurn(session.id, newTurn);

      const list = store.listSessions();
      const meta = list.find((s) => s.id === session.id);
      expect(meta?.updated_at).toBe(futureTs);
    });

    it('does NOT lower updated_at when new turn timestamp is older', () => {
      const session = loadFixture('02-single-turn.json');
      store.createSession(session);
      const originalUpdated = session.updated_at;

      const pastTs = '2000-01-01T00:00:00.000Z';
      const newTurn: Turn = {
        id: '019d0001-0000-7000-8000-0000000000bb' as Turn['id'],
        role: 'user',
        timestamp: pastTs,
        status: 'completed',
        content: [{ type: 'text', text: 'past' }],
      };

      store.appendTurn(session.id, newTurn);

      const list = store.listSessions();
      const meta = list.find((s) => s.id === session.id);
      expect(meta?.updated_at).toBe(originalUpdated);
    });

    it('rejects appendTurn for nonexistent session', () => {
      const ghost = '019d0000-0000-7000-8000-fffffffffffe' as SessionId;
      const newTurn: Turn = {
        id: '019d0001-0000-7000-8000-0000000000cc' as Turn['id'],
        role: 'user',
        timestamp: '2026-05-02T01:01:00.000Z',
        status: 'completed',
        content: [{ type: 'text', text: 'no session' }],
      };
      expect(() => store.appendTurn(ghost, newTurn)).toThrow(/not found/);
    });
  });

  // ── listSessions ────────────────────────────────────────────

  describe('listSessions', () => {
    it('returns empty list for empty DB', () => {
      expect(store.listSessions()).toEqual([]);
    });

    it('lists all sessions sorted by updated_at DESC', () => {
      // Use 3 fixtures with distinct workspace_ids, distinct ids.
      // 01 (ws-a1b2c3d4e5f6a7b8, updated 01:00:00),
      // 06 (ws-old-project, updated 2026-04-20),
      // 04 (ws-a1b2c3d4e5f6a7b8 also — duplicate workspace conflict).
      // Pick 01, 05 (ws-pyeongtaek-portal01), 06 (ws-old-project).
      const s01 = loadFixture('01-empty.json');
      const s05 = loadFixture('05-with-browser.json');
      const s06 = loadFixture('06-archived.json');

      store.createSession(s01);
      store.createSession(s05);
      store.createSession(s06);

      const list = store.listSessions();
      expect(list.length).toBe(3);
      // s05.updated_at = 2026-05-02T01:54:30 (latest)
      // s01.updated_at = 2026-05-02T01:00:00
      // s06.updated_at = 2026-04-20T15:30:00 (oldest)
      expect(list[0]!.id).toBe(s05.id);
      expect(list[1]!.id).toBe(s01.id);
      expect(list[2]!.id).toBe(s06.id);
    });

    it('filters by workspace_id', () => {
      const s01 = loadFixture('01-empty.json'); // ws-a1b2c3d4e5f6a7b8
      const s05 = loadFixture('05-with-browser.json'); // ws-pyeongtaek-portal01
      const s06 = loadFixture('06-archived.json'); // ws-old-project

      store.createSession(s01);
      store.createSession(s05);
      store.createSession(s06);

      const wsP = store.listSessions({
        workspace_id: 'ws-pyeongtaek-portal01',
      });
      expect(wsP.length).toBe(1);
      expect(wsP[0]!.id).toBe(s05.id);

      const wsOld = store.listSessions({ workspace_id: 'ws-old-project' });
      expect(wsOld.length).toBe(1);
      expect(wsOld[0]!.id).toBe(s06.id);
    });

    it('filters by archived flag', () => {
      const s01 = loadFixture('01-empty.json');
      const s06 = loadFixture('06-archived.json');

      store.createSession(s01);
      store.createSession(s06);

      const archived = store.listSessions({ archived: true });
      expect(archived.length).toBe(1);
      expect(archived[0]!.id).toBe(s06.id);

      const active = store.listSessions({ archived: false });
      expect(active.length).toBe(1);
      expect(active[0]!.id).toBe(s01.id);
    });

    it('filters by pinned flag', () => {
      const s01 = loadFixture('01-empty.json'); // pinned=false
      const s05 = loadFixture('05-with-browser.json'); // pinned=true

      store.createSession(s01);
      store.createSession(s05);

      const pinned = store.listSessions({ pinned: true });
      expect(pinned.length).toBe(1);
      expect(pinned[0]!.id).toBe(s05.id);
    });

    it('returns SessionMeta (no nested sub-states)', () => {
      const s01 = loadFixture('01-empty.json');
      store.createSession(s01);

      const list = store.listSessions();
      expect(list.length).toBe(1);
      const meta = list[0]!;
      // Required meta fields
      expect(meta.id).toBe(s01.id);
      expect(meta.title).toBe(s01.title);
      expect(meta.pinned).toBe(false);
      expect(meta.archived).toBe(false);
      expect(meta.provider).toBe(s01.provider);
      // Sub-states must NOT be present
      expect((meta as unknown as Record<string, unknown>)['conversation']).toBeUndefined();
      expect((meta as unknown as Record<string, unknown>)['workspace']).toBeUndefined();
    });
  });

  // ── updateSessionMeta ───────────────────────────────────────

  describe('updateSessionMeta', () => {
    it('updates only specified fields', () => {
      const session = loadFixture('01-empty.json');
      store.createSession(session);

      store.updateSessionMeta(session.id, { title: '제목 변경' });

      const reloaded = store.getSession(session.id);
      expect(reloaded?.title).toBe('제목 변경');
      // Other fields unchanged
      expect(reloaded?.pinned).toBe(session.pinned);
      expect(reloaded?.archived).toBe(session.archived);
    });

    it('updates pinned flag', () => {
      const session = loadFixture('01-empty.json');
      store.createSession(session);

      store.updateSessionMeta(session.id, { pinned: true });

      const reloaded = store.getSession(session.id);
      expect(reloaded?.pinned).toBe(true);
    });

    it('updates archived flag', () => {
      const session = loadFixture('01-empty.json');
      store.createSession(session);

      store.updateSessionMeta(session.id, { archived: true });

      const reloaded = store.getSession(session.id);
      expect(reloaded?.archived).toBe(true);
    });

    it('bumps updated_at to current time', () => {
      const session = loadFixture('01-empty.json');
      store.createSession(session);
      const before = session.updated_at;

      store.updateSessionMeta(session.id, { title: 'bump' });

      const list = store.listSessions();
      const meta = list.find((m) => m.id === session.id);
      expect(meta).toBeDefined();
      // Updated timestamp should be >= original.
      expect(meta!.updated_at >= before).toBe(true);
    });

    it('throws for nonexistent session', () => {
      const ghost = '019d0000-0000-7000-8000-fffffffffffd' as SessionId;
      expect(() => store.updateSessionMeta(ghost, { title: 'x' })).toThrow(/not found/);
    });

    it('no-op for empty patch does not throw', () => {
      const session = loadFixture('01-empty.json');
      store.createSession(session);
      expect(() => store.updateSessionMeta(session.id, {})).not.toThrow();
    });
  });

  // ── deleteSession ───────────────────────────────────────────

  describe('deleteSession', () => {
    it('removes a session and all its children', () => {
      // Use a fixture with most child rows: 04-plan-mode (plan_items)
      const session = loadFixture('04-plan-mode.json');
      store.createSession(session);

      // Sanity: pre-delete child counts
      const dbAccessor = store as unknown as {
        db: { prepare: (s: string) => { get: (...a: unknown[]) => unknown } };
      };
      const countTurns = () =>
        (
          dbAccessor.db
            .prepare('SELECT COUNT(*) AS c FROM turns WHERE session_id = ?')
            .get(session.id) as { c: number }
        ).c;
      const countPlanItems = () =>
        (
          dbAccessor.db
            .prepare('SELECT COUNT(*) AS c FROM plan_items WHERE session_id = ?')
            .get(session.id) as { c: number }
        ).c;

      expect(countTurns()).toBeGreaterThan(0);
      expect(countPlanItems()).toBeGreaterThan(0);

      store.deleteSession(session.id);

      expect(store.getSession(session.id)).toBeNull();
      expect(countTurns()).toBe(0);
      expect(countPlanItems()).toBe(0);
    });

    it('cascades through grants, browser_tabs, terminal_panes, annotations', () => {
      const session = loadFixture('05-with-browser.json'); // grants + tabs + panes
      store.createSession(session);

      const dbAccessor = store as unknown as {
        db: { prepare: (s: string) => { get: (...a: unknown[]) => unknown } };
      };
      const cnt = (table: string) =>
        (
          dbAccessor.db
            .prepare(`SELECT COUNT(*) AS c FROM ${table} WHERE session_id = ?`)
            .get(session.id) as { c: number }
        ).c;

      expect(cnt('permission_grants')).toBeGreaterThan(0);
      expect(cnt('browser_tabs')).toBeGreaterThan(0);
      expect(cnt('terminal_panes')).toBeGreaterThan(0);

      store.deleteSession(session.id);

      expect(cnt('permission_grants')).toBe(0);
      expect(cnt('browser_tabs')).toBe(0);
      expect(cnt('terminal_panes')).toBe(0);
    });

    it('removes turn-level annotations', () => {
      const session = loadFixture('08-with-annotation.json');
      store.createSession(session);

      const dbAccessor = store as unknown as {
        db: { prepare: (s: string) => { get: (...a: unknown[]) => unknown } };
      };
      const annoCount = () =>
        (
          dbAccessor.db
            .prepare('SELECT COUNT(*) AS c FROM annotations WHERE session_id = ?')
            .get(session.id) as { c: number }
        ).c;

      expect(annoCount()).toBeGreaterThan(0);

      store.deleteSession(session.id);

      expect(annoCount()).toBe(0);
    });

    it('throws for nonexistent session', () => {
      const ghost = '019d0000-0000-7000-8000-fffffffffffc' as SessionId;
      expect(() => store.deleteSession(ghost)).toThrow(/not found/);
    });
  });

  // ── Boolean encoding ─────────────────────────────────────────

  describe('boolean encoding', () => {
    it('round-trips pinned=true, archived=false correctly', () => {
      const session = loadFixture('05-with-browser.json'); // pinned=true
      expect(session.pinned).toBe(true);
      expect(session.archived).toBe(false);

      store.createSession(session);
      const reloaded = store.getSession(session.id);
      expect(reloaded?.pinned).toBe(true);
      expect(reloaded?.archived).toBe(false);
    });

    it('round-trips pinned=false, archived=true correctly', () => {
      const session = loadFixture('06-archived.json'); // archived=true
      expect(session.pinned).toBe(false);
      expect(session.archived).toBe(true);

      store.createSession(session);
      const reloaded = store.getSession(session.id);
      expect(reloaded?.pinned).toBe(false);
      expect(reloaded?.archived).toBe(true);
    });
  });

  // ── Optional fields and parent_session_id ────────────────────

  describe('optional fields', () => {
    it('round-trips parent_session_id when present', () => {
      const session = loadFixture('07-side-fork.json');
      expect(session.parent_session_id).toBeDefined();

      // Insert parent session first to satisfy FK.
      const parent = loadFixture('05-with-browser.json');
      store.createSession(parent);

      store.createSession(session);
      const reloaded = store.getSession(session.id);
      expect(reloaded?.parent_session_id).toBe(session.parent_session_id);
    });

    it('omits parent_session_id when absent', () => {
      const session = loadFixture('01-empty.json');
      expect(session.parent_session_id).toBeUndefined();

      store.createSession(session);
      const reloaded = store.getSession(session.id);
      expect((reloaded as Record<string, unknown>)['parent_session_id']).toBeUndefined();
    });
  });

  // -- deletePlanItemsForSession -- deep nesting (Bug #1 regression) ------

  describe('deletePlanItemsForSession -- deep nesting', () => {
    /**
     * Build a linear N-level deep plan tree:
     *   root -> child -> grandchild -> ... (N levels)
     * Each level is represented as a PlanItem with one sub_item.
     */
    function buildDeepPlan(depth: number): PlanItem {
      function buildLevel(level: number): PlanItem {
        const item: PlanItem = {
          id: `deep-plan-item-${level}`,
          text: `Level ${level}`,
          status: 'pending',
          related_turns: [],
        };
        if (level < depth - 1) {
          item.sub_items = [buildLevel(level + 1)];
        }
        return item;
      }
      return buildLevel(0);
    }

    it('handles 20-level deep plan_items tree on deleteSession (Bug #1)', () => {
      const base = loadFixture('04-plan-mode.json');
      // Replace checklist with a single 20-level deep tree
      const deepSession = {
        ...base,
        id: '019d0000-0000-7000-8000-000000000020' as SessionId,
        plan: {
          ...base.plan,
          checklist: [buildDeepPlan(20)],
          current_item_index: 0,
        },
      };

      const dbAccessor = store as unknown as {
        db: { prepare: (s: string) => { get: (...a: unknown[]) => unknown } };
      };

      store.createSession(deepSession);

      // Verify 20 plan_items were inserted
      const beforeCount = (
        dbAccessor.db
          .prepare('SELECT COUNT(*) AS c FROM plan_items WHERE session_id = ?')
          .get(deepSession.id) as { c: number }
      ).c;
      expect(beforeCount).toBe(20);

      // This must NOT throw a SQLITE_CONSTRAINT_FOREIGNKEY error
      expect(() => store.deleteSession(deepSession.id)).not.toThrow();

      // Verify zero plan_items remain
      const afterCount = (
        dbAccessor.db
          .prepare('SELECT COUNT(*) AS c FROM plan_items WHERE session_id = ?')
          .get(deepSession.id) as { c: number }
      ).c;
      expect(afterCount).toBe(0);
    });
  });

  // -- deleteSession -- orphan worktrees (Bug #2 regression) ---------------

  describe('deleteSession -- orphan worktrees', () => {
    it('removes worktrees whose parent_session_id matches the deleted session (Bug #2)', () => {
      const session = loadFixture('01-empty.json');
      store.createSession(session);

      // Insert a worktree directly referencing this session via parent_session_id.
      // parent_session_id on worktrees has NO FK constraint, so we need explicit cleanup.
      const dbAccessor = store as unknown as {
        db: {
          prepare: (s: string) => {
            run: (...a: unknown[]) => unknown;
            get: (...a: unknown[]) => unknown;
          };
        };
      };

      dbAccessor.db
        .prepare(
          'INSERT INTO worktrees (id, workspace_id, path, branch, is_permanent, parent_session_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)'
        )
        .run(
          'wt-orphan-test-001',
          session.workspace_id,
          'C:\\Dev\\orphan-worktree',
          'fix/orphan-test',
          0,
          session.id,
          session.created_at
        );

      // Verify the worktree was inserted
      const beforeCount = (
        dbAccessor.db
          .prepare('SELECT COUNT(*) AS c FROM worktrees WHERE parent_session_id = ?')
          .get(session.id) as { c: number }
      ).c;
      expect(beforeCount).toBe(1);

      store.deleteSession(session.id);

      // Worktree must be gone after session delete
      const afterCount = (
        dbAccessor.db
          .prepare('SELECT COUNT(*) AS c FROM worktrees WHERE parent_session_id = ?')
          .get(session.id) as { c: number }
      ).c;
      expect(afterCount).toBe(0);
    });
  });

  // -- Real-file DB persistence --------------------------------------------

  describe('SessionStore -- real file DB', () => {
    let tmpDir: string;
    let dbPath: string;
    let fileStore: SessionStore;

    beforeEach(() => {
      tmpDir = mkdtempSync(pathJoin(tmpdir(), 'dreampia-store-test-'));
      dbPath = pathJoin(tmpDir, 'sessions.sqlite');
    });

    afterEach(() => {
      try {
        fileStore?.close();
      } catch {
        // ignore
      }
      try {
        rmSync(tmpDir, { recursive: true, force: true });
      } catch {
        // ignore Windows file-lock cleanup quirks
      }
    });

    it('persists sessions across close + reopen', () => {
      fileStore = new SessionStore(dbPath);
      const original = loadFixture('02-single-turn.json');
      fileStore.createSession(original);
      // v0.7.0 (F-026) — schema version bumped to 4 (FTS5 turns search).
      expect(fileStore.getSchemaVersion()).toBe(LATEST_SCHEMA_VERSION);
      fileStore.close();

      // DB file must exist on disk
      expect(existsSync(dbPath)).toBe(true);

      // Reopen and verify session round-trips
      fileStore = new SessionStore(dbPath);
      expect(fileStore.getSchemaVersion()).toBe(LATEST_SCHEMA_VERSION); // migration is idempotent
      const reloaded = fileStore.getSession(original.id);
      expect(reloaded).toEqual(original);
    });

    it('uses WAL journal mode on file DB', () => {
      fileStore = new SessionStore(dbPath);
      const mode = (
        fileStore as unknown as {
          db: { pragma: (s: string, o?: unknown) => string };
        }
      ).db.pragma('journal_mode', { simple: true });
      expect(mode).toBe('wal');
    });

    it('creates WAL sidecar files on disk after a write', () => {
      fileStore = new SessionStore(dbPath);
      const session = loadFixture('01-empty.json');
      fileStore.createSession(session);
      // After a write, -wal or -shm sidecars should exist
      expect(existsSync(dbPath + '-wal') || existsSync(dbPath + '-shm')).toBe(true);
    });

    it('migration is idempotent on second open', () => {
      fileStore = new SessionStore(dbPath);
      const v1 = fileStore.getSchemaVersion();
      fileStore.close();
      fileStore = new SessionStore(dbPath);
      expect(fileStore.getSchemaVersion()).toBe(v1);
    });
  });
});
