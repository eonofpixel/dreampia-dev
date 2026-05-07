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
import { ArrowLeft, ArrowRight, RotateCw, Plus, Maximize2, X, Camera, Code } from 'lucide-react';
import type { BrowserState, SessionId } from '@/types';
import { useBrowser, type BrowserTabUI } from '../../hooks/useBrowser';
import { useT } from '../../i18n';
import { AnnotationOverlay, type AnnotationBox } from './AnnotationOverlay';
import type { AnnotationBlock, DomDumpBlock } from '@/types/conversation';

const DEMO_URL = 'https://example.com';

export interface PreviewPanelProps {
  sessionId: SessionId | null;
  browser: BrowserState | null;
  /**
   * v1.6.9 wiring — Annotation 캡처 시 호출. 부모 (App.tsx) 가 ChatInput 의
   * pendingBlocks 에 prepend 하거나 즉시 chat 에 inject. 미지정 시 annotation
   * 모드 자체 비활성 (기능 hidden).
   */
  onAnnotation?: (block: AnnotationBlock) => void;
  /**
   * v1.6.12 — Screenshot 캡처 시 호출. base64 PNG + 크기. 부모가 chat 으로
   * 전송하거나 ImageBlock 으로 prepend. 미지정 시 카메라 버튼 미노출.
   */
  onScreenshot?: (data: { png_base64: string; width: number; height: number }) => void;
  /**
   * v1.6.14 — DOM dump 캡처 시 호출. DomDumpBlock 을 그대로 prepend.
   * 미지정 시 DOM 캡처 버튼 미노출.
   */
  onDomDump?: (block: DomDumpBlock) => void;
}

