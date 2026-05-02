/**
 * PreviewPanel — renderer component tests (P1-5).
 *
 * Spec: docs/ia/preview-panel.md, docs/session/browser.md
 *
 * Verifies the PreviewPanel UI plumbing into useBrowser:
 *   - empty state + "예시 URL 열기" demo button
 *   - URL bar (Enter to navigate)
 *   - back / forward gating on can_go_*
 *   - tab strip rendering + close-X
 *   - new-tab (+) button
 *
 * Uses the in-memory __mockStore from tests/setup.ts. The actual
 * WebContentsView is never created — these tests only cover the
 * renderer-side UX wiring.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, waitFor, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { PreviewPanel } from '../../src/renderer/components/preview/PreviewPanel';
import type { SessionId } from '../../src/types';
import { __mockStore, __emitBrowserUpdate } from '../setup';

const SID = '019d-aaaa' as SessionId;

// ResizeObserver stub: jsdom doesn't ship one, and PreviewPanel's anchor
// installs it for live placeholder geometry.
class ResizeObserverStub {
  observe(): void {}
  unobserve(): void {}
  disconnect(): void {}
}
(globalThis as unknown as { ResizeObserver: typeof ResizeObserverStub }).ResizeObserver =
  ResizeObserverStub;

describe('PreviewPanel', () => {
  beforeEach(() => {
    __mockStore.browserTabs.clear();
    __mockStore.browserActive.clear();
  });

  it('renders empty state with the demo URL button when no tabs exist', async () => {
    render(<PreviewPanel sessionId={SID} browser={null} />);
    // Wait for the initial useBrowser refresh to settle so the act warning
    // doesn't fire from the loading=false transition after assertions.
    await waitFor(() => {
      expect(screen.getByText('미리보기할 페이지가 없어요')).toBeInTheDocument();
    });
    expect(screen.getByRole('button', { name: '예시 URL 열기' })).toBeInTheDocument();
  });

  it('"예시 URL 열기" creates a new tab', async () => {
    const user = userEvent.setup();
    render(<PreviewPanel sessionId={SID} browser={null} />);

    const btn = screen.getByRole('button', { name: '예시 URL 열기' });
    await user.click(btn);

    await waitFor(() => {
      // After click, tabs map should contain a new tab for SID.
      const tabs = Array.from(__mockStore.browserTabs.values()).filter(
        (t) => t.session_id === SID
      );
      expect(tabs).toHaveLength(1);
    });
  });

  it('renders existing tabs in the tab strip', async () => {
    __mockStore.browserTabs.set('seed-1', {
      tab_id: 'seed-1',
      session_id: SID,
      url: 'https://example.com',
      title: 'Example',
      favicon_url: null,
      status: 'ready',
      can_go_back: false,
      can_go_forward: false,
    });
    __mockStore.browserTabs.set('seed-2', {
      tab_id: 'seed-2',
      session_id: SID,
      url: 'https://other.com',
      title: 'Other',
      favicon_url: null,
      status: 'ready',
      can_go_back: false,
      can_go_forward: false,
    });

    render(<PreviewPanel sessionId={SID} browser={null} />);

    await waitFor(() => {
      expect(screen.getByText('Example')).toBeInTheDocument();
      expect(screen.getByText('Other')).toBeInTheDocument();
    });
  });

  it('back / forward buttons are disabled until canGo* flips true', async () => {
    __mockStore.browserTabs.set('seed-1', {
      tab_id: 'seed-1',
      session_id: SID,
      url: 'https://example.com',
      title: 'Example',
      favicon_url: null,
      status: 'ready',
      can_go_back: false,
      can_go_forward: false,
    });

    const user = userEvent.setup();
    render(<PreviewPanel sessionId={SID} browser={null} />);

    // Need to make this tab active; the hook needs at least one switchTo
    // call (initial load doesn't auto-select). Click on the tab title to
    // do that.
    await waitFor(() => {
      expect(screen.getByText('Example')).toBeInTheDocument();
    });
    await user.click(screen.getByText('Example'));

    const back = screen.getByRole('button', { name: '뒤로' });
    const forward = screen.getByRole('button', { name: '앞으로' });
    expect(back).toBeDisabled();
    expect(forward).toBeDisabled();

    // Simulate a tab-update event flipping can_go_back to true.
    act(() => {
      __emitBrowserUpdate({
        tab_id: 'seed-1',
        session_id: SID,
        url: 'https://example.com/page',
        title: 'Example',
        favicon_url: null,
        status: 'ready',
        can_go_back: true,
        can_go_forward: false,
      });
    });

    await waitFor(() => {
      expect(screen.getByRole('button', { name: '뒤로' })).not.toBeDisabled();
    });
    expect(screen.getByRole('button', { name: '앞으로' })).toBeDisabled();
  });

  it('close X button removes the tab', async () => {
    __mockStore.browserTabs.set('seed-1', {
      tab_id: 'seed-1',
      session_id: SID,
      url: 'https://example.com',
      title: 'Example',
      favicon_url: null,
      status: 'ready',
      can_go_back: false,
      can_go_forward: false,
    });

    const user = userEvent.setup();
    render(<PreviewPanel sessionId={SID} browser={null} />);

    const closeBtn = await screen.findByRole('button', { name: 'Example 닫기' });
    await user.click(closeBtn);

    await waitFor(() => {
      expect(screen.queryByText('Example')).not.toBeInTheDocument();
    });
    expect(__mockStore.browserTabs.get('seed-1')).toBeUndefined();
  });

  it('typing in URL bar + Enter triggers navigate on the active tab', async () => {
    __mockStore.browserTabs.set('seed-1', {
      tab_id: 'seed-1',
      session_id: SID,
      url: 'https://example.com',
      title: 'Example',
      favicon_url: null,
      status: 'ready',
      can_go_back: false,
      can_go_forward: false,
    });

    const user = userEvent.setup();
    render(<PreviewPanel sessionId={SID} browser={null} />);

    // Activate the seeded tab.
    await waitFor(() => {
      expect(screen.getByText('Example')).toBeInTheDocument();
    });
    await user.click(screen.getByText('Example'));

    const urlInput = screen.getByLabelText('URL') as HTMLInputElement;
    await user.clear(urlInput);
    await user.type(urlInput, 'https://newsite.test{Enter}');

    await waitFor(() => {
      const tab = __mockStore.browserTabs.get('seed-1');
      expect(tab?.url).toBe('https://newsite.test');
    });
  });

  it('"+" button opens a new tab', async () => {
    __mockStore.browserTabs.set('seed-1', {
      tab_id: 'seed-1',
      session_id: SID,
      url: 'https://example.com',
      title: 'Example',
      favicon_url: null,
      status: 'ready',
      can_go_back: false,
      can_go_forward: false,
    });

    const user = userEvent.setup();
    render(<PreviewPanel sessionId={SID} browser={null} />);

    await waitFor(() => {
      expect(screen.getByText('Example')).toBeInTheDocument();
    });

    const plusBtn = screen.getByRole('button', { name: '새 탭' });
    await user.click(plusBtn);

    await waitFor(() => {
      const tabs = Array.from(__mockStore.browserTabs.values()).filter(
        (t) => t.session_id === SID
      );
      expect(tabs.length).toBeGreaterThanOrEqual(2);
    });
  });
});
