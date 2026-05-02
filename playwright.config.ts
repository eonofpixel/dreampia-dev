/**
 * Playwright configuration — Electron E2E.
 *
 * Spec: P2-A E2E infra (replaces manual V2/V3/V4 verification).
 *
 * Why these knobs:
 *   - fullyParallel: false / workers: 1 — Electron app holds a single
 *     instance lock (`requestSingleInstanceLock` in src/main/index.ts).
 *     Running multiple windows in parallel triggers the second-instance
 *     handler instead of spawning a fresh process.
 *   - testIgnore for utils — fixtures.ts is a helper, not a spec.
 *   - retain-on-failure traces / videos — flaky reruns get a debuggable
 *     artefact without bloating CI on success.
 */

import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  testIgnore: ['**/utils/**', '**/fixtures.ts'],

  // Per-test budget. Electron cold-launch on Windows ~3-5s; Mock streaming
  // (delayMs:15ms × ~80 chars) ~1.5s. 30s gives plenty of headroom.
  timeout: 30_000,
  expect: { timeout: 5_000 },

  // Single-instance lock: never run two Electron apps at once.
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env['CI'],
  retries: process.env['CI'] !== undefined ? 1 : 0,

  reporter: [
    ['list'],
    ['html', { open: 'never', outputFolder: 'playwright-report' }],
  ],

  use: {
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    actionTimeout: 10_000,
  },

  outputDir: 'test-results/',
});
