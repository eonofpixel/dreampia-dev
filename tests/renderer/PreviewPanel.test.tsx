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

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, waitFor, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { PreviewPanel } from '../../src/renderer/components/preview/PreviewPanel';
import type { SessionId } from '../../src/types';
import { __mockStore, __emitBrowserUpdate, __emitInspectorEvent } from '../setup';

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

  it('v2.4.0: inspector toolbar renders when handlers are provided', async () => {
    render(
      <PreviewPanel
        sessionId={SID}
        browser={null}
        onAnnotation={() => {}}
        onScreenshot={() => {}}
        onDomDump={() => {}}
      />
    );
    await waitFor(() => {
      expect(screen.getByTestId('preview-inspector-toolbar')).toBeInTheDocument();
    });
    // All three buttons present.
    expect(screen.getByTestId('preview-annotation-start')).toBeInTheDocument();
    expect(screen.getByTestId('preview-screenshot-capture')).toBeInTheDocument();
    expect(screen.getByTestId('preview-dom-dump')).toBeInTheDocument();
    // No active tab → camera + dom buttons disabled, hint shown.
    expect(screen.getByTestId('preview-screenshot-capture')).toBeDisabled();
    expect(screen.getByTestId('preview-dom-dump')).toBeDisabled();
    // v2.10.0 (.omc/DESIGN.md) — hardcoded 영문 → i18n. default locale 'ko' 매치.
    expect(screen.getByText(/URL 을 열어 캡처 도구 활성화/)).toBeInTheDocument();
  });

  it('v2.4.0: inspector toolbar hidden when no handlers provided', async () => {
    render(<PreviewPanel sessionId={SID} browser={null} />);
    await waitFor(() => {
      expect(screen.getByText('미리보기할 페이지가 없어요')).toBeInTheDocument();
    });
    expect(screen.queryByTestId('preview-inspector-toolbar')).not.toBeInTheDocument();
  });

  it('v2.4.0: capture buttons enable when an active tab exists', async () => {
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
    render(
      <PreviewPanel
        sessionId={SID}
        browser={null}
        onAnnotation={() => {}}
        onScreenshot={() => {}}
        onDomDump={() => {}}
      />
    );
    await waitFor(() => screen.getByText('Example'));
    await user.click(screen.getByText('Example'));
    await waitFor(() => {
      expect(screen.getByTestId('preview-screenshot-capture')).not.toBeDisabled();
      expect(screen.getByTestId('preview-dom-dump')).not.toBeDisabled();
    });
  });

  // ────────────────────────────────────────────────────────────
  // v2.5.0 Phase 1 — Code mode (옵션 D, Codex file-open preview 패턴)
  // Decision doc: ../../CODE_TAB_DECISION.md
  // ────────────────────────────────────────────────────────────
  it('v2.5.0: mode="code" renders Code placeholder instead of browser', () => {
    render(<PreviewPanel sessionId={SID} browser={null} mode="code" />);
    const codePanel = screen.getByTestId('preview-panel-code');
    expect(codePanel).toBeInTheDocument();
    expect(codePanel).toHaveAttribute('data-mode', 'code');
    expect(screen.getByText(/코드 보기|Code/)).toBeInTheDocument();
    // Browser-mode chrome (PreviewTabs / BrowserControls) must not render in code mode.
    expect(screen.queryByRole('button', { name: '예시 URL 열기' })).not.toBeInTheDocument();
  });

  it('v2.5.0: mode="code" with onSwitchMode shows Browser-return button', async () => {
    const user = userEvent.setup();
    const onSwitchMode = vi.fn();
    render(
      <PreviewPanel sessionId={SID} browser={null} mode="code" onSwitchMode={onSwitchMode} />
    );
    const btn = screen.getByTestId('preview-mode-browser');
    expect(btn).toBeInTheDocument();
    await user.click(btn);
    expect(onSwitchMode).toHaveBeenCalledWith('browser');
  });

  it('v2.5.0: mode="code" without onSwitchMode hides Browser-return button', () => {
    render(<PreviewPanel sessionId={SID} browser={null} mode="code" />);
    expect(screen.queryByTestId('preview-mode-browser')).not.toBeInTheDocument();
  });

  it('v2.5.0: default mode (no prop) keeps existing browser behavior', async () => {
    render(<PreviewPanel sessionId={SID} browser={null} />);
    await waitFor(() => {
      expect(screen.getByText('미리보기할 페이지가 없어요')).toBeInTheDocument();
    });
    expect(screen.queryByTestId('preview-panel-code')).not.toBeInTheDocument();
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

  // ────────────────────────────────────────────────────────────
  // v2.10.0 β-2 (F-021 + F-033) — Annotation pick mode wiring
  // ────────────────────────────────────────────────────────────
  it('v2.10.0 β-2: annotation activate (pick default) → enableInspector', async () => {
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
    render(
      <PreviewPanel sessionId={SID} browser={null} onAnnotation={() => {}} />
    );
    await waitFor(() => screen.getByText('Example'));
    await user.click(screen.getByText('Example'));

    // Toggle annotation on.
    await user.click(screen.getByTestId('preview-annotation-start'));

    await waitFor(() => {
      expect(__mockStore.browserInspectorEnabled.has('seed-1')).toBe(true);
    });
  });

  it('v2.10.0 β-2: annotation deactivate → disableInspector', async () => {
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
    render(
      <PreviewPanel sessionId={SID} browser={null} onAnnotation={() => {}} />
    );
    await waitFor(() => screen.getByText('Example'));
    await user.click(screen.getByText('Example'));

    await user.click(screen.getByTestId('preview-annotation-start'));
    await waitFor(() => {
      expect(__mockStore.browserInspectorEnabled.has('seed-1')).toBe(true);
    });
    await user.click(screen.getByTestId('preview-annotation-start'));
    await waitFor(() => {
      expect(__mockStore.browserInspectorEnabled.has('seed-1')).toBe(false);
    });
  });

  it('v2.10.0 β-2: inspector pick event → onAnnotation block w/ selector', async () => {
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
    const onAnnotation = vi.fn();
    const user = userEvent.setup();
    render(
      <PreviewPanel sessionId={SID} browser={null} onAnnotation={onAnnotation} />
    );
    await waitFor(() => screen.getByText('Example'));
    await user.click(screen.getByText('Example'));
    await user.click(screen.getByTestId('preview-annotation-start'));

    // Wait for inspector subscription to settle.
    await waitFor(() => {
      expect(__mockStore.browserInspectorEnabled.has('seed-1')).toBe(true);
    });

    act(() => {
      __emitInspectorEvent({
        tab_id: 'seed-1',
        session_id: SID,
        event: {
          type: 'pick',
          selector: 'button#submit',
          x: 12,
          y: 34,
          w: 100,
          h: 30,
          tag: 'button',
          page_url: 'https://example.com/page',
          ts: 1715600000000,
        },
      });
    });

    await waitFor(() => {
      expect(onAnnotation).toHaveBeenCalledTimes(1);
    });
    const block = onAnnotation.mock.calls[0]![0] as {
      type: string;
      url: string;
      bounding_box: { x: number; y: number; w: number; h: number };
      selector?: string;
    };
    expect(block.type).toBe('annotation_block');
    expect(block.selector).toBe('button#submit');
    expect(block.url).toBe('https://example.com/page');
    expect(block.bounding_box).toEqual({ x: 12, y: 34, w: 100, h: 30 });
  });

  // ────────────────────────────────────────────────────────────
  // v2.10.0 β-2 hardening (architect strengthening 7) — keyboard P / R
  // ────────────────────────────────────────────────────────────
  it('v2.10.0 β-2 hardening: P key (annotation active) switches to pick mode', async () => {
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
    render(<PreviewPanel sessionId={SID} browser={null} onAnnotation={() => {}} />);
    await waitFor(() => screen.getByText('Example'));
    await user.click(screen.getByText('Example'));

    // Annotation 활성 + segmented control 의 region 으로 전환.
    await user.click(screen.getByTestId('preview-annotation-start'));
    await waitFor(() => {
      expect(screen.getByTestId('annotation-mode-segment')).toBeInTheDocument();
    });
    await user.click(screen.getByTestId('annotation-mode-region'));
    await waitFor(() => {
      expect(screen.getByTestId('annotation-mode-region').getAttribute('aria-checked')).toBe(
        'true'
      );
    });

    // P 키 → pick 으로 복귀.
    await user.keyboard('p');
    await waitFor(() => {
      expect(screen.getByTestId('annotation-mode-pick').getAttribute('aria-checked')).toBe('true');
    });
  });

  it('v2.10.0 β-2 hardening: R key (annotation active) switches to region mode', async () => {
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
    render(<PreviewPanel sessionId={SID} browser={null} onAnnotation={() => {}} />);
    await waitFor(() => screen.getByText('Example'));
    await user.click(screen.getByText('Example'));
    await user.click(screen.getByTestId('preview-annotation-start'));

    await user.keyboard('r');
    await waitFor(() => {
      expect(screen.getByTestId('annotation-mode-region').getAttribute('aria-checked')).toBe(
        'true'
      );
    });
  });

  it('v2.10.0 β-2 hardening: P / R keys ignored when annotation is inactive', async () => {
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
    render(<PreviewPanel sessionId={SID} browser={null} onAnnotation={() => {}} />);
    await waitFor(() => screen.getByText('Example'));
    await user.click(screen.getByText('Example'));

    // annotation 비활성 → keypress 가 mode 토글 안 함 (segmented control 자체가
    // 안 보임).
    await user.keyboard('p');
    expect(screen.queryByTestId('annotation-mode-segment')).not.toBeInTheDocument();
    await user.keyboard('r');
    expect(screen.queryByTestId('annotation-mode-segment')).not.toBeInTheDocument();
  });

  it('v2.10.0 β-2 hardening: P / R keys ignored while typing in the URL bar (input focus)', async () => {
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
    render(<PreviewPanel sessionId={SID} browser={null} onAnnotation={() => {}} />);
    await waitFor(() => screen.getByText('Example'));
    await user.click(screen.getByText('Example'));
    await user.click(screen.getByTestId('preview-annotation-start'));
    await waitFor(() => {
      expect(screen.getByTestId('annotation-mode-pick').getAttribute('aria-checked')).toBe('true');
    });

    // URL bar 에 focus → 'r' 입력해도 mode 가 region 으로 가지 않아야 함.
    const urlInput = screen.getByLabelText('URL') as HTMLInputElement;
    await user.click(urlInput);
    await user.type(urlInput, 'r');

    expect(screen.getByTestId('annotation-mode-pick').getAttribute('aria-checked')).toBe('true');
    expect(screen.getByTestId('annotation-mode-region').getAttribute('aria-checked')).toBe('false');
  });

  it('v2.10.0 β-2: pick event for OTHER tab id is ignored', async () => {
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
    const onAnnotation = vi.fn();
    const user = userEvent.setup();
    render(
      <PreviewPanel sessionId={SID} browser={null} onAnnotation={onAnnotation} />
    );
    await waitFor(() => screen.getByText('Example'));
    await user.click(screen.getByText('Example'));
    await user.click(screen.getByTestId('preview-annotation-start'));
    await waitFor(() => {
      expect(__mockStore.browserInspectorEnabled.has('seed-1')).toBe(true);
    });

    act(() => {
      __emitInspectorEvent({
        tab_id: 'OTHER-TAB',
        session_id: SID,
        event: {
          type: 'pick',
          selector: 'a',
          x: 0,
          y: 0,
          w: 10,
          h: 10,
          tag: 'a',
          page_url: 'https://other',
          ts: 0,
        },
      });
    });

    // Tick a bit — make sure no annotation comes through.
    await new Promise((r) => setTimeout(r, 10));
    expect(onAnnotation).not.toHaveBeenCalled();
  });
});
