/**
 * BrowserView spec — V4 PreviewPanel + WebContentsView lifecycle.
 *
 * Replaces manual V4 verification.
 *
 * Network requirement: openTab() loads https://example.com via the demo
 * button. CI runners with no network should skip via PLAYWRIGHT_SKIP_NETWORK=1.
 */

import { test, expect } from './fixtures';

const SKIP_NETWORK = process.env['PLAYWRIGHT_SKIP_NETWORK'] === '1';

test.describe('preview panel — BrowserView (V4)', () => {
  test('shows empty state with [예시 URL 열기] button initially', async ({ window }) => {
    // No tabs → EmptyPreview renders (PreviewPanel.tsx:404).
    await expect(window.getByText('미리보기할 페이지가 없어요')).toBeVisible();
    await expect(
      window.getByRole('button', { name: '예시 URL 열기' })
    ).toBeVisible();
  });

  test('opens example.com tab when clicking demo button', async ({ window }) => {
    test.skip(SKIP_NETWORK, 'PLAYWRIGHT_SKIP_NETWORK set — no network in CI runner');

    // BrowserView 는 session-scoped partition 사용 — 세션 먼저 생성 필요.
    await window.getByRole('button', { name: '새 채팅', exact: true }).click();

    await window.getByRole('button', { name: '예시 URL 열기' }).click();

    // After open, browser/tab-updated push events arrive. The placeholder
    // div (browser-pane-anchor) replaces the empty state.
    await expect(window.getByTestId('browser-pane-anchor')).toBeVisible({
      timeout: 10_000,
    });

    // Tab strip role=tablist; one tab now exists.
    const tabs = window.getByRole('tab');
    await expect(tabs).toHaveCount(1, { timeout: 10_000 });

    // URL bar reflects the loaded URL once navigation starts. The bar
    // is editable so we check `value` on the input.
    const urlInput = window.getByLabel('URL');
    await expect(urlInput).toHaveValue(/example\.com/i, { timeout: 15_000 });
  });

  test('closes tab → empty state returns', async ({ window }) => {
    test.skip(SKIP_NETWORK, 'PLAYWRIGHT_SKIP_NETWORK set — no network in CI runner');

    await window.getByRole('button', { name: '새 채팅', exact: true }).click();
    await window.getByRole('button', { name: '예시 URL 열기' }).click();
    await expect(window.getByRole('tab')).toHaveCount(1, { timeout: 10_000 });

    // Close button has aria-label '<title> 닫기'. Title initially "새 탭".
    const closeBtns = window.getByRole('button', { name: /닫기/ });
    await closeBtns.first().click();

    // Tab gone → EmptyPreview again.
    await expect(window.getByText('미리보기할 페이지가 없어요')).toBeVisible({
      timeout: 5_000,
    });
  });
});