export function PreviewPanel({
  sessionId,
  browser,
  onAnnotation,
  onScreenshot,
  onDomDump,
}: PreviewPanelProps): React.JSX.Element {
  const t = useT();
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

  // v1.6.9 wiring — Annotation 모드 + 마지막 box draft.
  const [annotationActive, setAnnotationActive] = useState(false);
  const [pendingBoxes, setPendingBoxes] = useState<AnnotationBox[]>([]);
  const [capturing, setCapturing] = useState(false);

  const handleCapture = useCallback(async (): Promise<void> => {
    if (onScreenshot === undefined || activeTab === null || capturing) return;
    setCapturing(true);
    try {
      const api = typeof window !== 'undefined' ? window.dreampia?.browser : undefined;
      if (api?.captureTab === undefined) return;
      const r = await api.captureTab(activeTab.tab_id);
      if (r.ok && r.value !== null) {
        onScreenshot(r.value);
      }
    } finally {
      setCapturing(false);
    }
  }, [activeTab, capturing, onScreenshot]);

  const handleDumpDom = useCallback(async (): Promise<void> => {
    if (onDomDump === undefined || activeTab === null) return;
    const api = typeof window !== 'undefined' ? window.dreampia?.browser : undefined;
    if (api?.dumpDom === undefined) return;
    const r = await api.dumpDom(activeTab.tab_id);
    if (!r.ok || r.value === null) return;
    // Parse 후 node_count / summary 계산 — domDump utility 의 식과 호환되는
    // 단순 재계산.
    let nodeCount = 0;
    try {
      const tree = JSON.parse(r.value.dump_json) as {
        tag?: string;
        children?: unknown[];
      };
      const count = (n: { tag?: string; children?: unknown[] }): number => {
        let c = 1;
        if (Array.isArray(n.children)) {
          for (const child of n.children) {
            c += count(child as { tag?: string; children?: unknown[] });
          }
        }
        return c;
      };
      nodeCount = count(tree);
    } catch {
      // 잘못된 JSON — 0 으로 둠.
    }
    const block: DomDumpBlock = {
      type: 'dom_dump',
      url: r.value.url,
      selector: r.value.selector,
      dump_json: r.value.dump_json,
      summary: `dom dump (${nodeCount} nodes)`,
      node_count: nodeCount,
      captured_at: new Date().toISOString(),
    };
    onDomDump(block);
  }, [activeTab, onDomDump]);

  const handleAnnotationToggle = useCallback(() => {
    setAnnotationActive((v) => !v);
  }, []);

  const handleAnnotationMark = useCallback(
    (box: AnnotationBox): void => {
      setPendingBoxes((prev) => [...prev, box]);
      if (onAnnotation === undefined || activeTab === null) return;
      // 즉시 부모에 forward — App.tsx 가 ChatInput 에 prepend.
      const block: AnnotationBlock = {
        type: 'annotation_block',
        url: activeTab.url,
        bounding_box: { x: box.x, y: box.y, w: box.w, h: box.h },
        comment: '',
        captured_at: box.captured_at,
      };
      onAnnotation(block);
    },
    [onAnnotation, activeTab]
  );

  return (
    <aside
      className="relative flex h-full flex-1 flex-col border-l border-border-primary bg-bg-primary"
      aria-label={t('preview.aside_aria')}
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

      <div className="relative flex flex-1 min-h-0">
        <BrowserPaneAnchor
          activeTabId={activeTabId}
          activeTab={activeTab}
          hasTabs={tabs.length > 0}
          sessionPanelVisible={browser?.panel_visible ?? true}
          setBounds={setBounds}
          onOpenDemo={handleNewTab}
        />
        {/*
         * v1.6.9 wiring — webview 위에 absolute overlay. annotationActive 가
         * false 일 때 pointer-events: none 이라 webview 클릭 그대로 통과.
         * onAnnotation prop 미지정 시 toggle button 자체가 미노출 → 기능 hidden.
         */}
        {onAnnotation !== undefined && (
          <AnnotationOverlay
            active={annotationActive}
            onToggle={handleAnnotationToggle}
            onMark={handleAnnotationMark}
            boxes={pendingBoxes}
          />
        )}
      </div>
      {/*
       * Annotation 모드 진입 토글 — 우상단 corner 의 작은 버튼. 우측 panel 하단
       * 에 별도 toolbar 두지 않아 layout 영향 0.
       */}
      {onAnnotation !== undefined && !annotationActive && (
        <button
          type="button"
          onClick={handleAnnotationToggle}
          className="absolute right-3 top-12 z-20 rounded-md border border-border-primary bg-bg-primary/90 px-2 py-1 text-xs text-text-secondary hover:bg-bg-tertiary"
          aria-label={t('preview.annotation.start_aria')}
          data-testid="preview-annotation-start"
        >
          📐
        </button>
      )}
      {/* v1.6.12 — Screenshot 캡처 버튼. annotation 버튼 옆. */}
      {onScreenshot !== undefined && activeTab !== null && (
        <button
          type="button"
          onClick={() => {
            void handleCapture();
          }}
          disabled={capturing}
          className="absolute right-12 top-12 z-20 rounded-md border border-border-primary bg-bg-primary/90 px-2 py-1 text-xs text-text-secondary hover:bg-bg-tertiary disabled:opacity-50"
          aria-label={t('preview.screenshot_capture_aria')}
          data-testid="preview-screenshot-capture"
        >
          <Camera className="h-3 w-3" />
        </button>
      )}
      {/* v1.6.14 — DOM 캡처 버튼 (annotation/screenshot 옆). */}
      {onDomDump !== undefined && activeTab !== null && (
        <button
          type="button"
          onClick={() => {
            void handleDumpDom();
          }}
          className="absolute right-[5.25rem] top-12 z-20 rounded-md border border-border-primary bg-bg-primary/90 px-2 py-1 text-xs text-text-secondary hover:bg-bg-tertiary"
          aria-label={t('preview.dom_dump_capture_aria')}
          data-testid="preview-dom-dump"
        >
          <Code className="h-3 w-3" />
        </button>
      )}
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
  const t = useT();
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
              aria-label={t('preview.tabs.select_aria', {
                title: tab.title || t('preview.tabs.untitled'),
              })}
            >
              {tab.title || t('preview.tabs.untitled')}
            </button>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onClose(tab.tab_id);
              }}
              aria-label={t('preview.tabs.close_aria', {
                title: tab.title || t('preview.tabs.untitled'),
              })}
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
        aria-label={t('preview.tabs.new_aria')}
        data-testid="preview-new-tab"
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
  const t = useT();
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
        aria-label={t('preview.controls.back_aria')}
        data-testid="preview-back"
      >
        <ArrowLeft className="h-4 w-4" />
      </button>
      <button
        type="button"
        onClick={onForward}
        disabled={disabled || !activeTab?.can_go_forward}
        className="rounded p-1.5 text-text-tertiary hover:bg-bg-tertiary disabled:opacity-30"
        aria-label={t('preview.controls.forward_aria')}
        data-testid="preview-forward"
      >
        <ArrowRight className="h-4 w-4" />
      </button>
      <button
        type="button"
        onClick={onReload}
        disabled={disabled}
        className="rounded p-1.5 text-text-tertiary hover:bg-bg-tertiary disabled:opacity-30"
        aria-label={t('preview.controls.reload_aria')}
        data-testid="preview-reload"
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
          placeholder={t('preview.controls.url_placeholder')}
          disabled={disabled}
          className="flex-1 bg-transparent text-xs text-text-primary placeholder:text-text-tertiary focus:outline-none disabled:opacity-50"
          aria-label={t('preview.controls.url_aria')}
        />
      </form>

      <button
        type="button"
        disabled
        className="rounded p-1.5 text-text-tertiary hover:bg-bg-tertiary disabled:opacity-30"
        aria-label={t('preview.controls.fullscreen_aria')}
        title={t('preview.controls.fullscreen_tooltip')}
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
  const t = useT();
  return (
    <div className="text-center">
      <div className="text-5xl">🌐</div>
      <p className="mt-4">{t('preview.empty.title')}</p>
      <p className="mt-2 text-xs">{t('preview.empty.hint')}</p>
      <button
        type="button"
        onClick={onOpenDemo}
        className="mt-4 rounded-md border border-border-primary bg-bg-secondary px-3 py-1 text-xs text-text-primary hover:bg-bg-tertiary"
        data-testid="preview-open-demo"
      >
        {t('preview.empty.open_demo')}
      </button>
    </div>
  );
}
