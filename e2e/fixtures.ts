/**
 * Playwright fixtures — Electron app launch + isolated user data dir.
 *
 * Spec: P2-A E2E infra.
 *
 * Each test gets:
 *   - app:           ElectronApplication (launched against dist/main/index.js)
 *   - window:        first Page (renderer) with domcontentloaded awaited
 *   - userDataDir:   fresh tmpdir; isolates SessionStore SQLite per test
 *
 * Critical correctness:
 *   - We launch from `dist/main/index.js` (production-style), NOT vite dev
 *     server. `pretest:e2e` runs `vite build` to keep this artefact fresh.
 *   - `--user-data-dir=<tmp>` overrides Electron's default app.getPath
 *     ('userData'). Without this, every test would share the same
 *     %APPDATA%/Dreampia-Dev/sessions.sqlite, leaking state.
 *   - Windows file locks: better-sqlite3 (-wal/-shm) and Electron's
 *     `Cookies` SQLite occasionally hold the dir for a beat after close.
 *     We swallow rmSync errors so a failed cleanup doesn't fail the test.
 */

import { _electron as electron } from 'playwright';
import type { ElectronApplication, Page } from 'playwright';
import { test as base } from '@playwright/test';
import { resolve, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// __dirname shim for ESM. Playwright transpiles spec files; this evaluates
// once when the fixture module loads.
const __filename = fileURLToPath(import.meta.url);
const __dirname = resolve(__filename, '..');

export interface DreampiaFixtures {
  app: ElectronApplication;
  window: Page;
  userDataDir: string;
  /**
   * v1.0.14: workspace_root 는 userDataDir 와 분리. v1.0.13 까지는 userDataDir
   * 를 그대로 workspace 로 썼지만, v1.0.14 의 META-4 hotfix 가 그 케이스를
   * userData 충돌로 차단함. e2e 도 userDataDir 와 별도 임시 폴더 사용.
   */
  workspaceDir: string;
}

export const test = base.extend<DreampiaFixtures>({
  // Per-test isolated user data directory. Worker-scoped would be cheaper
  // but we want hermetic SQLite per test — flaky cross-test DB state would
  // be hell to debug.
  userDataDir: async ({}, use) => {
    const dir = mkdtempSync(join(tmpdir(), 'dreampia-e2e-'));
    await use(dir);
    try {
      rmSync(dir, { recursive: true, force: true });
    } catch {
      // Windows: better-sqlite3 / Cookies SQLite may still hold a handle
      // for a few hundred ms after app.close(). Cleanup is best-effort —
      // OS tmpdir reaper will eventually take care of leftovers.
    }
  },

  workspaceDir: async ({}, use) => {
    const dir = mkdtempSync(join(tmpdir(), 'dreampia-ws-'));
    // v1.0.14: workspaceDir 가 userDataDir 와 분리되면서 빈 폴더가 됨.
    // mention popover 등 일부 e2e 가 workspace 안 file list 에 의존하므로
    // sample 파일 몇 개 미리 생성. fixture-level 이라 모든 spec 이 받음.
    writeFileSync(join(dir, 'sample.txt'), 'fixture sample\n', 'utf-8');
    writeFileSync(join(dir, 'session.md'), '# session\n', 'utf-8');
    writeFileSync(join(dir, 'src.ts'), 'export const x = 1;\n', 'utf-8');
    await use(dir);
    try {
      rmSync(dir, { recursive: true, force: true });
    } catch {
      // ignore
    }
  },

  app: async ({ userDataDir, workspaceDir }, use) => {
    // Phase 3 B2: 기존 16 e2e 가 onboarding wizard 에 막히지 않도록 settings.json
    // 을 미리 써둔다. wizard 자체를 검증하는 onboarding spec 은 별도 fixture 에서
    // 이 파일을 쓰지 않거나 비워둔 상태로 launch.
    // Spec: docs/ia/onboarding.md
    //
    // v1.0.14: workspace_root 는 userDataDir 가 아닌 별도 workspaceDir 사용
    // (META-4 차단 회피). 이전엔 userDataDir 를 workspace 로 썼는데 v1.0.14
    // 의 hotfix 가 그걸 정확히 막음.
    writeFileSync(
      join(userDataDir, 'settings.json'),
      JSON.stringify(
        {
          onboarding_completed: true,
          workspace_root: workspaceDir,
          workspace_name: basename(workspaceDir),
        },
        null,
        2
      ),
      'utf-8'
    );

    const mainEntry = resolve(__dirname, '..', 'dist', 'main', 'index.js');
    const electronApp = await electron.launch({
      args: [
        mainEntry,
        // Electron CLI flag, parsed by Chromium. Overrides
        // app.getPath('userData') for this process.
        `--user-data-dir=${userDataDir}`,
      ],
      timeout: 30_000,
      env: {
        ...process.env,
        NODE_ENV: 'production',
        // Marker for any conditional dev hooks. Currently unused — see
        // the dev-only injection TODO in tool-call/permission specs.
        DREAMPIA_TEST: '1',
      },
    });

    await use(electronApp);

    try {
      await electronApp.close();
    } catch {
      // close() throws if the app already exited (e.g. crash test).
    }
  },

  window: async ({ app }, use) => {
    const window = await app.firstWindow({ timeout: 15_000 });
    await window.waitForLoadState('domcontentloaded');
    // App.tsx mounts immediately; #app gets contents after first paint.
    // Wait for the root to have at least one child so tests don't race
    // the React commit.
    await window.waitForFunction(() => {
      const root = document.getElementById('app');
      return root !== null && root.childElementCount > 0;
    }, undefined, { timeout: 10_000 });
    await use(window);
  },
});

export { expect } from '@playwright/test';
