/**
 * PreviewPanel — right panel: in-app browser (P1-5).
 *
 * Spec: docs/ia/preview-panel.md, docs/session/browser.md
 *
 * Wires `useBrowser` to a real WebContentsView managed by the main
 * process. The renderer keeps a transparent placeholder div and reports
 * its bounding rect over IPC; main re-positions the WebContentsView
 * over that area.
 *
 * Layout (panel mode, P1):
 *   ┌─────────────────────────────────────────┐
 *   │ tab1  tab2  +                          ⛶│  ← PreviewTabs
 *   ├─────────────────────────────────────────┤
 *   │ ◀ ▶ ↻  [https://example.com         ]   │  ← BrowserControls
 *   ├─────────────────────────────────────────┤
 *   │                                         │
 *   │   placeholder div (WebContentsView      │  ← BrowserPaneAnchor
 *   │   sits here in main, hosted by Electron)│
 *   │                                         │
 *   └─────────────────────────────────────────┘
 *
 * Out of scope for P1-5 (deferred to P2/P3):
 *   - Annotation mode (DOM Inspector)
 *   - Screenshot / DOM dump
 *   - Side chat tabs (parent-child session fork)
 *   - Fullscreen overlay layout
 */

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, ArrowRight, RotateCw, Plus, Maximize2, X } from 'lucide-react';
import type { BrowserState, SessionId } from '@/types';
import { useBrowser, type BrowserTabUI } from '../../hooks/useBrowser';

const DEMO_URL = 'https://example.com';

export interface PreviewPanelProps {
  sessionId: SessionId | null;
  browser: BrowserState | null;
}

export function PreviewPanel({ sessionId, browser }: PreviewPanelProps): React.JSX.Element {
  const {
    tabs,
    activeTabId,
    error,
    open,
    close,
    switchTo,
    navigate,
    back,
    forward,
    reload,
    setBounds,
  } = useBrowser(sessionId, browser?.active_tab_id ?? null);

  const activeTab = useMemo<BrowserTabUI | null>(
    () => tabs.find((t) => t.tab_id === activeTabId) ?? null,
    [tabs, activeTabId]
  );

  const handleNewTab = useCallback(() => {
    void open(DEMO_URL);
  }, [open]);

  return (
    <aside
      className="flex h-full flex-1 flex-col border-l border-border-primary bg-bg-primary"
      aria-label="미리보기"
    >
      <PreviewTabs
        tabs={tabs}
        activeTabId={activeTabId}
        onSelect={(id) => {
          void switchTo(id);
        }}
        onClose={(id) => {
          void close(id);
        }}
        onNewTab={handleNewTab}
      />

      <BrowserControls
        activeTab={activeTab}
        onBack={() => {
          if (activeTab) void back(activeTab.tab_id);
        }}
        onForward={() => {
          if (activeTab) void forward(activeTab.tab_id);
        }}
        onReload={() => {
          if (activeTab) void reload(activeTab.tab_id);
        }}
        onNavigate={(url) => {
          if (activeTab) void navigate(activeTab.tab_id, url);
        }}
      />

      {error !== null && (
        <div
          role="alert"
          className="border-b border-border-primary bg-red-900/20 px-3 py-1 text-xs text-red-400"
        >
          {error}
        </div>
      )}

      <BrowserPaneAnchor
        activeTabId={activeTabId}
        activeTab={activeTab}
        hasTabs={tabs.length > 0}
        sessionPanelVisible={browser?.panel_visible ?? true}
        setBounds={setBounds}
        onOpenDemo={handleNewTab}
      />
    </aside>
  );
}

// ────────────────────────────────────────────────────────────
// Tabs (F-017)
// ────────────────────────────────────────────────────────────

interface PreviewTabsProps {
  tabs: BrowserTabUI[];
  activeTabId: string | null;
  onSelect: (tabId: string) => void;
  onClose: (tabId: string) => void;
  onNewTab: () => void;
}

