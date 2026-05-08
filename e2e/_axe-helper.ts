/**
 * axe-core 직접 주입 helper — Electron e2e 용 (v1.7.7).
 *
 * `@axe-core/playwright` 가 내부적으로 `Target.createTarget` 을 호출하는데
 * Electron 의 BrowserWindow 는 child target 생성을 미지원 (단일 webContents).
 * 이 helper 는 axe-core 의 source 를 page.evaluate 로 직접 주입해 root frame
 * 만 검사. iframe 검사 누락은 dreampia 의 BrowserView/<webview> 가 이미 별
 * 프로세스라 무관.
 *
 * Spec: docs/v1.x-roadmap.md (v1.7.7 — a11y baseline).
 */

import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Page } from 'playwright';

const __dirname = dirname(fileURLToPath(import.meta.url));
const AXE_SOURCE_PATH = resolve(__dirname, '..', 'node_modules', 'axe-core', 'axe.min.js');

/** spec 모듈 로드 시 1회만 readFileSync — 매 테스트 inject 비용 감소. */
const AXE_SOURCE = readFileSync(AXE_SOURCE_PATH, 'utf-8');

export interface AxeViolation {
  id: string;
  impact: 'minor' | 'moderate' | 'serious' | 'critical' | null;
  description?: string;
  help?: string;
  helpUrl?: string;
  nodes?: Array<{ html?: string; target?: ReadonlyArray<string> }>;
}

export interface AxeRunOptions {
  /** WCAG tag — `withTags` 에 해당. e.g., ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']. */
  tags: ReadonlyArray<string>;
  /** disable 할 rule id. AxeBuilder.disableRules 와 동일. */
  disableRules?: ReadonlyArray<string>;
}

export interface AxeRunResult {
  violations: AxeViolation[];
}

/**
 * page 에 axe 가 이미 주입되어 있는지 확인 후 없으면 주입. 한 페이지에서
 * runAxe 가 여러 번 호출되어도 source 는 1회만 평가.
 */
async function ensureAxeLoaded(page: Page): Promise<void> {
  const has = await page.evaluate(
    () => typeof (window as unknown as { axe?: unknown }).axe !== 'undefined'
  );
  if (has) return;
  await page.evaluate((src) => {
    // eslint-disable-next-line @typescript-eslint/no-implied-eval
    new Function(src)();
  }, AXE_SOURCE);
}

/**
 * page (Electron renderer) 에 axe 를 주입한 뒤 axe.run 실행. AxeBuilder 의
 * `withTags(...).disableRules(...).analyze()` 와 동등 결과.
 */
export async function runAxe(page: Page, opts: AxeRunOptions): Promise<AxeRunResult> {
  await ensureAxeLoaded(page);
  return page.evaluate(
    async ({ tags, disableRules }) => {
      const w = window as unknown as { axe: { run: (ctx: unknown, opts: unknown) => Promise<AxeRunResult> } };
      const ruleOverrides: Record<string, { enabled: boolean }> = {};
      for (const id of disableRules) {
        ruleOverrides[id] = { enabled: false };
      }
      return w.axe.run(document, {
        runOnly: { type: 'tag', values: tags },
        rules: ruleOverrides,
      });
    },
    { tags: [...opts.tags], disableRules: [...(opts.disableRules ?? [])] }
  );
}
