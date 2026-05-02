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

import { useCallback, useEffect, useMemo, useState } from 'react';
import { ThreePanelLayout } from './components/layout/ThreePanelLayout';
import { Sidebar } from './components/sidebar/Sidebar';
import { ChatPanel, type CliStatus } from './components/chat/ChatPanel';
import { PreviewPanel } from './components/preview/PreviewPanel';
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

const FALLBACK_WORKSPACE: WorkspaceInfo = {
  root: '/',
  name: 'workspace',
};

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

  // The full active session lives only in the renderer during chat;
  // the database holds the source of truth, but we shadow it locally
  // so streaming text_delta events update synchronously.
  const [activeSessionId, setActiveSessionId] = useState<string>('');
  const [activeSession, setActiveSession] = useState<Session | null>(null);
  const [launchWorkspace, setLaunchWorkspace] = useState<WorkspaceInfo>(FALLBACK_WORKSPACE);

  // 사용자가 picker 로 선택한 워크스페이스 (settings.json 영속). 있으면 우선,
  // 없으면 main 이 보내준 launch workspace (보통 process.cwd()) 로 폴백.
  const { workspace: pickedWorkspace, pick: pickWorkspace } = useWorkspace();

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
    if (appApi === undefined) return;
    let cancelled = false;
    void (async () => {
      try {
        const result = await appApi.getDefaultWorkspace();
        if (!cancelled && result.ok) setLaunchWorkspace(result.value);
      } catch {
        // Keep browser-safe fallback.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // 새 세션은 항상 (사용자 선택 > launch) 우선순위로 root 결정.
  const defaultWorkspace = useMemo<WorkspaceInfo>(() => {
    if (pickedWorkspace !== null) {
      return { root: pickedWorkspace.path, name: pickedWorkspace.name };
    }
    return launchWorkspace;
  }, [pickedWorkspace, launchWorkspace]);

  // P1-4: IpcStreamingProvider 가 main 의 ai/start-stream 으로 위임.
  // window.dreampia.ai 가 없는 환경 (legacy renderer / 오래된 build) 에서는
  // MockProvider 로 fallback.
  const provider = useMemo<StreamingProvider>(() => {
    const hasIpc = typeof window !== 'undefined' && window.dreampia?.ai !== undefined;
    if (hasIpc) return new IpcStreamingProvider();
    return new MockProvider({ delayMs: 15 });
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
    const newSession = createDemoSession(`새 채팅 ${sessions.length + 1}`, defaultWorkspace);
    const created = await createSession(newSession);
    if (created !== null) {
      setActiveSessionId(created.id);
    }
  }, [createSession, defaultWorkspace, sessions.length]);

  const handleSubmitMessage = useCallback(
    async (text: string): Promise<void> => {
      if (activeSession === null || isStreaming) return;

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
    [activeSession, isStreaming, persistTurn, startStream]
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
  const projectName = activeSession?.workspace.name ?? defaultWorkspace.name;

  return (
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
            void handleSubmitMessage(text);
          }}
          isStreaming={isStreaming}
          onCancel={cancelStream}
          cliStatus={cliStatus}
          workspaceName={defaultWorkspace.name}
          onPickWorkspace={() => {
            void pickWorkspace();
          }}
        />
      }
      preview={
        <PreviewPanel
          sessionId={(activeSession?.id ?? null) as SessionId | null}
          browser={activeSession?.browser ?? null}
        />
      }
    />
  );
}