function PreviewTabs({
  tabs,
  activeTabId,
  onSelect,
  onClose,
  onNewTab,
}: PreviewTabsProps): React.JSX.Element {
  return (
    <div
      className="flex h-9 items-center border-b border-border-primary bg-bg-secondary"
      role="tablist"
    >
      {tabs.map((tab) => {
        const isActive = tab.tab_id === activeTabId;
        return (
          <div
            key={tab.tab_id}
            role="tab"
            aria-selected={isActive}
            data-active={isActive}
            className="flex items-center gap-1 border-r border-border-primary pl-3 pr-1 py-1.5 text-xs hover:bg-bg-tertiary data-[active=true]:bg-bg-primary"
          >
            <button
              type="button"
              onClick={() => onSelect(tab.tab_id)}
              className="max-w-[140px] truncate"
              title={tab.url}
            >
              {tab.title || '새 탭'}
            </button>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onClose(tab.tab_id);
              }}
              aria-label={`${tab.title || '탭'} 닫기`}
              className="rounded p-0.5 text-text-tertiary hover:bg-bg-primary hover:text-text-primary"
            >
              <X className="h-3 w-3" />
            </button>
          </div>
        );
      })}
      <button
        type="button"
        onClick={onNewTab}
        className="px-3 py-1.5 text-text-tertiary hover:bg-bg-tertiary"
        aria-label="새 탭"
      >
        <Plus className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}

// ────────────────────────────────────────────────────────────
// Browser controls (URL bar + back/forward/reload + fullscreen)
// ────────────────────────────────────────────────────────────

interface BrowserControlsProps {
  activeTab: BrowserTabUI | null;
  onBack: () => void;
  onForward: () => void;
  onReload: () => void;
  onNavigate: (url: string) => void;
}

function BrowserControls({
  activeTab,
  onBack,
  onForward,
  onReload,
  onNavigate,
}: BrowserControlsProps): React.JSX.Element {
  const [draftUrl, setDraftUrl] = useState<string>(activeTab?.url ?? '');
  const lastSeenUrlRef = useRef<string | null>(activeTab?.url ?? null);

  // Keep draft in sync when the active tab navigates externally (e.g. after
  // a link click inside the WebContentsView). Don't clobber user typing —
  // only overwrite when the live URL has actually changed since we last saw it.
  useEffect(() => {
    const liveUrl = activeTab?.url ?? null;
    if (liveUrl !== lastSeenUrlRef.current) {
      lastSeenUrlRef.current = liveUrl;
      setDraftUrl(liveUrl ?? '');
    }
  }, [activeTab?.url]);

  const submit = useCallback(
    (e: React.FormEvent<HTMLFormElement>) => {
      e.preventDefault();
      const trimmed = draftUrl.trim();
      if (trimmed.length === 0) return;
      onNavigate(trimmed);
    },
    [draftUrl, onNavigate]
  );

  const disabled = activeTab === null;

  return (
    <div className="flex h-10 items-center gap-1 border-b border-border-primary px-2">
      <button
        type="button"
        onClick={onBack}
        disabled={disabled || !activeTab?.can_go_back}
        className="rounded p-1.5 text-text-tertiary hover:bg-bg-tertiary disabled:opacity-30"
        aria-label="뒤로"
      >
        <ArrowLeft className="h-4 w-4" />
      </button>
      <button
        type="button"
        onClick={onForward}
        disabled={disabled || !activeTab?.can_go_forward}
        className="rounded p-1.5 text-text-tertiary hover:bg-bg-tertiary disabled:opacity-30"
        aria-label="앞으로"
      >
        <ArrowRight className="h-4 w-4" />
      </button>
      <button
        type="button"
        onClick={onReload}
        disabled={disabled}
        className="rounded p-1.5 text-text-tertiary hover:bg-bg-tertiary disabled:opacity-30"
        aria-label="새로고침"
      >
        <RotateCw className="h-4 w-4" />
      </button>

      <form
        onSubmit={submit}
        className="ml-2 flex flex-1 items-center rounded-md bg-bg-secondary px-3 py-1"
      >
        <input
          type="text"
          value={draftUrl}
          onChange={(e) => setDraftUrl(e.target.value)}
          placeholder="URL 입력 또는 검색"
          disabled={disabled}
          className="flex-1 bg-transparent text-xs text-text-primary placeholder:text-text-tertiary focus:outline-none disabled:opacity-50"
          aria-label="URL"
        />
      </form>

      <button
        type="button"
        disabled
        className="rounded p-1.5 text-text-tertiary hover:bg-bg-tertiary disabled:opacity-30"
        aria-label="전체화면"
        title="전체화면 (P2)"
      >
        <Maximize2 className="h-4 w-4" />
      </button>
    </div>
  );
}

