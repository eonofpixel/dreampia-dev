/**
 * Sidebar spec — multiple chats, switching, default-workspace label.
 *
 * Replaces manual sidebar verification.
 */

import { test, expect } from './fixtures';

test.describe('sidebar', () => {
  test('shows project name from main process default workspace', async ({ window }) => {
    // App.tsx fetches getDefaultWorkspace() and surfaces it in the project
    // section. The folder defaults to process.cwd() basename — for the
    // built app this is wherever Electron was launched from.
    // We don't pin the exact name (varies by CI/Windows path); only that
    // the section header renders.
    await expect(window.getByRole('heading', { name: '프로젝트' })).toBeVisible();
  });

  test('creates multiple sessions and switches between them', async ({ window }) => {
    const newChat = window.getByRole('button', { name: '새 채팅', exact: false }).first();

    // Create three sessions sequentially. Auto-titles are deterministic
    // ("새 채팅 1", "새 채팅 2", "새 채팅 3") because App.tsx uses
    // sessions.length+1 at click time.
    await newChat.click();
    await expect(window.getByRole('button', { name: /새 채팅 1/ })).toBeVisible({
      timeout: 5_000,
    });
    await newChat.click();
    await expect(window.getByRole('button', { name: /새 채팅 2/ })).toBeVisible({
      timeout: 5_000,
    });
    await newChat.click();
    await expect(window.getByRole('button', { name: /새 채팅 3/ })).toBeVisible({
      timeout: 5_000,
    });

    // Switch to chat 1, then chat 3. aria-current="true" is set on the
    // active item (Sidebar.tsx ChatItem).
    await window.getByRole('button', { name: /새 채팅 1/ }).click();
    await expect(window.getByRole('button', { name: /새 채팅 1/ }))
      .toHaveAttribute('aria-current', 'true');

    await window.getByRole('button', { name: /새 채팅 3/ }).click();
    await expect(window.getByRole('button', { name: /새 채팅 3/ }))
      .toHaveAttribute('aria-current', 'true');
  });

  test('chat input becomes available once a session is selected', async ({ window }) => {
    // Empty state → no chat input visible.
    await expect(window.getByTestId('chat-input')).toHaveCount(0);

    await window.getByRole('button', { name: '새 채팅', exact: false }).first().click();

    // After selection, ChatPanel mounts ChatInput.
    await expect(window.getByTestId('chat-input')).toBeVisible({ timeout: 5_000 });
  });
});
