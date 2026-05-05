/**
 * Agent drive spec — Round 12 (v1.0.14 hotfix): META-4 saved-settings 우회 청산.
 *
 * Codex 외부 검토에서 발견된 P0 closure blind spot:
 *  v1.0.13 의 META-4 는 picker 시점만 차단. 이전 버전 / 수동 settings 편집
 *  / upgrade 시 settings.workspace_root 가 userData 안인 채로 부팅하면 그대로
 *  사용됨. v1.0.14 가 app:get-default-workspace / workspace/get 에서 재검증.
 *
 * 검증 (e2e):
 *  44. settings.json 에 직접 userData 경로를 workspace_root 로 저장 → 부팅
 *      후 app:get-default-workspace 가 null 반환.
 *  45. settings.json 에 정상 경로 저장 → app:get-default-workspace 가 정상값
 *      (회귀 0).
 *
 * 출력: test-results/drive/r12-*.png
 */

import { _electron as electron } from 'playwright';
import { test as base, expect } from '@playwright/test';
import { resolve, basename, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';

const __filename = fileURLToPath(import.meta.url);
const __dirname = resolve(__filename, '..');

interface Result<T> {
  ok: true;
  value: T;
}
interface ResultErr {
  ok: false;
  error: string;
}

interface WorkspaceInfo {
  root: string;
  name: string;
}

/**
 * 기본 fixtures.ts 와 다르게 settings.json 의 workspace_root 를 의도적으로
 * userDataDir (자기 자신) 로 셋업 — META-4 우회 시나리오 재현.
 */
async function launchWithSettings(
  userDataDir: string,
  settings: Record<string, unknown>
): Promise<Awaited<ReturnType<typeof electron.launch>>> {
  writeFileSync(
    join(userDataDir, 'settings.json'),
    JSON.stringify(settings, null, 2),
    'utf-8'
  );
  const mainEntry = resolve(__dirname, '..', 'dist', 'main', 'index.js');
  return electron.launch({
    args: [mainEntry, `--user-data-dir=${userDataDir}`],
    timeout: 30_000,
    env: {
      ...process.env,
      NODE_ENV: 'production',
      DREAMPIA_TEST: '1',
    },
  });
}

const test = base.extend<{ userDataDir: string }>({
  userDataDir: async ({}, use) => {
    const dir = mkdtempSync(join(tmpdir(), 'dreampia-r12-'));
    await use(dir);
    try {
      rmSync(dir, { recursive: true, force: true });
    } catch {
      // ignore Windows file locks
    }
  },
});

test.describe('drive r12 — META-4 saved-settings 우회 청산 (v1.0.14)', () => {
  test('44 — saved workspace_root = userDataDir → app:get-default-workspace 가 null 반환', async ({
    userDataDir,
  }) => {
    // settings.workspace_root 를 의도적으로 userDataDir 로 셋업. 이전 v1.0.13
    // 까진 부팅 시 그대로 사용됐을 위험 케이스.
    const app = await launchWithSettings(userDataDir, {
      onboarding_completed: true,
      workspace_root: userDataDir,
      workspace_name: basename(userDataDir),
    });
    try {
      const window = await app.firstWindow({ timeout: 15_000 });
      await window.waitForLoadState('domcontentloaded');
      // app api 가 ready 될 때까지 기다림 (#app 마운트 후).
      await window.waitForFunction(() => {
        const root = document.getElementById('app');
        return root !== null && root.childElementCount > 0;
      }, undefined, { timeout: 10_000 });

      // app:get-default-workspace 호출.
      const result = await window.evaluate(async () => {
        const w = window as unknown as {
          dreampia?: {
            app?: {
              getDefaultWorkspace: () => Promise<Result<WorkspaceInfo | null> | ResultErr>;
            };
          };
        };
        const api = w.dreampia?.app;
        if (api?.getDefaultWorkspace === undefined) {
          return { ok: false as const, error: 'IPC not available' };
        }
        return api.getDefaultWorkspace();
      });

      expect(result.ok).toBe(true);
      if (result.ok) {
        // userData 와 충돌하므로 null 반환.
        expect(result.value).toBeNull();
      }
    } finally {
      try {
        await app.close();
      } catch {
        // ignore
      }
    }
  });

  test('45 — saved workspace_root = 정상 폴더 → app:get-default-workspace 가 정상값', async ({
    userDataDir,
  }) => {
    // 정상 case — 다른 임시 폴더를 workspace 로.
    const externalDir = mkdtempSync(join(tmpdir(), 'r12-external-'));
    try {
      const app = await launchWithSettings(userDataDir, {
        onboarding_completed: true,
        workspace_root: externalDir,
        workspace_name: basename(externalDir),
      });
      try {
        const window = await app.firstWindow({ timeout: 15_000 });
        await window.waitForLoadState('domcontentloaded');
        await window.waitForFunction(() => {
          const root = document.getElementById('app');
          return root !== null && root.childElementCount > 0;
        }, undefined, { timeout: 10_000 });

        const result = await window.evaluate(async () => {
          const w = window as unknown as {
            dreampia?: {
              app?: {
                getDefaultWorkspace: () => Promise<Result<WorkspaceInfo | null> | ResultErr>;
              };
            };
          };
          const api = w.dreampia?.app;
          if (api?.getDefaultWorkspace === undefined) {
            return { ok: false as const, error: 'IPC not available' };
          }
          return api.getDefaultWorkspace();
        });

        expect(result.ok).toBe(true);
        if (result.ok) {
          // 외부 폴더 → 그대로 반환.
          expect(result.value).not.toBeNull();
          expect(result.value?.root).toBe(externalDir);
        }
      } finally {
        try {
          await app.close();
        } catch {
          /* ignore */
        }
      }
    } finally {
      try {
        rmSync(externalDir, { recursive: true, force: true });
      } catch {
        /* ignore */
      }
    }
  });
});
