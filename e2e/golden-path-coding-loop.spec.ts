/**
 * Golden-path coding loop smoke.
 *
 * Covers the user-visible chain that matters most for a first-time user:
 * workspace file -> request -> structured plan -> code candidate -> diff review
 * -> explicit apply -> file changed on disk.
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { test, expect } from './fixtures';

test.describe('golden path coding loop', () => {
  test.setTimeout(60_000);

  test('README request exposes structured workflow, diff review, and explicit apply', async ({
    window,
    workspaceDir,
  }) => {
    const readmePath = join(workspaceDir, 'README.md');
    writeFileSync(readmePath, '# Old README\n\nNeeds setup notes.\n', 'utf-8');

    await window.setViewportSize({ width: 1440, height: 920 });
    await window.getByRole('button', { name: '새 채팅', exact: false }).first().click();
    await expect(window.getByTestId('chat-input')).toBeVisible({ timeout: 10_000 });

    await window.getByTestId('provider-dropdown-select').selectOption('mock');
    await window.getByTestId('sidebar-open-code').click();
    await expect(window.getByTestId('code-file-row-README.md')).toBeVisible({ timeout: 10_000 });
    await window.getByTestId('code-file-row-README.md').click();
    await expect(window.getByTestId('code-active-path')).toContainText('README.md');

    const input = window.getByTestId('chat-input');
    await input.fill('README 설치 안내를 더 명확하게 바꿔줘');
    await input.press('Enter');

    const assistantTurn = window.locator('[data-testid="turn-assistant"]').last();
    await expect(assistantTurn).toHaveAttribute('data-status', 'completed', {
      timeout: 30_000,
    });
    await expect(window.getByTestId('coding-workflow-card')).toBeVisible();
    await expect(window.getByTestId('coding-workflow-section-plan')).toContainText('README');
    await expect(window.getByTestId('coding-workflow-section-tests')).toContainText(
      'npm run typecheck'
    );

    await assistantTurn
      .getByRole('button', { name: '이 코드 블록을 현재 열려 있는 파일에 적용' })
      .click();
    await expect(window.getByTestId('apply-to-file-modal')).toBeVisible({ timeout: 10_000 });
    await expect(window.getByTestId('apply-to-file-safety')).toContainText('적용 전 안전 확인');
    await expect(window.getByTestId('apply-to-file-preview')).toBeVisible();

    await window.setViewportSize({ width: 390, height: 844 });
    await expect(window.getByTestId('apply-to-file-modal')).toBeVisible();
    const hasHorizontalOverflow = await window.evaluate(
      () => document.documentElement.scrollWidth > document.documentElement.clientWidth
    );
    expect(hasHorizontalOverflow).toBe(false);

    await window.getByTestId('apply-to-file-accept').click();
    await expect(window.getByTestId('apply-to-file-modal')).not.toBeVisible({
      timeout: 10_000,
    });

    expect(readFileSync(readmePath, 'utf-8')).toContain('## Quick start');
  });
});
