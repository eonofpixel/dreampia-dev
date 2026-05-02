/**
 * Permission spec — V3 보안 (DangerCheck → PERMISSION_DENIED).
 *
 * STATUS: deferred. Same blocker as tool-call.spec.ts — needs
 * dev-only injection of a synthetic tool_call to drive the
 * permission denial flow without a real CLI.
 *
 * See tool-call.spec.ts for the path forward (P2-B).
 *
 * Coverage today: tests/permission/*.test.ts validate the resolver +
 * danger pattern matchers in isolation; tests/main/ipc.tool.test.ts
 * validates the IPC bridge. What's missing is end-to-end: AI emits a
 * dangerous tool_call → renderer surfaces "❌ 실패" with PERMISSION_DENIED.
 */

import { test, expect } from './fixtures';

test.describe.skip('permission (V3) — needs dev-only injection (P2-B)', () => {
  test('rm -rf / blocked → ToolCallCard shows ❌ 실패', async ({ window }) => {
    expect(window).toBeTruthy();
  });
});
