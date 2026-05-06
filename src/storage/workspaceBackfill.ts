/**
 * Workspace id backfill helper — FNV-1a → sha256 (v1.4.0).
 *
 * Spec: docs/v1.x-roadmap.md (P3 Schema architectural debt B-1 backfill).
 *
 * 본 helper 는 명시적으로 호출할 때만 동작 — application 부팅에서 자동 실행 X.
 * 데이터를 수정하므로 호출 시점은 사용자 인지 (settings panel 의 [데이터베이스
 * 진단] 또는 별도 마이그레이션 도구) 에 위임.
 *
 * 동작:
 *  1. PRAGMA foreign_keys 일시 OFF — id 변경 시 FK 폭주 방지.
 *  2. workspaces 모든 row 순회. `id === workspaceIdFor(root)` (FNV) 인 경우만
 *     "백필 대상". random UUIDv7 / 이미 sha256 인 경우 skip.
 *  3. 새 id = workspaceIdForSha256(root). 같은 row 가 이미 새 id 를 갖고 있으면
 *     `INSERT OR IGNORE` (다른 워크스페이스 충돌 시 skip).
 *  4. UPDATE workspaces.id + cascade UPDATE: sessions / worktrees(있다면).
 *  5. PRAGMA foreign_keys ON 복원.
 *  6. 모두 single transaction — 실패 시 rollback.
 */

import type { Database } from 'better-sqlite3';
import {
  isLegacyFnvWorkspaceId,
  workspaceIdForSha256,
} from '../types/helpers';
import type { WorkspaceId } from '../types';

export interface BackfillResult {
  /** 검사된 workspace row 수. */
  scanned: number;
  /** 실제로 id 가 갱신된 row 수. */
  updated: number;
  /** Skip 된 row (random UUIDv7 또는 이미 sha256). */
  skipped: number;
  /** 충돌 (target sha256 id 가 이미 다른 row 차지) — skip + 경고. */
  conflicts: Array<{ old_id: string; target_id: string; root: string }>;
  /** Cascade 로 갱신된 sessions row 수 (참고용). */
  cascade_sessions: number;
}

/**
 * Backfill 실행. 함수는 transaction 안에서 실행되며 throw 시 자동 rollback.
 *
 * 호출자 책임:
 *  - 호출 전후로 application 의 in-memory cache 무효화 (workspace_id 가 바뀌었으므로).
 *  - production 에서 호출 시 사용자에게 시간이 걸릴 수 있음을 표시.
 */
export function backfillWorkspaceIdsToSha256(db: Database): BackfillResult {
  const result: BackfillResult = {
    scanned: 0,
    updated: 0,
    skipped: 0,
    conflicts: [],
    cascade_sessions: 0,
  };

  // SQLite: PRAGMA foreign_keys 는 transaction 안에서 no-op. transaction
  // 시작 전에 OFF 한 후 이후 commit 시점에 ON 복원.
  const fkPragma = db.prepare('PRAGMA foreign_keys').get() as { foreign_keys?: number } | undefined;
  const fkWasOn = fkPragma?.foreign_keys === 1;
  if (fkWasOn) {
    db.exec('PRAGMA foreign_keys = OFF');
  }

  const tx = db.transaction(() => {
    const rows = db.prepare<unknown[], { id: string; root: string }>(
      'SELECT id, root FROM workspaces'
    ).all() as Array<{ id: string; root: string }>;
    result.scanned = rows.length;

    const updateWorkspace = db.prepare(
      'UPDATE workspaces SET id = ? WHERE id = ?'
    );
    const updateSessionsFk = db.prepare(
      'UPDATE sessions SET workspace_id = ? WHERE workspace_id = ?'
    );
    const checkExistingTarget = db.prepare(
      'SELECT 1 FROM workspaces WHERE id = ?'
    );

    for (const row of rows) {
      // Random UUIDv7 / 이미 sha256 → skip.
      if (!isLegacyFnvWorkspaceId(row.id as WorkspaceId, row.root)) {
        result.skipped += 1;
        continue;
      }
      const newId = workspaceIdForSha256(row.root);
      if (newId === row.id) {
        result.skipped += 1;
        continue;
      }
      const conflict = checkExistingTarget.get(newId);
      if (conflict !== undefined) {
        result.conflicts.push({ old_id: row.id, target_id: newId, root: row.root });
        result.skipped += 1;
        continue;
      }

      // FK OFF 상태이므로 sessions 가 먼저든 workspace 가 먼저든 무관하지만
      // UNIQUE(root) constraint 만 신경. workspace.id 변경이 root 와 무관해
      // 안전.
      updateWorkspace.run(newId, row.id);
      const cascade = updateSessionsFk.run(newId, row.id);
      result.cascade_sessions += Number(cascade.changes ?? 0);
      result.updated += 1;
    }
  });

  try {
    tx();
  } finally {
    if (fkWasOn) {
      db.exec('PRAGMA foreign_keys = ON');
    }
  }

  return result;
}

