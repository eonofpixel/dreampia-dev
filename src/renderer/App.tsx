/**
 * App.tsx — Main React component
 *
 * Day 6: 3-패널 layout (F-013) + ChatInput (IME-safe).
 * Day 7: MockProvider streaming wire-through (P0 final).
 *
 * Spec: docs/design/layout/3panel.md, docs/ia/chat-flow.md
 */

import { useMemo, useState } from 'react';
import { ThreePanelLayout } from './components/layout/ThreePanelLayout';
import { Sidebar } from './components/sidebar/Sidebar';
import { ChatPanel } from './components/chat/ChatPanel';
import { PreviewPanel } from './components/preview/PreviewPanel';
import {
  SessionSchema,
  newSessionId,
  newTurnId,
  workspaceIdFor,
  partitionIdFor,
  nowIso,
  type Session,
  type Turn,
} from '@/types';
import { MockProvider } from '@/providers';
import { useStreamingTurn } from './hooks/useStreamingTurn';

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
  const [sessions, setSessions] = useState<Session[]>(() => [
    { ...createDemoSession('Day 6 layout 데모'), pinned: true },
    createDemoSession('테스트 세션 2'),
  ]);
  const [activeSessionId, setActiveSessionId] = useState<string>(
    () => sessions[0]?.id ?? ''
  );

  const activeSession = useMemo(
    () => sessions.find((s) => s.id === activeSessionId) ?? null,
    [sessions, activeSessionId]
  );

  // MockProvider: 15ms delay 로 글자 단위 streaming
  const provider = useMemo(() => new MockProvider({ delayMs: 15 }), []);

  const { isStreaming, start: startStream, cancel: cancelStream } = useStreamingTurn({
    provider,
    onTurnUpdate: (turn) => {
      setSessions((prev) =>
        prev.map((s) => {
          if (s.id !== activeSessionId) return s;
          const turns = [...s.conversation.turns];
          const idx = turns.findIndex((t) => t.id === turn.id);
          if (idx >= 0) {
            turns[idx] = turn;
          } else {
            turns.push(turn);
          }
          return {
            ...s,
            updated_at: nowIso(),
            conversation: { ...s.conversation, turns },
          };
        })
      );
    },
    onComplete: (_turn) => {
      // onTurnUpdate 가 마지막 이벤트(message_complete)도 처리하므로 추가 작업 없음
    },
    onError: (error) => {
      console.error('[ChatStreaming] error:', error);
    },
  });

  const handleNewChat = (): void => {
    const newSession = createDemoSession(`새 채팅 ${sessions.length + 1}`);
    setSessions([...sessions, newSession]);
    setActiveSessionId(newSession.id);
  };

  const handleSubmitMessage = (text: string): void => {
    if (!activeSession || isStreaming) return;

    const userTurn: Turn = {
      id: newTurnId(),
      role: 'user',
      timestamp: nowIso(),
      status: 'completed',
      content: [{ type: 'text', text }],
    };

    setSessions((prev) =>
      prev.map((s) =>
        s.id === activeSessionId
          ? {
              ...s,
              updated_at: nowIso(),
              conversation: {
                ...s.conversation,
                turns: [...s.conversation.turns, userTurn],
              },
            }
          : s
      )
    );

    void startStream({
      turns: [...activeSession.conversation.turns, userTurn],
      model: activeSession.conversation.current_model,
    });
  };

  return (
    <ThreePanelLayout
      sidebar={
        <Sidebar
          sessions={sessions}
          activeSessionId={activeSessionId}
          onSelectSession={setActiveSessionId}
          onNewChat={handleNewChat}
        />
      }
      chat={
        <ChatPanel
          session={activeSession}
          onSubmit={handleSubmitMessage}
          isStreaming={isStreaming}
          onCancel={cancelStream}
        />
      }
      preview={<PreviewPanel browser={activeSession?.browser ?? null} />}
    />
  );
}
