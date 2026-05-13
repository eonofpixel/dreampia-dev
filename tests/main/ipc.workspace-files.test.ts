/**
 * IPC handler tests — `workspace/list-files` + `workspace/read-file`
 * (v0.6.0 — F-019 @ mention).
 *
 * Mocks:
 *   - electron: ipcMain.handle 캡처 (실제 dialog 는 사용 X)
 *
 * Real fs 사용:
 *   - 각 test 마다 고유 tmp 디렉토리 + 테스트용 파일/하위폴더 생성
 *   - afterEach 에서 정리
 *
 * 검증 포커스:
 *   - 정상 enumerate / read
 *   - ignore_patterns 매칭
 *   - max_files / max_bytes 캡
 *   - path traversal 거절
 *   - binary 파일 거절
 *   - Zod 유효성 검증
 *
 * Spec: docs/ux/patterns/F-019-mention-palette.md
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// ────────────────────────────────────────────────────────────
// Mock electron
// ────────────────────────────────────────────────────────────

type Handler = (evt: unknown, ...args: unknown[]) => unknown | Promise<unknown>;
const handlers = new Map<string, Handler>();

const userDataRef = vi.hoisted(() => ({ current: '' }));
const electronRef = vi.hoisted(() => ({ isPackaged: false }));

vi.mock('electron', () => {
  return {
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
    dialog: {
      showOpenDialog: vi.fn(),
    },
  };
});

import { registerIpcHandlers } from '../../src/main/ipc';
import { __resetSettingsCache } from '../../src/main/settings';
import type { Result } from '../../src/main/types';
import type {
  CommandRunResult,
  FileContent,
  FileEntry,
  RepoContextSummary,
} from '../../src/types/workspace';

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
  testTmpDir = mkdtempSync(join(tmpdir(), 'dreampia-ipc-files-'));
  userDataRef.current = testTmpDir;
  __resetSettingsCache();
  electronRef.isPackaged = false;

  // Workspace 트리 생성:
  //   testTmpDir/workspace/
  //     README.md            (text)
  //     src/main/index.ts    (text)
  //     src/main/preload.ts  (text)
  //     node_modules/foo/index.js   (text — should be ignored by default pattern)
  //     bin/binary.dat       (binary — has NUL byte)
  //     big.txt              (large text — > 8KB to test truncation)
  workspaceRoot = join(testTmpDir, 'workspace');
  mkdirSync(workspaceRoot, { recursive: true });
  writeFileSync(join(workspaceRoot, 'README.md'), '# Hello\nworld\n');
  mkdirSync(join(workspaceRoot, 'src', 'main'), { recursive: true });
  writeFileSync(
    join(workspaceRoot, 'src', 'main', 'index.ts'),
    'export const a = 1;\nexport const b = 2;\n'
  );
  writeFileSync(join(workspaceRoot, 'src', 'main', 'preload.ts'), "export const p = 'preload';\n");
  mkdirSync(join(workspaceRoot, 'node_modules', 'foo'), { recursive: true });
  writeFileSync(
    join(workspaceRoot, 'node_modules', 'foo', 'index.js'),
    'module.exports = { a: 1 };\n'
  );
  mkdirSync(join(workspaceRoot, 'bin'), { recursive: true });
  // binary file w/ NUL byte → looksBinary 가 reject
  writeFileSync(join(workspaceRoot, 'bin', 'binary.dat'), Buffer.from([1, 2, 0, 3, 4]));
  // ~9KB text 파일 — max_bytes=8192 default 보다 큼.
  writeFileSync(
    join(workspaceRoot, 'big.txt'),
    'line\n'.repeat(2000) // 2000 * 5 = 10000 bytes
  );

  registerIpcHandlers(stubApp);
});

afterEach(() => {
  if (testTmpDir.length > 0 && existsSync(testTmpDir)) {
    rmSync(testTmpDir, { recursive: true, force: true });
  }
});

// ────────────────────────────────────────────────────────────
// Tests
// ────────────────────────────────────────────────────────────

describe('IPC workspace/list-files (v0.6.0)', () => {
  it('registers the channel', () => {
    expect(handlers.has('workspace/list-files')).toBe(true);
    expect(handlers.has('workspace/read-file')).toBe(true);
  });

  it('returns expected files (no ignore patterns → includes everything)', async () => {
    const result = await call<Result<FileEntry[]>>('workspace/list-files', {
      workspace_root: workspaceRoot,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const paths = result.value.map((f) => f.path).sort();
    // 5 files: README.md, src/main/index.ts, src/main/preload.ts,
    //         node_modules/foo/index.js, bin/binary.dat, big.txt → 6
    expect(paths).toContain('README.md');
    expect(paths).toContain('src/main/index.ts');
    expect(paths).toContain('src/main/preload.ts');
    expect(paths).toContain('node_modules/foo/index.js');
    expect(paths).toContain('bin/binary.dat');
    expect(paths).toContain('big.txt');
  });

  it('ignore_patterns excludes node_modules', async () => {
    const result = await call<Result<FileEntry[]>>('workspace/list-files', {
      workspace_root: workspaceRoot,
      ignore_patterns: ['node_modules/**'],
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const paths = result.value.map((f) => f.path);
    expect(paths.some((p) => p.startsWith('node_modules/'))).toBe(false);
    // 다른 파일들은 그대로 있어야 한다.
    expect(paths).toContain('README.md');
    expect(paths).toContain('src/main/index.ts');
  });

  it('returns FileEntry with size_bytes + ISO mtime', async () => {
    const result = await call<Result<FileEntry[]>>('workspace/list-files', {
      workspace_root: workspaceRoot,
      ignore_patterns: ['node_modules/**', 'bin/**'],
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const readme = result.value.find((f) => f.path === 'README.md');
    expect(readme).toBeDefined();
    if (readme === undefined) return;
    expect(readme.size_bytes).toBeGreaterThan(0);
    // ISO 8601 형식: 2024-...T...Z
    expect(readme.mtime).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it('respects max_files cap', async () => {
    const result = await call<Result<FileEntry[]>>('workspace/list-files', {
      workspace_root: workspaceRoot,
      max_files: 2,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.length).toBeLessThanOrEqual(2);
  });

  it('rejects non-existent workspace_root', async () => {
    const result = await call<Result<FileEntry[]>>('workspace/list-files', {
      workspace_root: '/this/path/does/not/exist/xyz123',
    });
    expect(result.ok).toBe(false);
  });

  it('rejects malformed args via Zod', async () => {
    const result = await call<Result<FileEntry[]>>('workspace/list-files', {
      // workspace_root missing
      ignore_patterns: [],
    });
    expect(result.ok).toBe(false);
  });

  it('returns forward-slash paths even on Windows-style names', async () => {
    const result = await call<Result<FileEntry[]>>('workspace/list-files', {
      workspace_root: workspaceRoot,
      ignore_patterns: ['node_modules/**', 'bin/**', 'big.txt'],
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    for (const f of result.value) {
      expect(f.path).not.toContain('\\');
    }
  });
});

describe('IPC workspace/read-file (v0.6.0)', () => {
  it('returns content + line_count for text file', async () => {
    const result = await call<Result<FileContent>>('workspace/read-file', {
      workspace_root: workspaceRoot,
      rel_path: 'README.md',
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.content).toContain('Hello');
    expect(result.value.line_count).toBeGreaterThanOrEqual(2);
    expect(result.value.truncated).toBe(false);
  });

  it('truncates content at max_bytes when file is larger', async () => {
    const result = await call<Result<FileContent>>('workspace/read-file', {
      workspace_root: workspaceRoot,
      rel_path: 'big.txt',
      max_bytes: 100,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.truncated).toBe(true);
    expect(result.value.content.length).toBeLessThanOrEqual(100);
  });

  it('does NOT truncate when content fits within max_bytes', async () => {
    const result = await call<Result<FileContent>>('workspace/read-file', {
      workspace_root: workspaceRoot,
      rel_path: 'README.md',
      max_bytes: 1024,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.truncated).toBe(false);
  });

  it('rejects path traversal (../../../etc/passwd)', async () => {
    const result = await call<Result<FileContent>>('workspace/read-file', {
      workspace_root: workspaceRoot,
      rel_path: '../../../etc/passwd',
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toContain('path traversal');
  });

  it('rejects binary file (NUL byte detected)', async () => {
    const result = await call<Result<FileContent>>('workspace/read-file', {
      workspace_root: workspaceRoot,
      rel_path: 'bin/binary.dat',
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toContain('binary');
  });

  it('rejects directory paths', async () => {
    const result = await call<Result<FileContent>>('workspace/read-file', {
      workspace_root: workspaceRoot,
      rel_path: 'src',
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toContain('directory');
  });

  it('rejects file > 1MB', async () => {
    // Create a 1.1MB text file (above hard limit)
    const big = join(workspaceRoot, 'huge.txt');
    writeFileSync(big, 'a'.repeat(1024 * 1024 + 1024));
    const result = await call<Result<FileContent>>('workspace/read-file', {
      workspace_root: workspaceRoot,
      rel_path: 'huge.txt',
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toContain('too large');
  });

  it('rejects non-existent file', async () => {
    const result = await call<Result<FileContent>>('workspace/read-file', {
      workspace_root: workspaceRoot,
      rel_path: 'does-not-exist.txt',
    });
    expect(result.ok).toBe(false);
  });

  it('rejects malformed args via Zod', async () => {
    const result = await call<Result<FileContent>>('workspace/read-file', {
      workspace_root: workspaceRoot,
      // rel_path missing
    });
    expect(result.ok).toBe(false);
  });

  it('rejects max_bytes > 1MB hard limit', async () => {
    const result = await call<Result<FileContent>>('workspace/read-file', {
      workspace_root: workspaceRoot,
      rel_path: 'README.md',
      max_bytes: 1024 * 1024 * 2, // 2MB
    });
    expect(result.ok).toBe(false);
  });

  it('counts lines correctly (\\n + 1)', async () => {
    // README.md has '# Hello\nworld\n' → 2 newlines, content '# Hello\nworld\n'
    // → \n count = 2 → line_count = 3 (slice 끝의 \n 도 newline 으로 카운트)
    const result = await call<Result<FileContent>>('workspace/read-file', {
      workspace_root: workspaceRoot,
      rel_path: 'README.md',
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.line_count).toBe(3);
  });
});

describe('IPC workspace/inspect + run-safe-command (local repo coding loop v1)', () => {
  it('summarizes repo context, package scripts, and safe commands', async () => {
    mkdirSync(join(workspaceRoot, 'tests'), { recursive: true });
    writeFileSync(join(workspaceRoot, 'tests', 'app.test.ts'), 'expect(true).toBe(true);\n');
    writeFileSync(
      join(workspaceRoot, 'package.json'),
      JSON.stringify(
        {
          scripts: {
            typecheck: 'tsc --noEmit',
            lint: 'eslint .',
            test: 'vitest run',
            build: 'vite build',
          },
        },
        null,
        2
      )
    );

    const result = await call<Result<RepoContextSummary>>('workspace/inspect', {
      workspace_root: workspaceRoot,
      max_files: 100,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.key_files.some((file) => file.path === 'README.md')).toBe(true);
    expect(result.value.test_files.some((file) => file.path === 'tests/app.test.ts')).toBe(true);
    expect(result.value.safe_commands.map((script) => script.command)).toEqual([
      'npm run typecheck',
      'npm run lint',
      'npm test',
    ]);
    expect(result.value.scripts.some((script) => script.name === 'build')).toBe(true);
  });

  it('rejects commands outside the safe allowlist', async () => {
    const result = await call<Result<CommandRunResult>>('workspace/run-safe-command', {
      workspace_root: workspaceRoot,
      command: 'git push',
    });

    expect(result.ok).toBe(false);
  });

  it('returns a structured result for an allowlisted npm test command', async () => {
    writeFileSync(
      join(workspaceRoot, 'package.json'),
      JSON.stringify({
        scripts: {
          test: 'node -e "console.log(\'safe test ok\')"',
        },
      })
    );

    const result = await call<Result<CommandRunResult>>('workspace/run-safe-command', {
      workspace_root: workspaceRoot,
      command: 'npm test',
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.command).toBe('npm test');
    expect(result.value.cwd).toBe(workspaceRoot);
    expect(result.value.started_at).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(result.value.ended_at).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(result.value.summary.length).toBeGreaterThan(0);
    if (result.value.status === 'completed') {
      expect(result.value.exit_code).toBe(0);
      expect(result.value.stdout_tail).toContain('safe test ok');
    }
  });
});
