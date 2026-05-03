/**
 * App.tsx — Main React component
 *
 * Day 6: 3-패널 layout (F-013) + ChatInput (IME-safe).
 * Day 7: MockProvider streaming wire-through (P0 final).
 * P1-2: SessionStore IPC integration — sessions persist across reload.
 * P1-4: Real CLI subprocess via IpcStreamingProvider + CLI status indicator.
 *
 * Spec: docs/design/layout/3panel.md, docs/ia/chat-flow.md,
 *       docs/session/persistence.md, docs/session/cross-ai-sync.md
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ThreePanelLayout } from './components/layout/ThreePanelLayout';
import { Sidebar } from './components/sidebar/Sidebar';
import { ChatPanel, type CliStatus } from './components/chat/ChatPanel';
import { PreviewPanel } from './components/preview/PreviewPanel';
import { OnboardingWizard } from './components/onboarding/OnboardingWizard';
import {
  SessionSchema,
  newSessionId,
  newTurnId,
  workspaceIdFor,
  partitionIdFor,
  nowIso,
  type Session,
  type SessionId,
  type Turn,
} from '@/types';
import { MockProvider } from '@/providers';
import type { StreamingProvider } from '@/providers/types';
import type { WorkspaceInfo } from '@/main/types';
import { IpcStreamingProvider } from './providers/IpcStreamingProvider';
import { useStreamingTurn } from './hooks/useStreamingTurn';
import { useSessionStore } from './hooks/useSessionStore';
import { useWorkspace } from './hooks/useWorkspace';
import { useOnboarding } from './hooks/useOnboarding';

/**
 * Renderer-side mock fallback gate.
 *
 * Phase 3 audit (HIGH): production 에서 IPC bridge 가 깨졌을 때 MockProvider
 * 로 silently fallback 하면 사용자에게 가짜 AI 응답을 보여줄 수 있다.
 * `import.meta.env.DEV` 는 Vite 가 build-time 에 inline 하므로 production
 * bundle 에선 항상 false → fail-closed.
 *
 * E2E 는 production build 의 dist/main 을 띄우므로 DEV=false 지만, 그땐
 * preload 가 정상 로드되어 hasIpc 가 true 가 되므로 mock fallback 자체가
 * 필요 없다 — 이 함수를 거치지 않는다. 만약 preload 가 깨지면 e2e 도 정상적
 * 으로 fail 표시되어야 하고, 그게 의도한 동작이다.
 */
function isMockAllowed(): boolean {
  // Vite 의 `import.meta.env.DEV` 는 production build 시 false 로 inline 된다.
  // SSR / Node test 환경 (vitest) 에선 DEV 가 undefined 일 수 있어 falsy guard.
  return Boolean(import.meta.env.DEV);
}

function createDemoSession(title: string, workspace: WorkspaceInfo): Session {
  const id = newSessionId();
  const now = nowIso();
  const workspaceId = workspaceIdFor(workspace.root);

  return SessionSchema.parse({
    id,
    schema_version: 1,
    created_at: now,
    updated_at: now,
    provider: 'codex',
    workspace_id: workspaceId,
    title,
    pinned: false,
    archived: false,
    conversation: {
      turns: [],
      current_model: 'gpt-5.5',
      current_effort: 'high',
      current_mode: 'standard',
    },
    workspace: {
      root: workspace.root,
      name: workspace.name,
      worktrees: [],
      recent_files: [],
      open_files: [],
      ignore_patterns: ['node_modules/**', '.git/**', 'dist/**'],
      index_status: 'idle',
      is_temporary: false,
    },
    terminal: { panes: [], panel_open: false, height_px: 200 },
    browser: {
      tabs: [],
      panel_visible: false,
      layout: 'hidden',
      partition_id: partitionIdFor(id),
    },
    plan: { active: false, browser_tool_enabled: false },
    permission: {
      grants: [],
      default_level: 'workspace_write',
      temporarily_blocked_capabilities: [],
    },
    metadata: {},
  });
}

