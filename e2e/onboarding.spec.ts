/**
 * Onboarding wizard e2e — Phase 3 B2.
 *
 * 일반 fixture (e2e/fixtures.ts) 는 settings.json 을 미리 써서 wizard 를 skip
 * 한다. 여기는 그 반대 — settings 가 비어 있는 상태로 Electron 을 띄워 wizard
 * 가 정상 표시 + 완료 + 영속되는지 검증한다.
 *
 * Spec: docs/ia/onboarding.md
 */

import { _electron as electron } from 'playwright';
import type { ElectronApplication, Page } from 'playwright';
import { test as base, expect } from '@playwright/test';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = resolve(__filename, '..');

interface OnboardingFixtures {
  app: ElectronApplication;
  window: Page;
  userDataDir: string;
}

// 별도 fixture — settings.json 을 미리 쓰지 않는다.
const test = base.extend<OnboardingFixtures>({
  userDataDir: async ({}, use) => {
    const dir = mkdtempSync(join(tmpdir(), 'dreampia-onboarding-'));
    await use(dir);
    try {
      rmSync(dir, { recursive: true, force: true });
    } catch {
      // best-effort cleanup
    }
  },

  app: async ({ userDataDir }, use) => {
    const mainEntry = resolve(__dirname, '..', 'dist', 'main', 'index.js');
    const electronApp = await electron.launch({
      args: [mainEntry, `--user-data-dir=${userDataDir}`],
      timeout: 30_000,
      env: {
        ...process.env,
        NODE_ENV: 'production',
        DREAMPIA_TEST: '1',
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

test.describe('onboarding wizard', () => {
  test('first-run shows wizard with welcome step', async ({ window }) => {
    // Step 1: Welcome 텍스트 visible
    await expect(window.getByTestId('onboarding-wizard')).toBeVisible({ timeout: 10_000 });
    await expect(window.getByText('Dreampia-Dev 에 오신 걸 환영합니다')).toBeVisible();
    await expect(window.getByTestId('onboarding-start')).toBeVisible();
  });

  test('skip button completes onboarding and shows main app', async ({ window, userDataDir }) => {
    await expect(window.getByTestId('onboarding-wizard')).toBeVisible({ timeout: 10_000 });

    await window.getByTestId('onboarding-skip').click();

    // Wizard 사라짐 + 사이드바(메인 앱) 표시
    await expect(window.getByTestId('onboarding-wizard')).toBeHidden();
    await expect(window.getByLabel('사이드바')).toBeVisible();

    // settings.json 영속 확인
    const settingsPath = join(userDataDir, 'settings.json');
    expect(existsSync(settingsPath)).toBe(true);
    const parsed = JSON.parse(readFileSync(settingsPath, 'utf-8')) as Record<string, unknown>;
    expect(parsed['onboarding_completed']).toBe(true);
  });

  test('next button advances through all 5 steps', async ({ window }) => {
    await expect(window.getByTestId('onboarding-step-welcome')).toBeVisible({
      timeout: 10_000,
    });

    // Step 1 → 2
    await window.getByTestId('onboarding-start').click();
    await expect(window.getByTestId('onboarding-step-cli')).toBeVisible();

    // Step 2 → 3
    await window.getByTestId('onboarding-next').click();
    await expect(window.getByTestId('onboarding-step-auth')).toBeVisible();

    // Step 3 → 4
    await window.getByTestId('onboarding-next').click();
    await expect(window.getByTestId('onboarding-step-workspace')).toBeVisible();

    // Step 4 → 5
    await window.getByTestId('onboarding-next').click();
    await expect(window.getByTestId('onboarding-step-firstchat')).toBeVisible();

    // Recommended prompts 표시
    await expect(window.getByTestId('recommended-prompts')).toBeVisible();
  });

  // v1.7.9 — 추천 prompts 클릭 시나리오. 첫 chip 클릭 → wizard 닫히고
  // onboarding_completed=true 영속. (workspace 미설정 시 새 session 은 생성되지
  // 않지만 onboarding 종료 자체는 정상.)
  test('recommended prompt click finishes wizard + persists settings (v1.7.9)', async ({
    window,
    userDataDir,
  }) => {
    // 5단계까지 진행.
    await expect(window.getByTestId('onboarding-step-welcome')).toBeVisible({
      timeout: 10_000,
    });
    await window.getByTestId('onboarding-start').click();
    await window.getByTestId('onboarding-next').click(); // 2 → 3
    await window.getByTestId('onboarding-next').click(); // 3 → 4
    await window.getByTestId('onboarding-next').click(); // 4 → 5
    await expect(window.getByTestId('recommended-prompts')).toBeVisible();

    // 첫 추천 chip 클릭. RECOMMENDED_PROMPTS[0] = '이 프로젝트 구조 분석해줘'.
    await window.getByTestId('prompt-이 프로젝트 구조 분석해줘').click();

    // Wizard 사라짐 + 메인 앱 표시.
    await expect(window.getByTestId('onboarding-wizard')).toBeHidden({
      timeout: 5_000,
    });
    await expect(window.getByLabel('사이드바')).toBeVisible();

    // settings.json 에 onboarding_completed=true 영속.
    const settingsPath = join(userDataDir, 'settings.json');
    expect(existsSync(settingsPath)).toBe(true);
    const parsed = JSON.parse(readFileSync(settingsPath, 'utf-8')) as Record<
      string,
      unknown
    >;
    expect(parsed['onboarding_completed']).toBe(true);
  });
});