// ────────────────────────────────────────────────────────────
// BrowserPaneAnchor — reports geometry to main, shows fallback content
// ────────────────────────────────────────────────────────────

interface BrowserPaneAnchorProps {
  activeTabId: string | null;
  activeTab: BrowserTabUI | null;
  hasTabs: boolean;
  sessionPanelVisible: boolean;
  setBounds: (
    tabId: string,
    rect: { x: number; y: number; width: number; height: number }
  ) => Promise<void>;
  onOpenDemo: () => void;
}

function BrowserPaneAnchor({
  activeTabId,
  activeTab,
  hasTabs,
  sessionPanelVisible: _sessionPanelVisible,
  setBounds,
  onOpenDemo,
}: BrowserPaneAnchorProps): React.JSX.Element {
  const placeholderRef = useRef<HTMLDivElement | null>(null);

  // Push current bounds whenever the active tab changes or the panel resizes.
  // useLayoutEffect (not useEffect) so the initial measurement happens before
  // the next paint — avoids a one-frame flash where the WebContentsView
  // reattaches at stale coordinates.
  useLayoutEffect(() => {
    if (!activeTabId) return undefined;
    const el = placeholderRef.current;
    if (el === null) return undefined;

    const update = (): void => {
      if (placeholderRef.current === null) return;
      const rect = placeholderRef.current.getBoundingClientRect();
      void setBounds(activeTabId, {
        x: rect.left,
        y: rect.top,
        width: rect.width,
        height: rect.height,
      });
    };

    update();

    const ro = new ResizeObserver(update);
    ro.observe(el);

    // Page-level changes (fullscreen toggles, sidebar resize, scroll) all
    // need a re-measure. Capture-phase scroll because nested overflow
    // containers don't bubble.
    window.addEventListener('resize', update);
    window.addEventListener('scroll', update, true);

    return (): void => {
      ro.disconnect();
      window.removeEventListener('resize', update);
      window.removeEventListener('scroll', update, true);
    };
  }, [activeTabId, setBounds]);

  if (!hasTabs) {
    return (
      <div className="flex flex-1 items-center justify-center text-sm text-text-tertiary">
        <EmptyPreview onOpenDemo={onOpenDemo} />
      </div>
    );
  }

  return (
    <div
      ref={placeholderRef}
      data-testid="browser-pane-anchor"
      className="flex flex-1 items-center justify-center"
    >
      {activeTab && activeTab.status !== 'ready' && (
        <span className="text-xs text-text-tertiary">
          {activeTab.status === 'failed' ? '미리보기 로드 실패' : '미리보기 로드 중...'}
        </span>
      )}
    </div>
  );
}

// ────────────────────────────────────────────────────────────
// Empty / Active state
// ────────────────────────────────────────────────────────────

function EmptyPreview({ onOpenDemo }: { onOpenDemo: () => void }): React.JSX.Element {
  return (
    <div className="text-center">
      <div className="text-5xl">🌐</div>
      <p className="mt-4">미리보기할 페이지가 없어요</p>
      <p className="mt-2 text-xs">AI가 띄운 서버 또는 직접 URL 입력</p>
      <button
        type="button"
        onClick={onOpenDemo}
        className="mt-4 rounded-md border border-border-primary bg-bg-secondary px-3 py-1 text-xs text-text-primary hover:bg-bg-tertiary"
      >
        예시 URL 열기
      </button>
    </div>
  );
}
