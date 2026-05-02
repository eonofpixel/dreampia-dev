/**
 * ChatPanel.streaming test
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ChatPanel } from '../../src/renderer/components/chat/ChatPanel';
import type { Session, Turn, ToolCallRef, ToolCallId } from '../../src/types';
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

const makeST = (text: string): Turn => ({
  id: newTurnId(),
  role: 'assistant',
  timestamp: nowIso(),
  status: 'streaming',
  content: [{ type: 'text', text }],
});
const makeCT = (text: string, role: Turn['role'] = 'assistant'): Turn => ({
  id: newTurnId(),
  role,
  timestamp: nowIso(),
  status: 'completed',
  content: [{ type: 'text', text }],
});

describe('streaming cursor', () => {
  it('shows animate-pulse cursor when streaming turn', () => {
    render(<ChatPanel session={makeSession([makeST('hi')])} onSubmit={() => {}} isStreaming />);
    const c = screen.getByTestId('streaming-cursor');
    expect(c).toBeInTheDocument();
    expect(c).toHaveClass('animate-pulse');
  });
  it('no cursor when completed', () => {
    render(<ChatPanel session={makeSession([makeCT('hi')])} onSubmit={() => {}} />);
    expect(screen.queryByTestId('streaming-cursor')).not.toBeInTheDocument();
  });
  it('cursor char is block cursor', () => {
    render(<ChatPanel session={makeSession([makeST('hi')])} onSubmit={() => {}} isStreaming />);
    expect(screen.getByTestId('streaming-cursor').textContent).toBe('▋');
  });
});

describe('ChatPanel isStreaming prop', () => {
  it('disables input when streaming', () => {
    render(<ChatPanel session={makeSession([makeCT('x')])} onSubmit={() => {}} isStreaming />);
    expect(screen.getByTestId('chat-input')).toBeDisabled();
  });
  it('enables input when not streaming', () => {
    render(
      <ChatPanel session={makeSession([makeCT('x')])} onSubmit={() => {}} isStreaming={false} />
    );
    expect(screen.getByTestId('chat-input')).not.toBeDisabled();
  });
  it('enables input by default', () => {
    render(<ChatPanel session={makeSession([])} onSubmit={() => {}} />);
    expect(screen.getByTestId('chat-input')).not.toBeDisabled();
  });
});

describe('stop button', () => {
  it('shows when streaming', () => {
    render(
      <ChatPanel session={makeSession([])} onSubmit={() => {}} isStreaming onCancel={() => {}} />
    );
    expect(screen.getByTestId('stop-button')).toBeInTheDocument();
  });
  it('hidden when not streaming', () => {
    render(<ChatPanel session={makeSession([])} onSubmit={() => {}} />);
    expect(screen.queryByTestId('stop-button')).not.toBeInTheDocument();
  });
  it('calls onCancel', () => {
    const fn = vi.fn();
    render(<ChatPanel session={makeSession([])} onSubmit={() => {}} isStreaming onCancel={fn} />);
    fireEvent.click(screen.getByTestId('stop-button'));
    expect(fn).toHaveBeenCalledTimes(1);
  });
  it('has aria-label', () => {
    render(
      <ChatPanel session={makeSession([])} onSubmit={() => {}} isStreaming onCancel={() => {}} />
    );
    expect(screen.getByLabelText('스트리밍 중지')).toBeInTheDocument();
  });
});

describe('tool call cards', () => {
  const tcTurn = (tc: { id: string; tool_id: string; input: unknown }): Turn => ({
    id: newTurnId(),
    role: 'assistant',
    timestamp: nowIso(),
    status: 'streaming',
    content: [{ type: 'text', text: 'x' }],
    tool_calls: [tc as ToolCallRef],
  });
  it('renders tool_id', () => {
    const t = tcTurn({
      id: '00000000-0000-7000-8000-000000000010',
      tool_id: 'shell.run',
      input: { cmd: 'ls' },
    });
    render(<ChatPanel session={makeSession([t])} onSubmit={() => {}} isStreaming />);
    expect(screen.getAllByTestId('tool-call-card')[0]).toHaveTextContent('shell.run');
  });
  it('renders input JSON', () => {
    const t = tcTurn({
      id: '00000000-0000-7000-8000-000000000011',
      tool_id: 'sh',
      input: { cmd: 'ls -la' },
    });
    render(<ChatPanel session={makeSession([t])} onSubmit={() => {}} isStreaming />);
    expect(screen.getByTestId('tool-call-card')).toHaveTextContent('ls -la');
  });
  it('no cards without tool_calls', () => {
    render(<ChatPanel session={makeSession([makeCT('hi')])} onSubmit={() => {}} />);
    expect(screen.queryByTestId('tool-call-card')).not.toBeInTheDocument();
  });
  it('multiple tool calls', () => {
    const turn: Turn = {
      id: newTurnId(),
      role: 'assistant',
      timestamp: nowIso(),
      status: 'streaming',
      content: [{ type: 'text', text: 'x' }],
      tool_calls: [
        {
          id: '00000000-0000-7000-8000-000000000012' as unknown as ToolCallId,
          tool_id: 'a',
          input: {},
        },
        {
          id: '00000000-0000-7000-8000-000000000013' as unknown as ToolCallId,
          tool_id: 'b',
          input: {},
        },
      ],
    };
    render(<ChatPanel session={makeSession([turn])} onSubmit={() => {}} isStreaming />);
    expect(screen.getAllByTestId('tool-call-card').length).toBe(2);
  });
});

describe('null session + static', () => {
  it('empty state when null', () => {
    render(<ChatPanel session={null} onSubmit={() => {}} />);
    expect(screen.getByText(/사이드바에서 채팅을 선택/)).toBeInTheDocument();
  });
  it('renders session title', () => {
    const s = makeSession([]);
    (s as { title: string }).title = '내 세션';
    render(<ChatPanel session={s} onSubmit={() => {}} />);
    expect(screen.getByText('내 세션')).toBeInTheDocument();
  });
  it('user right-aligned', () => {
    render(<ChatPanel session={makeSession([makeCT('h', 'user')])} onSubmit={() => {}} />);
    expect(screen.getByTestId('turn-user')).toHaveClass('justify-end');
  });
  it('assistant left-aligned', () => {
    render(<ChatPanel session={makeSession([makeCT('h')])} onSubmit={() => {}} />);
    expect(screen.getByTestId('turn-assistant')).toHaveClass('justify-start');
  });
});

export {};
