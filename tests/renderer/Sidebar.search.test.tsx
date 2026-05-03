/**
 * Sidebar search section tests (v0.7.0 F-026 Chat Search).
 *
 * Covers:
 *   - 검색 입력 쓰기 → onQueryChange 호출
 *   - 빈 query → 결과 영역 숨김
 *   - loading state → "검색 중..." 표시
 *   - error state → "검색 중 오류가 발생했습니다" 표시 (alert role)
 *   - 결과 없음 → "검색 결과 없음"
 *   - 결과 클릭 → onSearchResultClick(sessionId, turnId) 호출
 *   - snippet 의 `<mark>...</mark>` 가 React `<mark>` element 로 렌더 (XSS 안전)
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Sidebar } from '../../src/renderer/components/sidebar/Sidebar';
import type { SessionId } from '../../src/types';

const sid = (s: string): SessionId => s as SessionId;

const sessions = [
  { id: sid('019d-1'), title: '첫번째 대화', pinned: false },
  { id: sid('019d-2'), title: '두번째 대화', pinned: false },
];

const noop = (): void => undefined;

describe('Sidebar search (v0.7.0 F-026)', () => {
  it('does not show search results region when query is empty', () => {
    render(
      <Sidebar
        sessions={sessions}
        onSelectSession={noop}
        onNewChat={noop}
        searchQuery=""
        onSearchQueryChange={noop}
        searchResults={[]}
        onSearchResultClick={noop}
      />
    );
    expect(screen.queryByTestId('sidebar-search-results')).not.toBeInTheDocument();
  });

  it('typing fires onSearchQueryChange', async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();

    render(
      <Sidebar
        sessions={sessions}
        onSelectSession={noop}
        onNewChat={noop}
        searchQuery=""
        onSearchQueryChange={onChange}
        searchResults={[]}
        onSearchResultClick={noop}
      />
    );

    await user.type(screen.getByTestId('sidebar-search-input'), 'h');
    expect(onChange).toHaveBeenCalledWith('h');
  });

  it('shows loading state', () => {
    render(
      <Sidebar
        sessions={sessions}
        onSelectSession={noop}
        onNewChat={noop}
        searchQuery="hello"
        onSearchQueryChange={noop}
        searchResults={[]}
        searchLoading={true}
        onSearchResultClick={noop}
      />
    );
    expect(screen.getByTestId('sidebar-search-loading')).toHaveTextContent(
      /검색 중/
    );
  });

  it('shows error state with alert role', () => {
    render(
      <Sidebar
        sessions={sessions}
        onSelectSession={noop}
        onNewChat={noop}
        searchQuery="hello"
        onSearchQueryChange={noop}
        searchResults={[]}
        searchError="something broke"
        onSearchResultClick={noop}
      />
    );
    const alert = screen.getByTestId('sidebar-search-error');
    expect(alert).toHaveAttribute('role', 'alert');
    expect(alert).toHaveTextContent(/검색 중 오류가 발생했습니다/);
  });

  it('shows empty results message when query non-empty but no results', () => {
    render(
      <Sidebar
        sessions={sessions}
        onSelectSession={noop}
        onNewChat={noop}
        searchQuery="zebra"
        onSearchQueryChange={noop}
        searchResults={[]}
        onSearchResultClick={noop}
      />
    );
    expect(screen.getByTestId('sidebar-search-empty')).toHaveTextContent(
      /검색 결과 없음/
    );
  });

  it('renders results and calls onSearchResultClick on click', async () => {
    const onClick = vi.fn();
    const user = userEvent.setup();

    render(
      <Sidebar
        sessions={sessions}
        onSelectSession={noop}
        onNewChat={noop}
        searchQuery="apple"
        onSearchQueryChange={noop}
        searchResults={[
          {
            turn_id: 'turn-aaa',
            session_id: '019d-1',
            role: 'user',
            snippet: 'fresh <mark>apple</mark> on the table',
            rank: -1.2,
            timestamp: '2026-05-02T01:00:00.000Z',
          },
        ]}
        onSearchResultClick={onClick}
      />
    );

    const resultRow = screen.getByTestId('sidebar-search-result');
    await user.click(resultRow);
    expect(onClick).toHaveBeenCalledWith('019d-1', 'turn-aaa');
  });

  it('renders <mark> markup safely as element, not raw HTML', () => {
    render(
      <Sidebar
        sessions={sessions}
        onSelectSession={noop}
        onNewChat={noop}
        searchQuery="apple"
        onSearchQueryChange={noop}
        searchResults={[
          {
            turn_id: 'turn-bbb',
            session_id: '019d-1',
            role: 'user',
            // a snippet with embedded <mark> — should become a real <mark>
            // element via React, NOT raw text containing literal "<mark>".
            snippet: 'before <mark>apple</mark> after',
            rank: 0,
            timestamp: '2026-05-02T01:00:00.000Z',
          },
        ]}
        onSearchResultClick={noop}
      />
    );

    const marks = screen.getAllByTestId('sidebar-search-mark');
    expect(marks.length).toBe(1);
    expect(marks[0]).toHaveTextContent('apple');
    // The snippet container should NOT contain the literal "<mark>" text.
    const snippet = screen.getByTestId('sidebar-search-snippet');
    expect(snippet.textContent ?? '').not.toContain('<mark>');
  });
});
