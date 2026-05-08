/**
 * drive20 — Workspace lock guard (v1.1.5).
 *
 * Spec: docs/v1.x-roadmap.md (v1.1.5 Workspace UX), docs/v2.x-roadmap.md.
 *
 * 시나리오:
 *   - 20-1: 세션 lock 후 [폴더 변경] 클릭 → toast warning 표시 + pickFolder 미호출.
 *   - 20-2: unlock 후 [폴더 변경] 클릭 → 정상 picker 흐름 (toast 없음).
 *
 * 본 spec 은 v1.1.5 의 handlePickWorkspace 가드 회귀 lock. 검증 부족 영역
 * (App.tsx defaultWorkspace useMemo + handlePickWorkspace) 의 사용자 path 가
 * 실제로 작동함을 e2e 로 보장.
 */

import { test, expect } from './fixtures';

test.describe('drive20 — Workspace lock guard (v1.1.5)', () => {
  test('20-1 — locked session: pickWorkspace blocked + warning toast', async ({ window }) => {
    // 새 세션 생성 — ChatHeader 의 workspace controls 가 mount 되기 위함.
    await window.getByRole('button', { name: '새 채팅', exact: false }).first().click();
    await expect(window.getByTestId('chat-input')).toBeVisible({ timeout: 10_000 });

    // 초기 상태: unlock (🔓). lock toggle 의 data-locked 속성 확인.
    const lockToggle = window.getByTestId('workspace-lock-toggle');
    await expect(lockToggle).toBeVisible();
    await expect(lockToggle).toHaveAttribute('data-locked', 'false');

    // 잠그기. data-locked='true' 로 전환.
    await lockToggle.click();
    await expect(lockToggle).toHaveAttribute('data-locked', 'true');

    // [폴더 변경] (workspace-pick-button) 클릭. handlePickWorkspace 가 lock 상태
    // 를 보고 pickFolder 호출 X + toast warning emit.
    const pickButton = window.getByTestId('workspace-pick-button');
    await expect(pickButton).toBeVisible();
    await pickButton.click();

    // toast warning 출현 검증. data-toast-kind='warning' + localized message.
    const toastItem = window.locator('[data-testid="toast-item"][data-toast-kind="warning"]');
    await expect(toastItem).toBeVisible({ timeout: 3_000 });
    // ko locale 의 메시지: "잠긴 세션의 작업 폴더는 변경할 수 없어요".
    // toast.workspace_lock.pick_blocked + detail 둘 다 표시됨. 부분 매치.
    await expect(toastItem).toContainText('잠긴');
  });

  test('20-2 — unlocked session: pickWorkspace 정상 흐름 (lock toast 없음)', async ({
    window,
  }) => {
    await window.getByRole('button', { name: '새 채팅', exact: false }).first().click();
    await expect(window.getByTestId('chat-input')).toBeVisible({ timeout: 10_000 });

    // unlock 상태 default. workspace-lock-toggle data-locked='false'.
    const lockToggle = window.getByTestId('workspace-lock-toggle');
    await expect(lockToggle).toHaveAttribute('data-locked', 'false');

    // [폴더 변경] 클릭. 정상이면 OS 다이얼로그를 띄우려고 시도하지만 e2e 환경
    // 에선 dialog mock 으로 즉시 cancel 또는 무반응. 핵심 검증은 lock toast 가
    // 안 떠야 함.
    const pickButton = window.getByTestId('workspace-pick-button');
    await pickButton.click();

    // 짧게 기다린 뒤 toast warning 이 안 떠야 함 (lock toast 가 발화 X).
    await window.waitForTimeout(500);
    const lockToast = window.locator(
      '[data-testid="toast-item"][data-toast-kind="warning"]'
    );
    // 0개 또는 lock 메시지가 아닌 다른 warning. lock 메시지 없음을 확정.
    const count = await lockToast.count();
    if (count > 0) {
      const text = await lockToast.first().innerText();
      expect(text).not.toContain('잠긴');
    }
  });
});
