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
import { IpcStreamingProvider } from './providers/IpcStreamingProvider';
import { useStreamingTurn } from './hooks/useStreamingTurn';
import { useSessionStore } from './hooks/useSessionStore';

function createDemoSession(title: string): Session {
  const id = newSessionId();
  const now = nowIso();
  const workspaceId = workspaceIdFor('C:\Dev\dreampia-dev');

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
      root: 'C:\Dev\dreampia-dev',
      name: 'dreampia-dev',
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

  // P1-4: IpcStreamingProvider 가 main 의 ai/start-stream 으로 위임.
  // window.dreampia.ai 가 없는 환경 (legacy renderer / 오래된 build) 에서는
  // MockProvider 로 fallback.
  const provider = useMemo<StreamingProvider>(() => {
    const hasIpc =
      typeof window !== 'undefined' && window.dreampia?.ai !== undefined;
    if (hasIpc) return new IpcStreamingProvider();
    return new MockProvider({ delayMs: 15 });
  }, []);

  // CLI 감지 결과 — onMount 한 번 가져와 ChatHeader 에 표시.
  const [cliStatus, setCliStatus] = useState<CliStatus>(null);
  useEffect(() => {
    const ai =
      typeof window !== 'undefined' ? window.dreampia?.ai : undefined;
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
    (turn: Turn): void => {
      // 스트리밍 도중에는 매 delta 마다 DB write 하지 않는다 (퍼포먼스).
      // 완성된 assistant turn 만 한 번에 persist.
      if (activeSessionId === '') return;
      void persistTurn(activeSessionId as SessionId, turn);
    },
    [activeSessionId, persistTurn]
  );

  const { isStreaming, start: startStream, cancel: cancelStream } = useStreamingTurn({
    provider,
    onTurnUpdate: handleTurnUpdate,
    onComplete: handleStreamComplete,
    onError: (err) => {
      console.error('[ChatStreaming] error:', err);
    },
  });

  const handleNewChat = useCallback(async (): Promise<void> => {
    const newSession = createDemoSession(`새 채팅 ${sessions.length + 1}`);
    const created = await createSession(newSession);
    if (created !== null) {
      setActiveSessionId(created.id);
    }
  }, [createSession, sessions.length]);

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
      void startStream({
        turns: [...activeSession.conversation.turns, userTurn],
        model: activeSession.conversation.current_model,
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

  return (
    <ThreePanelLayout
      sidebar={
        <Sidebar
          sessions={sidebarSessions}
          activeSessionId={activeSessionId}
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
