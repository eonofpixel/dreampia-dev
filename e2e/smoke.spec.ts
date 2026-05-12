/**
 * Smoke spec — Electron launch + 3-panel layout + Korean nav labels.
 *
 * Replaces manual V1 verification. If this fails, NOTHING else can pass.
 */

import { test, expect } from './fixtures';

test.describe('smoke', () => {
  test('launches without crash and exposes app version IPC', async ({ app, window }) => {
    // Window title comes from src/renderer/index.html.
    await expect(window).toHaveTitle('Dreampia-Dev');

    // Validate app:get-version IPC works end-to-end (preload + main).
    const version = await app.evaluate(async ({ app }) => {
      return app.getVersion();
    });
    expect(typeof version).toBe('string');
    expect(version.length).toBeGreaterThan(0);
  });

  test('renders 3-panel layout (sidebar / chat / preview)', async ({ window }) => {
    // Sidebar: aria-label="사이드바" (src/renderer/components/sidebar/Sidebar.tsx:33)
    await expect(window.getByLabel('사이드바')).toBeVisible();

    // Preview panel: aria-label="미리보기" (PreviewPanel.tsx:86). Inspector toolbar
    // also has a "미리보기" label, so use the complementary landmark.
    await expect(window.getByRole('complementary', { name: '미리보기' })).toBeVisible();

    // Center chat panel — v2.10 ChatLandingHero when no session yet.
    await expect(window.getByTestId('chat-landing-hero')).toBeVisible();
    await expect(window.getByRole('heading', { name: '무엇을 만들어볼까요?' })).toBeVisible();
  });

  test('shows Korean nav labels in sidebar', async ({ window }) => {
    // v0.7.0 변경: "검색" placeholder button → SearchSection <input>
    // (메시지 전체 FTS5 검색). data-testid 와 aria-label 로 검증.
    await expect(window.getByTestId('sidebar-search-input'))
      .toBeVisible();
    await expect(window.getByLabel('메시지 검색'))
      .toBeVisible();

    // 나머지 nav 버튼들은 그대로 — i18n key 적용 후에도 한국어 default 라벨 유지.
    await expect(window.getByRole('button', { name: '플러그인', exact: false }))
      .toBeVisible();
    await expect(window.getByRole('button', { name: '자동화', exact: false }))
      .toBeVisible();
    await expect(window.getByRole('button', { name: '설정', exact: false }))
      .toBeVisible();

    // SectionHeader: "프로젝트", "채팅"
    await expect(window.getByRole('heading', { name: '프로젝트' }))
      .toBeVisible();
    await expect(window.getByRole('heading', { name: '채팅' }))
      .toBeVisible();
  });

  test('exposes window.dreampia bridge to renderer', async ({ window }) => {
    // Preload (src/main/preload.ts) must contextBridge.exposeInMainWorld.
    // page.evaluate runs inside the Electron renderer where `window.dreampia`
    // is the API surface. TypeScript here doesn't see the preload's global
    // augmentation, so cast through `unknown` to inspect at runtime.
    const hasBridge = await window.evaluate(() => {
      const w = window as unknown as {
        dreampia?: { session?: unknown; ai?: unknown };
      };
      return typeof w.dreampia === 'object'
        && typeof w.dreampia?.session === 'object'
        && typeof w.dreampia?.ai === 'object';
    });
    expect(hasBridge).toBe(true);
  });
});
