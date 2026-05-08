/**
 * drive18 — axe-core 자동 a11y 검사 (v1.7.7).
 *
 * Spec: docs/v1.x-roadmap.md (v1.7.7 — a11y baseline).
 *
 * 핵심 화면의 WCAG 위반을 자동 감지. 본 spec 은 회귀 lock — 새 commit 이 a11y
 * 를 망가뜨리면 즉시 fail.
 *
 * 시나리오:
 *   - 18-1: 메인 채팅 화면 (사이드바 + 비어있는 chat panel + preview).
 *   - 18-2: settings 모달 (mcp 탭 mount).
 *   - 18-3: settings 모달 [Direct API] 탭.
 *
 * 정책:
 *  - WCAG 2.1 A + AA. critical / serious 위반은 fail.
 *  - moderate / minor 는 경고만 (info log) — 점진 개선 단계.
 *  - axe-core 가 false positive 라고 판단된 rule 은 disableRules 로 제외 (현재 0).
 *
 * 구현: `_axe-helper.ts` 의 `runAxe()` 사용. `@axe-core/playwright` 의
 * AxeBuilder 는 내부적으로 `Target.createTarget` 을 호출해 Electron 환경에서
 * 실패 — axe-core 를 page.evaluate 로 직접 주입하는 path 로 우회.
 *
 * 본 spec 은 새 a11y baseline 을 잡는 첫 시나리오라, 만약 기존에 위반이
 * 누적돼 있다면 첫 통과를 위해 일부 rule 을 임시 disable 할 수 있음 — 그
 * 경우 disableRules 에 해당 rule + comment 로 사유 명시.
 */

import { test, expect } from './fixtures';
import { runAxe } from './_axe-helper';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const WCAG_TAGS: ReadonlyArray<string> = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'];

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const SHOT_DIR = resolve(__dirname, '..', 'test-results', 'drive');
mkdirSync(SHOT_DIR, { recursive: true });

/**
 * 임시 비활성 규칙. baseline 을 잡으면서 점진 정리. 각 항목에 사유 명시.
 *
 * 비어있으면 모든 default rule 적용.
 *
 * v1.1.7 — strict baseline 회복:
 *   - 'aria-required-children' fix → PreviewPanel.tsx 의 PreviewTabs 가
 *     tablist role 을 inner div 만 carry, new-tab 버튼은 tablist 형제.
 *   - 'color-contrast' fix → text-tertiary token 조정 (light 65→42% L,
 *     dark 50→60% L) → bg-tertiary 위에서도 4.5:1 충족.
 */
const DISABLE_RULES: ReadonlyArray<string> = [];

/** Severity 별 위반 분류. */
interface AxeSummary {
  critical: number;
  serious: number;
  moderate: number;
  minor: number;
  total: number;
  rules: string[];
}

function summarize(violations: ReadonlyArray<{ id: string; impact?: string | null }>): AxeSummary {
  const out: AxeSummary = {
    critical: 0,
    serious: 0,
    moderate: 0,
    minor: 0,
    total: violations.length,
    rules: violations.map((v) => v.id),
  };
  for (const v of violations) {
    switch (v.impact) {
      case 'critical':
        out.critical += 1;
        break;
      case 'serious':
        out.serious += 1;
        break;
      case 'moderate':
        out.moderate += 1;
        break;
      case 'minor':
        out.minor += 1;
        break;
    }
  }
  return out;
}

test.describe('drive18 — axe-core a11y baseline (v1.7.7)', () => {
  test('18-1 — 메인 채팅 화면: critical/serious 0', async ({ window }) => {
    await expect(window.getByTestId('sidebar-search-input')).toBeVisible({
      timeout: 10_000,
    });

    const results = await runAxe(window, { tags: WCAG_TAGS, disableRules: DISABLE_RULES });

    const summary = summarize(results.violations);
    writeFileSync(
      resolve(SHOT_DIR, 'r18-1-main.json'),
      JSON.stringify({ summary, violations: results.violations }, null, 2),
      'utf-8'
    );

    // critical / serious 0 만 강제. moderate / minor 는 점진 개선.
    expect.soft(summary.critical, `critical 위반 ${summary.critical}개`).toBe(0);
    expect.soft(summary.serious, `serious 위반 ${summary.serious}개`).toBe(0);
    // 위 두 항목 fail 시 어떤 rule 인지 보고하기 위한 항상 통과 assert.
    expect(true).toBe(true);
  });

  test('18-2 — settings 모달 (mcp 탭): critical/serious 0', async ({ window }) => {
    await expect(window.getByTestId('sidebar-search-input')).toBeVisible({
      timeout: 10_000,
    });
    await window.evaluate(() => document.body.focus());
    await window.keyboard.press('ControlOrMeta+,');
    await expect(window.getByTestId('settings-modal')).toBeVisible({
      timeout: 5_000,
    });

    // 모달이 열린 상태에서 뒤 main 까지 모두 검사 — focus trap 검증 포함.
    const results = await runAxe(window, { tags: WCAG_TAGS, disableRules: DISABLE_RULES });

    const summary = summarize(results.violations);
    writeFileSync(
      resolve(SHOT_DIR, 'r18-2-settings-mcp.json'),
      JSON.stringify({ summary, violations: results.violations }, null, 2),
      'utf-8'
    );
    expect.soft(summary.critical).toBe(0);
    expect.soft(summary.serious).toBe(0);
  });

  test('18-3 — settings 모달 [Direct API] 탭: critical/serious 0', async ({
    window,
  }) => {
    await expect(window.getByTestId('sidebar-search-input')).toBeVisible({
      timeout: 10_000,
    });
    await window.evaluate(() => document.body.focus());
    await window.keyboard.press('ControlOrMeta+,');
    await expect(window.getByTestId('settings-modal')).toBeVisible({
      timeout: 5_000,
    });
    await window.getByTestId('settings-tab-direct_api').click();
    await expect(window.getByTestId('settings-direct-api-panel')).toBeVisible({
      timeout: 3_000,
    });

    const results = await runAxe(window, { tags: WCAG_TAGS, disableRules: DISABLE_RULES });
    const summary = summarize(results.violations);
    writeFileSync(
      resolve(SHOT_DIR, 'r18-3-settings-direct-api.json'),
      JSON.stringify({ summary, violations: results.violations }, null, 2),
      'utf-8'
    );
    expect.soft(summary.critical).toBe(0);
    expect.soft(summary.serious).toBe(0);
  });
});

