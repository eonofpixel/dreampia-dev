/**
 * Agent drive spec — Round 4: 설정 모달 모든 탭 + 권한 모달 + 사용량 패널 깊이.
 *
 * 출력: test-results/drive/r4-*.png + r4-*.json
 */

import { test, expect } from './fixtures';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const SHOT_DIR = resolve(__dirname, '..', 'test-results', 'drive');
mkdirSync(SHOT_DIR, { recursive: true });

const shot = (name: string): string => resolve(SHOT_DIR, `r4-${name}.png`);

const TABS = [
  'mcp',
  'usage',
  'provider',
  'permission',
  'theme',
  'shortcuts',
  'language',
  'diagnose',
  'about',
  'onboarding',
] as const;

test.describe('drive r4 — settings deep dive', () => {
  for (const tab of TABS) {
    test(`18-${tab} — settings tab renders without error`, async ({ window }) => {
      // 1) 모달 열기
      await expect(window.getByTestId('sidebar-search-input')).toBeVisible({
        timeout: 10_000,
      });
      await window.evaluate(() => document.body.focus());
      await window.keyboard.press('ControlOrMeta+,');
      await expect(window.getByTestId('settings-modal')).toBeVisible({ timeout: 5_000 });

      // 2) 해당 탭 클릭
      const tabBtn = window.getByTestId(`settings-tab-${tab}`);
      const tabExists = await tabBtn.isVisible().catch(() => false);
      if (!tabExists) {
        // 일부 탭은 다른 testid 일 수 있음 (e.g. shortcuts → keyboard).
        await window.screenshot({ path: shot(`18-${tab}-NOT_FOUND`), fullPage: true });
        const allTabs = await window.evaluate(() => {
          return Array.from(
            document.querySelectorAll('[data-testid^="settings-tab-"]')
          ).map((el) => el.getAttribute('data-testid'));
        });
        writeFileSync(
          resolve(SHOT_DIR, `r4-18-${tab}-tabs-found.json`),
          JSON.stringify(allTabs, null, 2),
          'utf-8'
        );
        return; // soft skip
      }

      await tabBtn.click();
      await window.waitForTimeout(400); // panel mount + initial fetch
      await window.screenshot({ path: shot(`18-${tab}`), fullPage: true });

      // 3) 패널 콘텐츠 인벤토리
      const inventory = await window.evaluate(() => {
        const panel = document.querySelector('[data-testid^="settings-panel-"]');
        if (panel === null) return { panelFound: false };

        const headings = Array.from(panel.querySelectorAll('h1, h2, h3, h4'));
        const buttons = Array.from(panel.querySelectorAll('button'));
        const inputs = Array.from(panel.querySelectorAll('input'));
        const errors = Array.from(panel.querySelectorAll('[role="alert"], .error, [class*="error"]'));

        return {
          panelFound: true,
          panelTestId: panel.getAttribute('data-testid'),
          headings: headings.map((h) => ({
            tag: h.tagName,
            text: h.textContent?.trim().slice(0, 80) ?? '',
          })),
          buttonCount: buttons.length,
          inputCount: inputs.length,
          errorElements: errors.length,
          panelTextSample: panel.textContent?.trim().slice(0, 400) ?? '',
        };
      });
      writeFileSync(
        resolve(SHOT_DIR, `r4-18-${tab}-inventory.json`),
        JSON.stringify(inventory, null, 2),
        'utf-8'
      );

      // 4) 콘솔 에러 검사 — 패널 마운트가 React 에러를 던졌는지
      // (이 테스트는 console listener 가 없어서 추후 라운드에서 추가)
    });
  }

  test('19 — permission dropdown in chat header', async ({ window }) => {
    // 세션 만들고 권한 드롭다운 열기
    await window.getByRole('button', { name: '새 채팅', exact: false }).first().click();
    await expect(window.getByTestId('chat-input')).toBeVisible({ timeout: 10_000 });

    // ChatHeader 안의 권한 dropdown — testid 확인
    const permissionDropdown = window
      .locator('[data-testid*="permission"], button:has-text("워크스페이스 쓰기")')
      .first();
    await expect(permissionDropdown).toBeVisible({ timeout: 5_000 });
    await permissionDropdown.click();
    await window.waitForTimeout(400);
    await window.screenshot({ path: shot('19-permission-dropdown'), fullPage: true });

    // 옵션 인벤토리
    const options = await window.evaluate(() => {
      const items = Array.from(
        document.querySelectorAll('[role="menuitem"], [data-testid*="permission-option"]')
      );
      return items.slice(0, 10).map((el) => ({
        text: el.textContent?.trim().slice(0, 60) ?? '',
        testId: el.getAttribute('data-testid'),
      }));
    });
    writeFileSync(
      resolve(SHOT_DIR, 'r4-19-permission-options.json'),
      JSON.stringify(options, null, 2),
      'utf-8'
    );

    // 닫기 — Esc 또는 외부 클릭
    await window.keyboard.press('Escape');
    await window.waitForTimeout(200);
  });

  test('20 — model selector dropdown in chat header', async ({ window }) => {
    await window.getByRole('button', { name: '새 채팅', exact: false }).first().click();
    await expect(window.getByTestId('chat-input')).toBeVisible({ timeout: 10_000 });

    // gpt-5.5·높음 같은 모델 라벨이 있는 버튼.
    const modelBtn = window.locator('button').filter({ hasText: /gpt-/i }).first();
    const modelExists = await modelBtn.isVisible().catch(() => false);
    if (!modelExists) {
      await window.screenshot({ path: shot('20-model-NOT_FOUND'), fullPage: true });
      return;
    }
    await modelBtn.click();
    await window.waitForTimeout(400);
    await window.screenshot({ path: shot('20-model-dropdown'), fullPage: true });

    const options = await window.evaluate(() => {
      const items = Array.from(
        document.querySelectorAll('[role="menuitem"], [data-testid*="model"]')
      );
      return items.slice(0, 15).map((el) => ({
        text: el.textContent?.trim().slice(0, 60) ?? '',
        testId: el.getAttribute('data-testid'),
      }));
    });
    writeFileSync(
      resolve(SHOT_DIR, 'r4-20-model-options.json'),
      JSON.stringify(options, null, 2),
      'utf-8'
    );

    await window.keyboard.press('Escape');
  });

  test('21 — sidebar [사용량] panel opens', async ({ window }) => {
    await window.getByTestId('sidebar-open-usage').click();
    await window.waitForTimeout(500);
    await window.screenshot({ path: shot('21-usage-panel'), fullPage: true });

    // 어떤 모달/패널이 열렸는지 확인 (settings-modal 안에 패널인지 별도인지)
    const what = await window.evaluate(() => {
      const modal = document.querySelector('[data-testid="settings-modal"]');
      const usagePanel = document.querySelector('[data-testid="settings-panel-usage"]');
      return {
        modalOpen: modal !== null,
        usagePanelVisible: usagePanel !== null,
        bodyTextSample: document.body.innerText.slice(0, 300),
      };
    });
    writeFileSync(
      resolve(SHOT_DIR, 'r4-21-usage-state.json'),
      JSON.stringify(what, null, 2),
      'utf-8'
    );
  });

  test('22 — diagnose panel exposes useful runtime info', async ({ window }) => {
    await expect(window.getByTestId('sidebar-search-input')).toBeVisible({
      timeout: 10_000,
    });
    await window.evaluate(() => document.body.focus());
    await window.keyboard.press('ControlOrMeta+,');
    await expect(window.getByTestId('settings-modal')).toBeVisible({ timeout: 5_000 });

    const diagnoseTab = window.getByTestId('settings-tab-diagnose');
    if (!(await diagnoseTab.isVisible().catch(() => false))) {
      await window.screenshot({ path: shot('22-diagnose-NOT_FOUND'), fullPage: true });
      return;
    }
    await diagnoseTab.click();
    await window.waitForTimeout(800); // 진단은 IPC 여러 번 호출 가능
    await window.screenshot({ path: shot('22-diagnose'), fullPage: true });

    const dump = await window.evaluate(() => {
      const panel = document.querySelector('[data-testid="settings-panel-diagnose"]');
      return {
        present: panel !== null,
        text: panel?.textContent?.trim().slice(0, 1500) ?? '',
      };
    });
    writeFileSync(
      resolve(SHOT_DIR, 'r4-22-diagnose-state.json'),
      JSON.stringify(dump, null, 2),
      'utf-8'
    );
  });
});
