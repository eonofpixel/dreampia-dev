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
import sql008 from './migrations/008_workspace_id_deterministic.sql?raw';
import sql009 from './migrations/009_grants_id_text.sql?raw';
import sql010 from './migrations/010_json_columns_promote.sql?raw';
import sql011 from './migrations/011_down_migration_marker.sql?raw';
import sql012 from './migrations/012_workspace_id_sha256_marker.sql?raw';
import sql013 from './migrations/013_permission_grants_id_text.sql?raw';
import sql014 from './migrations/014_conversation_columns_promote.sql?raw';

// v1.4.3 — down migrations. 일부 (markers 8-12) 만 backfill, 1-7 은 후속.
import down008 from './migrations/down_008_workspace_id_deterministic.sql?raw';
import down009 from './migrations/down_009_grants_id_text.sql?raw';
import down010 from './migrations/down_010_json_columns_promote.sql?raw';
import down011 from './migrations/down_011_down_migration_marker.sql?raw';
import down012 from './migrations/down_012_workspace_id_sha256_marker.sql?raw';
import down013 from './migrations/down_013_permission_grants_id_text.sql?raw';
import down014 from './migrations/down_014_conversation_columns_promote.sql?raw';

// ────────────────────────────────────────────────────────────
// Migration registry
// ────────────────────────────────────────────────────────────

interface Migration {
  version: number;
  description: string;
  up: string;
  /**
   * v1.4.3 — Down migration SQL. 미정 시 본 migration 을 cross 하는 revertTo
   * 호출은 throw — 데이터 손실 방지. 현재 markers (8-12) 만 down 정의되어
   * 있고 실제 schema 변경 migration (1-7) 은 후속에서 추가.
   */
  down?: string;
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
  {
    version: 8,
    description: 'v1.3.0 — workspace_id deterministic marker (B-1)',
    up: sql008,
    down: down008,
  },
  {
    version: 9,
    description: 'v1.3.1 — permission_grants.id TEXT promote marker (B-2)',
    up: sql009,
    down: down009,
  },
  {
    version: 10,
    description: 'v1.3.2 — JSON-wrapped columns promote marker (B-3)',
    up: sql010,
    down: down010,
  },
  {
    version: 11,
    description: 'v1.3.3 — down-migration marker (B-4)',
    up: sql011,
    down: down011,
  },
  {
    version: 12,
    description: 'v1.4.0 — workspace_id sha256 backfill foundation (B-1 후속)',
    up: sql012,
    down: down012,
  },
  {
    version: 13,
    description: 'v1.4.1 — permission_grants.id INTEGER → TEXT rebuild (B-2)',
    up: sql013,
    down: down013,
  },
  {
    version: 14,
    description: 'v1.4.2 — sessions.conversation columns promote (B-3 1단계)',
    up: sql014,
    down: down014,
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

// ────────────────────────────────────────────────────────────
// v1.4.3 — Down-migration / revertTo
// ────────────────────────────────────────────────────────────

/**
 * RevertToResult — `revertTo` 호출 결과 통계.
 *
 *  - reverted: 실제로 down SQL 이 실행된 migration version 들 (descending).
 *  - from / to: 시작 / 최종 schema_version.
 */
export interface RevertToResult {
  from: number;
  to: number;
  reverted: number[];
}

export class DownMigrationMissingError extends Error {
  constructor(public readonly version: number) {
    super(
      `Migration v${version} 의 down SQL 이 정의되지 않아 revert 를 거절합니다. ` +
        `데이터 손실 방지를 위해 backup 후 manual 처리가 필요합니다.`
    );
    this.name = 'DownMigrationMissingError';
  }
}

/**
 * 현재 schema_version 에서 `targetVersion` 까지 down migrations 를 역순으로
 * 적용. 한 번이라도 down 이 정의 안 된 migration 을 cross 해야 한다면
 * `DownMigrationMissingError` 로 fail-fast (데이터 손실 위험).
 *
 * 호출자 책임:
 *  - 호출 전 DB backup (file copy 권장).
 *  - 호출 후 application 의 in-memory cache 무효화.
 *  - INV: targetVersion 은 0 ≤ target ≤ current.
 */
export function revertTo(db: Database, targetVersion: number): RevertToResult {
  const current = readCurrentVersion(db);
  if (targetVersion < 0 || !Number.isInteger(targetVersion)) {
    throw new Error(`targetVersion must be a non-negative integer (got ${targetVersion})`);
  }
  if (targetVersion > current) {
    throw new Error(
      `Cannot revert to v${targetVersion} from v${current} (target > current).`
    );
  }
  if (targetVersion === current) {
    return { from: current, to: current, reverted: [] };
  }

  // descending — current > current-1 > ... > target+1.
  const toRevert: Migration[] = [];
  for (let v = current; v > targetVersion; v -= 1) {
    const m = MIGRATIONS.find((mg) => mg.version === v);
    if (m === undefined) {
      throw new Error(`No migration registered for version ${v}`);
    }
    if (m.down === undefined) {
      throw new DownMigrationMissingError(v);
    }
    toRevert.push(m);
  }

  const reverted: number[] = [];
  for (const m of toRevert) {
    db.transaction(() => {
      // down SQL — markers 는 SELECT 1, 실제 schema 변경 migration 은 DROP /
      // ALTER 등 명시 statement 가 들어있어야 함.
      db.exec(m.down ?? 'SELECT 1');
      // schema_version 은 한 단계 내려감 (m.version - 1).
      upsertMeta(db, 'version', String(m.version - 1));
    })();
    reverted.push(m.version);
  }

  return { from: current, to: targetVersion, reverted };
}

/**
 * 어떤 migration version 들이 revert 가능한지 (down SQL 보유) 반환. UI 의
 * "이 version 까지 안전하게 되돌릴 수 있어요" 표시에 사용.
 */
export function getRevertableVersions(): readonly number[] {
  return MIGRATIONS.filter((m) => m.down !== undefined).map((m) => m.version);
}
