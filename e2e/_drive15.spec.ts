/**
 * drive15 — Real CLI integration e2e: 한국어 cwd round-trip
 * (v1.1.8 / Codex Q9 picking 5 — 2순위 → drive14 인접 시나리오 격상).
 *
 * Spec: docs/v1.x-roadmap.md (v1.1.4 Real CLI integration e2e), Codex Q5/Q9.
 *
 * 시나리오:
 *   workspace 디렉토리 이름이 한국어 ("dreampia-한국어-...") 인 상태에서
 *   tool_use round-trip 이 정상 작동. v1.0.6 의 ensureAsciiCwd 가 Windows 8.3
 *   short path 변환을 통과시킨다는 회귀 lock.
 *
 * 본 spec 은 drive14 와 동일한 fixture 를 재사용하지만 koreanWorkspace=true.
 * 차이점: workspaceDir 이름의 비-ASCII 문자.
 */

import { makeVcrTest, expect } from './fixtures-vcr';

const test = makeVcrTest('claude/tool-use-roundtrip.json', { koreanWorkspace: true });

test.describe('drive15 — KR cwd 와 함께 tool_use round-trip', () => {
  test(
    '15-1 — 한국어 워크스페이스 폴더에서 tool_use 정상 round-trip',
    async ({ window, workspaceDir }) => {
      // 사전 검증: workspaceDir 이 실제 한국어 prefix 가지고 있는지.
      expect(workspaceDir).toContain('한국어');

      await expect(window.getByTestId('sidebar-search-input')).toBeVisible({
        timeout: 15_000,
      });

      const composer = window.getByTestId('chat-input');
      await composer.fill('현재 디렉토리 파일 목록 보여줘');
      await composer.press('Enter');

      // KR cwd 에서도 fake CLI 가 spawn 정상 — argv-last + KR prompt 일치 →
      // Permission card 도달.
      const card = window.getByTestId('permission-approval-card');
      await expect(card).toBeVisible({ timeout: 20_000 });

      await window.getByTestId('permission-approval-once').click();

      // tool 실행 + result 표시.
      const toolCard = window.getByTestId('tool-call-card');
      await expect(toolCard).toBeVisible({ timeout: 15_000 });
      await expect(card).not.toBeVisible({ timeout: 5_000 });
    }
  );
});
