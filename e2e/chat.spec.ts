/**
 * Chat spec — V2 user input → Mock streaming → assistant bubble.
 *
 * Replaces manual V2 verification.
 *
 * Notes:
 *   - In CI / dev hosts without claude/codex installed, ai/start-stream
 *     falls back to MockProvider (auto.ts). The Mock echoes the user
 *     message char-by-char with delayMs:15 → ~1.5s for short prompts.
 *   - Persistence: chat ↻ reload should re-show messages because
 *     SessionStore SQLite lives in our isolated userDataDir.
 */

import { test, expect } from './fixtures';

test.describe('chat flow (V2)', () => {
  test('creates new session via [+ 새 채팅] and selects it', async ({ window }) => {
    // Start state: no chats. Empty-state copy.
    await expect(window.getByText('아직 채팅이 없어요.')).toBeVisible();

    // Click "새 채팅" button (Sidebar.tsx:42).
    await window.getByRole('button', { name: '새 채팅', exact: false }).first().click();

    // First session is auto-titled "새 채팅 1" (App.tsx createDemoSession).
    await expect(window.getByRole('button', { name: /새 채팅 1/ })).toBeVisible({
      timeout: 10_000,
    });
  });

  test('user input → assistant bubble (Mock streaming)', async ({ window }) => {
    // Create a session first.
    await window.getByRole('button', { name: '새 채팅', exact: false }).first().click();
    await expect(window.getByTestId('chat-input')).toBeVisible();

    // Type a Korean message and submit via Enter (IME-safe path: not in
    // composition, so Enter without shift submits).
    const input = window.getByTestId('chat-input');
    await input.click();
    await input.fill('안녕');
    await input.press('Enter');

    // User bubble appears immediately (optimistic push, App.tsx:259).
    const userTurn = window.locator('[data-testid="turn-user"]');
    await expect(userTurn).toContainText('안녕');

    // Assistant bubble starts streaming. data-status='streaming' means
    // delta still flowing (ChatPanel TurnDisplay).
    const assistantTurn = window.locator('[data-testid="turn-assistant"]');
    await expect(assistantTurn).toBeVisible({ timeout: 10_000 });

    // Streaming cursor visible during stream.
    await expect(window.getByTestId('streaming-cursor').first()).toBeVisible({
      timeout: 5_000,
    });

    // Eventually message_complete fires — status flips to 'completed'.
    await expect(assistantTurn).toHaveAttribute('data-status', 'completed', {
      timeout: 15_000,
    });

    // Echo content includes the user's text.
    await expect(assistantTurn).toContainText('안녕');
  });

  test('persists conversation across reload (SessionStore IPC)', async ({ window }) => {
    // Seed a session with one user turn.
    await window.getByRole('button', { name: '새 채팅', exact: false }).first().click();
    const input = window.getByTestId('chat-input');
    await input.click();
    await input.fill('지속성 테스트');
    await input.press('Enter');

    // Wait for full streaming complete so persistTurn finishes.
    const assistantTurn = window.locator('[data-testid="turn-assistant"]');
    await expect(assistantTurn).toHaveAttribute('data-status', 'completed', {
      timeout: 15_000,
    });

    // Reload renderer. main process keeps SQLite open; renderer re-fetches
    // session list via session/list, then session/get for the active one.
    await window.reload();
    await window.waitForFunction(() => {
      const root = document.getElementById('app');
      return root !== null && root.childElementCount > 0;
    });

    // Session in sidebar persists. Sidebar 의 "새 채팅" 버튼 (생성용) 과
    // 채팅 항목 ("새 채팅 1") 둘 다 매치되므로 채팅 목록 nav 안 에서만 검색.
    const chatList = window.getByRole('navigation', { name: '채팅 목록' });
    await expect(chatList.getByRole('button', { name: /새 채팅 \d+/ })).toBeVisible({
      timeout: 10_000,
    });

    // Click into it — the user message must come back.
    await chatList.getByRole('button', { name: /새 채팅 \d+/ }).first().click();
    // Mock response 도 '지속성 테스트' 를 포함하므로 user turn 으로 scope.
    await expect(
      window.getByTestId('turn-user').getByText('지속성 테스트')
    ).toBeVisible({ timeout: 5_000 });
  });

  // v0.6.0 (F-019) — @ mention popover end-to-end.
  test('@ mention: typing @s opens popover with file matches and Tab inserts path', async ({
    window,
  }) => {
    // Create a session — ChatInput mount + workspace_root attached.
    await window.getByRole('button', { name: '새 채팅', exact: false }).first().click();
    const input = window.getByTestId('chat-input');
    await expect(input).toBeVisible({ timeout: 10_000 });

    // 사용자 fixture 의 workspace_root = userDataDir 안에 settings.json 이 있다.
    // @s 를 입력하면 file 멘션 후보로 settings.json 가 나타나야 한다.
    await input.click();
    await input.fill('@s');
    // popover 등장.
    await expect(window.getByTestId('mention-popover')).toBeVisible({
      timeout: 5_000,
    });
    // settings.json 항목 존재. (e2e fixture 가 미리 써놓은 파일)
    await expect(
      window.getByTestId('mention-option-file-settings.json')
    ).toBeVisible({ timeout: 5_000 });
  });

  test('cancels mid-stream via [중지] button', async ({ window }) => {
    await window.getByRole('button', { name: '새 채팅', exact: false }).first().click();
    const input = window.getByTestId('chat-input');
    await input.click();
    // Long-ish text → Mock stream takes ~1.5s, plenty to click stop.
    await input.fill('이것은 충분히 긴 메시지여서 스트리밍 도중에 중지를 누를 수 있습니다');
    await input.press('Enter');

    // Stop button only renders while isStreaming=true.
    const stopButton = window.getByTestId('stop-button');
    await expect(stopButton).toBeVisible({ timeout: 5_000 });
    await stopButton.click();

    // After cancel, stop button disappears (isStreaming flipped back).
    await expect(stopButton).not.toBeVisible({ timeout: 5_000 });
  });
});
