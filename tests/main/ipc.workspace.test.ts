/**
 * IPC handler tests — `workspace/*` namespace + `app:get-default-workspace`
 * (Phase 2 fix: workspace picker + settings.json 영속).
 *
 * Mocks:
 *   - electron: ipcMain.handle 캡처 + dialog.showOpenDialog 인젝션
 *
 * Real fs 사용:
 *   - 각 test 마다 고유 tmp 디렉토리 (`os.tmpdir()/dreampia-test-<rand>`)
 *   - app.getPath('userData') 이 그 디렉토리 반환
 *   - afterEach 에서 정리
 *
 * Spec: docs/permission/levels.md (workspace 의 의도된 경로)
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// ────────────────────────────────────────────────────────────
// Mock electron — must come before importing anything that uses it
// ────────────────────────────────────────────────────────────

type Handler = (evt: unknown, ...args: unknown[]) => unknown | Promise<unknown>;
const handlers = new Map<string, Handler>();

interface OpenDialogResult {
  canceled: boolean;
  filePaths: string[];
}
let nextDialogResult: OpenDialogResult = { canceled: true, filePaths: [] };

// vi.hoisted: 호이스트된 mock 안에서 testTmpDir 를 lazy 하게 가져오기 위한 ref.
const userDataRef = vi.hoisted(() => ({ current: '' }));
// Phase 3 audit (HIGH): app:get-default-workspace 가 isPackaged 에 따라
// strict mode 동작 — 테스트별 토글.
const electronRef = vi.hoisted(() => ({ isPackaged: false }));

vi.mock('electron', () => {
  return {
    app: {
      getVersion: () => '0.0.1-test',
      getPath: (name: string): string => {
        if (name === 'userData') return userDataRef.current;
        return userDataRef.current;
      },
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
      showOpenDialog: vi.fn(async () => nextDialogResult),
    },
  };
});

// Imports MUST come after vi.mock so they pick up the stubs.
import { registerIpcHandlers } from '../../src/main/ipc';
import { __resetSettingsCache } from '../../src/main/settings';
import type { Result } from '../../src/main/types';

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

beforeEach(() => {
  handlers.clear();
  // 각 테스트마다 고유 tmp dir → 다른 테스트의 settings.json 누설 차단.
  testTmpDir = mkdtempSync(join(tmpdir(), 'dreampia-ipc-workspace-'));
  userDataRef.current = testTmpDir;
  __resetSettingsCache();
  nextDialogResult = { canceled: true, filePaths: [] };
  // 기본은 unpackaged (dev/e2e) — process.cwd() fallback 허용.
  electronRef.isPackaged = false;
  registerIpcHandlers(stubApp);
});

afterEach(() => {
  // 정리 — 실제 디스크 잔여물 X.
  if (testTmpDir.length > 0 && existsSync(testTmpDir)) {
    rmSync(testTmpDir, { recursive: true, force: true });
  }
});

// ────────────────────────────────────────────────────────────
// Suite
// ────────────────────────────────────────────────────────────

describe('IPC workspace handlers', () => {
  it('registers workspace channels', () => {
    expect(handlers.has('workspace/pick-folder')).toBe(true);
    expect(handlers.has('workspace/get')).toBe(true);
  });

  describe('workspace/get', () => {
    it('returns null when settings.json does not exist', async () => {
      const result = await call<Result<{ path: string; name: string } | null>>('workspace/get');
      expect(result).toEqual({ ok: true, value: null });
    });

    it('returns null when settings.json missing required fields', async () => {
      writeFileSync(
        join(testTmpDir, 'settings.json'),
        JSON.stringify({ random_field: 'noise' })
      );
      __resetSettingsCache();
      const result = await call<Result<{ path: string; name: string } | null>>('workspace/get');
      expect(result).toEqual({ ok: true, value: null });
    });

    it('returns saved workspace when settings.json present', async () => {
      writeFileSync(
        join(testTmpDir, 'settings.json'),
        JSON.stringify({ workspace_root: '/my/project', workspace_name: 'project' })
      );
      __resetSettingsCache();
      const result = await call<Result<{ path: string; name: string } | null>>('workspace/get');
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.value).toEqual({ path: '/my/project', name: 'project' });
    });

    it('handles corrupt JSON gracefully (returns null)', async () => {
      writeFileSync(join(testTmpDir, 'settings.json'), '{ not valid json');
      __resetSettingsCache();
      const result = await call<Result<{ path: string; name: string } | null>>('workspace/get');
      expect(result).toEqual({ ok: true, value: null });
    });
  });

  describe('workspace/pick-folder', () => {
    it('returns null when user cancels', async () => {
      nextDialogResult = { canceled: true, filePaths: [] };
      const result = await call<Result<{ path: string; name: string } | null>>(
        'workspace/pick-folder'
      );
      expect(result).toEqual({ ok: true, value: null });
      // Settings.json must NOT be written on cancel.
      expect(existsSync(join(testTmpDir, 'settings.json'))).toBe(false);
    });

    it('returns null when filePaths is empty', async () => {
      nextDialogResult = { canceled: false, filePaths: [] };
      const result = await call<Result<{ path: string; name: string } | null>>(
        'workspace/pick-folder'
      );
      expect(result).toEqual({ ok: true, value: null });
    });

    it('writes settings + returns picked path on success', async () => {
      nextDialogResult = { canceled: false, filePaths: ['/some/picked/folder'] };
      const result = await call<Result<{ path: string; name: string } | null>>(
        'workspace/pick-folder'
      );
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.value).toEqual({ path: '/some/picked/folder', name: 'folder' });
      // File written.
      const settingsFile = join(testTmpDir, 'settings.json');
      expect(existsSync(settingsFile)).toBe(true);
      const parsed = JSON.parse(readFileSync(settingsFile, 'utf-8')) as Record<string, unknown>;
      expect(parsed['workspace_root']).toBe('/some/picked/folder');
      expect(parsed['workspace_name']).toBe('folder');
    });

    it('subsequent workspace/get reflects pick result (cache invalidation)', async () => {
      nextDialogResult = { canceled: false, filePaths: ['/another/picked'] };
      await call('workspace/pick-folder');
      const result = await call<Result<{ path: string; name: string } | null>>('workspace/get');
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.value).toEqual({ path: '/another/picked', name: 'picked' });
    });

    it('mkdir creates userData if missing', async () => {
      // testTmpDir 자체는 mkdtempSync 가 만들었지만, 그 안의 nested
      // userData 가 없어도 settings 가 만들어주는지 확인.
      const nested = join(testTmpDir, 'nested-userdata');
      userDataRef.current = nested;
      __resetSettingsCache();
      nextDialogResult = { canceled: false, filePaths: ['/foo/bar'] };
      const result = await call<Result<{ path: string; name: string } | null>>(
        'workspace/pick-folder'
      );
      expect(result.ok).toBe(true);
      expect(existsSync(join(nested, 'settings.json'))).toBe(true);
      // cleanup nested for safety
      rmSync(nested, { recursive: true, force: true });
    });
  });

  describe('app:get-default-workspace', () => {
    it('unpackaged + no settings → falls back to process.cwd() (dev convenience)', async () => {
      electronRef.isPackaged = false;
      const result = await call<Result<{ root: string; name: string } | null>>(
        'app:get-default-workspace'
      );
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.value).not.toBeNull();
      if (result.value === null) return;
      expect(result.value.root).toBe(process.cwd());
    });

    it('packaged + no settings → returns null (forces user to pick a workspace)', async () => {
      // Phase 3 audit (HIGH): packaged 빌드는 process.cwd() 가 OS 기본 경로
      // (Program Files / Applications) — 사용자 의도와 무관. null 반환으로
      // renderer 가 picker 강제하도록 한다.
      electronRef.isPackaged = true;
      const result = await call<Result<{ root: string; name: string } | null>>(
        'app:get-default-workspace'
      );
      expect(result).toEqual({ ok: true, value: null });
    });

    it('packaged + settings present → returns saved workspace', async () => {
      electronRef.isPackaged = true;
      writeFileSync(
        join(testTmpDir, 'settings.json'),
        JSON.stringify({ workspace_root: '/picked/path', workspace_name: 'picked' })
      );
      __resetSettingsCache();
      const result = await call<Result<{ root: string; name: string } | null>>(
        'app:get-default-workspace'
      );
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.value).toEqual({ root: '/picked/path', name: 'picked' });
    });

    it('unpackaged + settings present → prefers settings over process.cwd()', async () => {
      electronRef.isPackaged = false;
      writeFileSync(
        join(testTmpDir, 'settings.json'),
        JSON.stringify({ workspace_root: '/picked/path', workspace_name: 'picked' })
      );
      __resetSettingsCache();
      const result = await call<Result<{ root: string; name: string } | null>>(
        'app:get-default-workspace'
      );
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.value).toEqual({ root: '/picked/path', name: 'picked' });
    });
  });
});
