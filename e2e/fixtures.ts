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

  app: async ({ userDataDir }, use) => {
    // Phase 3 B2: 기존 16 e2e 가 onboarding wizard 에 막히지 않도록 settings.json
    // 을 미리 써둔다. wizard 자체를 검증하는 onboarding spec 은 별도 fixture 에서
    // 이 파일을 쓰지 않거나 비워둔 상태로 launch.
    // Spec: docs/ia/onboarding.md
    writeFileSync(
      join(userDataDir, 'settings.json'),
      JSON.stringify(
        {
          onboarding_completed: true,
          workspace_root: userDataDir,
          workspace_name: basename(userDataDir),
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
