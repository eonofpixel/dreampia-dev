/**
 * IPC handler tests — `workspace/write-file` (v2.7.0 Phase 3).
 *
 * 검증 포커스:
 *   - atomic write (tmp → rename, leftover tmp 없음)
 *   - 새 파일 생성 (workspace_root 안의 부모 디렉토리도 자동 생성)
 *   - 기존 파일 덮어쓰기
 *   - expected_mtime 불일치 → conflict='mtime_mismatch' (write 미수행)
 *   - expected_mtime 일치 → 정상 write
 *   - path traversal 거절
 *   - 디렉토리 경로 거절
 *   - content > 1MB 거절 (zod schema)
 *
 * Decision doc: ../../CODE_TAB_DECISION.md.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// ────────────────────────────────────────────────────────────
// Mock electron (mirror existing ipc.workspace-files.test.ts)
// ────────────────────────────────────────────────────────────

type Handler = (evt: unknown, ...args: unknown[]) => unknown | Promise<unknown>;
const handlers = new Map<string, Handler>();
const userDataRef = vi.hoisted(() => ({ current: '' }));
const electronRef = vi.hoisted(() => ({ isPackaged: false }));

vi.mock('electron', () => ({
  app: {
    getVersion: () => '0.0.1-test',
    getPath: (_n: string): string => userDataRef.current,
    get isPackaged(): boolean {
      return electronRef.isPackaged;
    },
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
import { __resetSettingsCache } from '../../src/main/settings';
import type { Result } from '../../src/main/types';
import type { FileStatResult, FileWriteResult } from '../../src/types/workspace';

const evt = {} as unknown;

async function call<T>(channel: string, ...args: unknown[]): Promise<T> {
  const handler = handlers.get(channel);
  if (handler === undefined) {
    throw new Error(`no handler registered for ${channel}`);
  }
  return (await handler(evt, ...args)) as T;
}

const stubApp = {
  getVersion: () => '0.0.1-test',
  getPath: (_n: string) => userDataRef.current,
  get isPackaged(): boolean {
    return electronRef.isPackaged;
  },
} as unknown as Parameters<typeof registerIpcHandlers>[0];

let testTmpDir = '';
let workspaceRoot = '';

beforeEach(() => {
  handlers.clear();
  testTmpDir = mkdtempSync(join(tmpdir(), 'dreampia-ipc-write-'));
  userDataRef.current = testTmpDir;
  __resetSettingsCache();
  electronRef.isPackaged = false;
  workspaceRoot = join(testTmpDir, 'workspace');
  mkdirSync(workspaceRoot, { recursive: true });
  registerIpcHandlers(stubApp);
});

afterEach(() => {
  if (testTmpDir.length > 0 && existsSync(testTmpDir)) {
    rmSync(testTmpDir, { recursive: true, force: true });
  }
});

describe('IPC workspace/write-file (v2.7.0 Phase 3)', () => {
  it('registers the channel', () => {
    expect(handlers.has('workspace/write-file')).toBe(true);
  });

  it('writes a new file inside workspace', async () => {
    const result = await call<Result<FileWriteResult>>('workspace/write-file', {
      workspace_root: workspaceRoot,
      rel_path: 'src/new.ts',
      content: 'export const x = 1;\n',
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.conflict).toBeUndefined();
    expect(result.value.size_bytes).toBeGreaterThan(0);
    expect(typeof result.value.mtime).toBe('string');

    // Real disk verification.
    const target = join(workspaceRoot, 'src', 'new.ts');
    expect(existsSync(target)).toBe(true);
    expect(readFileSync(target, 'utf8')).toBe('export const x = 1;\n');

    // No leftover tmp file in the parent directory.
    const dir = join(workspaceRoot, 'src');
    const entries = readdirSync(dir);
    expect(entries.filter((n) => n.includes('.tmp.'))).toEqual([]);
  });

  it('overwrites existing file', async () => {
    const target = join(workspaceRoot, 'a.ts');
    writeFileSync(target, 'old content\n');

    const result = await call<Result<FileWriteResult>>('workspace/write-file', {
      workspace_root: workspaceRoot,
      rel_path: 'a.ts',
      content: 'new content\n',
    });
    expect(result.ok).toBe(true);
    expect(readFileSync(target, 'utf8')).toBe('new content\n');
  });

  it('expected_mtime mismatch returns conflict without writing', async () => {
    const target = join(workspaceRoot, 'a.ts');
    writeFileSync(target, 'original\n');
    const originalMtime = statSync(target).mtime.toISOString();

    const result = await call<Result<FileWriteResult>>('workspace/write-file', {
      workspace_root: workspaceRoot,
      rel_path: 'a.ts',
      content: 'should not be written',
      expected_mtime: '2099-01-01T00:00:00.000Z', // wrong
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.conflict).toBe('mtime_mismatch');
    // Disk content unchanged.
    expect(readFileSync(target, 'utf8')).toBe('original\n');
    // Returned mtime is the disk's actual mtime.
    expect(result.value.mtime).toBe(originalMtime);
  });

  it('expected_mtime match writes through', async () => {
    const target = join(workspaceRoot, 'a.ts');
    writeFileSync(target, 'original\n');
    const mtime = statSync(target).mtime.toISOString();

    const result = await call<Result<FileWriteResult>>('workspace/write-file', {
      workspace_root: workspaceRoot,
      rel_path: 'a.ts',
      content: 'updated\n',
      expected_mtime: mtime,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.conflict).toBeUndefined();
    expect(readFileSync(target, 'utf8')).toBe('updated\n');
  });

  it('rejects path traversal', async () => {
    const result = await call<Result<FileWriteResult>>('workspace/write-file', {
      workspace_root: workspaceRoot,
      rel_path: '../escape.ts',
      content: 'malicious',
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.toLowerCase()).toContain('traversal');
  });

  it('rejects writing to a directory path', async () => {
    mkdirSync(join(workspaceRoot, 'subdir'));
    const result = await call<Result<FileWriteResult>>('workspace/write-file', {
      workspace_root: workspaceRoot,
      rel_path: 'subdir',
      content: 'should fail',
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toMatch(/directory/i);
  });

  it('rejects content larger than 1 MB (zod schema)', async () => {
    const oversize = 'a'.repeat(1024 * 1024 + 1);
    const result = await call<Result<FileWriteResult>>('workspace/write-file', {
      workspace_root: workspaceRoot,
      rel_path: 'big.txt',
      content: oversize,
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.toLowerCase()).toMatch(/validation|too|max/i);
  });
});

describe('IPC workspace/stat-file (v2.7.0 Phase 3 sub-PR)', () => {
  it('registers the channel', () => {
    expect(handlers.has('workspace/stat-file')).toBe(true);
  });

  it('returns exists=false when file does not exist', async () => {
    const result = await call<Result<FileStatResult>>('workspace/stat-file', {
      workspace_root: workspaceRoot,
      rel_path: 'missing.ts',
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.exists).toBe(false);
    expect(result.value.mtime).toBeUndefined();
    expect(result.value.size_bytes).toBeUndefined();
  });

  it('returns exists=true with mtime + size for existing file', async () => {
    writeFileSync(join(workspaceRoot, 'a.ts'), 'export const x = 1;\n');

    const result = await call<Result<FileStatResult>>('workspace/stat-file', {
      workspace_root: workspaceRoot,
      rel_path: 'a.ts',
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.exists).toBe(true);
    expect(typeof result.value.mtime).toBe('string');
    expect(result.value.size_bytes).toBeGreaterThan(0);
  });

  it('rejects path traversal', async () => {
    const result = await call<Result<FileStatResult>>('workspace/stat-file', {
      workspace_root: workspaceRoot,
      rel_path: '../escape.ts',
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.toLowerCase()).toContain('traversal');
  });

  it('mtime changes after write', async () => {
    const target = join(workspaceRoot, 'a.ts');
    writeFileSync(target, 'first\n');
    const first = await call<Result<FileStatResult>>('workspace/stat-file', {
      workspace_root: workspaceRoot,
      rel_path: 'a.ts',
    });
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    const firstMtime = first.value.mtime;

    // Wait a tick to ensure mtime resolution captures the change.
    await new Promise<void>((res) => setTimeout(res, 20));
    writeFileSync(target, 'second\n');

    const second = await call<Result<FileStatResult>>('workspace/stat-file', {
      workspace_root: workspaceRoot,
      rel_path: 'a.ts',
    });
    expect(second.ok).toBe(true);
    if (!second.ok) return;
    expect(second.value.mtime).not.toBe(firstMtime);
  });
});
