/**
 * Tool call spec — V3 tool execution end-to-end.
 *
 * DREAMPIA_TEST=1 makes auto.ts use MockProvider with a test-only prompt
 * marker. The tool still executes through main-process ToolQueue, so this
 * covers renderer -> IPC stream -> Queue -> shell.run -> tool result display.
 */

import { test, expect } from './fixtures';

const TOOL_MARKER = '__DREAMPIA_TOOL_CALL__';

test.describe('tool call (V3)', () => {
  test('shell.run echo hi → ToolCallCard shows ✅ 완료', async ({ window }) => {
    await window.getByRole('button', { name: '새 채팅', exact: false }).first().click();
    const input = window.getByTestId('chat-input');
    await input.click();
    await input.fill(
      `${TOOL_MARKER} {"tool_id":"shell.run","input":{"cmd":"echo dreampia-e2e-tool"}}`
    );
    await input.press('Enter');

    const assistantTurn = window.locator('[data-testid="turn-assistant"]');
    await expect(assistantTurn).toHaveAttribute('data-status', 'completed', {
      timeout: 15_000,
    });

    const card = window.getByTestId('tool-call-card').first();
    await expect(card).toBeVisible({ timeout: 10_000 });
    await expect(card).toContainText('shell.run');
    await expect(card).toContainText('완료');
    await card.getByRole('button').click();
    await expect(card).toContainText('dreampia-e2e-tool');
  });
});
