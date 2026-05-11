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
    // v2.10.0 (Codex parity α) — EmptyState → ChatLandingHero (.omc/DESIGN.md).
    expect(screen.getByTestId('chat-landing-hero')).toBeInTheDocument();
    expect(screen.getByText(/무엇을 만들어볼까요/)).toBeInTheDocument();
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

// ────────────────────────────────────────────────────────────
// v0.3.0 — WelcomeMessage in empty MessagesArea
// ────────────────────────────────────────────────────────────

describe('WelcomeMessage (v0.3.0)', () => {
  it('renders WelcomeMessage when session has zero turns', () => {
    render(
      <ChatPanel
        session={makeSession([])}
        onSubmit={() => {}}
        workspaceName="dreampia-dev"
      />
    );
    expect(screen.getByTestId('welcome-message')).toBeInTheDocument();
    expect(screen.getByText('안녕하세요')).toBeInTheDocument();
  });

  it('does NOT render WelcomeMessage when there are turns', () => {
    render(<ChatPanel session={makeSession([makeCT('hi')])} onSubmit={() => {}} />);
    expect(screen.queryByTestId('welcome-message')).not.toBeInTheDocument();
  });

  it('renders 3 suggestion chips', () => {
    render(
      <ChatPanel
        session={makeSession([])}
        onSubmit={() => {}}
        workspaceName="dreampia-dev"
      />
    );
    const chips = screen.getAllByTestId('welcome-suggestion-chip');
    expect(chips.length).toBe(3);
  });

  it('clicking a suggestion chip calls onSubmit with that prompt', () => {
    const onSubmit = vi.fn();
    render(
      <ChatPanel
        session={makeSession([])}
        onSubmit={onSubmit}
        workspaceName="dreampia-dev"
      />
    );
    const chips = screen.getAllByTestId('welcome-suggestion-chip');
    const first = chips[0];
    if (first === undefined) throw new Error('expected at least one chip');
    fireEvent.click(first);
    expect(onSubmit).toHaveBeenCalledTimes(1);
    // 첫 chip 의 프롬프트 = '이 프로젝트 구조 분석해줘' (WELCOME_SUGGESTIONS[0])
    expect(onSubmit).toHaveBeenCalledWith('이 프로젝트 구조 분석해줘');
  });

  it('clicking each chip submits with its own prompt text', () => {
    const onSubmit = vi.fn();
    render(
      <ChatPanel
        session={makeSession([])}
        onSubmit={onSubmit}
        workspaceName="x"
      />
    );
    const chips = screen.getAllByTestId('welcome-suggestion-chip');
    chips.forEach((chip) => fireEvent.click(chip));
    expect(onSubmit).toHaveBeenCalledTimes(3);
    expect(onSubmit).toHaveBeenNthCalledWith(1, '이 프로젝트 구조 분석해줘');
    expect(onSubmit).toHaveBeenNthCalledWith(2, '최근 변경 사항 리뷰');
    expect(onSubmit).toHaveBeenNthCalledWith(3, '테스트 통과시키기');
  });

  it('shows workspaceName in greeting', () => {
    render(
      <ChatPanel
        session={makeSession([])}
        onSubmit={() => {}}
        workspaceName="my-cool-project"
      />
    );
    expect(screen.getByText(/my-cool-project 작업 시작/)).toBeInTheDocument();
  });

  it('falls back to safe default when workspaceName undefined', () => {
    render(<ChatPanel session={makeSession([])} onSubmit={() => {}} />);
    // v0.11.0 — i18n unified the fallback to "폴더 선택 필요" (sidebar 와 동일)
    // 사용자가 picker 를 누르도록 명확한 안내. 이전 "작업 폴더" 단순 라벨에서
    // 변경됨.
    expect(screen.getByText(/폴더 선택 필요 작업 시작/)).toBeInTheDocument();
  });
});

export {};
