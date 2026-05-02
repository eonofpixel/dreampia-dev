/**
 * Tool call spec — V3 tool execution end-to-end.
 *
 * STATUS: deferred. Requires a deterministic way to make MockProvider
 * inject a tool_call_complete event from outside the renderer.
 *
 * Path forward (P2-B):
 *   1. Add `src/renderer/devTestHooks.ts` exposing window.__dreampiaTest
 *      with `injectStreamEvent(stream_id, event)` gated on
 *      import.meta.env.MODE !== 'production' OR DREAMPIA_TEST=1.
 *   2. Hook into App.tsx so the active provider can be wrapped to
 *      surface inject hooks.
 *   3. Re-enable the .skip below.
 *
 * Why skipped now: changing App.tsx to expose internal hooks is invasive
 * for a P2-A foundation commit. Smoke + chat + sidebar + browser-view
 * already give regression coverage of every UI flow that doesn't depend
 * on driving tool calls deterministically.
 */

import { test, expect } from './fixtures';

test.describe.skip('tool call (V3) — needs dev-only injection (P2-B)', () => {
  test('shell.run echo hi → ToolCallCard shows ✅ 완료', async ({ window }) => {
    expect(window).toBeTruthy(); // placeholder for re-enabled flow
  });
});
