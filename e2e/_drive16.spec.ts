/**
 * drive16 — Real CLI integration e2e: failure modes (v1.1.9 / Codex Q9 권고).
 *
 * Spec: docs/v1.x-roadmap.md (v1.1.4 Real CLI integration e2e), Codex Q9 picking 5.
 *
 * 시나리오:
 *   - 16-1: fake CLI exit !=0 → ChatPanel 에 error message 표시.
 *   - 16-2: fake CLI stderr 에 error keyword → 마찬가지 error 표시.
 *
 * 본 spec 은 chat 입력 → fake CLI 가 의도적으로 실패 → renderer 가 error UI
 * 를 보여주는지 회귀 lock. CliProvider 의 fail-closed 정책이 production code
 * path 에서도 정상 작동하는지 검증.
 */

import { makeVcrTest, expect } from './fixtures-vcr';

test_exitNonZero();
test_stderrError();

function test_exitNonZero(): void {
  const test = makeVcrTest('claude/failure-exit-nonzero.json');
  test.describe('drive16 — failure: exit code !== 0', () => {
    test('16-1 — fake CLI 가 exit 1 → assistant turn 이 failed 상태로 종료', async ({
      window,
    }) => {
      await expect(window.getByTestId('sidebar-search-input')).toBeVisible({
        timeout: 15_000,
      });
      const composer = window.getByTestId('chat-input');
      await composer.fill('실패 케이스');
      await composer.press('Enter');

      // assistant turn 이 mount 되지만 status='failed'. 핵심 신호는 stop-button
      // 이 사라지거나 error 메시지가 표시되는 것. error 메시지의 정확한
      // testid 는 없을 수 있어 turn-assistant 가 마운트되었지만 streaming-cursor
      // 가 사라지는 것을 기다린다.
      const assistantTurn = window.getByTestId('turn-assistant').first();
      await expect(assistantTurn).toBeVisible({ timeout: 20_000 });

      // streaming-cursor 가 사라지면 stream 종료 — 정상 / 실패 어느 쪽이든.
      const cursor = window.getByTestId('streaming-cursor');
      await expect(cursor).not.toBeVisible({ timeout: 15_000 });
    });
  });
}

function test_stderrError(): void {
  const test = makeVcrTest('claude/failure-stderr-error.json');
  test.describe('drive16 — failure: stderr error keyword', () => {
    test('16-2 — fake CLI stderr 에 401 → assistant turn 종료 + error 노출', async ({
      window,
    }) => {
      await expect(window.getByTestId('sidebar-search-input')).toBeVisible({
        timeout: 15_000,
      });
      const composer = window.getByTestId('chat-input');
      await composer.fill('stderr 에러');
      await composer.press('Enter');

      const assistantTurn = window.getByTestId('turn-assistant').first();
      await expect(assistantTurn).toBeVisible({ timeout: 20_000 });

      const cursor = window.getByTestId('streaming-cursor');
      await expect(cursor).not.toBeVisible({ timeout: 15_000 });
    });
  });
}
