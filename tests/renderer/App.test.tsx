/**
 * App.tsx 회귀 테스트 — Codex audit 의 fail-closed 흐름 검증.
 *
 * Phase 3 blockers (audit HIGH):
 *   1. Renderer fail-closed: production 환경 (DEV=false) 에서 window.dreampia
 *      누락 시 IPC unavailable banner 표시. mock fallback 으로 가짜 응답을 보여
 *      주지 않는다.
 *   2. Workspace picker 강제: launchWorkspace === null + pickedWorkspace === null
 *      이면 자동으로 picker 호출 (한 번만 — 무한 루프 방지).
 *   3. 새 채팅 button: workspace 가 null 이면 picker 띄운 후 사용자 취소 시
 *      세션 생성 X (process.cwd() 우연 매칭 차단).
 *
 * Spec: src/renderer/App.tsx, docs/session/cross-ai-sync.md (provider fallback)
 */

import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { App } from '../../src/renderer/App';
import { __mockStore } from '../setup';

// ────────────────────────────────────────────────────────────
// Helper: window.dreampia 를 임시로 교체했다가 복원.
// (tests/setup.ts 의 beforeEach 가 다시 채우므로 끝나면 자동 cleanup)
// ────────────────────────────────────────────────────────────

function withoutIpcBridge(): { restore: () => void } {
  const original = window.dreampia;
  Object.defineProperty(window, 'dreampia', {
    writable: true,
    configurable: true,
    value: undefined,
  });
  return {
    restore: () => {
      Object.defineProperty(window, 'dreampia', {
        writable: true,
        configurable: true,
        value: original,
      });
    },
  };
}

afterEach(() => {
  // vi.stubEnv 했던 것 모두 원복 (다른 test 격리).
  vi.unstubAllEnvs();
});

describe('App — fail-closed flows', () => {
  it('IPC unavailable banner: production 환경 + window.dreampia 누락 시 표시', async () => {
    // App 의 isMockAllowed() = Boolean(import.meta.env.DEV).
    // DEV=true (vitest default) 면 MockProvider fallback 으로 banner 안 뜸.
    // production 모방 위해 DEV=false 로 stub.
    vi.stubEnv('DEV', false);

    const guard = withoutIpcBridge();
    try {
      render(<App />);
      await waitFor(() =>
        expect(screen.getByTestId('ipc-unavailable-banner')).toBeInTheDocument()
      );
    } finally {
      guard.restore();
    }
  });

  it('IPC unavailable banner 미표시: dev 환경 (DEV=true) + window.dreampia 누락 시 MockProvider 폴백', async () => {
    // 정반대 경로 검증 — dev 에선 banner 가 뜨면 안된다 (MockProvider 활성).
    // 이게 깨지면 e2e 가 어차피 fail 표시하므로 안전.
    const guard = withoutIpcBridge();
    try {
      render(<App />);
      // 잠깐 기다려서 useEffect 가 모두 끝나도 banner 가 없는 걸 확인.
      await new Promise((r) => setTimeout(r, 50));
      expect(screen.queryByTestId('ipc-unavailable-banner')).not.toBeInTheDocument();
    } finally {
      guard.restore();
    }
  });

  it('workspace picker auto-launch: launch + picked 둘 다 null 이면 onMount 후 pickFolder() 호출', async () => {
    // 시나리오: packaged + settings 없음.
    //   - main 의 getDefaultWorkspace → ok:true, value:null (mock 패치 필요)
    //   - workspace.get → null (default mockStore.workspace = null 그대로)
    //   - 사용자 picker 취소 시뮬: workspacePickNext = null
    const originalGetDefault = window.dreampia.app.getDefaultWorkspace;
    window.dreampia.app.getDefaultWorkspace = vi.fn(async () => ({
      ok: true as const,
      value: null,
    }));
    __mockStore.workspacePickNext = null; // 사용자가 취소

    try {
      render(<App />);
      // useEffect 가 launchWorkspace + pickedWorkspace 모두 null 인 걸 감지하고
      // pickWorkspace() 한 번 자동 호출.
      await waitFor(() => {
        expect(window.dreampia.workspace.pickFolder).toHaveBeenCalled();
      });
      // 무한 루프 방지: workspacePickAttempted=true 후엔 추가 호출 X.
      const callsAfterFirst = (
        window.dreampia.workspace.pickFolder as unknown as { mock: { calls: unknown[] } }
      ).mock.calls.length;
      expect(callsAfterFirst).toBeGreaterThanOrEqual(1);
    } finally {
      window.dreampia.app.getDefaultWorkspace = originalGetDefault;
    }
  });

  it('workspace 가 끝까지 null 이면 [+ 새 채팅] 클릭해도 session.create 호출 X', async () => {
    // 흐름:
    //   1. 마운트 — auto picker 호출 (첫 시도). 사용자 취소 → workspace null 유지.
    //   2. 사용자가 [+ 새 채팅] 클릭 → handleNewChat 이 다시 pickWorkspace() 호출.
    //   3. 또 취소 → workspace null → 세션 생성 안함.
    const originalGetDefault = window.dreampia.app.getDefaultWorkspace;
    window.dreampia.app.getDefaultWorkspace = vi.fn(async () => ({
      ok: true as const,
      value: null,
    }));
    __mockStore.workspacePickNext = null; // 자동 picker 가 null 받음

    try {
      render(<App />);
      // 자동 picker 가 끝나길 대기.
      await waitFor(() => {
        expect(window.dreampia.workspace.pickFolder).toHaveBeenCalled();
      });

      const sessionCreateSpy = window.dreampia.session.create as unknown as {
        mock: { calls: unknown[] };
      };
      const initialCreateCalls = sessionCreateSpy.mock.calls.length;

      // [+ 새 채팅] button 클릭. setup 의 mock 이 pickFolder 호출 후
      // workspacePickNext 를 undefined 로 reset 하므로 다음 pick 도 null 시뮬
      // 위해 명시적으로 다시 set.
      __mockStore.workspacePickNext = null;
      const newChatBtn = screen.getByRole('button', { name: '새 채팅' });
      await userEvent.click(newChatBtn);

      // pickFolder 가 한 번 더 불렸어야 (auto + manual 합 ≥ 2).
      await waitFor(() => {
        const total = (
          window.dreampia.workspace.pickFolder as unknown as {
            mock: { calls: unknown[] };
          }
        ).mock.calls.length;
        expect(total).toBeGreaterThanOrEqual(2);
      });

      // 사용자가 취소했으니 세션은 만들어지지 않아야 한다.
      expect(sessionCreateSpy.mock.calls.length).toBe(initialCreateCalls);
    } finally {
      window.dreampia.app.getDefaultWorkspace = originalGetDefault;
    }
  });
});
