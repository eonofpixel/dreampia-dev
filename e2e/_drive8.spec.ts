/**
 * Agent drive spec — Round 8 (v1.0.10): SEC-2 i18n 정직성 + grant status banner.
 *
 * Codex 검토에서 발견된 권한 i18n 거짓말 정정. PermissionPanel 에 v1.1.0
 * 예정 명시 banner. 진짜 grant UI 는 v1.1.0.
 */

import { test, expect } from './fixtures';
import { mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const SHOT_DIR = resolve(__dirname, '..', 'test-results', 'drive');
mkdirSync(SHOT_DIR, { recursive: true });
const shot = (name: string): string => resolve(SHOT_DIR, `r8-${name}.png`);

test.describe('drive r8 — SEC-2 honest i18n + grant status banner (v1.0.10)', () => {
  test('30 — PermissionPanel shows v1.1.0 deferred banner', async ({ window }) => {
    await expect(window.getByTestId('sidebar-search-input')).toBeVisible({ timeout: 10_000 });
    await window.evaluate(() => document.body.focus());
    await window.keyboard.press('ControlOrMeta+,');
    await expect(window.getByTestId('settings-modal')).toBeVisible({ timeout: 5_000 });

    await window.getByTestId('settings-tab-permission').click();
    await expect(window.getByTestId('settings-permission-panel')).toBeVisible();

    // 새로 추가된 grant status banner.
    const banner = window.getByTestId('settings-permission-grant-status');
    await expect(banner).toBeVisible();
    await expect(banner).toContainText('v1.1.0');
    await window.screenshot({ path: shot('30-grant-status-banner'), fullPage: true });
  });

  test('31 — read_only hint reflects honest behavior (no longer claims approval)', async ({
    window,
  }) => {
    await expect(window.getByTestId('sidebar-search-input')).toBeVisible({ timeout: 10_000 });
    await window.evaluate(() => document.body.focus());
    await window.keyboard.press('ControlOrMeta+,');
    await expect(window.getByTestId('settings-modal')).toBeVisible({ timeout: 5_000 });

    await window.getByTestId('settings-tab-permission').click();

    // read_only option label 영역 텍스트 확인.
    const readOnlyOption = window.getByTestId('settings-permission-read_only');
    await expect(readOnlyOption).toBeVisible();
    // 이전 v1.0.9 까지의 거짓말 ("매번 사용자 승인") 가 사라졌는지.
    await expect(readOnlyOption).not.toContainText('매번 사용자 승인');
    // 정직한 라벨 ("차단" 또는 "v1.1.0") 포함.
    const text = (await readOnlyOption.textContent()) ?? '';
    expect(text).toMatch(/차단|v1\.1\.0|blocked|approval modal/i);
  });
});
