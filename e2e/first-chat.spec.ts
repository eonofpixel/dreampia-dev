/**
 * First-chat flow e2e — v0.3.0 onboarding polish.
 *
 * 시나리오: fresh profile (settings.json 없음) → wizard 5단계 통과 → main app
 * 진입 → 빈 채팅에서 WelcomeMessage chip 클릭 → 즉시 streaming 응답 확인.
 *
 * 일반 fixture 와 달리 settings.json 을 미리 안 써두어 wizard 가 그대로 보이는
 * 환경을 만든다 (e2e/onboarding.spec.ts 와 같은 패턴).
 *
 * Spec: docs/ia/onboarding.md, docs/ia/chat-flow.md
 */

import { _electron as electron } from 'playwright';
import type { ElectronApplication, Page } from 'playwright';
import { test as base, expect } from '@playwright/test';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = resolve(__filename, '..');

interface FirstChatFixtures {
  app: ElectronApplication;
  window: Page;
  userDataDir: string;
}

const test = base.extend<FirstChatFixtures>({
  userDataDir: async ({}, use) => {
    const dir = mkdtempSync(join(tmpdir(), 'dreampia-first-chat-'));
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
        // DREAMPIA_TEST=1 → MockProvider 강제 (auto.ts).
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

test.describe('first-chat flow (v0.3.0)', () => {
  test('wizard → workspace pick (skip) → first-chat suggestion → streaming response', async ({
    window,
  }) => {
    // ─── Step 1: Welcome ───
    await expect(window.getByTestId('onboarding-wizard')).toBeVisible({
      timeout: 10_000,
    });
    await window.getByTestId('onboarding-start').click();

    // ─── Step 2: CLI 감지 (DREAMPIA_TEST=1 이면 mock 으로 진행) ───
    await expect(window.getByTestId('onboarding-step-cli')).toBeVisible();
    await window.getByTestId('onboarding-next').click();

    // ─── Step 3: 인증 안내 + provider selector ───
    await expect(window.getByTestId('onboarding-step-auth')).toBeVisible();
    await expect(window.getByTestId('provider-selector')).toBeVisible();
    await window.getByTestId('onboarding-next').click();

    // ─── Step 4: 작업 폴더 선택 + permission selector ───
    // 폴더 picker 는 dialog 라 e2e 에서 자동 클릭 어려움 — 사용자가 폴더를
    // 선택 안 한 상태로 그대로 next 진행 (App.tsx 가 wizard 종료 후 picker 강제).
    await expect(window.getByTestId('onboarding-step-workspace')).toBeVisible();
    await expect(window.getByTestId('permission-selector')).toBeVisible();
    await window.getByTestId('onboarding-next').click();

    // ─── Step 5: 첫 채팅 — 추천 prompt 클릭 시 wizard 가 onComplete(prompt) ───
    await expect(window.getByTestId('onboarding-step-firstchat')).toBeVisible();
    // [직접 시작하기] 클릭 → workspace 가 없어서 새 session 생성 X.
    // 그 대신 onComplete(undefined) 후 main app 진입.
    await window.getByTestId('onboarding-finish').click();

    // ─── Wizard 사라짐 ───
    await expect(window.getByTestId('onboarding-wizard')).toBeHidden();
    // 메인 앱 사이드바 표시.
    await expect(window.getByLabel('사이드바')).toBeVisible();
  });

  test('after wizard skip, suggestion chip in WelcomeMessage submits prompt', async ({
    window,
  }) => {
    // Wizard skip → main app 으로 빨리 진입.
    await expect(window.getByTestId('onboarding-wizard')).toBeVisible({
      timeout: 10_000,
    });
    await window.getByTestId('onboarding-skip').click();
    await expect(window.getByTestId('onboarding-wizard')).toBeHidden();

    // 새 채팅 생성. e2e/chat.spec.ts 와 같은 패턴.
    await window.getByRole('button', { name: '새 채팅', exact: false }).first().click();

    // 빈 채팅 → WelcomeMessage 표시.
    await expect(window.getByTestId('welcome-message')).toBeVisible({ timeout: 10_000 });
    const chips = window.getByTestId('welcome-suggestion-chip');
    await expect(chips.first()).toBeVisible();

    // 첫 chip 클릭 → onSubmit('이 프로젝트 구조 분석해줘') 즉시 호출.
    await chips.first().click();

    // user turn 즉시 push (optimistic).
    const userTurn = window.locator('[data-testid="turn-user"]');
    await expect(userTurn).toContainText('이 프로젝트 구조 분석해줘', { timeout: 10_000 });

    // assistant turn 도 streaming → completed 로 진행 (Mock provider).
    const assistantTurn = window.locator('[data-testid="turn-assistant"]');
    await expect(assistantTurn).toBeVisible({ timeout: 15_000 });
    await expect(assistantTurn).toHaveAttribute('data-status', 'completed', {
      timeout: 30_000,
    });

    // chip 들이 사라지고 (turn 이 1개 이상이라) 메시지가 보인다.
    await expect(window.getByTestId('welcome-message')).not.toBeVisible();
  });

  test('reopen onboarding from sidebar shows wizard again', async ({ window }) => {
    // Wizard skip → main app.
    await expect(window.getByTestId('onboarding-wizard')).toBeVisible({
      timeout: 10_000,
    });
    await window.getByTestId('onboarding-skip').click();
    await expect(window.getByTestId('onboarding-wizard')).toBeHidden();

    // [온보딩 다시 보기] 버튼 클릭.
    await expect(window.getByTestId('sidebar-reopen-onboarding')).toBeVisible();
    await window.getByTestId('sidebar-reopen-onboarding').click();

    // wizard 가 다시 표시.
    await expect(window.getByTestId('onboarding-wizard')).toBeVisible({
      timeout: 5_000,
    });
    await expect(window.getByTestId('onboarding-step-welcome')).toBeVisible();
  });

  // v0.5.0 (F-018) — slash command popover + /help 모달 동작 검증.
  test('slash commands: /help opens help modal, popover navigates by keyboard', async ({
    window,
  }) => {
    // Wizard skip → main app 로 진입.
    await expect(window.getByTestId('onboarding-wizard')).toBeVisible({
      timeout: 10_000,
    });
    await window.getByTestId('onboarding-skip').click();
    await expect(window.getByTestId('onboarding-wizard')).toBeHidden();

    // 새 채팅 생성 (입력창이 mount 되도록).
    await window.getByRole('button', { name: '새 채팅', exact: false }).first().click();
    const input = window.getByTestId('chat-input');
    await expect(input).toBeVisible({ timeout: 10_000 });

    // / 입력 → popover 표시 + 7개 명령 노출.
    await input.click();
    await input.fill('/');
    await expect(window.getByTestId('slash-command-popover')).toBeVisible();
    await expect(window.getByTestId('slash-command-option-help')).toBeVisible();
    await expect(window.getByTestId('slash-command-option-usage')).toBeVisible();

    // /usage 로 좁히기 → option 1개만 표시.
    await input.fill('/usage');
    await expect(window.getByTestId('slash-command-option-usage')).toHaveAttribute(
      'aria-selected',
      'true'
    );

    // Enter → UsageSettings 모달 열림 + popover 닫힘 + input clear.
    await input.press('Enter');
    await expect(window.getByTestId('slash-command-popover')).toBeHidden();
    // UsageSettings 의 dialog 가 등장한다 — 한국어 라벨 "사용량" 으로 매칭.
    await expect(window.getByRole('dialog', { name: /사용량/i })).toBeVisible({
      timeout: 5_000,
    });

    // 닫고 /help 도 검증.
    await window.keyboard.press('Escape');
    await input.fill('/help');
    await input.press('Enter');
    await expect(window.getByTestId('slash-help-modal')).toBeVisible();
    // 7개 명령 모두 표 안에 있다.
    await expect(window.getByTestId('slash-help-row-help')).toBeVisible();
    await expect(window.getByTestId('slash-help-row-onboarding')).toBeVisible();
    // Esc 로 닫기 동작.
    await window.keyboard.press('Escape');
    await expect(window.getByTestId('slash-help-modal')).toBeHidden();
  });
});
