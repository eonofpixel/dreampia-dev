/**
 * ChatPanel.fork-at-turn test (v1.6.19)
 *
 * v1.6.19 — per-turn [🌿] 분기 버튼이 turn footer 에 mount 되고 클릭 시
 * onForkAtTurn(turn.id) 가 호출되는지 검증. backend (sessionApi.fork +
 * truncateAt) 는 tests/storage/forkSession.test.ts + tests/main/ipc.session-fork.test.ts
 * 가 별도로 cover.
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ChatPanel } from '../../src/renderer/components/chat/ChatPanel';
import type { Session, Turn } from '../../src/types';
import { newSessionId, newTurnId, workspaceIdFor, partitionIdFor, nowIso } from '../../src/types';

function makeSession(turns: Turn[] = []): Session {
  const id = newSessionId();
  const now = nowIso();
  return {
    id,
    schema_version: 1,
    created_at: now,
    updated_at: now,
    provider: 'claude',
    workspace_id: workspaceIdFor('C:\\Dev\\dreampia-dev'),
    title: 'test',
    pinned: false,
    archived: false,
    conversation: {
      turns,
      current_model: 'claude-opus-4',
      current_effort: 'high',
      current_mode: 'standard',
    },
    workspace: {
      root: 'C:\\Dev\\dreampia-dev',
      name: 'dreampia-dev',
      worktrees: [],
      recent_files: [],
      open_files: [],
      ignore_patterns: [],
      index_status: 'idle',
      is_temporary: false,
    },
    terminal: { panes: [], panel_open: false, height_px: 200 },
    browser: { tabs: [], panel_visible: false, layout: 'hidden', partition_id: partitionIdFor(id) },
    plan: { active: false, browser_tool_enabled: false },
    permission: {
      grants: [],
      default_level: 'workspace_write',
      temporarily_blocked_capabilities: [],
    },
    metadata: {},
  };
}

const makeCT = (text: string, role: Turn['role'] = 'assistant'): Turn => ({
  id: newTurnId(),
  role,
  timestamp: nowIso(),
  status: 'completed',
  content: [{ type: 'text', text }],
});

const makeST = (text: string): Turn => ({
  id: newTurnId(),
  role: 'assistant',
  timestamp: nowIso(),
  status: 'streaming',
  content: [{ type: 'text', text }],
});

describe('per-turn fork button (v1.6.19)', () => {
  it('does not render the button when onForkAtTurn is not provided', () => {
    const turn = makeCT('hello');
    render(<ChatPanel session={makeSession([turn])} onSubmit={() => {}} />);
    expect(screen.queryByTestId(`turn-fork-button-${turn.id}`)).not.toBeInTheDocument();
  });

  it('renders the button per completed turn when onForkAtTurn is provided', () => {
    const t1 = makeCT('hi', 'user');
    const t2 = makeCT('hello back');
    render(
      <ChatPanel
        session={makeSession([t1, t2])}
        onSubmit={() => {}}
        onForkAtTurn={() => {}}
      />
    );
    expect(screen.getByTestId(`turn-fork-button-${t1.id}`)).toBeInTheDocument();
    expect(screen.getByTestId(`turn-fork-button-${t2.id}`)).toBeInTheDocument();
  });

  it('hides the button on streaming turns (incomplete state)', () => {
    const stTurn = makeST('streaming...');
    render(
      <ChatPanel
        session={makeSession([stTurn])}
        onSubmit={() => {}}
        isStreaming
        onForkAtTurn={() => {}}
      />
    );
    expect(screen.queryByTestId(`turn-fork-button-${stTurn.id}`)).not.toBeInTheDocument();
  });

  it('invokes onForkAtTurn(turnId) on click', () => {
    const turn = makeCT('hello');
    const onForkAtTurn = vi.fn();
    render(
      <ChatPanel
        session={makeSession([turn])}
        onSubmit={() => {}}
        onForkAtTurn={onForkAtTurn}
      />
    );
    fireEvent.click(screen.getByTestId(`turn-fork-button-${turn.id}`));
    expect(onForkAtTurn).toHaveBeenCalledTimes(1);
    expect(onForkAtTurn).toHaveBeenCalledWith(turn.id);
  });
});
