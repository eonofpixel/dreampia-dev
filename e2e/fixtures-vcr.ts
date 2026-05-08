/**
 * Playwright fixtures — VCR variant (v1.1.7 / drive14 e2e).
 *
 * Spec: docs/v1.x-roadmap.md (v1.1.4 Real CLI integration e2e), Codex Q10.
 *
 * `fixtures.ts` 와 같이 isolated user data dir + workspace dir 을 만들지만:
 *   - `DREAMPIA_TEST` 가 set 되지 않음 (mock 조기 반환 회피).
 *   - `DREAMPIA_CLI_COMMAND=node` + `DREAMPIA_CLI_PREARGS=<fake-cli.cjs>` +
 *     `DREAMPIA_VCR_FIXTURE=<fixture path>` set.
 *
 * 결과: production code path 의 CliProvider 가 사용되지만, child_process.spawn
 * 의 binary 가 fake CLI 로 향함. Real CLI 와 동일한 IPC + stream + permission
 * flow 를 deterministic 하게 검증.
 *
 * Codex Q10 picking: test-only IPC 회피, env override 사용.
 */

import { _electron as electron } from 'playwright';
import type { ElectronApplication, Page } from 'playwright';
import { test as base } from '@playwright/test';
import { resolve, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = resolve(__filename, '..');

const FAKE_CLI = resolve(__dirname, '..', 'tests', 'fixtures', 'fake-claude-cli.cjs');

export interface VcrFixtures {
  app: ElectronApplication;
  window: Page;
  userDataDir: string;
  workspaceDir: string;
  /** 본 spec 이 사용할 VCR fixture path (절대경로). */
  vcrFixture: string;
}

export interface VcrTestOptions {
  /** Spec 단위 fixture path (resolve 가능한 절대경로). */
  vcrFixture: string;
}

export interface MakeVcrTestOptions {
  /**
   * v1.1.8 (drive15): workspace 디렉토리 이름에 한국어 prefix. KR cwd 회귀
   * lock — Codex Q5 picking 의 한국어 폴더 처리 검증.
   */
  koreanWorkspace?: boolean;
  /**
   * v1.9.0 (A3 / drive16-3): `DREAMPIA_CLI_TIMEOUT_MS` 주입. set 시
   * CliProvider 가 spawn 후 N ms 경과 시 SIGTERM + error event.
   * undefined → env 미설정 (timeout 없음).
   */
  cliTimeoutMs?: number;
}

/**
 * Spec 단위로 VCR fixture path 를 주입하는 base test.
 *
 * 사용:
 *   import { makeVcrTest } from './fixtures-vcr';
 *   const test = makeVcrTest('claude/tool-use-roundtrip.json');
 *   test('drive14 — ...', async ({ window, ... }) => { ... });
 *
 *   const krTest = makeVcrTest('claude/tool-use-roundtrip.json', { koreanWorkspace: true });
 *   krTest('drive15 — KR cwd ...', ...);
 */
export function makeVcrTest(fixtureRelPath: string, options: MakeVcrTestOptions = {}) {
  const fixturePath = resolve(
    __dirname,
    '..',
    'tests',
    'fixtures',
    'cli-vcr',
    fixtureRelPath
  );
  const wsPrefix = options.koreanWorkspace === true ? 'dreampia-한국어-' : 'dreampia-ws-vcr-';
  return base.extend<VcrFixtures>({
    userDataDir: async ({}, use) => {
      const dir = mkdtempSync(join(tmpdir(), 'dreampia-e2e-vcr-'));
      await use(dir);
      try {
        rmSync(dir, { recursive: true, force: true });
      } catch {
        // ignore
      }
    },

    workspaceDir: async ({}, use) => {
      const dir = mkdtempSync(join(tmpdir(), wsPrefix));
      writeFileSync(join(dir, 'sample.txt'), 'fixture sample\n', 'utf-8');
      writeFileSync(join(dir, 'src.ts'), 'export const x = 1;\n', 'utf-8');
      await use(dir);
      try {
        rmSync(dir, { recursive: true, force: true });
      } catch {
        // ignore
      }
    },

    vcrFixture: async ({}, use) => {
      await use(fixturePath);
    },

    app: async ({ userDataDir, workspaceDir, vcrFixture }, use) => {
      writeFileSync(
        join(userDataDir, 'settings.json'),
        JSON.stringify(
          {
            onboarding_completed: true,
            workspace_root: workspaceDir,
            workspace_name: basename(workspaceDir),
            // E2E v1.1.5 — drive14/15/16 spec 들이 PermissionApprovalCard
            // 표시를 검증하므로 prompt 발생 강제. default workspace_write 는
            // shell.run 의 LOCAL_EXECUTE 를 auto-allow → card 안 뜸.
            default_permission_level: 'read_only',
          },
          null,
          2
        ),
        'utf-8'
      );

      const mainEntry = resolve(__dirname, '..', 'dist', 'main', 'index.js');
      const electronApp = await electron.launch({
        args: [mainEntry, `--user-data-dir=${userDataDir}`],
        timeout: 30_000,
        env: {
          ...process.env,
          NODE_ENV: 'production',
          // ★ DREAMPIA_TEST 는 set 하지 X — mock 조기 반환 회피.
          // ★ env override 가 mock 보다 먼저이지만 안전을 위해 명시적 unset.
          DREAMPIA_TEST: '0',
          // Codex Q10: command + preArgs (single path 가 아닌 분리).
          DREAMPIA_CLI_COMMAND: process.execPath,
          DREAMPIA_CLI_PREARGS: FAKE_CLI,
          DREAMPIA_VCR_FIXTURE: vcrFixture,
          // v1.9.0 (A3): drive16-3 timeout spec 만 set. 그 외 spec 은 undefined.
          ...(options.cliTimeoutMs !== undefined && {
            DREAMPIA_CLI_TIMEOUT_MS: String(options.cliTimeoutMs),
          }),
        },
      });

      await use(electronApp);

      try {
        await electronApp.close();
      } catch {
        // ignore
      }
    },

    window: async ({ app }, use) => {
      const window = await app.firstWindow({ timeout: 15_000 });
      await window.waitForLoadState('domcontentloaded');
      await window.waitForFunction(
        () => {
          const root = document.getElementById('app');
          return root !== null && root.childElementCount > 0;
        },
        undefined,
        { timeout: 10_000 }
      );
      await use(window);
    },
  });
}

export { expect } from '@playwright/test';
