/**
 * Migration runner for the SessionStore SQLite database.
 *
 * Reads schema_meta.version, applies any pending up-migrations sequentially
 * inside a transaction, and stamps schema_meta.initialized_at on first run.
 *
 * Down-migrations are out of scope for Phase 1 P0.
 *
 * Spec: docs/session/migration.md, docs/session/persistence.md
 */

import type { Database } from 'better-sqlite3';

// SQL files imported as raw text — Vite/Vitest 가 빌드 시 inline.
// 이전엔 readFileSync 로 dist/main/migrations/*.sql 을 읽었으나 vite-plugin-electron
// 이 .sql 을 번들에 안 넣어 production build 에서 ENOENT 발생 (P2-V1 발견).
import sql001 from './migrations/001_init.sql?raw';
import sql002 from './migrations/002_locks.sql?raw';
import sql003 from './migrations/003_usage_events.sql?raw';
import sql004 from './migrations/004_fts5_turns.sql?raw';
import sql005 from './migrations/005_compare_runs.sql?raw';
import sql006 from './migrations/006_cost_v1_0_12.sql?raw';
import sql007 from './migrations/007_workspace_locked.sql?raw';

// ────────────────────────────────────────────────────────────
// Migration registry
// ────────────────────────────────────────────────────────────

interface Migration {
  version: number;
  description: string;
  up: string;
}

/** Ordered list of migrations. Future versions append here. */
const MIGRATIONS: readonly Migration[] = [
  { version: 1, description: 'initial schema', up: sql001 },
  { version: 2, description: 'session_locks for multi-window leader election', up: sql002 },
  { version: 3, description: 'usage_events for v0.4.0 cost tracking', up: sql003 },
  { version: 4, description: 'FTS5 full-text search over turn content (v0.7.0 F-026)', up: sql004 },
  { version: 5, description: 'compare_runs for v0.12.0 cross-AI verify/compare', up: sql005 },
  {
    version: 6,
    description: 'v1.0.12 — usage_events.unknown_pricing + audit_log.tool_id (COST-1 + debt)',
    up: sql006,
  },
  {
    version: 7,
    description: 'v1.1.11 — sessions.workspace_locked (Workspace UX sticky lock)',
    up: sql007,
  },
] as const;

export const LATEST_SCHEMA_VERSION = MIGRATIONS[MIGRATIONS.length - 1]!.version;

// ────────────────────────────────────────────────────────────
// Helpers
// ────────────────────────────────────────────────────────────

/**
 * Returns the current schema version, or 0 if the schema_meta table
 * doesn't exist yet (fresh DB).
 */
function readCurrentVersion(db: Database): number {
  const row = db
    .prepare(`SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'schema_meta'`)
    .get() as { name: string } | undefined;

  if (!row) return 0;

  const meta = db.prepare(`SELECT value FROM schema_meta WHERE key = ?`).get('version') as
    | { value: string }
    | undefined;

  return meta ? parseInt(meta.value, 10) : 0;
}

/** Set schema_meta.value, inserting if missing. */
function upsertMeta(db: Database, key: string, value: string): void {
  db.prepare(
    `INSERT INTO schema_meta (key, value) VALUES (?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value`
  ).run(key, value);
}

/** Read meta value or undefined. */
function readMeta(db: Database, key: string): string | undefined {
  const row = db.prepare(`SELECT value FROM schema_meta WHERE key = ?`).get(key) as
    | { value: string }
    | undefined;
  return row?.value;
}

// ────────────────────────────────────────────────────────────
// Public API
// ────────────────────────────────────────────────────────────

/**
 * Apply all pending migrations.
 *
 * INV-1: schema_meta.version must equal LATEST_SCHEMA_VERSION on return.
 * INV-2: each migration runs inside a transaction.
 * INV-3: rejects DBs newer than this app version.
 */
export function migrate(db: Database): void {
  const current = readCurrentVersion(db);

  if (current > LATEST_SCHEMA_VERSION) {
    throw new Error(
      `DB schema version ${current} > app version ${LATEST_SCHEMA_VERSION}. ` +
        `Please update Dreampia-Dev or restore from a backup.`
    );
  }

  if (current === LATEST_SCHEMA_VERSION) {
    return;
  }

  for (const m of MIGRATIONS) {
    if (m.version <= current) continue;

    // v0.7.0 (F-026): FTS5 가 better-sqlite3 prebuilt 에 거의 항상 들어 있지만,
    // 일부 환경 (사용자 빌드, 임의 환경) 에서 누락될 가능성을 방어. v=4 만
    // 특수 케이스로 try/catch — 실패 시 schema_meta 에 'fts5_disabled'=1 표시
    // 후 schema version 만 bump 한다. SessionStore.searchTurns 가 LIKE
    // fallback 으로 동작하므로 사용자 기능은 유지.
    if (m.version === 4) {
      try {
        db.transaction(() => {
          db.exec(m.up);
          upsertMeta(db, 'version', String(m.version));
        })();
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        // FTS5 unavailable — graceful degrade.
        upsertMeta(db, 'version', String(m.version));
        upsertMeta(db, 'fts5_disabled', '1');
        upsertMeta(db, 'fts5_disabled_reason', msg);
      }
      continue;
    }

    db.transaction(() => {
      db.exec(m.up);
      // The 001_init migration creates schema_meta and inserts version=1.
      // For subsequent versions we must UPDATE the row.
      upsertMeta(db, 'version', String(m.version));
    })();
  }

  // Stamp initialized_at exactly once (first migration only).
  if (readMeta(db, 'initialized_at') === undefined) {
    upsertMeta(db, 'initialized_at', new Date().toISOString());
  }
}

/** Read the current schema version. Returns 0 if uninitialized. */
export function getSchemaVersion(db: Database): number {
  return readCurrentVersion(db);
}
