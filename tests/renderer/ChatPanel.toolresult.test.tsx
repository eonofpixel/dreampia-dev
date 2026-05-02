/**
 * ChatPanel.toolresult — integration tests for inline tool result display.
 *
 * Verifies P1-3: tool turns hidden, results shown inline in assistant bubble.
 */

import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ChatPanel } from '../../src/renderer/components/chat/ChatPanel';
import type { Session, Turn, ToolCallId } from '../../src/types';
import { newSessionId, newTurnId, workspaceIdFor, partitionIdFor, nowIso } from '../../src/types';

// ─── session factory ──────────────────────────────────────────

function makeSession(turns: Turn[]): Session {
  const id = newSessionId();
  const now = nowIso();
  return {
    id, schema_version: 1, created_at: now, updated_at: now,
    provider: 'claude', workspace_id: workspaceIdFor('C:\\Dev\\dreampia-dev'),
    title: 'tool-result test', pinned: false, archived: false,
    conversation: { turns, current_model: 'claude-opus-4', current_effort: 'high', current_mode: 'standard' },
    workspace: { root: 'C:\\Dev\\dreampia-dev', name: 'dreampia-dev', worktrees: [], recent_files: [], open_files: [], ignore_patterns: [], index_status: 'idle', is_temporary: false },
    terminal: { panes: [], panel_open: false, height_px: 200 },
    browser: { tabs: [], panel_visible: false, layout: 'hidden', partition_id: partitionIdFor(id) },
    plan: { active: false, browser_tool_enabled: false },
    permission: { grants: [], default_level: 'workspace_write', temporarily_blocked_capabilities: [] },
    metadata: {},
  };
}

const CALL_ID = '019d0003-0000-7000-8000-000000000003' as unknown as ToolCallId;
const CALL_ID_B = '019d0003-0000-7000-8000-000000000099' as unknown as ToolCallId;

function makeAssistantTurn(extraToolCalls?: Turn['tool_calls']): Turn {
  return {
    id: newTurnId(),
    role: 'assistant',
    timestamp: nowIso(),
    status: 'completed',
    content: [{ type: 'text', text: 'Running tests' }],
    tool_calls: [
      { id: CALL_ID, tool_id: 'shell.run', input: { cmd: 'npm test' } },
      ...(extraToolCalls ?? []),
    ],
  };
}

function makeToolTurn(status: 'success' | 'failed', callId = CALL_ID): Turn {
  const base = {
    id: newTurnId(),
    role: 'tool' as const,
    timestamp: nowIso(),
    status: 'completed' as const,
    content: [],
  };

  if (status === 'success') {
    return {
      ...base,
      tool_results: [{
        call_id: callId,
        status: 'success',
        output: { stdout: 'All tests pass', exit_code: 0 },
        duration_ms: 1200,
      }],
    };
  }
  return {
    ...base,
    tool_results: [{
      call_id: callId,
      status: 'failed',
      error: { code: 'EXIT_NONZERO', message: '5 tests failed' },
      duration_ms: 8200,
    }],
  };
}

// ─── tests ───────────────────────────────────────────────────

describe('inline tool result integration', () => {
  it('assistant turn + matching tool result shows 완료 inline', () => {
    const turns = [makeAssistantTurn(), makeToolTurn('success')];
    render(<ChatPanel session={makeSession(turns)} onSubmit={() => {}} />);
    const cards = screen.getAllByTestId('tool-call-card');
    expect(cards[0]).toHaveTextContent('완료');
  });

  it('assistant turn without matching tool turn shows 실행 중 (pending)', () => {
    const turns = [makeAssistantTurn()]; // no tool turn
    render(<ChatPanel session={makeSession(turns)} onSubmit={() => {}} />);
    const cards = screen.getAllByTestId('tool-call-card');
    expect(cards[0]).toHaveTextContent('실행 중');
  });

  it('role=tool turn does NOT render as a separate bubble', () => {
    const turns = [makeAssistantTurn(), makeToolTurn('success')];
    render(<ChatPanel session={makeSession(turns)} onSubmit={() => {}} />);
    // There should be no turn-tool article in the DOM
    expect(screen.queryByTestId('turn-tool')).not.toBeInTheDocument();
  });

  it('multiple tool_calls in one turn each show their own result card', () => {
    const assistantTurn: Turn = {
      id: newTurnId(),
      role: 'assistant',
      timestamp: nowIso(),
      status: 'completed',
      content: [{ type: 'text', text: 'Two tools' }],
      tool_calls: [
        { id: CALL_ID, tool_id: 'shell.run', input: { cmd: 'npm test' } },
        { id: CALL_ID_B, tool_id: 'fs.read', input: { path: '/package.json' } },
      ],
    };
    const toolTurn: Turn = {
      id: newTurnId(),
      role: 'tool',
      timestamp: nowIso(),
      status: 'completed',
      content: [],
      tool_results: [
        { call_id: CALL_ID, status: 'success', output: { ok: true }, duration_ms: 500 },
        { call_id: CALL_ID_B, status: 'failed', error: { code: 'ENOENT', message: 'not found' }, duration_ms: 10 },
      ],
    };
    render(<ChatPanel session={makeSession([assistantTurn, toolTurn])} onSubmit={() => {}} />);
    const cards = screen.getAllByTestId('tool-call-card');
    expect(cards).toHaveLength(2);
    expect(cards[0]).toHaveTextContent('완료');
    expect(cards[1]).toHaveTextContent('실패');
  });

  it('failed result renders error variant (실패 label)', () => {
    const turns = [makeAssistantTurn(), makeToolTurn('failed')];
    render(<ChatPanel session={makeSession(turns)} onSubmit={() => {}} />);
    const cards = screen.getAllByTestId('tool-call-card');
    expect(cards[0]).toHaveTextContent('실패');
  });

  it('success result renders success variant (완료 label)', () => {
    const turns = [makeAssistantTurn(), makeToolTurn('success')];
    render(<ChatPanel session={makeSession(turns)} onSubmit={() => {}} />);
    const cards = screen.getAllByTestId('tool-call-card');
    expect(cards[0]).toHaveTextContent('완료');
  });
});

export {};
