/**
 * v1.4.8 — Workspace ID backfill IPC handlers.
 *
 * 검증:
 *  - app:check-workspace-backfill — store 미등록 시 legacy=0 + flag.
 *  - app:check-workspace-backfill — legacy FNV row 가 있으면 legacy_fnv > 0.
 *  - app:check-workspace-backfill — flag_done 이 settings 와 동기.
 *  - app:run-workspace-backfill — 성공 시 settings.workspace_backfill_done=true.
 *  - app:dismiss-workspace-backfill — flag 만 set.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtempSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

type Handler = (evt: unknown, ...args: unknown[]) => unknown | Promise<unknown>;
const handlers = new Map<string, Handler>();
const userDataRef = vi.hoisted(() => ({ current: '' }));

vi.mock('electron', () => ({
  app: {
    getVersion: () => '0.0.1-test',
    getPath: () => userDataRef.current,
    isPackaged: false,
  },
  ipcMain: {
    handle: (channel: string, handler: Handler): void => {
      handlers.set(channel, handler);
    },
    removeHandler: (channel: string): void => {
      handlers.delete(channel);
    },
  },
  dialog: { showOpenDialog: vi.fn() },
}));

import { registerIpcHandlers } from '../../src/main/ipc';
import { __resetSettingsCache, readSettings } from '../../src/main/settings';
import { SessionStore } from '../../src/storage';
import {
  workspaceIdFor,
  workspaceIdForSha256,
} from '../../src/types/helpers';
import type { Result } from '../../src/main/types';

const evt = {} as unknown;

async function call<T>(channel: string, ...args: unknown[]): Promise<T> {
  const h = handlers.get(channel);
  if (h === undefined) throw new Error(`no handler: ${channel}`);
  return (await h(evt, ...args)) as T;
}

const stubApp = {
  getVersion: () => '0.0.1-test',
  getPath: () => userDataRef.current,
  isPackaged: false,
} as unknown as Parameters<typeof registerIpcHandlers>[0];

let testTmpDir = '';

function insertWorkspace(store: SessionStore, id: string, root: string): void {
  store
    .getDb()
    .prepare(
      `INSERT INTO workspaces
       (id, root, name, git_state_json, index_status, file_count, indexed_at, created_at, is_temporary)
       VALUES (?, ?, 'ws', NULL, 'idle', NULL, NULL, '2026-05-07T00:00:00.000Z', 0)`
    )
    .run(id, root);
}

describe('v1.4.8 — workspace backfill IPC', () => {
  beforeEach(() => {
    handlers.clear();
    testTmpDir = mkdtempSync(join(tmpdir(), 'dreampia-bk-'));
    userDataRef.current = testTmpDir;
    __resetSettingsCache();
  });

  afterEach(() => {
    if (testTmpDir.length > 0 && existsSync(testTmpDir)) {
      rmSync(testTmpDir, { recursive: true, force: true });
    }
  });

  it('handler 가 등록됨', () => {
    registerIpcHandlers(stubApp);
    expect(handlers.has('app:check-workspace-backfill')).toBe(true);
    expect(handlers.has('app:run-workspace-backfill')).toBe(true);
    expect(handlers.has('app:dismiss-workspace-backfill')).toBe(true);
  });

  it('check — store 없음 + flag 없음 → legacy=0 + flag_done=false', async () => {
    registerIpcHandlers(stubApp);
    const r = await call<
      Result<{
        total: number;
        legacy_fnv: number;
        target_conflicts: number;
        flag_done: boolean;
      }>
    >('app:check-workspace-backfill');
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.legacy_fnv).toBe(0);
    expect(r.value.flag_done).toBe(false);
  });

  it('check — store 가 있고 FNV row → legacy_fnv > 0', async () => {
    const store = new SessionStore(':memory:');
    try {
      insertWorkspace(store, workspaceIdFor('/proj/x'), '/proj/x');
      insertWorkspace(store, workspaceIdForSha256('/proj/y'), '/proj/y');
      registerIpcHandlers(stubApp, store);
      const r = await call<
        Result<{ total: number; legacy_fnv: number; flag_done: boolean }>
      >('app:check-workspace-backfill');
      expect(r.ok).toBe(true);
      if (!r.ok) return;
      expect(r.value.total).toBe(2);
      expect(r.value.legacy_fnv).toBe(1);
      expect(r.value.flag_done).toBe(false);
    } finally {
      store.close();
    }
  });

  it('check — flag_done=true 면 그대로 반환', async () => {
    const store = new SessionStore(':memory:');
    try {
      registerIpcHandlers(stubApp, store);
      await call<Result<void>>('app:dismiss-workspace-backfill');
      __resetSettingsCache();
      const r = await call<Result<{ flag_done: boolean }>>(
        'app:check-workspace-backfill'
      );
      expect(r.ok).toBe(true);
      if (!r.ok) return;
      expect(r.value.flag_done).toBe(true);
    } finally {
      store.close();
    }
  });

  it('run — 성공 시 settings.workspace_backfill_done=true 자동 설정', async () => {
    const store = new SessionStore(':memory:');
    try {
      insertWorkspace(store, workspaceIdFor('/p1'), '/p1');
      registerIpcHandlers(stubApp, store);
      const r = await call<Result<{ updated: number }>>(
        'app:run-workspace-backfill'
      );
      expect(r.ok).toBe(true);
      if (!r.ok) return;
      expect(r.value.updated).toBe(1);
      __resetSettingsCache();
      expect(readSettings().workspace_backfill_done).toBe(true);
    } finally {
      store.close();
    }
  });

  it('dismiss — backfill 미실행 + flag 만 set', async () => {
    const store = new SessionStore(':memory:');
    try {
      const fnv = workspaceIdFor('/keep-fnv');
      insertWorkspace(store, fnv, '/keep-fnv');
      registerIpcHandlers(stubApp, store);
      const r = await call<Result<void>>('app:dismiss-workspace-backfill');
      expect(r.ok).toBe(true);
      __resetSettingsCache();
      expect(readSettings().workspace_backfill_done).toBe(true);
      // 데이터 변경 없음 — FNV id 그대로.
      const row = store
        .getDb()
        .prepare<unknown[], { id: string }>('SELECT id FROM workspaces')
        .get() as { id: string };
      expect(row.id).toBe(fnv);
    } finally {
      store.close();
    }
  });
});
