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
