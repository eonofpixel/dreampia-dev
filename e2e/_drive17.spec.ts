/**
 * drive17 — Theme toggle persistence (v1.7.10).
 *
 * Spec: docs/v1.x-roadmap.md (v1.7.10 — Drive 스펙 테마 토글 시나리오).
 *
 * 시나리오:
 *   - 17-1: settings 모달 열고 [테마] 탭 → light 선택 → document
 *           [data-theme="light"] 즉시 반영 + light radio checked.
 *   - 17-2: dark 선택 → document [data-theme="dark"] 반영.
 *   - 17-3: 모달 close (Escape) + 재열기 → 선택된 테마 유지 (in-memory
 *           + IPC 영속). dark 라디오가 여전히 checked.
 *
 * 본 spec 은 "테마 변경" 이라는 단순 UX 가 회귀 없이 동작함을 lock 한다.
 * v0.8.0 의 ThemePanel + applyTheme + app:set-theme IPC chain 을 e2e 에서
 * 검증.
 */

import { test, expect } from './fixtures';
import { mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const SHOT_DIR = resolve(__dirname, '..', 'test-results', 'drive');
mkdirSync(SHOT_DIR, { recursive: true });

const shot = (name: string): string => resolve(SHOT_DIR, `r17-${name}.png`);

test.describe('drive17 — theme toggle (v1.7.10)', () => {
  test('17-1 — Light 선택 시 data-theme=light + radio checked', async ({ window }) => {
    await expect(window.getByTestId('sidebar-search-input')).toBeVisible({
      timeout: 10_000,
    });
    await window.evaluate(() => document.body.focus());

    // Mod+, 로 settings 모달 열기.
    await window.keyboard.press('ControlOrMeta+,');
    await expect(window.getByTestId('settings-modal')).toBeVisible({
      timeout: 5_000,
    });

    // [테마] 탭 클릭.
    await window.getByTestId('settings-tab-theme').click();
    await expect(window.getByTestId('settings-theme-panel')).toBeVisible({
      timeout: 3_000,
    });

    // light 클릭.
    await window.getByTestId('settings-theme-light').click();

    // DOM data-theme 즉시 반영.
    await expect
      .poll(
        async () =>
          window.evaluate(() =>
            document.documentElement.getAttribute('data-theme')
          ),
        { timeout: 3_000 }
      )
      .toBe('light');

    // radio 의 checked 상태 — input 만 골라 검사.
    const lightChecked = await window.evaluate(() => {
      const label = document.querySelector('[data-testid="settings-theme-light"]');
      const input = label?.querySelector(
        'input[type="radio"]'
      ) as HTMLInputElement | null;
      return input?.checked ?? false;
    });
    expect(lightChecked).toBe(true);

    await window.screenshot({ path: shot('17-1-light'), fullPage: true });
  });

  test('17-2 — Dark 선택 시 data-theme=dark', async ({ window }) => {
    await expect(window.getByTestId('sidebar-search-input')).toBeVisible({
      timeout: 10_000,
    });
    await window.evaluate(() => document.body.focus());
    await window.keyboard.press('ControlOrMeta+,');
    await expect(window.getByTestId('settings-modal')).toBeVisible({
      timeout: 5_000,
    });
    await window.getByTestId('settings-tab-theme').click();
    await window.getByTestId('settings-theme-dark').click();

    await expect
      .poll(
        async () =>
          window.evaluate(() =>
            document.documentElement.getAttribute('data-theme')
          ),
        { timeout: 3_000 }
      )
      .toBe('dark');
    await window.screenshot({ path: shot('17-2-dark'), fullPage: true });
  });

  test('17-3 — 모달 재열기 시 선택 유지 (영속)', async ({ window }) => {
    await expect(window.getByTestId('sidebar-search-input')).toBeVisible({
      timeout: 10_000,
    });
    await window.evaluate(() => document.body.focus());

    // 1차: 모달 → dark 선택.
    await window.keyboard.press('ControlOrMeta+,');
    await expect(window.getByTestId('settings-modal')).toBeVisible({
      timeout: 5_000,
    });
    await window.getByTestId('settings-tab-theme').click();
    await window.getByTestId('settings-theme-dark').click();
    await expect
      .poll(
        async () =>
          window.evaluate(() =>
            document.documentElement.getAttribute('data-theme')
          ),
        { timeout: 3_000 }
      )
      .toBe('dark');

    // Escape 로 닫기.
    await window.keyboard.press('Escape');
    await expect(window.getByTestId('settings-modal')).not.toBeVisible({
      timeout: 3_000,
    });

    // 재열기.
    await window.keyboard.press('ControlOrMeta+,');
    await expect(window.getByTestId('settings-modal')).toBeVisible({
      timeout: 5_000,
    });
    await window.getByTestId('settings-tab-theme').click();
    await expect(window.getByTestId('settings-theme-panel')).toBeVisible({
      timeout: 3_000,
    });

    // dark 가 여전히 checked.
    await expect
      .poll(
        async () =>
          window.evaluate(() => {
            const label = document.querySelector(
              '[data-testid="settings-theme-dark"]'
            );
            const input = label?.querySelector(
              'input[type="radio"]'
            ) as HTMLInputElement | null;
            return input?.checked ?? false;
          }),
        { timeout: 3_000 }
      )
      .toBe(true);

    // DOM data-theme 도 dark 로 유지.
    await expect
      .poll(
        async () =>
          window.evaluate(() =>
            document.documentElement.getAttribute('data-theme')
          ),
        { timeout: 3_000 }
      )
      .toBe('dark');

    await window.screenshot({ path: shot('17-3-persisted'), fullPage: true });
  });
});
