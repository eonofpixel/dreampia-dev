/**
 * Agent drive spec — Round 5 (Phase A): drift detection.
 *
 * 시나리오:
 *   1. 세션 생성 (workspace = fixture tmpdir)
 *   2. dialog mock 으로 다른 fake path 반환 → workspace 변경
 *   3. ChatHeader 의 ⚠ drift badge 가 표시되는지 검증
 *   4. badge tooltip 이 원래 폴더 이름을 포함하는지 검증
 */

import { test, expect } from './fixtures';
import { mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const SHOT_DIR = resolve(__dirname, '..', 'test-results', 'drive');
mkdirSync(SHOT_DIR, { recursive: true });

const shot = (name: string): string => resolve(SHOT_DIR, `r5-${name}.png`);

test.describe('drive r5 — drift detection', () => {
  test('23 — drift badge appears when active session workspace differs from default', async ({
    app,
    window,
  }) => {
    // 1) 새 세션 생성 — 이 시점의 fixture workspace = userDataDir.
    await window.getByRole('button', { name: '새 채팅', exact: false }).first().click();
    await expect(window.getByTestId('chat-input')).toBeVisible({ timeout: 10_000 });

    // 처음에는 같은 폴더라 badge 없어야 함.
    const badgeBefore = window.getByTestId('workspace-drift-badge');
    await expect(badgeBefore).not.toBeVisible();
    await window.screenshot({ path: shot('23a-no-drift'), fullPage: true });

    // 2) dialog mock → 다른 폴더로 변경.
    const FAKE_PATH = process.platform === 'win32'
      ? 'C:\\fake\\drift-target-folder'
      : '/fake/drift-target-folder';
    await app.evaluate(({ dialog }, p) => {
      dialog.showOpenDialog = (async () => ({
        canceled: false,
        filePaths: [p],
      })) as typeof dialog.showOpenDialog;
    }, FAKE_PATH);

    // 3) [프로젝트] 클릭으로 폴더 변경 트리거.
    await window.getByTestId('sidebar-pick-workspace').click();
    await window.waitForTimeout(1500);

    // 4) drift badge 출현 검증.
    const badge = window.getByTestId('workspace-drift-badge');
    await expect(badge).toBeVisible({ timeout: 5_000 });
    await window.screenshot({ path: shot('23b-drift-detected'), fullPage: true });

    // 5) v1.0.7 — badge 가 짧은 ⚠ icon only. 텍스트 라벨은 tooltip 으로 이동.
    await expect(badge).toContainText('⚠');

    // 6) tooltip (title) 이 원래 폴더 이름을 포함하는지.
    const titleAttr = await badge.getAttribute('title');
    expect(titleAttr).not.toBeNull();
    // fixture 의 tmpdir basename 은 'dreampia-e2e-XXXXXX' 형식.
    expect(titleAttr ?? '').toMatch(/dreampia-e2e-/);

    // 7) v1.0.7 — Codex 검토 후 추가: ChatHeader layout 회귀 가드.
    //    drift badge 가 들어가도 header 가 단일 row 로 유지되어야 한다.
    //    이전 v1.0.6 는 badge 추가로 모든 요소가 wrap → 이 spec 이 통과시켰음.
    const headerLayout = await window.evaluate(() => {
      const title = document.querySelector('h1.truncate');
      const driftBadge = document.querySelector('[data-testid="workspace-drift-badge"]');
      const workspaceBtn = document.querySelector('[data-testid="workspace-pick-button"]');
      if (title === null || driftBadge === null || workspaceBtn === null) {
        return { error: 'missing element' };
      }
      const titleRect = title.getBoundingClientRect();
      const badgeRect = driftBadge.getBoundingClientRect();
      const wsRect = workspaceBtn.getBoundingClientRect();
      // header 의 부모 (`.flex.h-12.items-center`)
      const header = title.parentElement;
      const headerRect = header?.getBoundingClientRect();
      return {
        titleHeight: titleRect.height,
        badgeHeight: badgeRect.height,
        wsHeight: wsRect.height,
        headerHeight: headerRect?.height ?? 0,
        // 모든 요소가 같은 수직 영역 (= 단일 row) 안에 있어야 함.
        // height 가 너무 크면 wrap 발생.
      };
    });

    // header 는 h-12 (48px) 로 설계됨. 어떤 자식도 30px 이상이면 wrap 의심.
    // 30px = 48px - padding 보수적 추정.
    expect(headerLayout.error).toBeUndefined();
    expect(headerLayout.titleHeight).toBeLessThan(30);
    expect(headerLayout.badgeHeight).toBeLessThan(30);
    expect(headerLayout.wsHeight).toBeLessThan(30);
    expect(headerLayout.headerHeight).toBeLessThan(60); // h-12 (48) + 약간의 여유
  });

  test('24 — no drift badge when workspace matches', async ({ window }) => {
    // 세션 생성만 하고 폴더 변경 X. badge 가 절대 안 나와야 함.
    await window.getByRole('button', { name: '새 채팅', exact: false }).first().click();
    await expect(window.getByTestId('chat-input')).toBeVisible({ timeout: 10_000 });

    // wait + screenshot 로 무 drift 시각 증거.
    await window.waitForTimeout(500);
    await window.screenshot({ path: shot('24-no-drift-baseline'), fullPage: true });

    const badge = window.getByTestId('workspace-drift-badge');
    await expect(badge).not.toBeVisible();
  });
});
