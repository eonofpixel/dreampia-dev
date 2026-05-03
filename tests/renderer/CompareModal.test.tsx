/**
 * CompareModal — v0.12.0 (I) UI tests.
 *
 * Verifies:
 *   1. open=false → nothing rendered.
 *   2. open=true with run renders both Claude + Codex columns.
 *   3. status badges match each side.
 *   4. accept button disabled while streaming, enabled when side done.
 *   5. accept click invokes onAccept with correct (side, text, model).
 *   6. diff toggle switches between side-by-side and line diff.
 *   7. cancel button visible only while running.
 *   8. close button calls onClose.
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { CompareModal } from '../../src/renderer/components/chat/CompareModal';
import type { CompareRun } from '../../src/renderer/hooks/useCompare';

function makeRun(overrides: Partial<CompareRun> = {}): CompareRun {
  return {
    id: '0190a0a0-0000-7000-8000-000000000001',
    session_id: 'sess-1',
    prompt: 'Why is the sky blue?',
    workspace_root: 'C:\\workspace',
    permission_level: 'workspace_write',
    created_at: '2026-05-03T10:00:00.000Z',
    status: 'running',
    claude: {
      status: 'streaming',
      model: 'claude-3-5-sonnet-20241022',
      text: 'Claude partial answer',
      error: null,
      started_at: '2026-05-03T10:00:00.000Z',
      finished_at: null,
    },
    codex: {
      status: 'streaming',
      model: 'gpt-5.5',
      text: 'Codex partial answer',
      error: null,
      started_at: '2026-05-03T10:00:00.000Z',
      finished_at: null,
    },
    ...overrides,
  };
}

describe('CompareModal', () => {
  it('renders nothing when open=false', () => {
    const { container } = render(
      <CompareModal
        open={false}
        run={null}
        isRunning={false}
        onClose={() => {}}
        onCancel={() => {}}
        onAccept={() => {}}
      />
    );
    expect(container.firstChild).toBeNull();
  });

  it('renders both sides + prompt + statuses when open', () => {
    render(
      <CompareModal
        open={true}
        run={makeRun()}
        isRunning={true}
        onClose={() => {}}
        onCancel={() => {}}
        onAccept={() => {}}
      />
    );
    expect(screen.getByTestId('compare-modal')).toBeInTheDocument();
    expect(screen.getByTestId('compare-prompt')).toHaveTextContent('Why is the sky blue?');
    expect(screen.getByTestId('compare-side-claude')).toBeInTheDocument();
    expect(screen.getByTestId('compare-side-codex')).toBeInTheDocument();
    expect(screen.getByTestId('compare-status-claude')).toHaveTextContent(/응답 중|Streaming/);
    expect(screen.getByTestId('compare-status-codex')).toHaveTextContent(/응답 중|Streaming/);
    expect(screen.getByTestId('compare-text-claude')).toHaveTextContent(
      /Claude partial answer/
    );
    expect(screen.getByTestId('compare-text-codex')).toHaveTextContent(
      /Codex partial answer/
    );
  });

  it('disables accept while streaming', () => {
    render(
      <CompareModal
        open={true}
        run={makeRun()}
        isRunning={true}
        onClose={() => {}}
        onCancel={() => {}}
        onAccept={() => {}}
      />
    );
    const claudeAccept = screen.getByTestId('compare-accept-claude') as HTMLButtonElement;
    const codexAccept = screen.getByTestId('compare-accept-codex') as HTMLButtonElement;
    expect(claudeAccept.disabled).toBe(true);
    expect(codexAccept.disabled).toBe(true);
  });

  it('enables accept and calls onAccept with side+text+model when done', async () => {
    const user = userEvent.setup();
    const onAccept = vi.fn();
    const run = makeRun({
      status: 'completed',
      claude: {
        status: 'done',
        model: 'claude-3-5-sonnet-20241022',
        text: 'final claude',
        error: null,
        started_at: '2026-05-03T10:00:00.000Z',
        finished_at: '2026-05-03T10:00:01.000Z',
      },
      codex: {
        status: 'done',
        model: 'gpt-5.5',
        text: 'final codex',
        error: null,
        started_at: '2026-05-03T10:00:00.000Z',
        finished_at: '2026-05-03T10:00:01.500Z',
      },
    });
    render(
      <CompareModal
        open={true}
        run={run}
        isRunning={false}
        onClose={() => {}}
        onCancel={() => {}}
        onAccept={onAccept}
      />
    );
    const claudeAccept = screen.getByTestId('compare-accept-claude') as HTMLButtonElement;
    expect(claudeAccept.disabled).toBe(false);
    await user.click(claudeAccept);
    expect(onAccept).toHaveBeenCalledWith(
      'claude',
      'final claude',
      'claude-3-5-sonnet-20241022'
    );
  });

  it('toggles diff view and renders diff lines', async () => {
    const user = userEvent.setup();
    const run = makeRun({
      claude: {
        status: 'done',
        model: 'claude-3-5-sonnet-20241022',
        text: 'line1\nshared\nclaude_only',
        error: null,
        started_at: null,
        finished_at: null,
      },
      codex: {
        status: 'done',
        model: 'gpt-5.5',
        text: 'line1\nshared\ncodex_only',
        error: null,
        started_at: null,
        finished_at: null,
      },
    });
    render(
      <CompareModal
        open={true}
        run={run}
        isRunning={false}
        onClose={() => {}}
        onCancel={() => {}}
        onAccept={() => {}}
      />
    );
    // Initially side-by-side.
    expect(screen.getByTestId('compare-side-claude')).toBeInTheDocument();
    expect(screen.queryByTestId('compare-diff-view')).toBeNull();
    await user.click(screen.getByTestId('compare-toggle-diff'));
    expect(screen.getByTestId('compare-diff-view')).toBeInTheDocument();
    // Should contain both 'common' (line1, shared) and divergent lines.
    expect(screen.getAllByTestId('compare-diff-line-common').length).toBeGreaterThanOrEqual(2);
    expect(screen.getByTestId('compare-diff-line-claude')).toHaveTextContent('claude_only');
    expect(screen.getByTestId('compare-diff-line-codex')).toHaveTextContent('codex_only');
  });

  it('cancel button visible while running, hidden when done', () => {
    const { rerender } = render(
      <CompareModal
        open={true}
        run={makeRun()}
        isRunning={true}
        onClose={() => {}}
        onCancel={() => {}}
        onAccept={() => {}}
      />
    );
    expect(screen.getByTestId('compare-cancel')).toBeInTheDocument();
    rerender(
      <CompareModal
        open={true}
        run={makeRun({ status: 'completed' })}
        isRunning={false}
        onClose={() => {}}
        onCancel={() => {}}
        onAccept={() => {}}
      />
    );
    expect(screen.queryByTestId('compare-cancel')).toBeNull();
  });

  it('calls onClose when close button clicked', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(
      <CompareModal
        open={true}
        run={makeRun()}
        isRunning={true}
        onClose={onClose}
        onCancel={() => {}}
        onAccept={() => {}}
      />
    );
    await user.click(screen.getByTestId('compare-close'));
    expect(onClose).toHaveBeenCalled();
  });

  it('Esc triggers onCancel + onClose when running', () => {
    const onClose = vi.fn();
    const onCancel = vi.fn();
    render(
      <CompareModal
        open={true}
        run={makeRun()}
        isRunning={true}
        onClose={onClose}
        onCancel={onCancel}
        onAccept={() => {}}
      />
    );
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onCancel).toHaveBeenCalled();
    expect(onClose).toHaveBeenCalled();
  });

  it('renders error message in error side', () => {
    const run = makeRun({
      status: 'completed',
      claude: {
        status: 'done',
        model: 'claude-3-5-sonnet-20241022',
        text: 'ok',
        error: null,
        started_at: null,
        finished_at: null,
      },
      codex: {
        status: 'error',
        model: 'gpt-5.5',
        text: '',
        error: 'codex unavailable',
        started_at: null,
        finished_at: null,
      },
    });
    render(
      <CompareModal
        open={true}
        run={run}
        isRunning={false}
        onClose={() => {}}
        onCancel={() => {}}
        onAccept={() => {}}
      />
    );
    expect(screen.getByTestId('compare-text-codex')).toHaveTextContent(
      'codex unavailable'
    );
  });
});
