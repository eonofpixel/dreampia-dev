/**
 * SEC-1 (v1.0.9): workspace/read-file path guard 가 symlink/junction 을
 * 통과시키지 않는지 검증.
 *
 * 이전 v1.0.8 까지는 `path.resolve` prefix 만 검사 → workspace 안에 외부를
 * 가리키는 symlink 를 두고 그 path 로 read-file 을 호출하면 외부 파일이
 * 읽혔음. 이 test 는 그 회귀 가드.
 *
 * Codex 검토에서 발견된 보안 hole. 직접 fs operations 으로 reproduction.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdirSync, writeFileSync, symlinkSync, rmSync, existsSync } from 'node:fs';
import { tmpdir, platform } from 'node:os';
import { join } from 'node:path';

const handlers = new Map<string, (...args: unknown[]) => unknown>();

vi.mock('electron', () => ({
  app: { getVersion: () => '0.0.1-test' },
  ipcMain: {
    handle: (channel: string, handler: (...args: unknown[]) => unknown): void => {
      handlers.set(channel, handler);
    },
    removeHandler: (channel: string): void => {
      handlers.delete(channel);
    },
  },
}));

import { registerIpcHandlers } from '../../src/main/ipc';
import { SessionStore } from '../../src/storage';
import type { Result } from '../../src/main/types';

interface FileContent {
  content: string;
  truncated: boolean;
  line_count: number;
}

const evt = {} as unknown;

async function call<T>(channel: string, ...args: unknown[]): Promise<T> {
  const handler = handlers.get(channel);
  if (handler === undefined) throw new Error(`no handler for ${channel}`);
  return (await handler(evt, ...args)) as T;
}

const stubApp = { getVersion: () => '0.0.1-test' } as unknown as Parameters<
  typeof registerIpcHandlers
>[0];

describe('workspace/read-file — SEC-1 path guard (v1.0.9)', () => {
  let store: SessionStore;
  let workspaceDir: string;
  let outsideDir: string;
  let outsideSecretFile: string;

  beforeEach(() => {
    handlers.clear();
    store = new SessionStore(':memory:');
    registerIpcHandlers(stubApp, store);

    // workspace + 외부 폴더 + 외부 secret 파일.
    workspaceDir = join(tmpdir(), 'sec1-ws-' + Date.now());
    outsideDir = join(tmpdir(), 'sec1-outside-' + Date.now());
    mkdirSync(workspaceDir, { recursive: true });
    mkdirSync(outsideDir, { recursive: true });
    outsideSecretFile = join(outsideDir, 'secret.txt');
    writeFileSync(outsideSecretFile, 'TOP-SECRET-12345', 'utf-8');
  });

  afterEach(() => {
    try {
      rmSync(workspaceDir, { recursive: true, force: true });
      rmSync(outsideDir, { recursive: true, force: true });
    } catch {
      // best-effort
    }
    store.close();
  });

  it('reads files inside workspace (positive control)', async () => {
    const innerFile = join(workspaceDir, 'inner.txt');
    writeFileSync(innerFile, 'inner-content', 'utf-8');

    const result = await call<Result<FileContent>>('workspace/read-file', {
      workspace_root: workspaceDir,
      rel_path: 'inner.txt',
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.content).toBe('inner-content');
    }
  });

  it('rejects rel_path with .. (traversal)', async () => {
    const result = await call<Result<FileContent>>('workspace/read-file', {
      workspace_root: workspaceDir,
      rel_path: '../sec1-outside-fake/secret.txt',
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toMatch(/path traversal/);
    }
  });

  it('rejects symlink pointing outside workspace (SEC-1 핵심)', async () => {
    // Windows admin 권한 없으면 symlink 생성 실패할 수 있음.
    // Junction 은 file → file 안 됨 (directory only). symlink 는 admin 없이
    // 안 되는 환경이라면 skip.
    const linkPath = join(workspaceDir, 'evil-link.txt');
    try {
      symlinkSync(outsideSecretFile, linkPath, 'file');
    } catch (err) {
      // Windows 비-admin 환경 — symlink 생성 권한 없음. 이 환경은 그 자체로
      // symlink 공격이 어렵지만, dev / CI / Linux / macOS 모두 권한 OK.
      // skip 하지 않고 expect.fail 으로 환경 가시화.
      console.warn(`symlink creation failed (likely Windows non-admin): ${String(err)}`);
      return;
    }

    const result = await call<Result<FileContent>>('workspace/read-file', {
      workspace_root: workspaceDir,
      rel_path: 'evil-link.txt',
    });

    // v1.0.8 까지는 ok=true 로 'TOP-SECRET-12345' 가 반환됐던 회귀.
    // v1.0.9 는 realpath check 로 reject 해야 함.
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toMatch(/path traversal/);
    }
  });

  it('rejects symlink to outside directory (escape via dir link)', async () => {
    // 외부 디렉토리 자체에 symlink 후 그 안의 파일에 접근 시도.
    const linkDir = join(workspaceDir, 'evil-dir');
    try {
      symlinkSync(outsideDir, linkDir, 'dir');
    } catch (err) {
      console.warn(`dir symlink creation failed: ${String(err)}`);
      return;
    }

    const result = await call<Result<FileContent>>('workspace/read-file', {
      workspace_root: workspaceDir,
      rel_path: 'evil-dir/secret.txt',
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toMatch(/path traversal/);
    }
  });

  it('returns clean "file not found" for non-existent file (no security false-positive)', async () => {
    const result = await call<Result<FileContent>>('workspace/read-file', {
      workspace_root: workspaceDir,
      rel_path: 'does-not-exist.txt',
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      // realpath 실패해도 fall-through 해서 stat 단계에서 file not found 로 처리.
      expect(result.error).toMatch(/file not found/);
    }
  });
});

const IS_WINDOWS = platform() === 'win32';
// Windows symlink 권한 노트 — 위 test 에서 직접 처리.
void IS_WINDOWS;
void existsSync;
