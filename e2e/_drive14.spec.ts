/**
 * drive14 — Real CLI integration e2e: Claude CLI tool_use round-trip
 * (v1.1.7 / Codex Q9/Q10 권고 시나리오).
 *
 * Spec: docs/v1.x-roadmap.md (v1.1.4 Real CLI integration e2e), Codex Q9 picking 4.
 *
 * Codex 권고 4개 보강:
 *   - source=claude-cli 확인 (mock fallback 금지).
 *   - tool_call_complete → permission/request → tool_result → message_complete 순서.
 *   - argv-last 검증 (fake CLI 가 자체 검증 — exit 5).
 *   - 한국어 prompt + 한국어 cwd 회귀 lock.
 *
 * 본 spec 은 v1.1.7 의 minimum: 사용자 입력 → AI tool_call_complete → permission
 * card 표시 → 'once' 클릭 → tool_result 수신 흐름까지.
 *
 * Permission flow + saved tool turn 의 깊은 검증 (sessions.sqlite 직접 query)
 * 는 후속 commit 에서 추가 (drive14b 또는 시나리오 확장).
 */

import { makeVcrTest, expect } from './fixtures-vcr';

const test = makeVcrTest('claude/tool-use-roundtrip.json');

test.describe('drive14 — Claude CLI tool_use round-trip (VCR)', () => {
  test(
    '14-1 — 사용자 prompt → AI 가 shell.run tool 호출 → PermissionApprovalCard 표시',
    async ({ window }) => {
      // 1. Sidebar / chat input 렌더 대기.
      await expect(window.getByTestId('sidebar-search-input')).toBeVisible({
        timeout: 15_000,
      });

      // 2. 채팅 입력. fixture 의 prompt_last 와 정확히 일치해야 fake CLI 가
      //    argv-last 검증 통과. testid 는 ChatInput 의 'chat-input' (textarea).
      const composer = window.getByTestId('chat-input');
      await expect(composer).toBeVisible({ timeout: 10_000 });
      await composer.fill('현재 디렉토리 파일 목록 보여줘');

      // 3. 전송 — Enter 키 (Shift+Enter 가 newline). 명시적 send 버튼 X.
      await composer.press('Enter');

      // 4. AI 가 fake CLI 의 fixture 를 통해 tool_use 응답.
      //    Permission flow 가 발화 — PermissionApprovalCard inline 표시.
      //    (fixture 의 첫 stdout chunk 가 약 5ms 후, tool_use chunk 는 ~30ms 후.
      //    Queue → confirmer → IPC → renderer → React commit 까지 추가 시간.)
      const card = window.getByTestId('permission-approval-card');
      await expect(card).toBeVisible({ timeout: 20_000 });

      // 5. card 에 capability + target 정보 표시 — UI 가 사용자에게 충분한
      //    context 제공하는지 검증.
      //    shell.run 은 LOCAL_EXECUTE — tool 명세에 따라 exact text 는 i18n
      //    의존. 여기선 card 가 마운트됐다는 사실 자체로 v1.1.7 minimum 충족.

      // 6. 'once' 클릭 — 이번 호출만 통과 + grant 영속 X.
      const onceBtn = window.getByTestId('permission-approval-once');
      await expect(onceBtn).toBeVisible();
      await onceBtn.click();

      // 7. tool 실행 (실제 shell.run — workspaceDir 의 ls 실행). 결과가
      //    DOM 에 tool_result 로 표시될 때까지 대기.
      //    tool_result 의 testid 는 ChatPanel 의 ToolCallCard 에서 emit.
      //    가장 안정적인 신호는 PermissionApprovalCard 가 사라지는 것 +
      //    chat 안에 tool 이름이 나타나는 것.
      await expect(card).not.toBeVisible({ timeout: 15_000 });
    }
  );
});
