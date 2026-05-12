/**
 * Agent drive spec — Round 2: 능동적 인터랙션으로 버그 사냥.
 *
 * Round 1 (_drive.spec.ts) 은 정적 visual 검증.
 * Round 2 는 클릭/타이핑/dialog mock 으로 실제 상태 전이를 본다.
 *
 * 출력: test-results/drive/r2-*.png + r2-*.json
 */

import { test, expect } from './fixtures';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const SHOT_DIR = resolve(__dirname, '..', 'test-results', 'drive');
mkdirSync(SHOT_DIR, { recursive: true });

const shot = (name: string): string => resolve(SHOT_DIR, `r2-${name}.png`);

test.describe('drive r2', () => {
  test('06 — click [새 채팅] creates a session and reveals composer', async ({ window }) => {
    await window.screenshot({ path: shot('06-before-newchat'), fullPage: true });

    const newChat = window.getByRole('button', { name: '새 채팅', exact: false });
    await expect(newChat).toBeVisible();
    await newChat.click();

    // 새 세션이 생기면 empty state 텍스트가 사라지고 composer/대화 영역이 떠야 한다.
    await window.waitForTimeout(800);
    await window.screenshot({ path: shot('06b-after-newchat'), fullPage: true });

    // landing hero 가 사라졌는지 — 사라졌으면 세션이 생긴 것.
    const stillEmpty = await window
      .getByTestId('chat-landing-hero')
      .isVisible()
      .catch(() => false);

    // DOM 상태를 캡처해서 문제 진단에 쓸 수 있게 저장.
    const state = await window.evaluate(() => {
      const root = document.getElementById('app');
      const textareas = Array.from(document.querySelectorAll('textarea')).map((t) => ({
        placeholder: t.placeholder,
        ariaLabel: t.getAttribute('aria-label'),
        testId: t.getAttribute('data-testid'),
      }));
      const inputs = Array.from(document.querySelectorAll('input')).map((i) => ({
        type: i.type,
        placeholder: i.placeholder,
        ariaLabel: i.getAttribute('aria-label'),
      }));
      const headings = Array.from(document.querySelectorAll('h1,h2,h3,h4')).map((h) => ({
        tag: h.tagName,
        text: h.textContent?.trim() ?? '',
      }));
      return {
        rootChildren: root?.childElementCount ?? 0,
        textareas,
        inputs,
        headings,
        bodyText: document.body.innerText.slice(0, 500),
      };
    });
    writeFileSync(
      resolve(SHOT_DIR, 'r2-06-state.json'),
      JSON.stringify({ stillEmpty, ...state }, null, 2),
      'utf-8'
    );
  });

  test('07 — search input typing triggers behaviour', async ({ window }) => {
    const search = window.getByTestId('sidebar-search-input');
    await expect(search).toBeVisible();

    await search.click();
    await search.fill('테스트 검색어');
    await window.waitForTimeout(500);
    await window.screenshot({ path: shot('07-search-typed'), fullPage: true });

    const result = await window.evaluate(() => {
      // 검색 결과 패널이나 dropdown 이 떴는지
      const list = document.querySelector('[role="listbox"], [data-testid*="search-results"]');
      return {
        listFound: list !== null,
        listText: list?.textContent?.trim().slice(0, 200) ?? null,
      };
    });
    writeFileSync(
      resolve(SHOT_DIR, 'r2-07-state.json'),
      JSON.stringify(result, null, 2),
      'utf-8'
    );

    await search.clear();
    await window.waitForTimeout(200);
    await window.screenshot({ path: shot('07b-search-cleared'), fullPage: true });
  });

  test('08 — preview panel example URL button', async ({ window }) => {
    const exampleBtn = window.getByRole('button', { name: '예시 URL 열기' });
    await expect(exampleBtn).toBeVisible();

    await window.screenshot({ path: shot('08-before-example-url'), fullPage: true });
    await exampleBtn.click();
    await window.waitForTimeout(2000); // BrowserView 로드 시간
    await window.screenshot({ path: shot('08b-after-example-url'), fullPage: true });

    // URL input 의 value 가 채워졌는지 확인
    const urlState = await window.evaluate(() => {
      const inputs = Array.from(document.querySelectorAll('input'));
      const urlInput = inputs.find(
        (i) => i.placeholder.includes('URL') || i.getAttribute('aria-label')?.includes('URL')
      );
      return {
        urlInputFound: urlInput !== undefined,
        urlValue: urlInput?.value ?? null,
        placeholder: urlInput?.placeholder ?? null,
      };
    });
    writeFileSync(
      resolve(SHOT_DIR, 'r2-08-state.json'),
      JSON.stringify(urlState, null, 2),
      'utf-8'
    );
  });

  test('09 — folder change end-to-end (dialog mock returns valid path)', async ({
    app,
    window,
  }) => {
    // 가짜 폴더 경로로 dialog 응답 설정.
    const FAKE_PATH = process.platform === 'win32'
      ? 'C:\\fake\\my-new-project'
      : '/fake/my-new-project';

    await app.evaluate(({ dialog }, fakePath) => {
      dialog.showOpenDialog = (async () => {
        return { canceled: false, filePaths: [fakePath] };
      }) as typeof dialog.showOpenDialog;
    }, FAKE_PATH);

    // before 캡처
    await window.screenshot({ path: shot('09-before-folder-change'), fullPage: true });
    const beforeName = await window.getByTestId('sidebar-pick-workspace').textContent();

    // 폴더 변경 시도
    await window.getByTestId('sidebar-pick-workspace').click();
    await window.waitForTimeout(1500); // settings 저장 + UI 반영

    await window.screenshot({ path: shot('09b-after-folder-change'), fullPage: true });
    const afterName = await window.getByTestId('sidebar-pick-workspace').textContent();

    writeFileSync(
      resolve(SHOT_DIR, 'r2-09-state.json'),
      JSON.stringify(
        {
          fakePath: FAKE_PATH,
          beforeName: beforeName?.trim(),
          afterName: afterName?.trim(),
          changed: beforeName !== afterName,
        },
        null,
        2
      ),
      'utf-8'
    );

    // v1.0.5 의 핵심: 폴더가 바뀌면 사이드바 라벨이 즉시 업데이트되어야 한다.
    // path 의 마지막 segment ("my-new-project") 가 라벨에 들어와야 한다.
    expect(afterName).toContain('my-new-project');
  });

  test('10 — onboarding 다시 보기 reopens wizard', async ({ window }) => {
    const reopenBtn = window.getByTestId('sidebar-reopen-onboarding');
    await expect(reopenBtn).toBeVisible();

    await window.screenshot({ path: shot('10-before-reopen'), fullPage: true });
    await reopenBtn.click();
    await window.waitForTimeout(800);

    await window.screenshot({ path: shot('10b-after-reopen'), fullPage: true });

    const wizardVisible = await window
      .getByTestId('onboarding-wizard')
      .isVisible()
      .catch(() => false);

    writeFileSync(
      resolve(SHOT_DIR, 'r2-10-state.json'),
      JSON.stringify({ wizardVisible }, null, 2),
      'utf-8'
    );

    expect(wizardVisible).toBe(true);
  });

  test('11 — full DOM inventory (interactive elements globally)', async ({ window }) => {
    // 사이드바뿐 아니라 전체 화면에서 클릭 가능한 모든 것을 카탈로그한다.
    const inventory = await window.evaluate(() => {
      const all = Array.from(
        document.querySelectorAll('button, a[href], [role="button"], input, textarea, [data-testid]')
      );
      const w = globalThis as unknown as Window;
      return all.slice(0, 80).map((el) => {
        const tag = el.tagName.toLowerCase();
        const role = el.getAttribute('role');
        const styles = w.getComputedStyle(el);
        return {
          tag,
          role,
          text: (el.textContent ?? '').trim().slice(0, 60),
          ariaLabel: el.getAttribute('aria-label'),
          testId: el.getAttribute('data-testid'),
          disabled: (el as HTMLButtonElement).disabled ?? null,
          opacity: styles.opacity,
          visible: styles.display !== 'none' && styles.visibility !== 'hidden',
        };
      });
    });

    writeFileSync(
      resolve(SHOT_DIR, 'r2-11-inventory.json'),
      JSON.stringify(inventory, null, 2),
      'utf-8'
    );

    expect(inventory.length).toBeGreaterThan(5);
  });
});
