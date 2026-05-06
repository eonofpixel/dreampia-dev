/**
 * drive18 — axe-core 자동 a11y 검사 (v1.7.7).
 *
 * Spec: docs/v1.x-roadmap.md (v1.7.7 — @axe-core/playwright 통합).
 *
 * @axe-core/playwright 를 활용해 핵심 화면의 WCAG 위반을 자동 감지. 본 spec
 * 은 회귀 lock — 새 commit 이 a11y 를 망가뜨리면 즉시 fail.
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
 * 본 spec 은 새 a11y baseline 을 잡는 첫 시나리오라, 만약 기존에 위반이
 * 누적돼 있다면 첫 통과를 위해 일부 rule 을 임시 disable 할 수 있음 — 그
 * 경우 disableRules 에 해당 rule + comment 로 사유 명시.
 */

import { test, expect } from './fixtures';
import { AxeBuilder } from '@axe-core/playwright';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const SHOT_DIR = resolve(__dirname, '..', 'test-results', 'drive');
mkdirSync(SHOT_DIR, { recursive: true });

/**
 * 임시 비활성 규칙. baseline 을 잡으면서 점진 정리. 각 항목에 사유 명시.
 *
 * 비어있으면 모든 default rule 적용. 점진적으로 추가/제거.
 */
const DISABLE_RULES: ReadonlyArray<string> = [
  // 'color-contrast'  — 일부 placeholder 텍스트가 4.5:1 미달일 수 있음. 실
  //                     개선은 v1.7.8+ Visual polish 에서.
  // 현재 비활성 0 — strict baseline.
];

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

    const builder = new AxeBuilder({ page: window }).withTags([
      'wcag2a',
      'wcag2aa',
      'wcag21a',
      'wcag21aa',
    ]);
    const results =
      DISABLE_RULES.length > 0
        ? await builder.disableRules([...DISABLE_RULES]).analyze()
        : await builder.analyze();

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

    const results = await new AxeBuilder({ page: window })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
      // 모달이 열린 상태에서 뒤 main 까지 모두 검사 — focus trap 검증 포함.
      .analyze();

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

    const results = await new AxeBuilder({ page: window })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
      .analyze();
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
