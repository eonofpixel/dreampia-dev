/**
 * Agent drive spec — Round 6 (v1.0.8): Preview panel 토글.
 *
 * FAKE-1 청산 검증.
 * 출력: test-results/drive/r6-*.png
 */

import { test, expect } from './fixtures';
import { mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const SHOT_DIR = resolve(__dirname, '..', 'test-results', 'drive');
mkdirSync(SHOT_DIR, { recursive: true });
const shot = (name: string): string => resolve(SHOT_DIR, `r6-${name}.png`);

test.describe('drive r6 — preview panel toggle (v1.0.8)', () => {
  test('25 — toggle button hides + shows preview panel', async ({ window }) => {
    // 세션 생성 — ChatHeader 가 떠야 toggle button 이 mount.
    await window.getByRole('button', { name: '새 채팅', exact: false }).first().click();
    await expect(window.getByTestId('chat-input')).toBeVisible({ timeout: 10_000 });

    // 초기: preview panel hidden.
    const layout = window.locator('[data-preview-visible]');
    await expect(layout).toHaveAttribute('data-preview-visible', 'false');
    await window.screenshot({ path: shot('25a-initial-preview-hidden'), fullPage: true });

    // toggle button 으로 표시.
    const toggleBtn = window.getByTestId('preview-toggle-button');
    await expect(toggleBtn).toBeVisible();
    await toggleBtn.click();
    await window.waitForTimeout(300); // CSS transition

    await expect(layout).toHaveAttribute('data-preview-visible', 'true');
    await window.screenshot({ path: shot('25b-preview-visible'), fullPage: true });

    // 다시 toggle 로 숨기기.
    await toggleBtn.click();
    await window.waitForTimeout(300);
    await expect(layout).toHaveAttribute('data-preview-visible', 'false');
    await window.screenshot({ path: shot('25c-preview-hidden-again'), fullPage: true });

    // rail 에서도 다시 열 수 있다.
    await window.getByTestId('preview-rail-toggle').click();
    await expect(layout).toHaveAttribute('data-preview-visible', 'true');
    await window.screenshot({ path: shot('25d-preview-visible-from-rail'), fullPage: true });
  });

  test('26 — Mod+\\ keyboard shortcut toggles preview', async ({ window }) => {
    await window.getByRole('button', { name: '새 채팅', exact: false }).first().click();
    await expect(window.getByTestId('chat-input')).toBeVisible({ timeout: 10_000 });

    const layout = window.locator('[data-preview-visible]');
    await expect(layout).toHaveAttribute('data-preview-visible', 'false');

    // body focus 로 옮긴 뒤 Mod+\\ — 채팅 input 에 focus 있으면 keyboard handler
    // 가 input 의 keydown 으로 흡수될 수 있어 명시적으로 body focus.
    await window.evaluate(() => document.body.focus());
    await window.keyboard.press('ControlOrMeta+\\');
    await window.waitForTimeout(300);
    await expect(layout).toHaveAttribute('data-preview-visible', 'true');
    await window.screenshot({ path: shot('26a-after-mod-backslash'), fullPage: true });

    // 다시 토글.
    await window.evaluate(() => document.body.focus());
    await window.keyboard.press('ControlOrMeta+\\');
    await window.waitForTimeout(300);
    await expect(layout).toHaveAttribute('data-preview-visible', 'false');
  });

  test('27 — sidebar toggle (Mod+B) still works after preview toggle wiring', async ({
    window,
  }) => {
    // 회귀 가드 — preview toggle 추가가 sidebar toggle 깨뜨리지 않는지.
    await expect(window.getByLabel('사이드바')).toBeVisible({ timeout: 10_000 });

    const layout = window.locator('[data-sidebar-visible]');
    await expect(layout).toHaveAttribute('data-sidebar-visible', 'true');

    await window.evaluate(() => document.body.focus());
    await window.keyboard.press('ControlOrMeta+B');
    await window.waitForTimeout(300);
    await expect(layout).toHaveAttribute('data-sidebar-visible', 'false');
    await window.screenshot({ path: shot('27-sidebar-hidden'), fullPage: true });
  });

  test('28 — narrow viewport keeps preview as a right drawer without horizontal overflow', async ({
    window,
  }) => {
    await window.setViewportSize({ width: 720, height: 760 });
    await expect(window.getByTestId('chat-landing-hero')).toBeVisible({ timeout: 10_000 });

    const layout = window.locator('[data-preview-visible]');
    await expect(layout).toHaveAttribute('data-preview-visible', 'false');
    await window.getByTestId('preview-rail-toggle').click();
    await expect(layout).toHaveAttribute('data-preview-visible', 'true');
    await expect(window.getByRole('complementary', { name: '미리보기' })).toBeVisible();

    const metrics = await window.evaluate(() => {
      const preview = document.querySelector('.three-panel-preview')?.getBoundingClientRect();
      const rail = document.querySelector('.three-panel-preview-rail')?.getBoundingClientRect();
      return {
        innerWidth: document.documentElement.clientWidth,
        scrollWidth: document.documentElement.scrollWidth,
        previewRight: preview?.right ?? 0,
        railLeft: rail?.left ?? 0,
      };
    });

    expect(metrics.scrollWidth).toBeLessThanOrEqual(metrics.innerWidth + 1);
    expect(metrics.previewRight).toBeLessThanOrEqual(metrics.railLeft + 1);
    await window.screenshot({ path: shot('28-responsive-preview-drawer'), fullPage: true });
  });
});
