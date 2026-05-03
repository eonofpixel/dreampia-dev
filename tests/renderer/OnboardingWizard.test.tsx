/**
 * OnboardingWizard test — Phase 3 B2 첫 실행 5-step UI.
 *
 * Spec: docs/ia/onboarding.md
 *
 * Mocks: tests/setup.ts 의 window.dreampia (ai.detectCli / workspace.*) 사용.
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { OnboardingWizard } from '../../src/renderer/components/onboarding/OnboardingWizard';
import { __mockStore } from '../setup';

describe('OnboardingWizard', () => {
  it('renders welcome step initially', () => {
    render(<OnboardingWizard onComplete={vi.fn()} onSkip={vi.fn()} />);
    expect(screen.getByTestId('onboarding-step-welcome')).toBeInTheDocument();
    expect(screen.getByText('Dreampia-Dev 에 오신 걸 환영합니다')).toBeInTheDocument();
    expect(screen.getByTestId('onboarding-start')).toBeInTheDocument();
  });

  it('start button advances from welcome to CLI detection step', async () => {
    const user = userEvent.setup();
    render(<OnboardingWizard onComplete={vi.fn()} onSkip={vi.fn()} />);

    await user.click(screen.getByTestId('onboarding-start'));
    expect(screen.getByTestId('onboarding-step-cli')).toBeInTheDocument();
  });

  it('next button progresses through all 5 steps', async () => {
    const user = userEvent.setup();
    render(<OnboardingWizard onComplete={vi.fn()} onSkip={vi.fn()} />);

    // Step 1 → 2
    await user.click(screen.getByTestId('onboarding-start'));
    await waitFor(() =>
      expect(screen.getByTestId('onboarding-step-cli')).toBeInTheDocument()
    );

    // Step 2 → 3
    await user.click(screen.getByTestId('onboarding-next'));
    expect(screen.getByTestId('onboarding-step-auth')).toBeInTheDocument();

    // Step 3 → 4
    await user.click(screen.getByTestId('onboarding-next'));
    expect(screen.getByTestId('onboarding-step-workspace')).toBeInTheDocument();

    // Step 4 → 5
    await user.click(screen.getByTestId('onboarding-next'));
    expect(screen.getByTestId('onboarding-step-firstchat')).toBeInTheDocument();

    // 마지막 step 에선 [다음 →] 미표시
    expect(screen.queryByTestId('onboarding-next')).not.toBeInTheDocument();
  });

  it('previous button returns to earlier step', async () => {
    const user = userEvent.setup();
    render(<OnboardingWizard onComplete={vi.fn()} onSkip={vi.fn()} />);

    await user.click(screen.getByTestId('onboarding-start'));
    await user.click(screen.getByTestId('onboarding-next'));
    // Now on step 3 (auth)
    expect(screen.getByTestId('onboarding-step-auth')).toBeInTheDocument();

    await user.click(screen.getByTestId('onboarding-prev'));
    expect(screen.getByTestId('onboarding-step-cli')).toBeInTheDocument();
  });

  it('previous button is disabled on welcome step', () => {
    render(<OnboardingWizard onComplete={vi.fn()} onSkip={vi.fn()} />);
    const prev = screen.getByTestId('onboarding-prev') as HTMLButtonElement;
    expect(prev).toBeDisabled();
  });

  it('CLI detection shows detected Claude CLI when present', async () => {
    __mockStore.aiDetection = {
      claude: { path: '/usr/local/bin/claude', version: '1.2.3' },
      codex: null,
    };
    const user = userEvent.setup();
    render(<OnboardingWizard onComplete={vi.fn()} onSkip={vi.fn()} />);

    await user.click(screen.getByTestId('onboarding-start'));
    await waitFor(() => {
      // detection 끝난 후
      expect(screen.queryByTestId('cli-detecting')).not.toBeInTheDocument();
    });
    expect(screen.getByText(/Claude CLI/)).toBeInTheDocument();
    expect(screen.getByText(/감지됨 \(v1\.2\.3\)/)).toBeInTheDocument();
  });

  it('CLI detection shows install command when CLI not present', async () => {
    __mockStore.aiDetection = { claude: null, codex: null };
    const user = userEvent.setup();
    render(<OnboardingWizard onComplete={vi.fn()} onSkip={vi.fn()} />);

    await user.click(screen.getByTestId('onboarding-start'));
    await waitFor(() => {
      expect(screen.queryByTestId('cli-detecting')).not.toBeInTheDocument();
    });
    expect(screen.getByText('npm install -g @anthropic-ai/claude-cli')).toBeInTheDocument();
    expect(screen.getByText('npm install -g codex-cli')).toBeInTheDocument();
  });

  it('auth step shows mock fallback notice when no CLI detected', async () => {
    __mockStore.aiDetection = { claude: null, codex: null };
    const user = userEvent.setup();
    render(<OnboardingWizard onComplete={vi.fn()} onSkip={vi.fn()} />);

    await user.click(screen.getByTestId('onboarding-start'));
    await waitFor(() => {
      expect(screen.queryByTestId('cli-detecting')).not.toBeInTheDocument();
    });
    await user.click(screen.getByTestId('onboarding-next'));

    expect(screen.getByText(/Mock provider 로 진행/)).toBeInTheDocument();
  });

  it('auth step shows login command for detected CLI', async () => {
    __mockStore.aiDetection = {
      claude: { path: '/usr/local/bin/claude', version: '1.2.3' },
      codex: null,
    };
    const user = userEvent.setup();
    render(<OnboardingWizard onComplete={vi.fn()} onSkip={vi.fn()} />);

    await user.click(screen.getByTestId('onboarding-start'));
    await waitFor(() => {
      expect(screen.queryByTestId('cli-detecting')).not.toBeInTheDocument();
    });
    await user.click(screen.getByTestId('onboarding-next'));

    expect(screen.getByText('claude /login')).toBeInTheDocument();
  });

  it('workspace step pick button calls workspace.pickFolder', async () => {
    __mockStore.workspacePickNext = { path: '/picked/wizard', name: 'wizard' };
    const user = userEvent.setup();
    render(<OnboardingWizard onComplete={vi.fn()} onSkip={vi.fn()} />);

    // Skip to workspace step
    await user.click(screen.getByTestId('onboarding-start'));
    await user.click(screen.getByTestId('onboarding-next'));
    await user.click(screen.getByTestId('onboarding-next'));
    expect(screen.getByTestId('onboarding-step-workspace')).toBeInTheDocument();

    await user.click(screen.getByTestId('workspace-pick'));

    await waitFor(() => {
      expect(screen.getByTestId('workspace-current')).toBeInTheDocument();
    });
    expect(screen.getByText('wizard')).toBeInTheDocument();
  });

  it('first chat step shows 4 recommended prompts', async () => {
    const user = userEvent.setup();
    render(<OnboardingWizard onComplete={vi.fn()} onSkip={vi.fn()} />);

    // 빠르게 5단계까지
    await user.click(screen.getByTestId('onboarding-start'));
    await user.click(screen.getByTestId('onboarding-next'));
    await user.click(screen.getByTestId('onboarding-next'));
    await user.click(screen.getByTestId('onboarding-next'));

    expect(screen.getByTestId('onboarding-step-firstchat')).toBeInTheDocument();
    expect(screen.getByText('이 프로젝트 구조 분석해줘')).toBeInTheDocument();
    expect(screen.getByText('최근 변경 사항 리뷰')).toBeInTheDocument();
    expect(screen.getByText('테스트 통과시키기')).toBeInTheDocument();
    expect(screen.getByText('새 기능 구현 가이드')).toBeInTheDocument();
  });

  it('clicking recommended prompt calls onComplete with that prompt', async () => {
    const onComplete = vi.fn();
    const user = userEvent.setup();
    render(<OnboardingWizard onComplete={onComplete} onSkip={vi.fn()} />);

    // skip to step 5
    await user.click(screen.getByTestId('onboarding-start'));
    await user.click(screen.getByTestId('onboarding-next'));
    await user.click(screen.getByTestId('onboarding-next'));
    await user.click(screen.getByTestId('onboarding-next'));

    await user.click(screen.getByText('테스트 통과시키기'));
    expect(onComplete).toHaveBeenCalledWith('테스트 통과시키기');
  });

  it('clicking [직접 시작하기] calls onComplete with no prompt', async () => {
    const onComplete = vi.fn();
    const user = userEvent.setup();
    render(<OnboardingWizard onComplete={onComplete} onSkip={vi.fn()} />);

    await user.click(screen.getByTestId('onboarding-start'));
    await user.click(screen.getByTestId('onboarding-next'));
    await user.click(screen.getByTestId('onboarding-next'));
    await user.click(screen.getByTestId('onboarding-next'));

    await user.click(screen.getByTestId('onboarding-finish'));
    expect(onComplete).toHaveBeenCalledWith(undefined);
  });

  it('skip button calls onSkip', async () => {
    const onSkip = vi.fn();
    const user = userEvent.setup();
    render(<OnboardingWizard onComplete={vi.fn()} onSkip={onSkip} />);

    await user.click(screen.getByTestId('onboarding-skip'));
    expect(onSkip).toHaveBeenCalled();
  });

  it('progress bar reflects current step', async () => {
    const user = userEvent.setup();
    render(<OnboardingWizard onComplete={vi.fn()} onSkip={vi.fn()} />);

    const progressbar = screen.getByRole('progressbar');
    expect(progressbar).toHaveAttribute('aria-valuenow', '1');

    await user.click(screen.getByTestId('onboarding-start'));
    expect(progressbar).toHaveAttribute('aria-valuenow', '2');
  });
});
