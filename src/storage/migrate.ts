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
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// ────────────────────────────────────────────────────────────
// Migration registry
// ────────────────────────────────────────────────────────────

interface Migration {
  version: number;
  description: string;
  up: string;
}

/** Resolve a SQL file path relative to this module. */
function readSql(file: string): string {
  const here = dirname(fileURLToPath(import.meta.url));
  const path = resolve(here, 'migrations', file);
  return readFileSync(path, 'utf-8');
}

/** Ordered list of migrations. Future versions append here. */
const MIGRATIONS: readonly Migration[] = [
  { version: 1, description: 'initial schema', up: readSql('001_init.sql') },
  { version: 2, description: 'session_locks for multi-window leader election', up: readSql('002_locks.sql') },
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
    .prepare(
      `SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'schema_meta'`
    )
    .get() as { name: string } | undefined;

  if (!row) return 0;

  const meta = db
    .prepare(`SELECT value FROM schema_meta WHERE key = ?`)
    .get('version') as { value: string } | undefined;

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
  const row = db
    .prepare(`SELECT value FROM schema_meta WHERE key = ?`)
    .get(key) as { value: string } | undefined;
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