export function App(): React.JSX.Element {
  const {
    state: { sessions, error: storeError },
    create: createSession,
    get: getSession,
    appendTurn: persistTurn,
  } = useSessionStore();

  // Phase 3 B2: 첫 실행 wizard. completed=true 면 main app, false 면 wizard 표시.
  // null 동안은 splash (flicker 방지) — Spec: docs/ia/onboarding.md
  const {
    completed: onboardingCompleted,
    loading: onboardingLoading,
    complete: completeOnboarding,
  } = useOnboarding();

  // The full active session lives only in the renderer during chat;
  // the database holds the source of truth, but we shadow it locally
  // so streaming text_delta events update synchronously.
  const [activeSessionId, setActiveSessionId] = useState<string>('');
  const [activeSession, setActiveSession] = useState<Session | null>(null);
  // Onboarding 추천 prompt → ChatInput 자동 채움. 새 prompt 가 도착할 때마다
  // 식별 가능하도록 Date.now() 같은 monotonic 값으로 들고 다닐 수 있지만,
  // ChatInput 의 useEffect 가 빈 문자열 무시하므로 string 자체로 충분.
  const [pendingPrompt, setPendingPrompt] = useState<string | undefined>(undefined);
  // launchWorkspace 는 main 이 보내준 default. packaged 에서 settings 없으면
  // null 이 반환되므로 nullable. dev/e2e 에선 process.cwd() 가 들어옴.
  const [launchWorkspace, setLaunchWorkspace] = useState<WorkspaceInfo | null>(null);
  const [launchWorkspaceLoaded, setLaunchWorkspaceLoaded] = useState(false);
  // Phase 3 audit (HIGH): picker auto-launch 가 사용자 취소 시 무한루프 방지.
  // Phase 3 B2: useState + useRef 이중 보호 — useState 는 React deps 에 반영,
  // useRef 는 같은 commit 내 빠른 연속 effect 실행에도 즉시 차단.
  const [workspacePickAttempted, setWorkspacePickAttempted] = useState(false);
  const workspacePickAttemptedRef = useRef(false);

  // 사용자가 picker 로 선택한 워크스페이스 (settings.json 영속). 있으면 우선,
  // 없으면 main 이 보내준 launch workspace (보통 process.cwd()) 로 폴백.
  const {
    workspace: pickedWorkspace,
    loading: pickedWorkspaceLoading,
    pick: pickWorkspace,
  } = useWorkspace();

  // When the list changes and we have no selection, pick the first one.
  useEffect(() => {
    if (activeSessionId !== '' || sessions.length === 0) return;
    const first = sessions[0];
    if (first !== undefined) setActiveSessionId(first.id);
  }, [sessions, activeSessionId]);

  // Fetch the full session (with conversation) whenever the selection changes.
  useEffect(() => {
    if (activeSessionId === '') {
      setActiveSession(null);
      return;
    }
    let cancelled = false;
    void (async () => {
      const session = await getSession(activeSessionId as SessionId);
      if (!cancelled) setActiveSession(session);
    })();
    return () => {
      cancelled = true;
    };
  }, [activeSessionId, getSession]);

  // Renderer has no Node path access in sandbox mode. Ask main for the
  // launch workspace instead of hardcoding a Windows path into new sessions.
  useEffect(() => {
    const appApi = typeof window !== 'undefined' ? window.dreampia?.app : undefined;
    if (appApi === undefined) {
      // IPC 미존재 (preload 깨짐) — launchWorkspace 는 null 유지. provider 도
      // null 이 되어 ipcUnavailable banner 가 표시된다.
      setLaunchWorkspaceLoaded(true);
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const result = await appApi.getDefaultWorkspace();
        if (cancelled) return;
        // result.value 가 null 일 수 있음 (packaged + settings 없음).
        if (result.ok) setLaunchWorkspace(result.value);
      } catch {
        // Keep null fallback.
      } finally {
        if (!cancelled) setLaunchWorkspaceLoaded(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // 새 세션은 항상 (사용자 선택 > launch) 우선순위로 root 결정.
  // packaged + settings 없음 + 사용자가 picker 로 선택 안함 = null.
  // null 이면 새 채팅 생성 disabled.
  const defaultWorkspace = useMemo<WorkspaceInfo | null>(() => {
    if (pickedWorkspace !== null) {
      return { root: pickedWorkspace.path, name: pickedWorkspace.name };
    }
    return launchWorkspace;
  }, [pickedWorkspace, launchWorkspace]);

  // Phase 3 audit (HIGH): packaged 에서 workspace 가 null 이면 자동으로
  // picker 띄우기. 단 한 번만 시도 — 사용자가 picker 취소하면 onboarding
  // screen 으로 안내 (무한 루프 방지).
  //
  // Phase 3 B2: onboarding wizard 가 step 4 에서 picker 를 직접 호출하므로
  // wizard 표시 중에는 auto picker 비활성화 (이중 dialog 방지). wizard 완료
  // 후 (onboardingCompleted=true) 까지 보류.
  const workspaceResolved = launchWorkspaceLoaded && !pickedWorkspaceLoading;
  const showOnboarding =
    !onboardingLoading && onboardingCompleted === false;
  useEffect(() => {
    if (!workspaceResolved) return;
    if (defaultWorkspace !== null) return;
    if (workspacePickAttempted) return;
    if (workspacePickAttemptedRef.current) return;
    if (showOnboarding) return; // wizard 가 picker 를 owner
    workspacePickAttemptedRef.current = true;
    setWorkspacePickAttempted(true);
    void pickWorkspace();
  }, [
    workspaceResolved,
    defaultWorkspace,
    workspacePickAttempted,
    pickWorkspace,
    showOnboarding,
  ]);

  // P1-4: IpcStreamingProvider 가 main 의 ai/start-stream 으로 위임.
  // window.dreampia.ai 가 없는 환경 (preload script 로딩 실패 / legacy build)
  // 에서는:
  //   - dev/test (vite dev / e2e / vitest) → MockProvider 로 빠른 iteration
  //   - production (packaged build) → null → UI 가 명시적 error banner 표시
  //
  // Phase 3 audit (HIGH) — 이전엔 production 에서도 MockProvider 로
  // silently fallback 했다. 이러면 preload 가 깨졌을 때 사용자에게 가짜
  // AI 응답을 보여주는 위험이 있다. fail-closed 로 명확히 표시하도록 변경.
  const provider = useMemo<StreamingProvider | null>(() => {
    const hasIpc = typeof window !== 'undefined' && window.dreampia?.ai !== undefined;
    if (hasIpc) return new IpcStreamingProvider();
    if (isMockAllowed()) return new MockProvider({ delayMs: 15 });
    return null;
  }, []);

  // CLI 감지 결과 — onMount 한 번 가져와 ChatHeader 에 표시.
  const [cliStatus, setCliStatus] = useState<CliStatus>(null);
  useEffect(() => {
    const ai = typeof window !== 'undefined' ? window.dreampia?.ai : undefined;
    if (ai === undefined) {
      setCliStatus({ source: 'mock', claude: null, codex: null });
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const result = await ai.detectCli();
        if (cancelled) return;
        if (result.ok) {
          setCliStatus({
            source: 'auto',
            claude: result.value.claude,
            codex: result.value.codex,
          });
        } else {
          setCliStatus({ source: 'mock', claude: null, codex: null });
        }
      } catch {
        if (!cancelled) setCliStatus({ source: 'mock', claude: null, codex: null });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Streaming pattern (see useSessionStore for rationale):
  //   - text_delta:        update local activeSession only (NO IPC)
  //   - message_complete:  appendTurn() through IPC + refresh
  const handleTurnUpdate = useCallback((turn: Turn): void => {
    setActiveSession((prev) => {
      if (prev === null) return prev;
      const turns = [...prev.conversation.turns];
      const idx = turns.findIndex((t) => t.id === turn.id);
      if (idx >= 0) {
        turns[idx] = turn;
      } else {
        turns.push(turn);
      }
      return {
        ...prev,
        updated_at: nowIso(),
        conversation: { ...prev.conversation, turns },
      };
    });
  }, []);

  const handleStreamComplete = useCallback(
    (turn: Turn, toolResultTurn?: Turn): void => {
      // 스트리밍 도중에는 매 delta 마다 DB write 하지 않는다 (퍼포먼스).
      // 완성된 assistant turn 만 한 번에 persist. Tool Queue 결과가 있으면
      // assistant 직후 role='tool' turn 으로 순서를 보존해 append 한다.
      if (activeSessionId === '') return;
      void (async () => {
        await persistTurn(activeSessionId as SessionId, turn);
        if (toolResultTurn !== undefined) {
          handleTurnUpdate(toolResultTurn);
          await persistTurn(activeSessionId as SessionId, toolResultTurn);
        }
      })();
    },
    [activeSessionId, handleTurnUpdate, persistTurn]
  );

  const {
    isStreaming,
    start: startStream,
    cancel: cancelStream,
  } = useStreamingTurn({
    provider,
    onTurnUpdate: handleTurnUpdate,
    onComplete: handleStreamComplete,
    onError: (err) => {
      console.error('[ChatStreaming] error:', err);
    },
  });

  const handleNewChat = useCallback(async (): Promise<void> => {
    // Phase 3 audit (HIGH): workspace 가 없으면 picker 먼저. 사용자가 취소하면
    // 새 채팅 만들지 않음 — 우연한 process.cwd() 위치를 root 로 쓰지 않도록.
    let workspace = defaultWorkspace;
    if (workspace === null) {
      const picked = await pickWorkspace();
      if (picked === null) return;
      workspace = { root: picked.path, name: picked.name };
    }
    const newSession = createDemoSession(`새 채팅 ${sessions.length + 1}`, workspace);
    const created = await createSession(newSession);
    if (created !== null) {
      setActiveSessionId(created.id);
    }
  }, [createSession, defaultWorkspace, pickWorkspace, sessions.length]);

  const handleSubmitMessage = useCallback(
    async (text: string): Promise<void> => {
      if (activeSession === null || isStreaming) return;
      // Phase 3 audit (HIGH) — production 에서 IPC bridge 누락 시 fail-closed.
      // ChatPanel 이 이미 banner 와 input disable 로 표시 중이지만 방어적으로 가드.
      if (provider === null) return;

      const userTurn: Turn = {
        id: newTurnId(),
        role: 'user',
        timestamp: nowIso(),
        status: 'completed',
        content: [{ type: 'text', text }],
      };

      // 1) Optimistic local push so the UI is responsive.
      setActiveSession((prev) =>
        prev === null
          ? prev
          : {
              ...prev,
              updated_at: nowIso(),
              conversation: {
                ...prev.conversation,
                turns: [...prev.conversation.turns, userTurn],
              },
            }
      );

      // 2) Persist user turn (refresh updates Sidebar's updated_at order).
      await persistTurn(activeSession.id, userTurn);

      // 3) Kick off streaming; assistant turn shadowed locally,
      //    persisted on message_complete (handleStreamComplete).
      // session.permission.default_level 을 명시적으로 forward — main 이 이걸로
      // CLI sandbox/tool-policy 결정. Spec: docs/permission/provider-mapping.md
      void startStream({
        turns: [...activeSession.conversation.turns, userTurn],
        model: activeSession.conversation.current_model,
        sessionId: activeSession.id,
        workspaceRoot: activeSession.workspace.root,
        permissionLevel: activeSession.permission.default_level,
      });
    },
    [activeSession, isStreaming, persistTurn, startStream, provider]
  );

  // Surface IPC errors in the console; UI-level error states come later.
  useEffect(() => {
    if (storeError !== null) {
      console.error('[useSessionStore] error:', storeError);
    }
  }, [storeError]);

  // Sidebar consumes a lightweight subset of the session list.
  const sidebarSessions = useMemo(
    () => sessions.map((s) => ({ id: s.id, title: s.title, pinned: s.pinned })),
    [sessions]
  );
  // Sidebar 의 project name — active session 우선, 없으면 default, 둘 다 없으면
  // 사용자가 picker 누르도록 안내 placeholder.
  const projectName =
    activeSession?.workspace.name ?? defaultWorkspace?.name ?? '폴더 선택 필요';

  // Phase 3 audit fix #4 — ChatHeader 가 표시할 workspace name.
  // 우선순위: active session 의 workspace.name (실제 메시지가 향하는 폴더) >
  //          defaultWorkspace.name (새 채팅이 만들어질 폴더).
  // 이전엔 항상 defaultWorkspace.name 만 보여서 session.workspace 와 drift 가
  // 났다 (사용자가 picker 로 폴더 바꿔도 기존 session 에는 반영 X).
  const chatHeaderWorkspaceName =
    activeSession?.workspace.name ?? defaultWorkspace?.name;

  // Phase 3 B2: Wizard 완료 시 호출 — settings 영속 + 옵션으로 첫 채팅 생성.
  // firstPrompt 가 있으면 새 세션 + ChatInput 자동 채움 (auto-submit X).
  const handleOnboardingComplete = useCallback(
    async (firstPrompt?: string): Promise<void> => {
      await completeOnboarding();
      if (firstPrompt === undefined || firstPrompt.length === 0) return;
      // workspace 결정: wizard step 4 에서 사용자가 선택했거나 기존 settings 사용.
      // 둘 다 null 이면 새 세션 생성 X (process.cwd() 우연 매칭 방지).
      const refreshedDefault = defaultWorkspace;
      if (refreshedDefault === null) return;
      const newSession = createDemoSession(
        `새 채팅 ${sessions.length + 1}`,
        refreshedDefault
      );
      const created = await createSession(newSession);
      if (created !== null) {
        setActiveSessionId(created.id);
        setPendingPrompt(firstPrompt);
      }
    },
    [completeOnboarding, defaultWorkspace, createSession, sessions.length]
  );

  const handleOnboardingSkip = useCallback(async (): Promise<void> => {
    await completeOnboarding();
  }, [completeOnboarding]);

  // Wizard 표시 중일 땐 main 3-panel 도 mount — 사용자가 wizard 끝낸 직후
  // 데이터가 이미 fetch 되어 있도록. wizard 가 z-50 overlay 라 위에 덮인다.
  // 단 onboarding loading 중 (= null) 에는 빈 div 로 splash 처럼 처리해
  // 잠깐 wizard 가 깜빡이는 걸 방지.
  if (onboardingLoading) {
    return <div className="h-full w-full bg-bg-primary" aria-hidden="true" />;
  }

  return (
    <>
      {showOnboarding && (
        <OnboardingWizard
          onComplete={handleOnboardingComplete}
          onSkip={handleOnboardingSkip}
        />
      )}
      <ThreePanelLayout
        sidebar={
          <Sidebar
            sessions={sidebarSessions}
            activeSessionId={activeSessionId}
            projectName={projectName}
            onSelectSession={setActiveSessionId}
            onNewChat={() => {
              void handleNewChat();
            }}
          />
        }
        chat={
          <ChatPanel
            session={activeSession}
            onSubmit={(text) => {
              setPendingPrompt(undefined);
              void handleSubmitMessage(text);
            }}
            isStreaming={isStreaming}
            onCancel={cancelStream}
            cliStatus={cliStatus}
            workspaceName={chatHeaderWorkspaceName}
            onPickWorkspace={() => {
              void pickWorkspace();
            }}
            ipcUnavailable={provider === null}
            initialInputValue={pendingPrompt}
          />
        }
        preview={
          <PreviewPanel
            sessionId={(activeSession?.id ?? null) as SessionId | null}
            browser={activeSession?.browser ?? null}
          />
        }
      />
    </>
  );
}
