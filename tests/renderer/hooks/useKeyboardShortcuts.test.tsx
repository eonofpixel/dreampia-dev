/**
 * useKeyboardShortcuts.test.tsx — v0.10.0 (G F-025).
 *
 * 검증:
 *  - Mod+K 키 이벤트 → handler 호출
 *  - IME composition 중에는 무시
 *  - Editable element 안에서 Mod 없이는 무시 (Escape 제외)
 *  - overrides 가 default 를 override
 *  - enabled=false 일 때 모두 무시
 *  - first-match-wins (modal.close 가 chat.cancel 보다 먼저 등록되어 있어
 *    Escape 가 modal.close 로만 dispatch)
 */

import React from 'react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render } from '@testing-library/react';
import { fireEvent } from '@testing-library/react';
import { useKeyboardShortcuts } from '../../../src/renderer/hooks/useKeyboardShortcuts';
import type { ShortcutAction } from '../../../src/renderer/keyboard/shortcuts';

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

function HostComponent({
  handlers,
  overrides,
  enabled,
}: {
  handlers: Partial<Record<ShortcutAction, () => void>>;
  overrides?: Partial<Record<ShortcutAction, string>>;
  enabled?: boolean;
}): React.JSX.Element {
  useKeyboardShortcuts({
    handlers,
    ...(overrides !== undefined ? { overrides } : {}),
    ...(enabled !== undefined ? { enabled } : {}),
  });
  return <div data-testid="host" />;
}

describe('useKeyboardShortcuts', () => {
  it('Mod+K fires search.focus on Windows', () => {
    stubPlatform('Win32');
    const onSearch = vi.fn();
    render(<HostComponent handlers={{ 'search.focus': onSearch }} />);
    fireEvent.keyDown(window, { key: 'k', ctrlKey: true });
    expect(onSearch).toHaveBeenCalledTimes(1);
  });

  it('Mod+K fires search.focus on macOS via metaKey', () => {
    stubPlatform('MacIntel');
    const onSearch = vi.fn();
    render(<HostComponent handlers={{ 'search.focus': onSearch }} />);
    fireEvent.keyDown(window, { key: 'k', metaKey: true });
    expect(onSearch).toHaveBeenCalledTimes(1);
  });

  it('does NOT fire when IME composing (isComposing=true)', () => {
    stubPlatform('Win32');
    const onSearch = vi.fn();
    render(<HostComponent handlers={{ 'search.focus': onSearch }} />);
    // jsdom 의 KeyboardEvent 는 isComposing 을 직접 받음.
    fireEvent.keyDown(window, { key: 'k', ctrlKey: true, isComposing: true });
    expect(onSearch).not.toHaveBeenCalled();
  });

  it('does NOT fire when keyCode === 229 (legacy IME)', () => {
    stubPlatform('Win32');
    const onSearch = vi.fn();
    render(<HostComponent handlers={{ 'search.focus': onSearch }} />);
    fireEvent.keyDown(window, { key: 'k', ctrlKey: true, keyCode: 229 });
    expect(onSearch).not.toHaveBeenCalled();
  });

  it('plain key in textarea is ignored', () => {
    stubPlatform('Win32');
    const onSearch = vi.fn();
    render(
      <>
        <HostComponent handlers={{ 'search.focus': onSearch }} />
        <textarea data-testid="ta" />
      </>
    );
    const ta = document.querySelector(
      '[data-testid="ta"]'
    ) as HTMLTextAreaElement;
    ta.focus();
    fireEvent.keyDown(ta, { key: 'k' });
    expect(onSearch).not.toHaveBeenCalled();
  });

  it('Mod+K in textarea STILL fires (modifier means power-user shortcut)', () => {
    stubPlatform('Win32');
    const onSearch = vi.fn();
    render(
      <>
        <HostComponent handlers={{ 'search.focus': onSearch }} />
        <textarea data-testid="ta" />
      </>
    );
    const ta = document.querySelector(
      '[data-testid="ta"]'
    ) as HTMLTextAreaElement;
    ta.focus();
    fireEvent.keyDown(ta, { key: 'k', ctrlKey: true });
    expect(onSearch).toHaveBeenCalledTimes(1);
  });

  it('Escape always fires even from textarea', () => {
    stubPlatform('Win32');
    const onClose = vi.fn();
    render(
      <>
        <HostComponent handlers={{ 'modal.close': onClose }} />
        <textarea data-testid="ta" />
      </>
    );
    const ta = document.querySelector(
      '[data-testid="ta"]'
    ) as HTMLTextAreaElement;
    ta.focus();
    fireEvent.keyDown(ta, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('overrides take precedence over defaults', () => {
    stubPlatform('Win32');
    const onSearch = vi.fn();
    // Override search.focus to Mod+J instead of Mod+K.
    render(
      <HostComponent
        handlers={{ 'search.focus': onSearch }}
        overrides={{ 'search.focus': 'Mod+J' }}
      />
    );
    // Mod+K should now NOT fire.
    fireEvent.keyDown(window, { key: 'k', ctrlKey: true });
    expect(onSearch).not.toHaveBeenCalled();
    // Mod+J should fire.
    fireEvent.keyDown(window, { key: 'j', ctrlKey: true });
    expect(onSearch).toHaveBeenCalledTimes(1);
  });

  it('enabled=false suppresses all shortcuts', () => {
    stubPlatform('Win32');
    const onSearch = vi.fn();
    render(
      <HostComponent handlers={{ 'search.focus': onSearch }} enabled={false} />
    );
    fireEvent.keyDown(window, { key: 'k', ctrlKey: true });
    expect(onSearch).not.toHaveBeenCalled();
  });

  it('first-match-wins: modal.close fires before chat.cancel for Escape', () => {
    stubPlatform('Win32');
    const onClose = vi.fn();
    const onCancel = vi.fn();
    render(
      <HostComponent
        handlers={{ 'modal.close': onClose, 'chat.cancel': onCancel }}
      />
    );
    fireEvent.keyDown(window, { key: 'Escape' });
    // SHORTCUT_DEFS 에서 modal.close 가 chat.cancel 보다 먼저 등록 (의도된
    // priority — 모달 닫기가 스트리밍 취소보다 우선).
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(onCancel).not.toHaveBeenCalled();
  });

  it('does not fire when no handler registered for action', () => {
    stubPlatform('Win32');
    const onSearch = vi.fn();
    // Only search.focus is registered. Mod+U (usage.open) does nothing.
    render(<HostComponent handlers={{ 'search.focus': onSearch }} />);
    fireEvent.keyDown(window, { key: 'u', ctrlKey: true });
    expect(onSearch).not.toHaveBeenCalled();
  });
});
