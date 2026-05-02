/**
 * App.tsx — Main React component
 *
 * Day 6: 3-패널 layout (F-013) + ChatInput (IME-safe).
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

function createDemoSession(title: string): Session {
  const id = newSessionId();
  const now = nowIso();
  const workspaceId = workspaceIdFor('C:\\Dev\\dreampia-dev');

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
      root: 'C:\\Dev\\dreampia-dev',
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
  // Day 6: 메모리 상 세션 (Phase 1 후반에 SessionStore 로 영구화)
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

  const handleNewChat = (): void => {
    const newSession = createDemoSession(`새 채팅 ${sessions.length + 1}`);
    setSessions([...sessions, newSession]);
    setActiveSessionId(newSession.id);
  };

  const handleSubmitMessage = (text: string): void => {
    if (!activeSession) return;

    const newTurn: Turn = {
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
                turns: [...s.conversation.turns, newTurn],
              },
            }
          : s
      )
    );
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
      chat={<ChatPanel session={activeSession} onSubmit={handleSubmitMessage} />}
      preview={<PreviewPanel browser={activeSession?.browser ?? null} />}
    />
  );
}
