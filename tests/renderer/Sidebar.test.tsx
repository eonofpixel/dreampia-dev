/**
 * Sidebar component test.
 *
 * Spec: docs/ia/sidebar.md
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Sidebar } from '../../src/renderer/components/sidebar/Sidebar';
import type { SessionId } from '../../src/types';

// SessionId 는 branded string 타입 (string & { __brand: 'SessionId' }).
// 테스트 fixture 에서는 캐스트 helper 로 단축 표기.
const sid = (s: string): SessionId => s as SessionId;

const mockSessions = [
  { id: sid('019d-1'), title: '서버 열고 미리보기', pinned: true },
  { id: sid('019d-2'), title: '테스트 통과시키기', pinned: false },
  { id: sid('019d-3'), title: '리팩토링', pinned: false },
];

describe('Sidebar', () => {
  it('renders all sessions', () => {
    render(
      <Sidebar
        sessions={mockSessions}
        onSelectSession={() => {}}
        onNewChat={() => {}}
      />
    );

    expect(screen.getByText('서버 열고 미리보기')).toBeInTheDocument();
    expect(screen.getByText('테스트 통과시키기')).toBeInTheDocument();
    expect(screen.getByText('리팩토링')).toBeInTheDocument();
  });

  it('shows new chat button', () => {
    render(
      <Sidebar sessions={[]} onSelectSession={() => {}} onNewChat={() => {}} />
    );
    expect(screen.getByLabelText('새 채팅')).toBeInTheDocument();
  });

  it('calls onNewChat when 새 채팅 clicked', async () => {
    const user = userEvent.setup();
    const onNewChat = vi.fn();

    render(
      <Sidebar sessions={[]} onSelectSession={() => {}} onNewChat={onNewChat} />
    );

    await user.click(screen.getByLabelText('새 채팅'));
    expect(onNewChat).toHaveBeenCalledTimes(1);
  });

  it('calls onSelectSession with session id', async () => {
    const user = userEvent.setup();
    const onSelectSession = vi.fn();

    render(
      <Sidebar
        sessions={mockSessions}
        onSelectSession={onSelectSession}
        onNewChat={() => {}}
      />
    );

    await user.click(screen.getByText('서버 열고 미리보기'));
    expect(onSelectSession).toHaveBeenCalledWith('019d-1');
  });

  it('shows empty state when no sessions', () => {
    render(
      <Sidebar sessions={[]} onSelectSession={() => {}} onNewChat={() => {}} />
    );
    expect(screen.getByText(/아직 채팅이 없어요/)).toBeInTheDocument();
  });

  it('marks active session with aria-current', () => {
    render(
      <Sidebar
        sessions={mockSessions}
        activeSessionId={sid('019d-2')}
        onSelectSession={() => {}}
        onNewChat={() => {}}
      />
    );

    const activeButton = screen
      .getByText('테스트 통과시키기')
      .closest('button')!;
    expect(activeButton).toHaveAttribute('aria-current', 'true');
  });

  it('separates pinned and recent sessions', () => {
    render(
      <Sidebar
        sessions={mockSessions}
        onSelectSession={() => {}}
        onNewChat={() => {}}
      />
    );

    // 고정된 채팅이 먼저 나타남
    const buttons = screen.getAllByRole('button');
    const pinnedIdx = buttons.findIndex((b) =>
      b.textContent?.includes('서버 열고')
    );
    const recentIdx = buttons.findIndex((b) =>
      b.textContent?.includes('테스트 통과시키기')
    );

    expect(pinnedIdx).toBeLessThan(recentIdx);
  });

  it('has 사이드바 aria-label', () => {
    render(
      <Sidebar sessions={[]} onSelectSession={() => {}} onNewChat={() => {}} />
    );
    expect(screen.getByLabelText('사이드바')).toBeInTheDocument();
  });

  it('renders 한국어 navigation labels', () => {
    render(
      <Sidebar sessions={[]} onSelectSession={() => {}} onNewChat={() => {}} />
    );
    expect(screen.getByText('검색')).toBeInTheDocument();
    expect(screen.getByText('플러그인')).toBeInTheDocument();
    expect(screen.getByText('자동화')).toBeInTheDocument();
    expect(screen.getByText('프로젝트')).toBeInTheDocument();
    expect(screen.getByText('채팅')).toBeInTheDocument();
    expect(screen.getByText('설정')).toBeInTheDocument();
  });
});