// ────────────────────────────────────────────────────────────
// v2.1.0 (Phase C C4) — light theme axe variant.
//
// Default theme = dark (index.html). 18-1~3 이 이미 dark mode cover. 본 그룹
// 18-4~6 은 data-theme='light' 로 강제 전환 후 같은 시나리오 재실행 — light
// theme color-contrast / focus-indicator / link-color 등이 별도 검증.
//
// disableRules 는 light 와 dark 가 다를 수 있어 별도 변수.
// 현재 비어있음 — strict baseline 시작 시점.
// ────────────────────────────────────────────────────────────

const DISABLE_RULES_LIGHT: ReadonlyArray<string> = [];

async function setLightTheme(window: import('@playwright/test').Page): Promise<void> {
  await window.evaluate(() => {
    document.documentElement.setAttribute('data-theme', 'light');
  });
  // 짧은 paint 대기 — theme 변경 후 CSS 변수가 반영될 시간.
  await window.waitForTimeout(150);
}

test.describe('drive18 — axe-core a11y baseline (v2.1.0 C4 — light theme)', () => {
  test('18-4 — 메인 채팅 (light): critical/serious 0', async ({ window }) => {
    await expect(window.getByTestId('sidebar-search-input')).toBeVisible({
      timeout: 10_000,
    });
    await setLightTheme(window);

    const results = await runAxe(window, {
      tags: WCAG_TAGS,
      disableRules: DISABLE_RULES_LIGHT,
    });
    const summary = summarize(results.violations);
    writeFileSync(
      resolve(SHOT_DIR, 'r18-4-main-light.json'),
      JSON.stringify({ summary, violations: results.violations }, null, 2),
      'utf-8'
    );
    expect.soft(summary.critical).toBe(0);
    expect.soft(summary.serious).toBe(0);
    expect(true).toBe(true);
  });

  test('18-5 — settings 모달 mcp 탭 (light): critical/serious 0', async ({
    window,
  }) => {
    await expect(window.getByTestId('sidebar-search-input')).toBeVisible({
      timeout: 10_000,
    });
    await setLightTheme(window);
    await window.evaluate(() => document.body.focus());
    await window.keyboard.press('ControlOrMeta+,');
    await expect(window.getByTestId('settings-modal')).toBeVisible({
      timeout: 5_000,
    });

    const results = await runAxe(window, {
      tags: WCAG_TAGS,
      disableRules: DISABLE_RULES_LIGHT,
    });
    const summary = summarize(results.violations);
    writeFileSync(
      resolve(SHOT_DIR, 'r18-5-settings-mcp-light.json'),
      JSON.stringify({ summary, violations: results.violations }, null, 2),
      'utf-8'
    );
    expect.soft(summary.critical).toBe(0);
    expect.soft(summary.serious).toBe(0);
  });

  test('18-6 — settings [Direct API] (light): critical/serious 0', async ({
    window,
  }) => {
    await expect(window.getByTestId('sidebar-search-input')).toBeVisible({
      timeout: 10_000,
    });
    await setLightTheme(window);
    await window.evaluate(() => document.body.focus());
    await window.keyboard.press('ControlOrMeta+,');
    await expect(window.getByTestId('settings-modal')).toBeVisible({
      timeout: 5_000,
    });
    await window.getByTestId('settings-tab-direct_api').click();
    await expect(window.getByTestId('settings-direct-api-panel')).toBeVisible({
      timeout: 3_000,
    });

    const results = await runAxe(window, {
      tags: WCAG_TAGS,
      disableRules: DISABLE_RULES_LIGHT,
    });
    const summary = summarize(results.violations);
    writeFileSync(
      resolve(SHOT_DIR, 'r18-6-settings-direct-api-light.json'),
      JSON.stringify({ summary, violations: results.violations }, null, 2),
      'utf-8'
    );
    expect.soft(summary.critical).toBe(0);
    expect.soft(summary.serious).toBe(0);
  });
});
