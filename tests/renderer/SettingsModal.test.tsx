/**
 * SettingsModal — v0.8.0 통합 설정 패널 UI 테스트.
 *
 * 검증:
 *  - open=false 일 때 nothing rendered
 *  - 7개 탭 모두 sidebar 에 표시
 *  - 탭 클릭 시 활성 panel 전환
 *  - initialTab 으로 기본 탭 분기
 *  - Provider 탭에서 변경 시 setDefaultProvider IPC 호출
 *  - Permission 탭이 capability list 표시
 *  - Theme 탭에서 변경 시 setTheme IPC + data-theme 적용
 *  - Keyboard 탭은 placeholder 표시
 *  - Onboarding 탭에서 [온보딩 다시 보기] 버튼 동작
 *  - 닫기 버튼 onClose 호출
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SettingsModal } from '../../src/renderer/components/settings/SettingsModal';
import { __mockStore } from '../setup';

describe('SettingsModal (v0.8.0)', () => {
  it('renders nothing when open=false', () => {
    const { container } = render(<SettingsModal open={false} onClose={() => {}} />);
    expect(container.firstChild).toBeNull();
  });

  it('renders dialog with 7 tabs when open=true', async () => {
    render(<SettingsModal open={true} onClose={() => {}} />);
    expect(screen.getByRole('dialog', { name: /설정/i })).toBeInTheDocument();
    // 7 tabs in sidebar.
    expect(screen.getByTestId('settings-tab-mcp')).toBeInTheDocument();
    expect(screen.getByTestId('settings-tab-usage')).toBeInTheDocument();
    expect(screen.getByTestId('settings-tab-provider')).toBeInTheDocument();
    expect(screen.getByTestId('settings-tab-permission')).toBeInTheDocument();
    expect(screen.getByTestId('settings-tab-theme')).toBeInTheDocument();
    expect(screen.getByTestId('settings-tab-keyboard')).toBeInTheDocument();
    expect(screen.getByTestId('settings-tab-onboarding')).toBeInTheDocument();
  });

  it('defaults to MCP tab when no initialTab', async () => {
    render(<SettingsModal open={true} onClose={() => {}} />);
    await waitFor(() => {
      expect(screen.getByTestId('settings-panel-mcp')).toBeInTheDocument();
    });
  });

  it('respects initialTab=usage', async () => {
    render(<SettingsModal open={true} onClose={() => {}} initialTab="usage" />);
    await waitFor(() => {
      expect(screen.getByTestId('settings-panel-usage')).toBeInTheDocument();
    });
  });

  it('switches panels when sidebar tab is clicked', async () => {
    const user = userEvent.setup();
    render(<SettingsModal open={true} onClose={() => {}} />);
    await user.click(screen.getByTestId('settings-tab-provider'));
    await waitFor(() => {
      expect(screen.getByTestId('settings-panel-provider')).toBeInTheDocument();
    });
    await user.click(screen.getByTestId('settings-tab-theme'));
    await waitFor(() => {
      expect(screen.getByTestId('settings-panel-theme')).toBeInTheDocument();
    });
  });

  it('Provider panel calls setDefaultProvider when option changes', async () => {
    const user = userEvent.setup();
    render(<SettingsModal open={true} onClose={() => {}} initialTab="provider" />);
    await waitFor(() => {
      expect(screen.getByTestId('settings-provider-claude')).toBeInTheDocument();
    });
    const claudeRadio = screen
      .getByTestId('settings-provider-claude')
      .querySelector('input') as HTMLInputElement;
    expect(claudeRadio).toBeTruthy();
    await user.click(claudeRadio);
    await waitFor(() => {
      expect(window.dreampia.app.setDefaultProvider).toHaveBeenCalledWith('claude');
    });
  });

  it('Permission panel renders capability list for current level', async () => {
    __mockStore.defaultPermissionLevel = 'workspace_write';
    render(<SettingsModal open={true} onClose={() => {}} initialTab="permission" />);
    await waitFor(() => {
      expect(screen.getByTestId('settings-permission-capabilities')).toBeInTheDocument();
    });
    // workspace_write 가 LOCAL_READ + LOCAL_WRITE 등을 포함.
    await waitFor(() => {
      expect(screen.getByText('LOCAL_READ')).toBeInTheDocument();
      expect(screen.getByText('LOCAL_WRITE')).toBeInTheDocument();
    });
  });

  it('Permission panel calls setDefaultPermissionLevel on change', async () => {
    const user = userEvent.setup();
    render(<SettingsModal open={true} onClose={() => {}} initialTab="permission" />);
    await waitFor(() => {
      expect(screen.getByTestId('settings-permission-read_only')).toBeInTheDocument();
    });
    const readOnlyRadio = screen
      .getByTestId('settings-permission-read_only')
      .querySelector('input') as HTMLInputElement;
    await user.click(readOnlyRadio);
    await waitFor(() => {
      expect(window.dreampia.app.setDefaultPermissionLevel).toHaveBeenCalledWith('read_only');
    });
  });

  it('Theme panel calls setTheme + applies data-theme on change', async () => {
    const user = userEvent.setup();
    render(<SettingsModal open={true} onClose={() => {}} initialTab="theme" />);
    await waitFor(() => {
      expect(screen.getByTestId('settings-theme-dark')).toBeInTheDocument();
    });
    const darkRadio = screen
      .getByTestId('settings-theme-dark')
      .querySelector('input') as HTMLInputElement;
    await user.click(darkRadio);
    await waitFor(() => {
      expect(window.dreampia.app.setTheme).toHaveBeenCalledWith('dark');
    });
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
  });

  it('Keyboard panel mounts KeyboardSettings with all SHORTCUT_DEFS rows', async () => {
    render(<SettingsModal open={true} onClose={() => {}} initialTab="keyboard" />);
    await waitFor(() => {
      expect(screen.getByTestId('settings-keyboard-panel')).toBeInTheDocument();
    });
    // v0.10.0 — placeholder 가 KeyboardSettings 로 교체. 행이 표시되는지 검증.
    await waitFor(() => {
      expect(
        screen.getByTestId('settings-keyboard-row-search.focus')
      ).toBeInTheDocument();
    });
    expect(
      screen.getByTestId('settings-keyboard-row-modal.close')
    ).toBeInTheDocument();
  });

  it('Onboarding panel calls onReopenOnboarding when button clicked', async () => {
    const user = userEvent.setup();
    const onReopen = vi.fn();
    render(
      <SettingsModal
        open={true}
        onClose={() => {}}
        initialTab="onboarding"
        onReopenOnboarding={onReopen}
      />
    );
    await user.click(screen.getByTestId('settings-reopen-onboarding'));
    expect(onReopen).toHaveBeenCalledTimes(1);
  });

  it('calls onClose when close button clicked', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(<SettingsModal open={true} onClose={onClose} />);
    // v2.10.0 (.omc/DESIGN.md modal B) — ModalShell 기본 close button.
    await user.click(screen.getByTestId('modal-shell-close'));
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
