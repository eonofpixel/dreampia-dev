/**
 * SessionReferenceChip — v0.13.0 (J) typed session mention chip.
 *
 * 검증:
 *   1. title + turn count 표시 (collapsed)
 *   2. title 비어있으면 sessionId fallback
 *   3. expanded → context_text 표시
 *   4. onPick 미지정 시 open 버튼 disabled
 *   5. onPick 지정 시 클릭하면 콜백
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { SessionReferenceChip } from '../../src/renderer/components/chat/SessionReferenceChip';

describe('SessionReferenceChip', () => {
  it('renders title and turn count by default (collapsed)', () => {
    render(
      <SessionReferenceChip
        sessionId="sess-1"
        title="Prior chat"
        contextText="사용자: hi\nAI: hello"
        turnCount={2}
      />
    );
    const chip = screen.getByTestId('session-reference-chip');
    expect(chip).toBeInTheDocument();
    expect(chip).toHaveAttribute('data-session-id', 'sess-1');
    expect(screen.getByText('Prior chat')).toBeInTheDocument();
    expect(screen.queryByTestId('session-reference-context')).toBeNull();
  });

  it('falls back to sessionId when title is empty', () => {
    render(
      <SessionReferenceChip
        sessionId="abc-123"
        title=""
        contextText=""
        turnCount={0}
      />
    );
    expect(screen.getByText('abc-123')).toBeInTheDocument();
  });

  it('expands context_text on header click', () => {
    render(
      <SessionReferenceChip
        sessionId="s"
        title="Chat"
        contextText="사용자: hi\nAI: hello"
        turnCount={2}
      />
    );
    const header = screen.getByRole('button', { name: /세션 참조/ });
    fireEvent.click(header);
    expect(screen.getByTestId('session-reference-context')).toBeInTheDocument();
    expect(screen.getByText(/사용자: hi/)).toBeInTheDocument();
  });

  it('disables open button when onPick is undefined', () => {
    render(
      <SessionReferenceChip
        sessionId="s"
        title="Chat"
        contextText=""
        turnCount={0}
      />
    );
    const openBtn = screen.getByTestId('session-reference-open');
    expect(openBtn).toBeDisabled();
  });

  it('invokes onPick when open button clicked', () => {
    const onPick = vi.fn();
    render(
      <SessionReferenceChip
        sessionId="s"
        title="Chat"
        contextText=""
        turnCount={0}
        onPick={onPick}
      />
    );
    const openBtn = screen.getByTestId('session-reference-open');
    fireEvent.click(openBtn);
    expect(onPick).toHaveBeenCalledTimes(1);
  });
});
