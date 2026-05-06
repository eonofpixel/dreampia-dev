/**
 * Workspace id backfill helper unit tests (v1.4.0).
 *
 * 검증:
 *  - FNV-기반 workspace_id 만 backfill 대상.
 *  - sha256 / random UUIDv7 id 는 skip.
 *  - sessions.workspace_id FK 도 cascade UPDATE.
 *  - target sha256 id 가 이미 존재 → conflict 기록 + skip.
 *  - Transaction 안 — 중간 throw 시 rollback (현재 코드는 throw 없음, 안전망).
 *  - foreign_keys pragma 호출 후 ON 으로 복원.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { SessionStore } from '../../src/storage';
import { backfillWorkspaceIdsToSha256 } from '../../src/storage/workspaceBackfill';
import {
  workspaceIdFor,
  workspaceIdForSha256,
} from '../../src/types/helpers';

interface WorkspaceRow {
  id: string;
  root: string;
}

describe('v1.4.0 — backfillWorkspaceIdsToSha256', () => {
  let store: SessionStore;

  beforeEach(() => {
    store = new SessionStore(':memory:');
  });

  afterEach(() => {
    store.close();
  });

  function insertWorkspace(id: string, root: string, name = 'ws'): void {
    store
      .getDb()
      .prepare(
        `INSERT INTO workspaces
         (id, root, name, git_state_json, index_status, file_count, indexed_at, created_at, is_temporary)
         VALUES (?, ?, ?, NULL, 'idle', NULL, NULL, '2026-05-06T00:00:00.000Z', 0)`
      )
      .run(id, root, name);
  }

  function readWorkspaces(): WorkspaceRow[] {
    return store.getDb().prepare<unknown[], WorkspaceRow>(
      'SELECT id, root FROM workspaces'
    ).all() as WorkspaceRow[];
  }

  it('FNV id → sha256 id 로 backfill', () => {
    const root = '/some/proj';
    const fnvId = workspaceIdFor(root);
    insertWorkspace(fnvId, root);
    const result = backfillWorkspaceIdsToSha256(store.getDb());
    expect(result.scanned).toBe(1);
    expect(result.updated).toBe(1);
    expect(result.skipped).toBe(0);
    expect(result.conflicts).toEqual([]);
    const rows = readWorkspaces();
    expect(rows[0]!.id).toBe(workspaceIdForSha256(root));
  });

  it('이미 sha256 id 인 row 는 skip (idempotent)', () => {
    const root = '/p2';
    const shaId = workspaceIdForSha256(root);
    insertWorkspace(shaId, root);
    const result = backfillWorkspaceIdsToSha256(store.getDb());
    expect(result.updated).toBe(0);
    expect(result.skipped).toBe(1);
    expect(readWorkspaces()[0]!.id).toBe(shaId);
  });

  it('random UUIDv7 같은 id (FNV 도 sha256 도 아님) → skip', () => {
    const root = '/p3';
    insertWorkspace('019d-zzzz-aaaa-bbbb', root);
    const result = backfillWorkspaceIdsToSha256(store.getDb());
    expect(result.updated).toBe(0);
    expect(result.skipped).toBe(1);
  });

  it('cascade UPDATE — sessions.workspace_id 도 함께 갱신', () => {
    const root = '/proj-with-session';
    const fnvId = workspaceIdFor(root);
    insertWorkspace(fnvId, root);
    // 최소한의 session row INSERT — 다른 NOT NULL 컬럼은 모르기 때문에 SQL 직접.
    // FK 제약 때문에 workspace insert 후만 가능.
    const db = store.getDb();
    db.prepare(
      `INSERT INTO sessions (id, schema_version, provider, workspace_id, title, created_at, updated_at)
       VALUES (?, 1, 'codex', ?, 'sess1', '2026-05-06T00:00:00.000Z', '2026-05-06T00:00:00.000Z')`
    ).run('s1', fnvId);
    const result = backfillWorkspaceIdsToSha256(db);
    expect(result.updated).toBe(1);
    expect(result.cascade_sessions).toBe(1);
    const sessRow = db
      .prepare('SELECT workspace_id FROM sessions WHERE id = ?')
      .get('s1') as { workspace_id: string };
    expect(sessRow.workspace_id).toBe(workspaceIdForSha256(root));
  });

  it('target sha256 id 가 이미 다른 row 차지 → conflict + skip', () => {
    const rootA = '/A';
    const rootB = '/B';
    // 의도적으로 충돌 시뮬레이션 — root B 에 root A 의 sha256 id 직접 삽입.
    // (실제로는 안 일어나지만 안전망 테스트.)
    const shaForA = workspaceIdForSha256(rootA);
    insertWorkspace(workspaceIdFor(rootA), rootA, 'A'); // FNV id, 백필 대상
    insertWorkspace(shaForA, rootB, 'B'); // 이미 target id 차지

    const result = backfillWorkspaceIdsToSha256(store.getDb());
    expect(result.scanned).toBe(2);
    expect(result.updated).toBe(0);
    expect(result.conflicts.length).toBe(1);
    expect(result.conflicts[0]!.target_id).toBe(shaForA);
  });

  it('foreign_keys pragma 가 backfill 후에도 ON 으로 복원', () => {
    const db = store.getDb();
    db.exec('PRAGMA foreign_keys = ON');
    insertWorkspace(workspaceIdFor('/x'), '/x');
    backfillWorkspaceIdsToSha256(db);
    const row = db.prepare('PRAGMA foreign_keys').get() as {
      foreign_keys?: number;
    };
    expect(row.foreign_keys).toBe(1);
  });
});
