/**
 * App.shortcuts.test.tsx — v0.10.0 (G F-025).
 *
 * App level 의 단축키 wiring 검증:
 *  - Mod+K → sidebar search input 으로 focus 이동
 *  - Mod+, → settings modal 'mcp' 탭으로 열림
 *  - Mod+U → settings modal 'usage' 탭으로 열림
 *  - Mod+/ → slash help 모달 열림
 *  - Mod+B → sidebar toggle (data-sidebar-visible attribute)
 *  - Esc (모달 열린 상태) → 그 모달이 먼저 닫힘
 *  - 한글 IME composition 중에는 단축키 무시
 *
 * 회귀 방지 — 기존 App 동작 (workspace 자동 picker / IPC fallback) 은
 * App.test.tsx 가 이미 검증.
 */

import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, waitFor, fireEvent, act } from '@testing-library/react';
import { App } from '../../src/renderer/App';
import { __mockStore } from '../setup';

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
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

describe('App keyboard shortcuts (v0.10.0)', () => {
  it('Mod+K focuses sidebar search input', async () => {
    stubPlatform('Win32');
    render(<App />);
    await waitFor(() => {
      expect(screen.getByTestId('sidebar-search-input')).toBeInTheDocument();
    });
    // Press Ctrl+K (Mod+K on Windows).
    await act(async () => {
      fireEvent.keyDown(window, { key: 'k', ctrlKey: true });
      // Wait one frame for requestAnimationFrame focus.
      await new Promise((r) => requestAnimationFrame(() => r(undefined)));
    });
    await waitFor(() => {
      const el = screen.getByTestId('sidebar-search-input') as HTMLInputElement;
      expect(document.activeElement).toBe(el);
    });
  });

  it('Mod+, opens settings modal on mcp tab', async () => {
    stubPlatform('Win32');
    render(<App />);
    await waitFor(() => {
      expect(screen.getByTestId('sidebar-search-input')).toBeInTheDocument();
    });
    fireEvent.keyDown(window, { key: ',', ctrlKey: true });
    await waitFor(() => {
      expect(screen.getByTestId('settings-modal')).toBeInTheDocument();
      expect(screen.getByTestId('settings-panel-mcp')).toBeInTheDocument();
    });
  });

  it('Mod+U opens settings modal on usage tab', async () => {
    stubPlatform('Win32');
    render(<App />);
    await waitFor(() => {
      expect(screen.getByTestId('sidebar-search-input')).toBeInTheDocument();
    });
    fireEvent.keyDown(window, { key: 'u', ctrlKey: true });
    await waitFor(() => {
      expect(screen.getByTestId('settings-modal')).toBeInTheDocument();
      expect(screen.getByTestId('settings-panel-usage')).toBeInTheDocument();
    });
  });

  it('Mod+/ opens slash help modal', async () => {
    stubPlatform('Win32');
    render(<App />);
    await waitFor(() => {
      expect(screen.getByTestId('sidebar-search-input')).toBeInTheDocument();
    });
    fireEvent.keyDown(window, { key: '/', ctrlKey: true });
    await waitFor(() => {
      expect(screen.getByTestId('slash-help-modal')).toBeInTheDocument();
    });
  });

  it('Esc closes top-most modal first', async () => {
    stubPlatform('Win32');
    render(<App />);
    await waitFor(() => {
      expect(screen.getByTestId('sidebar-search-input')).toBeInTheDocument();
    });
    // Open settings via Mod+,
    fireEvent.keyDown(window, { key: ',', ctrlKey: true });
    await waitFor(() => {
      expect(screen.getByTestId('settings-modal')).toBeInTheDocument();
    });
    // Esc closes it.
    fireEvent.keyDown(window, { key: 'Escape' });
    await waitFor(() => {
      expect(screen.queryByTestId('settings-modal')).not.toBeInTheDocument();
    });
  });

  it('Mod+B toggles sidebar visibility', async () => {
    stubPlatform('Win32');
    render(<App />);
    await waitFor(() => {
      expect(screen.getByTestId('sidebar-search-input')).toBeInTheDocument();
    });
    // Container with data-sidebar-visible.
    const container = document.querySelector('[data-sidebar-visible]');
    expect(container?.getAttribute('data-sidebar-visible')).toBe('true');
    fireEvent.keyDown(window, { key: 'b', ctrlKey: true });
    await waitFor(() => {
      expect(
        document
          .querySelector('[data-sidebar-visible]')
          ?.getAttribute('data-sidebar-visible')
      ).toBe('false');
    });
    // Toggle back.
    fireEvent.keyDown(window, { key: 'b', ctrlKey: true });
    await waitFor(() => {
      expect(
        document
          .querySelector('[data-sidebar-visible]')
          ?.getAttribute('data-sidebar-visible')
      ).toBe('true');
    });
  });

  it('IME composition (isComposing=true) suppresses shortcut', async () => {
    stubPlatform('Win32');
    render(<App />);
    await waitFor(() => {
      expect(screen.getByTestId('sidebar-search-input')).toBeInTheDocument();
    });
    fireEvent.keyDown(window, {
      key: ',',
      ctrlKey: true,
      isComposing: true,
    });
    // Should NOT open settings.
    await new Promise((r) => setTimeout(r, 30));
    expect(screen.queryByTestId('settings-modal')).not.toBeInTheDocument();
  });

  it('Mod+Shift+F toggles fullscreen layout — hides sidebar + preview together (v1.6.4)', async () => {
    stubPlatform('Win32');
    render(<App />);
    await waitFor(() => {
      expect(screen.getByTestId('sidebar-search-input')).toBeInTheDocument();
    });
    const layout = document.querySelector('[data-sidebar-visible]');
    expect(layout?.getAttribute('data-sidebar-visible')).toBe('true');
    expect(layout?.getAttribute('data-preview-visible')).toBe('true');

    // 진입 — 둘 다 hidden.
    fireEvent.keyDown(window, { key: 'F', ctrlKey: true, shiftKey: true });
    await waitFor(() => {
      const el = document.querySelector('[data-sidebar-visible]');
      expect(el?.getAttribute('data-sidebar-visible')).toBe('false');
      expect(el?.getAttribute('data-preview-visible')).toBe('false');
    });

    // OFF — snapshot 으로 복원.
    fireEvent.keyDown(window, { key: 'F', ctrlKey: true, shiftKey: true });
    await waitFor(() => {
      const el = document.querySelector('[data-sidebar-visible]');
      expect(el?.getAttribute('data-sidebar-visible')).toBe('true');
      expect(el?.getAttribute('data-preview-visible')).toBe('true');
    });
  });

  it('Mod+Shift+F restores prior sidebar-only state (v1.6.4)', async () => {
    stubPlatform('Win32');
    render(<App />);
    await waitFor(() => {
      expect(screen.getByTestId('sidebar-search-input')).toBeInTheDocument();
    });
    // 사용자가 먼저 preview 를 끔 (Mod+\)
    fireEvent.keyDown(window, { key: '\\', ctrlKey: true });
    await waitFor(() => {
      const el = document.querySelector('[data-preview-visible]');
      expect(el?.getAttribute('data-preview-visible')).toBe('false');
    });
    // 진입 fullscreen — 사이드바도 hidden.
    fireEvent.keyDown(window, { key: 'F', ctrlKey: true, shiftKey: true });
    await waitFor(() => {
      const el = document.querySelector('[data-sidebar-visible]');
      expect(el?.getAttribute('data-sidebar-visible')).toBe('false');
      expect(el?.getAttribute('data-preview-visible')).toBe('false');
    });
    // OFF — sidebar=true 로, preview=false 로 복원 (사용자가 끈 상태).
    fireEvent.keyDown(window, { key: 'F', ctrlKey: true, shiftKey: true });
    await waitFor(() => {
      const el = document.querySelector('[data-sidebar-visible]');
      expect(el?.getAttribute('data-sidebar-visible')).toBe('true');
      expect(el?.getAttribute('data-preview-visible')).toBe('false');
    });
  });

  it('respects user override (Mod+J for search.focus)', async () => {
    stubPlatform('Win32');
    __mockStore.keyboardShortcuts = { 'search.focus': 'Mod+J' };
    render(<App />);
    await waitFor(() => {
      expect(screen.getByTestId('sidebar-search-input')).toBeInTheDocument();
    });
    // Wait for useKeyboardOverrides to fetch.
    await new Promise((r) => setTimeout(r, 50));
    // Mod+K should NOT focus the search input now.
    const input = screen.getByTestId('sidebar-search-input') as HTMLInputElement;
    document.body.focus();
    fireEvent.keyDown(window, { key: 'k', ctrlKey: true });
    await new Promise((r) => setTimeout(r, 30));
    expect(document.activeElement).not.toBe(input);
    // But Mod+J should.
    await act(async () => {
      fireEvent.keyDown(window, { key: 'j', ctrlKey: true });
      await new Promise((r) => requestAnimationFrame(() => r(undefined)));
    });
    await waitFor(() => {
      expect(document.activeElement).toBe(input);
    });
  });
});