// ────────────────────────────────────────────────────────────
// v1.4.8 — Detection (read-only)
// ────────────────────────────────────────────────────────────

export interface BackfillDetectionResult {
  /** workspaces 테이블의 row 총 개수. */
  total: number;
  /** id 가 path 의 FNV 와 일치하는 row 수 — backfill 대상. */
  legacy_fnv: number;
  /** target sha256 id 가 이미 다른 row 차지 — backfill 시 conflict 예상. */
  target_conflicts: number;
}

// ────────────────────────────────────────────────────────────
// v1.4.11 — Conflict listing + resolution
// ────────────────────────────────────────────────────────────

export interface BackfillConflictRow {
  /** root 차지 중인 legacy FNV id workspace. */
  legacy_id: string;
  /** sha256 derived target id (다른 row 가 이미 차지). */
  target_id: string;
  /** root 경로 — 동일. */
  root: string;
  /** legacy_id 를 FK 로 참조하는 sessions row 수 (delete 시 영향 범위). */
  session_count: number;
}

/**
 * v1.4.11 — backfill 시 충돌이 예상되는 legacy row 들의 detail 을 반환.
 * `detectLegacyWorkspaceIds` 가 count 만 알려줬다면 이 함수는 사용자가
 * 수동 처리할 수 있도록 row-level 정보 (root + session_count) 를 함께 노출.
 * 데이터 변경 X (read-only).
 */
export function listBackfillConflicts(db: Database): BackfillConflictRow[] {
  const rows = db
    .prepare<unknown[], { id: string; root: string }>('SELECT id, root FROM workspaces')
    .all() as Array<{ id: string; root: string }>;
  const checkExisting = db.prepare('SELECT 1 FROM workspaces WHERE id = ?');
  const countSessions = db.prepare(
    'SELECT COUNT(*) as n FROM sessions WHERE workspace_id = ?'
  );
  const out: BackfillConflictRow[] = [];
  for (const row of rows) {
    if (!isLegacyFnvWorkspaceId(row.id as WorkspaceId, row.root)) continue;
    const target = workspaceIdForSha256(row.root);
    if (target === row.id) continue;
    if (checkExisting.get(target) === undefined) continue;
    const c = countSessions.get(row.id) as { n: number } | undefined;
    out.push({
      legacy_id: row.id,
      target_id: target,
      root: row.root,
      session_count: c?.n ?? 0,
    });
  }
  return out;
}

export interface DeleteLegacyResult {
  /** legacy workspace row 가 실제로 지워졌는지. */
  workspace_deleted: boolean;
  /** cascade 로 함께 지워진 sessions row 수. */
  sessions_deleted: number;
}

/**
 * v1.4.11 — legacy id workspace + 그를 FK 로 참조하는 sessions 들을 삭제.
 * sha256 target row 는 그대로 유지 — 사용자가 새 세션을 그 root 로
 * 만들 때 자연스럽게 사용된다. 충돌 해결의 가장 단순/안전한 옵션.
 *
 * caller 는 호출 전후로 in-memory cache (sessions list 등) 를 무효화.
 */
export function deleteLegacyWorkspace(
  db: Database,
  legacyId: string
): DeleteLegacyResult {
  const result: DeleteLegacyResult = {
    workspace_deleted: false,
    sessions_deleted: 0,
  };
  const tx = db.transaction(() => {
    const sessRes = db
      .prepare('DELETE FROM sessions WHERE workspace_id = ?')
      .run(legacyId);
    result.sessions_deleted = Number(sessRes.changes ?? 0);
    const wsRes = db.prepare('DELETE FROM workspaces WHERE id = ?').run(legacyId);
    result.workspace_deleted = Number(wsRes.changes ?? 0) > 0;
  });
  tx();
  return result;
}

/**
 * v1.4.8 — DB 의 workspaces 를 읽어 backfill 대상 통계를 반환.
 * 데이터 변경 X. 부팅 시 modal 표시 여부 결정에 사용.
 */
export function detectLegacyWorkspaceIds(
  db: Database
): BackfillDetectionResult {
  const rows = db.prepare<unknown[], { id: string; root: string }>(
    'SELECT id, root FROM workspaces'
  ).all() as Array<{ id: string; root: string }>;
  const total = rows.length;
  let legacy = 0;
  let conflicts = 0;
  const checkExisting = db.prepare('SELECT 1 FROM workspaces WHERE id = ?');
  for (const row of rows) {
    if (!isLegacyFnvWorkspaceId(row.id as WorkspaceId, row.root)) continue;
    const target = workspaceIdForSha256(row.root);
    if (target === row.id) continue;
    legacy += 1;
    if (checkExisting.get(target) !== undefined) {
      conflicts += 1;
    }
  }
  return {
    total,
    legacy_fnv: legacy,
    target_conflicts: conflicts,
  };
}
