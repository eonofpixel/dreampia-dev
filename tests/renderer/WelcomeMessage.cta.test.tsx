/**
 * v1.6.22 — WelcomeMessage 의 empty state CTA chips.
 *
 * 검증:
 *  - 모든 CTA prop 미지정 시 cta 섹션 자체가 렌더되지 않음.
 *  - 각 CTA prop 지정 시 해당 chip 렌더 + 클릭 시 콜백 호출.
 *  - 일부만 지정 시 다른 chip 은 숨김.
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { WelcomeMessage } from '../../src/renderer/components/chat/ChatPanel';

describe('WelcomeMessage — empty state CTAs (v1.6.22)', () => {
  it('omits CTA section entirely when no CTA props provided', () => {
    render(<WelcomeMessage workspaceName="ws" />);
    expect(screen.queryByTestId('welcome-cta-section')).toBeNull();
    expect(screen.queryByTestId('welcome-cta-automation')).toBeNull();
    expect(screen.queryByTestId('welcome-cta-plugins')).toBeNull();
    expect(screen.queryByTestId('welcome-cta-help')).toBeNull();
  });

  it('renders all three CTA chips when all handlers provided', () => {
    render(
      <WelcomeMessage
        workspaceName="ws"
        onOpenAutomation={() => {}}
        onOpenPlugins={() => {}}
        onOpenHelp={() => {}}
      />
    );
    expect(screen.getByTestId('welcome-cta-section')).toBeInTheDocument();
    expect(screen.getByTestId('welcome-cta-automation')).toBeInTheDocument();
    expect(screen.getByTestId('welcome-cta-plugins')).toBeInTheDocument();
    expect(screen.getByTestId('welcome-cta-help')).toBeInTheDocument();
  });

  it('clicking automation chip calls onOpenAutomation', async () => {
    const user = userEvent.setup();
    const onOpenAutomation = vi.fn();
    render(<WelcomeMessage workspaceName="ws" onOpenAutomation={onOpenAutomation} />);
    await user.click(screen.getByTestId('welcome-cta-automation'));
    expect(onOpenAutomation).toHaveBeenCalledTimes(1);
  });

  it('clicking plugins chip calls onOpenPlugins', async () => {
    const user = userEvent.setup();
    const onOpenPlugins = vi.fn();
    render(<WelcomeMessage workspaceName="ws" onOpenPlugins={onOpenPlugins} />);
    await user.click(screen.getByTestId('welcome-cta-plugins'));
    expect(onOpenPlugins).toHaveBeenCalledTimes(1);
  });

  it('clicking help chip calls onOpenHelp', async () => {
    const user = userEvent.setup();
    const onOpenHelp = vi.fn();
    render(<WelcomeMessage workspaceName="ws" onOpenHelp={onOpenHelp} />);
    await user.click(screen.getByTestId('welcome-cta-help'));
    expect(onOpenHelp).toHaveBeenCalledTimes(1);
  });

  it('renders only specified subset of chips', () => {
    render(<WelcomeMessage workspaceName="ws" onOpenHelp={() => {}} />);
    expect(screen.queryByTestId('welcome-cta-automation')).toBeNull();
    expect(screen.queryByTestId('welcome-cta-plugins')).toBeNull();
    expect(screen.getByTestId('welcome-cta-help')).toBeInTheDocument();
  });
});
