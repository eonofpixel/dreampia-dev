/**
 * KeyboardSettings.test.tsx — v0.10.0 (G F-025).
 *
 * 검증:
 *  - 기본 매핑 표시 (모든 SHORTCUT_DEFS 의 default 가 보여야)
 *  - [편집] 버튼 클릭 → 캡처 모드 진입
 *  - 캡처 모드에서 키 이벤트 → setKeyboardShortcuts IPC 호출
 *  - [기본값 복원] → override 제거
 *  - [전체 초기화] → 모든 override 제거
 *  - 충돌 detected 시 error 표시
 *  - default 와 같은 값 입력 → override 자체를 저장 안 함 (minimal 영속)
 */

import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { KeyboardSettings } from '../../src/renderer/components/settings/KeyboardSettings';
import { __mockStore } from '../setup';

afterEach(() => {
  vi.unstubAllGlobals();
});

function stubPlatform(platform: string): void {
  Object.defineProperty(navigator, 'platform', {
    value: platform,
    configurable: true,
  });
  Object.defineProperty(navigator, 'userAgentData', {
    value: { platform: platform.includes('Mac') ? 'macOS' : 'Windows' },
    configurable: true,
  });
}

describe('KeyboardSettings (v0.10.0)', () => {
  it('renders all SHORTCUT_DEFS with default combos', async () => {
    stubPlatform('Win32');
    render(<KeyboardSettings />);
    // Loading 상태 끝나면 모든 행이 표시.
    await waitFor(() => {
      expect(
        screen.getByTestId('settings-keyboard-row-search.focus')
      ).toBeInTheDocument();
    });
    // 8 actions present.
    expect(
      screen.getByTestId('settings-keyboard-row-sidebar.toggle')
    ).toBeInTheDocument();
    expect(
      screen.getByTestId('settings-keyboard-row-settings.open')
    ).toBeInTheDocument();
    expect(
      screen.getByTestId('settings-keyboard-row-usage.open')
    ).toBeInTheDocument();
    expect(
      screen.getByTestId('settings-keyboard-row-chat.new')
    ).toBeInTheDocument();
    expect(
      screen.getByTestId('settings-keyboard-row-chat.cancel')
    ).toBeInTheDocument();
    expect(
      screen.getByTestId('settings-keyboard-row-help.open')
    ).toBeInTheDocument();
    expect(
      screen.getByTestId('settings-keyboard-row-modal.close')
    ).toBeInTheDocument();
  });

  it('shows formatted default combo (Ctrl+K on Windows)', async () => {
    stubPlatform('Win32');
    render(<KeyboardSettings />);
    await waitFor(() => {
      expect(
        screen.getByTestId('settings-keyboard-combo-search.focus')
      ).toBeInTheDocument();
    });
    expect(
      screen.getByTestId('settings-keyboard-combo-search.focus')
    ).toHaveTextContent('Ctrl+K');
  });

  it('respects existing overrides from settings', async () => {
    stubPlatform('Win32');
    __mockStore.keyboardShortcuts = { 'search.focus': 'Mod+J' };
    render(<KeyboardSettings />);
    await waitFor(() => {
      expect(
        screen.getByTestId('settings-keyboard-combo-search.focus')
      ).toHaveTextContent('Ctrl+J');
    });
  });

  it('clicking [edit] enters capture mode', async () => {
    stubPlatform('Win32');
    const user = userEvent.setup();
    render(<KeyboardSettings />);
    await waitFor(() => {
      expect(
        screen.getByTestId('settings-keyboard-edit-search.focus')
      ).toBeInTheDocument();
    });
    await user.click(
      screen.getByTestId('settings-keyboard-edit-search.focus')
    );
    expect(
      screen.getByTestId('settings-keyboard-capture-search.focus')
    ).toBeInTheDocument();
  });

  it('captured combo is persisted via setKeyboardShortcuts', async () => {
    stubPlatform('Win32');
    const user = userEvent.setup();
    render(<KeyboardSettings />);
    await waitFor(() => {
      expect(
        screen.getByTestId('settings-keyboard-edit-search.focus')
      ).toBeInTheDocument();
    });
    await user.click(
      screen.getByTestId('settings-keyboard-edit-search.focus')
    );
    // Capture mode active. Press Mod+J.
    fireEvent.keyDown(window, { key: 'j', ctrlKey: true });
    await waitFor(() => {
      expect(window.dreampia.app.setKeyboardShortcuts).toHaveBeenCalledWith({
        'search.focus': 'Mod+J',
      });
    });
  });

  it('[reset all] clears all overrides', async () => {
    stubPlatform('Win32');
    __mockStore.keyboardShortcuts = { 'search.focus': 'Mod+J' };
    const user = userEvent.setup();
    render(<KeyboardSettings />);
    await waitFor(() => {
      expect(screen.getByTestId('settings-keyboard-reset-all')).toBeInTheDocument();
    });
    await user.click(screen.getByTestId('settings-keyboard-reset-all'));
    await waitFor(() => {
      expect(window.dreampia.app.setKeyboardShortcuts).toHaveBeenCalledWith({});
    });
  });

  it('[reset one] removes a single override', async () => {
    stubPlatform('Win32');
    __mockStore.keyboardShortcuts = {
      'search.focus': 'Mod+J',
      'usage.open': 'Mod+Y',
    };
    const user = userEvent.setup();
    render(<KeyboardSettings />);
    await waitFor(() => {
      expect(
        screen.getByTestId('settings-keyboard-reset-search.focus')
      ).toBeInTheDocument();
    });
    await user.click(
      screen.getByTestId('settings-keyboard-reset-search.focus')
    );
    await waitFor(() => {
      expect(window.dreampia.app.setKeyboardShortcuts).toHaveBeenCalledWith({
        'usage.open': 'Mod+Y',
      });
    });
  });

  it('rejects conflict with another action', async () => {
    stubPlatform('Win32');
    const user = userEvent.setup();
    render(<KeyboardSettings />);
    await waitFor(() => {
      expect(
        screen.getByTestId('settings-keyboard-edit-search.focus')
      ).toBeInTheDocument();
    });
    await user.click(
      screen.getByTestId('settings-keyboard-edit-search.focus')
    );
    // 'Mod+U' is already taken by usage.open default.
    fireEvent.keyDown(window, { key: 'u', ctrlKey: true });
    await waitFor(() => {
      expect(screen.getByTestId('settings-keyboard-error')).toBeInTheDocument();
    });
    // Error message references the 사용량 보기 label.
    expect(screen.getByTestId('settings-keyboard-error').textContent).toMatch(
      /사용량 보기/
    );
  });
});
