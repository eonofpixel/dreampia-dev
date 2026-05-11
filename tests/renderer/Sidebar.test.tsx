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
    // v0.7.0 (F-026) — `검색` placeholder 였던 nav item 은 SearchSection 으로 교체.
    // 이제 검색은 input 의 aria-label 로 표현된다 (`메시지 검색`).
    expect(screen.getByLabelText('메시지 검색')).toBeInTheDocument();
    expect(screen.getByText('플러그인')).toBeInTheDocument();
    expect(screen.getByText('자동화')).toBeInTheDocument();
    expect(screen.getByText('프로젝트')).toBeInTheDocument();
    expect(screen.getByText('채팅')).toBeInTheDocument();
    // v2.10.0 (.omc/DESIGN.md γ) — footer icon-only row. 설정 텍스트 미노출 →
    // aria-label/testid 로 식별.
    expect(screen.getByTestId('sidebar-open-settings').getAttribute('aria-label') ?? '').toContain(
      '설정'
    );
  });

  // ────────────────────────────────────────────────────────────
  // v2.5.0 Phase 1 — Code nav item (Codex file-open preview 패턴, 옵션 D)
  // Decision doc: ../../CODE_TAB_DECISION.md
  // ────────────────────────────────────────────────────────────

  describe('Code nav (v2.5.0 Phase 1)', () => {
    it('hides Code nav item when onOpenCode undefined', () => {
      render(<Sidebar sessions={[]} onSelectSession={() => {}} onNewChat={() => {}} />);
      expect(screen.queryByTestId('sidebar-open-code')).not.toBeInTheDocument();
    });

    it('shows Code nav item when onOpenCode provided', () => {
      render(
        <Sidebar
          sessions={[]}
          onSelectSession={() => {}}
          onNewChat={() => {}}
          onOpenCode={() => {}}
        />
      );
      expect(screen.getByTestId('sidebar-open-code')).toBeInTheDocument();
      expect(screen.getByText('코드')).toBeInTheDocument();
    });

    it('calls onOpenCode when clicked', async () => {
      const user = userEvent.setup();
      const onOpenCode = vi.fn();
      render(
        <Sidebar
          sessions={[]}
          onSelectSession={() => {}}
          onNewChat={() => {}}
          onOpenCode={onOpenCode}
        />
      );
      await user.click(screen.getByTestId('sidebar-open-code'));
      expect(onOpenCode).toHaveBeenCalledTimes(1);
    });
  });

  // ────────────────────────────────────────────────────────────
  // v0.3.0 — [온보딩 다시 보기] 버튼
  // ────────────────────────────────────────────────────────────

  describe('Reopen onboarding (v0.3.0)', () => {
    it('hides 온보딩 다시 보기 button when onReopenOnboarding undefined', () => {
      render(
        <Sidebar sessions={[]} onSelectSession={() => {}} onNewChat={() => {}} />
      );
      expect(screen.queryByTestId('sidebar-reopen-onboarding')).not.toBeInTheDocument();
    });

    it('shows 온보딩 다시 보기 button when onReopenOnboarding provided', () => {
      render(
        <Sidebar
          sessions={[]}
          onSelectSession={() => {}}
          onNewChat={() => {}}
          onReopenOnboarding={() => {}}
        />
      );
      const btn = screen.getByTestId('sidebar-reopen-onboarding');
      expect(btn).toBeInTheDocument();
      // v2.10.0 (.omc/DESIGN.md γ) — icon-only row; label 은 aria-label 로.
      expect(btn.getAttribute('aria-label') ?? '').toContain('온보딩 다시 보기');
    });

    it('clicking 온보딩 다시 보기 calls onReopenOnboarding', async () => {
      const onReopenOnboarding = vi.fn();
      const user = userEvent.setup();
      render(
        <Sidebar
          sessions={[]}
          onSelectSession={() => {}}
          onNewChat={() => {}}
          onReopenOnboarding={onReopenOnboarding}
        />
      );

      await user.click(screen.getByTestId('sidebar-reopen-onboarding'));
      expect(onReopenOnboarding).toHaveBeenCalledTimes(1);
    });
  });

  // ────────────────────────────────────────────────────────────
  // v0.4.0 — [사용량] 버튼
  // ────────────────────────────────────────────────────────────

  describe('Open usage (v0.4.0)', () => {
    it('hides 사용량 button when onOpenUsage undefined', () => {
      render(
        <Sidebar sessions={[]} onSelectSession={() => {}} onNewChat={() => {}} />
      );
      expect(screen.queryByTestId('sidebar-open-usage')).not.toBeInTheDocument();
    });

    it('shows 사용량 button when onOpenUsage provided', () => {
      render(
        <Sidebar
          sessions={[]}
          onSelectSession={() => {}}
          onNewChat={() => {}}
          onOpenUsage={() => {}}
        />
      );
      const btn = screen.getByTestId('sidebar-open-usage');
      expect(btn).toBeInTheDocument();
      // v2.10.0 (.omc/DESIGN.md γ) — icon-only row; label 은 aria-label 로.
      expect(btn.getAttribute('aria-label') ?? '').toContain('사용량');
    });

    it('clicking 사용량 calls onOpenUsage', async () => {
      const onOpenUsage = vi.fn();
      const user = userEvent.setup();
      render(
        <Sidebar
          sessions={[]}
          onSelectSession={() => {}}
          onNewChat={() => {}}
          onOpenUsage={onOpenUsage}
        />
      );

      await user.click(screen.getByTestId('sidebar-open-usage'));
      expect(onOpenUsage).toHaveBeenCalledTimes(1);
    });
  });
});
