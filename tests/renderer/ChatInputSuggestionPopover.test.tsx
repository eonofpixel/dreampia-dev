/**
 * ChatInputSuggestionPopover — generic listbox popover (v0.6.0).
 *
 * 도메인-무관 listbox 컴포넌트. 슬래시 / 멘션 양쪽이 같은 a11y / 키보드 / 스타일을
 * 공유하는지 검증.
 *
 * Spec:
 *   - docs/ux/patterns/F-018-slash-commands.md
 *   - docs/ux/patterns/F-019-mention-palette.md
 */

import { describe, it, expect, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import {
  ChatInputSuggestionPopover,
  suggestionOptionId,
  type SuggestionItem,
} from '../../src/renderer/components/chat/ChatInputSuggestionPopover';

const sample: ReadonlyArray<SuggestionItem> = [
  { id: 'a', primary: '항목 A', secondary: '설명 A', badge: 'A' },
  { id: 'b', primary: '항목 B', secondary: '설명 B', badge: 'B' },
  { id: 'c', primary: '항목 C', secondary: '설명 C', badge: 'C' },
];

describe('ChatInputSuggestionPopover (generic)', () => {
  it('renders nothing when items empty and emptyMessage missing', () => {
    const { container } = render(
      <ChatInputSuggestionPopover items={[]} activeIndex={0} onPick={() => {}} idPrefix="x" />
    );
    expect(container.firstChild).toBeNull();
  });

  it('renders emptyMessage when items empty and emptyMessage provided', () => {
    render(
      <ChatInputSuggestionPopover
        items={[]}
        activeIndex={0}
        onPick={() => {}}
        idPrefix="x"
        emptyMessage="비어있음"
        ariaLabel="custom"
        testid="empty-test"
      />
    );
    expect(screen.getByTestId('empty-test')).toHaveTextContent('비어있음');
    expect(screen.getByTestId('empty-test')).toHaveAttribute('role', 'listbox');
    expect(screen.getByTestId('empty-test')).toHaveAttribute('aria-label', 'custom');
  });

  it('renders all items with badge + primary + secondary', () => {
    render(
      <ChatInputSuggestionPopover
        items={sample}
        activeIndex={0}
        onPick={() => {}}
        idPrefix="suggest"
        testid="suggest-pop"
        optionTestidPrefix="suggest-opt"
      />
    );
    expect(screen.getByTestId('suggest-opt-a')).toBeInTheDocument();
    expect(screen.getByTestId('suggest-opt-a').textContent).toContain('A');
    expect(screen.getByTestId('suggest-opt-a').textContent).toContain('항목 A');
    expect(screen.getByTestId('suggest-opt-a').textContent).toContain('설명 A');
  });

  it('marks the active item with aria-selected="true" and data-active', () => {
    render(
      <ChatInputSuggestionPopover
        items={sample}
        activeIndex={1}
        onPick={() => {}}
        idPrefix="x"
        optionTestidPrefix="x-opt"
      />
    );
    const b = screen.getByTestId('x-opt-b');
    expect(b).toHaveAttribute('aria-selected', 'true');
    expect(b).toHaveAttribute('data-active', 'true');
    const a = screen.getByTestId('x-opt-a');
    expect(a).toHaveAttribute('aria-selected', 'false');
    expect(a).toHaveAttribute('data-active', 'false');
  });

  it('calls onPick on mousedown (preventDefault to keep focus)', () => {
    const onPick = vi.fn();
    render(
      <ChatInputSuggestionPopover
        items={sample}
        activeIndex={0}
        onPick={onPick}
        idPrefix="x"
        optionTestidPrefix="x-opt"
      />
    );
    fireEvent.mouseDown(screen.getByTestId('x-opt-c'));
    expect(onPick).toHaveBeenCalledTimes(1);
    expect(onPick.mock.calls[0]?.[0]?.id).toBe('c');
  });

  it('item DOM ids match suggestionOptionId() for aria-activedescendant', () => {
    render(
      <ChatInputSuggestionPopover
        items={sample}
        activeIndex={0}
        onPick={() => {}}
        idPrefix="my-prefix"
        optionTestidPrefix="x-opt"
      />
    );
    const item = screen.getByTestId('x-opt-b');
    expect(item).toHaveAttribute('id', suggestionOptionId('my-prefix', 'b'));
  });

  it('renders footerHint when provided', () => {
    render(
      <ChatInputSuggestionPopover
        items={sample}
        activeIndex={0}
        onPick={() => {}}
        idPrefix="x"
        testid="x-pop"
        footerHint="↑↓ 탐색 · Enter 선택"
      />
    );
    expect(screen.getByTestId('x-pop')).toHaveTextContent('↑↓ 탐색 · Enter 선택');
  });
});
