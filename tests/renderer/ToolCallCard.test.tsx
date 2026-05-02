/**
 * ToolCallCard — unit tests for all status variants, expand/collapse,
 * and formatting behaviour.
 */

import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ToolCallCard } from '../../src/renderer/components/chat/ToolCallCard';
import type { ToolCallRef, ToolResultRef, ToolCallId } from '../../src/types';

// ─── helpers ─────────────────────────────────────────────────

function makeCall(overrides?: Partial<ToolCallRef>): ToolCallRef {
  return {
    id: '00000000-0000-7000-8000-000000000020' as unknown as ToolCallId,
    tool_id: 'shell.run',
    input: { cmd: 'npm test' },
    ...overrides,
  };
}

function makeResult(overrides?: Partial<ToolResultRef>): ToolResultRef {
  return {
    call_id: '00000000-0000-7000-8000-000000000020' as unknown as ToolCallId,
    status: 'success',
    output: { stdout: 'Tests passed', exit_code: 0 },
    duration_ms: 1234,
    ...overrides,
  };
}

// ─── pending (no result) ──────────────────────────────────────

describe('pending state', () => {
  it('shows 실행 중 label when no result', () => {
    render(<ToolCallCard call={makeCall()} />);
    expect(screen.getByTestId('tool-call-card')).toHaveTextContent('실행 중');
  });

  it('renders tool_id in header', () => {
    render(<ToolCallCard call={makeCall({ tool_id: 'browser.click' })} />);
    expect(screen.getByTestId('tool-call-card')).toHaveTextContent('browser.click');
  });

  it('does not show duration when pending', () => {
    render(<ToolCallCard call={makeCall()} />);
    // No parenthesised duration e.g. (1.2s) should appear
    expect(screen.getByTestId('tool-call-card').textContent).not.toMatch(/\(\d/);
  });
});

// ─── success ─────────────────────────────────────────────────

describe('success state', () => {
  it('shows 완료 label', () => {
    render(<ToolCallCard call={makeCall()} result={makeResult({ status: 'success' })} />);
    expect(screen.getByTestId('tool-call-card')).toHaveTextContent('완료');
  });

  it('shows duration for success result', () => {
    render(<ToolCallCard call={makeCall()} result={makeResult({ status: 'success', duration_ms: 1234 })} />);
    expect(screen.getByTestId('tool-call-card')).toHaveTextContent('1.2s');
  });
});

// ─── failed ──────────────────────────────────────────────────

describe('failed state', () => {
  it('shows 실패 label', () => {
    const result = makeResult({
      status: 'failed',
      error: { code: 'EXIT_NONZERO', message: '5 tests failed' },
      duration_ms: 8200,
    });
    render(<ToolCallCard call={makeCall()} result={result} />);
    expect(screen.getByTestId('tool-call-card')).toHaveTextContent('실패');
  });

  it('shows error.code when expanded', async () => {
    const user = userEvent.setup();
    const result = makeResult({
      status: 'failed',
      error: { code: 'EXIT_NONZERO', message: '5 tests failed' },
      duration_ms: 8200,
    });
    render(<ToolCallCard call={makeCall()} result={result} />);
    await user.click(screen.getByRole('button', { expanded: false }));
    expect(screen.getByTestId('tool-call-card')).toHaveTextContent('EXIT_NONZERO');
  });
});

// ─── cancelled ───────────────────────────────────────────────

describe('cancelled state', () => {
  it('shows 취소됨 label', () => {
    const result = makeResult({ status: 'cancelled', duration_ms: 300 });
    render(<ToolCallCard call={makeCall()} result={result} />);
    expect(screen.getByTestId('tool-call-card')).toHaveTextContent('취소됨');
  });
});

// ─── timeout ─────────────────────────────────────────────────

describe('timeout state', () => {
  it('shows 시간 초과 label', () => {
    const result = makeResult({ status: 'timeout', duration_ms: 30000 });
    render(<ToolCallCard call={makeCall()} result={result} />);
    expect(screen.getByTestId('tool-call-card')).toHaveTextContent('시간 초과');
  });
});

// ─── input preview ───────────────────────────────────────────

describe('input preview', () => {
  it('shows truncated input JSON (≤80 chars) in collapsed state', () => {
    const call = makeCall({ input: { cmd: 'ls' } });
    render(<ToolCallCard call={call} />);
    expect(screen.getByTestId('tool-call-card')).toHaveTextContent('ls');
  });

  it('truncates long input with ellipsis', () => {
    const longInput = { value: 'x'.repeat(100) };
    render(<ToolCallCard call={makeCall({ input: longInput })} />);
    const card = screen.getByTestId('tool-call-card');
    // collapsed preview should be truncated
    const text = card.textContent ?? '';
    // The raw JSON is >80 chars, so ellipsis must appear
    expect(text).toContain('…');
  });

  it('treats undefined input as empty object {}', () => {
    render(<ToolCallCard call={makeCall({ input: undefined })} />);
    expect(screen.getByTestId('tool-call-card')).toHaveTextContent('{}');
  });
});

// ─── expand / collapse ───────────────────────────────────────

describe('expand / collapse', () => {
  it('shows full input JSON when expanded', async () => {
    const user = userEvent.setup();
    const call = makeCall({ input: { cmd: 'npm run build', flag: '--verbose' } });
    render(<ToolCallCard call={call} />);
    await user.click(screen.getByRole('button', { expanded: false }));
    // Full JSON should now be visible
    expect(screen.getByTestId('tool-call-card')).toHaveTextContent('--verbose');
  });

  it('shows output preview when expanded (success)', async () => {
    const user = userEvent.setup();
    const result = makeResult({
      status: 'success',
      output: { message: 'Build succeeded' },
    });
    render(<ToolCallCard call={makeCall()} result={result} />);
    await user.click(screen.getByRole('button', { expanded: false }));
    expect(screen.getByTestId('tool-call-card')).toHaveTextContent('Build succeeded');
  });

  it('toggles back to collapsed on second click', async () => {
    const user = userEvent.setup();
    render(<ToolCallCard call={makeCall()} />);
    const btn = screen.getByRole('button', { expanded: false });
    await user.click(btn);
    expect(btn).toHaveAttribute('aria-expanded', 'true');
    await user.click(btn);
    expect(btn).toHaveAttribute('aria-expanded', 'false');
  });
});

// ─── duration formatting ─────────────────────────────────────

describe('duration formatting', () => {
  it('formats sub-second as Xms', () => {
    const result = makeResult({ status: 'success', duration_ms: 450 });
    render(<ToolCallCard call={makeCall()} result={result} />);
    expect(screen.getByTestId('tool-call-card')).toHaveTextContent('450ms');
  });

  it('formats >=1s as X.Ys', () => {
    const result = makeResult({ status: 'success', duration_ms: 2700 });
    render(<ToolCallCard call={makeCall()} result={result} />);
    expect(screen.getByTestId('tool-call-card')).toHaveTextContent('2.7s');
  });
});

export {};
