/**
 * Permission spec — V3 security (DangerCheck -> blocked ToolResult).
 *
 * Uses the same DREAMPIA_TEST-only tool marker as tool-call.spec.ts. The
 * dangerous command is blocked before child_process.spawn; the UI must show
 * the failed tool result from the real main-process ToolQueue path.
 */

import { test, expect } from './fixtures';

const TOOL_MARKER = '__DREAMPIA_TOOL_CALL__';

test.describe('permission (V3)', () => {
  test('rm -rf / blocked → ToolCallCard shows 실패 + DANGEROUS_PATTERN', async ({ window }) => {
    await window.getByRole('button', { name: '새 채팅', exact: false }).first().click();
    const input = window.getByTestId('chat-input');
    await input.click();
    await input.fill(`${TOOL_MARKER} {"tool_id":"shell.run","input":{"cmd":"rm -rf /"}}`);
    await input.press('Enter');

    const assistantTurn = window.locator('[data-testid="turn-assistant"]');
    await expect(assistantTurn).toHaveAttribute('data-status', 'completed', {
      timeout: 15_000,
    });

    const card = window.getByTestId('tool-call-card').first();
    await expect(card).toBeVisible({ timeout: 10_000 });
    await expect(card).toContainText('실패');
    await card.getByRole('button').click();
    await expect(card).toContainText('DANGEROUS_PATTERN');
  });
});
