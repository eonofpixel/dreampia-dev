/**
 * OnboardingWizard — v0.9.0 MCP 미니 안내 검증 (step 3 / index 2: AuthGuide).
 *
 * Existing v0.3.0 wizard tests 는 OnboardingWizard.test.tsx — 그대로 유지.
 * v0.9.0 에선 step 3 진입 시 mcp.list IPC 호출 + mini 표시 검증.
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { OnboardingWizard } from '../../src/renderer/components/onboarding/OnboardingWizard';
import { __mockStore } from '../setup';

describe('OnboardingWizard — MCP mini section (v0.9.0)', () => {
  // Helper: each test calls 시작하기 → 다음 → 다음 directly to reach step 3.
  it('shows empty MCP message when no servers configured', async () => {
    __mockStore.mcpServers.clear();
    render(<OnboardingWizard onComplete={() => {}} onSkip={() => {}} />);
    // Skip welcome.
    await userEvent.click(screen.getByTestId('onboarding-start'));
    // Now at step 2 (CLI detection). Click next to step 3.
    await userEvent.click(screen.getByTestId('onboarding-next'));
    await waitFor(() => {
      expect(screen.getByTestId('onboarding-mcp-empty')).toBeInTheDocument();
    });
    expect(screen.getByText(/등록된 MCP 서버가 없어요/)).toBeInTheDocument();
  });

  it('shows server count summary when MCP servers configured', async () => {
    __mockStore.mcpServers.set('s1', {
      config: {
        id: 's1',
        name: 'Server 1',
        command: 'cmd',
        args: [],
        env: {},
        enabled: true,
        added_at: '2026-05-03T00:00:00.000Z',
      },
      status: 'ready',
      tools: [],
      last_log: [],
    });
    __mockStore.mcpServers.set('s2', {
      config: {
        id: 's2',
        name: 'Server 2',
        command: 'cmd',
        args: [],
        env: {},
        enabled: true,
        added_at: '2026-05-03T00:00:00.000Z',
      },
      status: 'error',
      last_error: 'spawn fail',
      tools: [],
      last_log: [],
    });
    render(<OnboardingWizard onComplete={() => {}} onSkip={() => {}} />);
    await userEvent.click(screen.getByTestId('onboarding-start'));
    await userEvent.click(screen.getByTestId('onboarding-next'));
    await waitFor(() => {
      expect(screen.getByTestId('onboarding-mcp-summary')).toBeInTheDocument();
    });
    const summary = screen.getByTestId('onboarding-mcp-summary');
    expect(summary).toHaveTextContent(/2개 서버/);
    expect(summary).toHaveTextContent(/1개 준비 완료/);
    expect(summary).toHaveTextContent(/1개 오류/);
  });

  it('[더 알아보기] button visible only when onOpenMcpSettings provided', async () => {
    const onOpenMcpSettings = vi.fn();
    render(
      <OnboardingWizard
        onComplete={() => {}}
        onSkip={() => {}}
        onOpenMcpSettings={onOpenMcpSettings}
      />
    );
    await userEvent.click(screen.getByTestId('onboarding-start'));
    await userEvent.click(screen.getByTestId('onboarding-next'));
    await waitFor(() => {
      expect(screen.getByTestId('onboarding-mcp-open-settings')).toBeInTheDocument();
    });
    await userEvent.click(screen.getByTestId('onboarding-mcp-open-settings'));
    expect(onOpenMcpSettings).toHaveBeenCalledTimes(1);
  });

  it('[더 알아보기] button hidden when onOpenMcpSettings is undefined', async () => {
    render(<OnboardingWizard onComplete={() => {}} onSkip={() => {}} />);
    await userEvent.click(screen.getByTestId('onboarding-start'));
    await userEvent.click(screen.getByTestId('onboarding-next'));
    await waitFor(() => {
      expect(screen.getByTestId('onboarding-mcp-mini')).toBeInTheDocument();
    });
    expect(screen.queryByTestId('onboarding-mcp-open-settings')).not.toBeInTheDocument();
  });
});
