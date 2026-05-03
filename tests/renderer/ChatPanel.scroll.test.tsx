/**
 * ChatPanel.scroll — pendingFocusTurnId triggers scrollIntoView (v0.7.0 F-026).
 *
 * Tests:
 *   - turn 들에 data-turn-id 가 붙는다
 *   - pendingFocusTurnId 가 set 되면 매칭 turn element 의 scrollIntoView 호출
 *   - scroll 후 onTurnFocused 가 호출된다
 */

import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';
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
  };
}

const makeUserTurn = (id: string, text: string): Turn => ({
  id: id as Turn['id'],
  role: 'user',
  timestamp: nowIso(),
  status: 'completed',
  content: [{ type: 'text', text }],
});

describe('ChatPanel pendingFocusTurnId scroll (v0.7.0 F-026)', () => {
  it('TurnDisplay article carries data-turn-id matching turn.id', () => {
    const turn = makeUserTurn(newTurnId(), 'find me later');
    const { container } = render(
      <ChatPanel session={makeSession([turn])} onSubmit={() => {}} />
    );
    const el = container.querySelector(`[data-turn-id="${turn.id}"]`);
    expect(el).not.toBeNull();
  });

  it('calls scrollIntoView on the matching element when pendingFocusTurnId is set', () => {
    const turn = makeUserTurn(newTurnId(), 'scroll target');
    // jsdom 의 scrollIntoView 는 setup.ts 에서 noop 으로 stub. 이 테스트만
    // spy 로 교체해 호출 여부 검증.
    const scrollSpy = vi.fn();
    const original = window.HTMLElement.prototype.scrollIntoView;
    window.HTMLElement.prototype.scrollIntoView = scrollSpy;
    try {
      const onFocused = vi.fn();
      render(
        <ChatPanel
          session={makeSession([turn])}
          onSubmit={() => {}}
          pendingFocusTurnId={turn.id}
          onTurnFocused={onFocused}
        />
      );
      // The matching element should have called scrollIntoView at least once.
      expect(scrollSpy).toHaveBeenCalled();
      // After the scroll, the focus callback fires so the parent can clear state.
      expect(onFocused).toHaveBeenCalledTimes(1);
    } finally {
      window.HTMLElement.prototype.scrollIntoView = original;
    }
  });

  it('does NOT call onTurnFocused when pendingFocusTurnId is null', () => {
    const turn = makeUserTurn(newTurnId(), 'no scroll');
    const onFocused = vi.fn();
    render(
      <ChatPanel
        session={makeSession([turn])}
        onSubmit={() => {}}
        pendingFocusTurnId={null}
        onTurnFocused={onFocused}
      />
    );
    expect(onFocused).not.toHaveBeenCalled();
  });

  it('does NOT call onTurnFocused when the target turn id does not exist', () => {
    const turn = makeUserTurn(newTurnId(), 'present');
    const onFocused = vi.fn();
    render(
      <ChatPanel
        session={makeSession([turn])}
        onSubmit={() => {}}
        pendingFocusTurnId={'non-existent-id'}
        onTurnFocused={onFocused}
      />
    );
    expect(onFocused).not.toHaveBeenCalled();
  });
});
