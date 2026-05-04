/**
 * Agent drive spec — 사람-루프 대신 에이전트가 직접 앱을 띄우고
 * 스크린샷을 찍어 "사람처럼" 검사하기 위한 inspection harness.
 *
 * 일반 E2E (smoke / sidebar / chat …) 와 분리하려고 파일명에 _ prefix 를 붙였다.
 * Playwright 의 testIgnore 에 추가 안 해도, `--grep _drive` 로 단독 실행하면 된다.
 *
 * 출력:
 *   test-results/drive/<step>.png   ← 에이전트가 Read 툴로 직접 본다.
 *
 * 운영 메모:
 *   - fixture (e2e/fixtures.ts) 가 settings.json 을 미리 써서 onboarding 을 skip
 *     하고 workspace_root 를 임시폴더로 박아둔다. 따라서 메인 화면이 바로 뜬다.
 *   - dialog.showOpenDialog 는 OS 네이티브라 Playwright 가 화면에 못 잡지만,
 *     IPC 로 mock 해서 클릭 핸들러가 정상 발화하는지 검증한다.
 *   - 실제 codex / claude spawn 은 이 드라이브에서 호출하지 않는다 (외부 의존).
 */

import { test, expect } from './fixtures';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const SHOT_DIR = resolve(__dirname, '..', 'test-results', 'drive');

mkdirSync(SHOT_DIR, { recursive: true });

/** 스크린샷 helper — 매 단계마다 fullPage 캡처 + manifest log 한 줄. */
function shotPath(step: string): string {
  return resolve(SHOT_DIR, `${step}.png`);
}

test.describe('drive', () => {
  test('01 — initial main screen after onboarding skip', async ({ window }) => {
    // 사이드바가 떠있는지 + 빈 채팅 empty state 확인.
    await expect(window.getByLabel('사이드바')).toBeVisible();

    await window.screenshot({ path: shotPath('01-initial'), fullPage: true });

    // 사이드바 단독 캡처 — 좌측 nav 의 [프로젝트], [플러그인], [자동화] 상태를 가까이서 본다.
    const sidebar = window.getByLabel('사이드바');
    await sidebar.screenshot({ path: shotPath('01b-sidebar') });
  });

  test('02 — coming-soon items visual (플러그인 / 자동화)', async ({ window }) => {
    // v1.0.3 에서 onClick 없는 sidebar 항목은 cursor-not-allowed + opacity-50 + "준비 중" 배지.
    const plugins = window.getByRole('button', { name: '플러그인', exact: false });
    const automation = window.getByRole('button', { name: '자동화', exact: false });

    await expect(plugins).toBeVisible();
    await expect(automation).toBeVisible();

    // Hover 해서 tooltip 확인 (title 어트리뷰트로 들어가있다)
    await plugins.hover();
    await window.waitForTimeout(300); // tooltip flush
    await window.screenshot({ path: shotPath('02-plugins-hover'), fullPage: true });

    // 클릭해도 아무 일이 일어나지 않아야 한다 — 누른 후에도 같은 화면.
    await plugins.click({ force: true }).catch(() => undefined);
    await window.waitForTimeout(200);
    await window.screenshot({ path: shotPath('02b-plugins-clicked'), fullPage: true });
  });

  test('03 — sidebar [프로젝트] click invokes folder picker IPC', async ({ app, window }) => {
    // 진짜 OS dialog 는 Playwright 가 화면에 못 잡으니까, main process 의
    // dialog.showOpenDialog 를 mock 한다. 호출 여부만 확인되면 v1.0.5 의
    // onPickWorkspace 와이어링이 살아있다는 뜻.
    await app.evaluate(({ dialog }) => {
      const original = dialog.showOpenDialog.bind(dialog);
      // @ts-expect-error — 글로벌 sentinel 로 호출 횟수 캡처
      globalThis.__pickCalls = 0;
      dialog.showOpenDialog = (async () => {
        // @ts-expect-error
        globalThis.__pickCalls += 1;
        // 사용자가 dialog 를 cancel 한 것처럼 응답.
        return { canceled: true, filePaths: [] };
        // original 은 안 부른다 — 실제 OS 다이얼로그가 뜨면 테스트가 멈춘다.
        void original;
      }) as typeof dialog.showOpenDialog;
    });

    const pick = window.getByTestId('sidebar-pick-workspace');
    await expect(pick).toBeVisible();
    await window.screenshot({ path: shotPath('03-before-pick'), fullPage: true });

    await pick.click();
    await window.waitForTimeout(500);

    const calls = await app.evaluate(() => {
      // @ts-expect-error
      return globalThis.__pickCalls as number;
    });

    await window.screenshot({ path: shotPath('03b-after-pick'), fullPage: true });

    expect(calls).toBeGreaterThan(0);
  });

  test('04 — chat header empty state vs. session state', async ({ window }) => {
    // 세션이 없을 때 empty state 메시지 표시.
    await expect(
      window.getByText('사이드바에서 채팅을 선택하거나 새로 만드세요')
    ).toBeVisible();

    await window.screenshot({ path: shotPath('04-empty-chat'), fullPage: true });
  });

  test('05 — DOM snapshot (sidebar nav inventory)', async ({ window }) => {
    // 텍스트 만으로 사이드바 네비를 찍어둔다 — 스크린샷 + 텍스트 둘 다 가져가면
    // 진단할 때 빠르다.
    const inventory = await window.evaluate(() => {
      const sidebar = document.querySelector('[aria-label="사이드바"]');
      if (sidebar === null) return { found: false, items: [] as Array<Record<string, string | boolean | null>> };

      const buttons = Array.from(sidebar.querySelectorAll('button'));
      const w = globalThis as unknown as Window;
      return {
        found: true,
        items: buttons.map((b) => ({
          text: b.textContent?.trim() ?? '',
          ariaLabel: b.getAttribute('aria-label'),
          testId: b.getAttribute('data-testid'),
          disabled: b.disabled,
          ariaDisabled: b.getAttribute('aria-disabled'),
          title: b.getAttribute('title'),
          opacity: w.getComputedStyle(b).opacity,
          cursor: w.getComputedStyle(b).cursor,
        })),
      };
    });

    writeFileSync(
      resolve(SHOT_DIR, '05-sidebar-inventory.json'),
      JSON.stringify(inventory, null, 2),
      'utf-8'
    );

    expect(inventory.found).toBe(true);
    expect(inventory.items.length).toBeGreaterThan(0);
  });
});
