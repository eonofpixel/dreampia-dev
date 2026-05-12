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
import {
  ArrowLeft,
  ArrowRight,
  Camera,
  Code,
  Globe,
  Maximize2,
  Plus,
  RotateCw,
  Ruler,
  X,
} from 'lucide-react';
import type { BrowserState, SessionId } from '@/types';
import {
  useBrowser,
  type BrowserTabUI,
  type BrowserInspectorPayload,
} from '../../hooks/useBrowser';
import { useT } from '../../i18n';
import { CodePanel } from '../code/CodePanel';
import {
  AnnotationOverlay,
  type AnnotationBox,
  type AnnotationMode,
  type AnnotationHoverMeta,
} from './AnnotationOverlay';
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
  /**
   * v2.5.0 (Phase 1 — Code mode) — Codex 의 file-open preview 패턴 (옵션 D).
   * 'browser' (default) 는 기존 WebContentsView 호스팅. 'code' 는 우측 패널을
   * 코드 보기 placeholder 로 전환. Phase 2 에서 CodeMirror 6 + 파일 트리가
   * 이 placeholder 를 대체한다.
   *
   * Decision doc: CODE_TAB_DECISION.md.
   */
  mode?: 'browser' | 'code';
  /**
   * v2.5.0 — Code 모드에서 헤더의 [브라우저] 버튼 클릭 시 호출. App.tsx 가
   * setPreviewMode('browser') 로 wire. 미지정 시 모드 전환 버튼 미노출.
   */
  onSwitchMode?: (next: 'browser' | 'code') => void;
  /**
   * v2.6.0 (Phase 2) — Code 모드의 FileTree 가 사용하는 워크스페이스 절대
   * 루트. mention 의 동일 prop 과 같은 값을 전달 (App.tsx 의
   * mentionWorkspaceRoot). undefined 면 FileTree 가 안내 문구 표시.
   */
  workspaceRoot?: string;
  /**
   * v2.6.0 (Phase 2) — workspace.listFiles 에 전달할 ignore 패턴.
   * mention 과 동일한 set 재사용 (node_modules, .git 등 자동 prune).
   */
  ignorePatterns?: ReadonlyArray<string>;
  /**
   * v2.8.0 (Builder UX) — Quick Open 등 외부에서 파일 로드 요청. 값 변화 시
   * CodePanel 이 loadFile(requestedFile). 한 번 소비되면 부모가
   * onRequestedFileConsumed 로 reset.
   */
  requestedFile?: string;
  onRequestedFileConsumed?: () => void;
  /**
   * v2.8.x (Builder UX, C 후속) — CodePanel 의 현재 파일 메타데이터를 부모
   * (App.tsx) 에 emit. ChatPanel "Apply to file" 활성화 + writeFile target.
   */
  onCurrentFileChange?: (info: { path: string; mtime?: string; content: string } | null) => void;
  /**
   * v2.8.x (Builder UX, C 3차) — Apply-to-file 성공 후 부모가 dispatch 하는
   * disk baseline 갱신 신호. CodePanel 이 selectedPath 일치 시 적용 + 즉시
   * 소비 callback. fs watcher 없이 in-process write 후 baseline 동기화.
   */
  appliedDiskUpdate?: { path: string; content: string; mtime?: string } | null;
  onAppliedDiskUpdateConsumed?: () => void;
}

/**
 * v2.5.0 Phase 1 / v2.6.0 Phase 2 — mode dispatcher.
 *
 * Code 모드 vs Browser 모드를 별도 자식 컴포넌트로 분기해 hooks 규칙
 * (Rules of Hooks) 을 안전하게 지킨다. 두 분기는 서로 다른 hook 집합을
 * 갖기 때문에 한 함수 안에서 conditional return 으로 처리하면 react-hooks
 * 린트 violation. 분기 전 호출되는 hook 자체가 없도록 wrapper 만 분리.
 */
export function PreviewPanel(props: PreviewPanelProps): React.JSX.Element {
  if (props.mode === 'code') {
    return (
      <CodePanel
        {...(props.workspaceRoot !== undefined && { workspaceRoot: props.workspaceRoot })}
        {...(props.ignorePatterns !== undefined && { ignorePatterns: props.ignorePatterns })}
        {...(props.onSwitchMode !== undefined && { onSwitchMode: props.onSwitchMode })}
        {...(props.requestedFile !== undefined && { requestedFile: props.requestedFile })}
        {...(props.onRequestedFileConsumed !== undefined && {
          onRequestedFileConsumed: props.onRequestedFileConsumed,
        })}
        {...(props.onCurrentFileChange !== undefined && {
          onCurrentFileChange: props.onCurrentFileChange,
        })}
        {...(props.appliedDiskUpdate !== undefined && {
          appliedDiskUpdate: props.appliedDiskUpdate,
        })}
        {...(props.onAppliedDiskUpdateConsumed !== undefined && {
          onAppliedDiskUpdateConsumed: props.onAppliedDiskUpdateConsumed,
        })}
      />
    );
  }
  return <BrowserPreview {...props} />;
}

function BrowserPreview({
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
  // v2.10.0 β-2 — Annotation mode (pick = DOM element, region = drag box) +
  // pick hover bbox (webview-viewport-relative; anchor 가 webview 와 정렬되어
  // 있어 overlay 좌표로 그대로 사용). 부모가 inspector-event 받아 overlay 에 전달.
  const [annotationMode, setAnnotationMode] = useState<AnnotationMode>('pick');
  const [hoverRect, setHoverRect] = useState<{ x: number; y: number; w: number; h: number } | null>(
    null
  );
  // v2.10.0 β-3 (F-033 meta card) — Hover meta sidecar. Inspector script
  // attaches computed-style fields to every hover event; we forward them
  // verbatim to AnnotationOverlay so the card renders next to hoverRect.
  // pick event 의 메타도 동일하게 도착하지만 본 PR 에서는 카드 UI 에만 사용
  // (annotation block dom_meta 확장은 별도 PR).
  const [hoverMeta, setHoverMeta] = useState<AnnotationHoverMeta | null>(null);

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
      // v2.10.0 β-2 — pick 모드에서 잡힌 box 는 selector + page_url 까지 포함.
      // v2.10.0 β-3 — 동일 시점에 main 의 captureRegion 을 호출해 부분
      // 스크린샷을 userData 에 저장 후 file URI 를 screenshot_uri 에 채운다.
      // captureRegion 비동기 동안 사용자가 다른 pick 을 해도 promise 가
      // 독립이라 race 가 발생하지 않는다 — captured_at 으로 식별 가능.
      const baseBlock: AnnotationBlock = {
        type: 'annotation_block',
        url: box.page_url ?? activeTab.url,
        bounding_box: { x: box.x, y: box.y, w: box.w, h: box.h },
        comment: '',
        captured_at: box.captured_at,
        ...(box.selector !== undefined && { selector: box.selector }),
      };
      const tabId = activeTab.tab_id;
      const api = typeof window !== 'undefined' ? window.dreampia?.browser : undefined;
      if (api?.captureRegion === undefined) {
        // captureRegion IPC 미존재 (older preload) — screenshot 없이 그대로.
        onAnnotation(baseBlock);
        return;
      }
      void api
        .captureRegion(tabId, { x: box.x, y: box.y, w: box.w, h: box.h })
        .then((r) => {
          if (r.ok && r.value !== null && r.value.uri.length > 0) {
            onAnnotation({ ...baseBlock, screenshot_uri: r.value.uri });
            return;
          }
          onAnnotation(baseBlock);
        })
        .catch(() => {
          onAnnotation(baseBlock);
        });
    },
    [onAnnotation, activeTab]
  );

  // v2.10.0 β-2 hardening (architect strengthening 7) — Annotation 모드 active
  // 시 P=pick, R=region 단축키. textarea/input/select/contenteditable focus
  // 시 무시 — chat 입력 / URL bar 등에서 타자를 막지 않기 위함. ChatInput 의
  // global Mod+P quick-open 과는 모디파이어 키 충돌 X (단순 'p' 만 처리).
  useEffect(() => {
    if (!annotationActive) return undefined;
    const onKey = (e: KeyboardEvent): void => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const target = e.target as HTMLElement | null;
      if (target !== null) {
        const tag = target.tagName;
        if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
        if (target.isContentEditable === true) return;
      }
      const k = e.key.toLowerCase();
      if (k === 'p') {
        setAnnotationMode('pick');
        e.preventDefault();
      } else if (k === 'r') {
        setAnnotationMode('region');
        e.preventDefault();
      }
    };
    window.addEventListener('keydown', onKey);
    return (): void => {
      window.removeEventListener('keydown', onKey);
    };
  }, [annotationActive]);

  // v2.10.0 β-2 — Inspector lifecycle. annotationActive && pick 모드일 때만
  // enable. 모드 전환 / 비활성 / activeTab 변경 시 cleanup. inspector hover/pick
  // event 를 hoverRect / handleAnnotationMark 로 분배.
  useEffect(() => {
    if (!annotationActive) return undefined;
    if (annotationMode !== 'pick') return undefined;
    if (activeTab === null) return undefined;
    const api = typeof window !== 'undefined' ? window.dreampia?.browser : undefined;
    if (
      api?.enableInspector === undefined ||
      api.disableInspector === undefined ||
      api.onInspectorEvent === undefined
    ) {
      return undefined;
    }
    const tabId = activeTab.tab_id;
    void api.enableInspector(tabId);
    const unsub = api.onInspectorEvent((payload: BrowserInspectorPayload) => {
      if (payload.tab_id !== tabId) return;
      const ev = payload.event;
      if (ev.type === 'hover') {
        setHoverRect({ x: ev.x, y: ev.y, w: ev.w, h: ev.h });
        // v2.10.0 β-3 — Hover meta sidecar. Inspector script 가 보내는
        // computed-style 필드를 그대로 카드 prop 으로 forward.
        const meta: AnnotationHoverMeta = {
          tag: ev.tag,
          dimensions: ev.dimensions,
          ...(ev.id !== undefined && { id: ev.id }),
          ...(ev.classes !== undefined && { classes: ev.classes }),
          ...(ev.color !== undefined && { color: ev.color }),
          ...(ev.bg_color !== undefined && { bg_color: ev.bg_color }),
          ...(ev.font !== undefined && { font: ev.font }),
        };
        setHoverMeta(meta);
      } else if (ev.type === 'pick') {
        // Inspector coords are webview-viewport. anchor placeholder 가 webview
        // 와 동일 origin 으로 정렬돼 있어 그대로 overlay 좌표로 사용 가능.
        const box: AnnotationBox = {
          x: Math.round(ev.x),
          y: Math.round(ev.y),
          w: Math.round(ev.w),
          h: Math.round(ev.h),
          captured_at: new Date(ev.ts).toISOString(),
          selector: ev.selector,
          page_url: ev.page_url,
        };
        handleAnnotationMark(box);
      }
    });
    return (): void => {
      unsub();
      void api.disableInspector?.(tabId);
      setHoverRect(null);
      setHoverMeta(null);
    };
  }, [annotationActive, annotationMode, activeTab, handleAnnotationMark]);

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

      {/*
       * v2.4.0 — Inspector toolbar. Floating absolute 버튼들이 empty state 와
       * 충돌하던 문제를 fix: 항상 보이는 header bar 로 통합. 활성 탭이 없으면
       * camera/dom 은 disabled 로 hint, annotation 은 활성 (overlay-only 도구).
       * v2.3.0 까지 ad-hoc absolute 위치였는데 layout shift 일으키고 빈 상태에서
       * 보이지도 않아 user 가 발견 불가했음.
       */}
      {(onAnnotation !== undefined || onScreenshot !== undefined || onDomDump !== undefined) && (
        <div
          className="flex items-center gap-xs border-b border-hairline bg-canvas-soft px-sm py-xxs"
          role="toolbar"
          aria-label={t('preview.aside_aria')}
          data-testid="preview-inspector-toolbar"
        >
          {/* v2.10.0 (.omc/DESIGN.md) — Inspector 식별자 label. 사용자가 toolbar
              가 무엇인지 즉시 인지하도록. */}
          <span className="select-none text-caption-uppercase uppercase text-text-tertiary">
            {t('preview.inspector.label')}
          </span>
          {onAnnotation !== undefined && (
            <button
              type="button"
              onClick={handleAnnotationToggle}
              className={
                annotationActive
                  ? 'rounded-md border border-accent/40 bg-accent-soft px-xs py-xxs text-caption text-accent'
                  : 'rounded-md border border-hairline bg-surface-card px-xs py-xxs text-caption text-text-secondary hover:bg-surface-strong'
              }
              aria-label={t('preview.annotation.start_aria')}
              aria-pressed={annotationActive}
              data-testid="preview-annotation-start"
              title={t('preview.annotation.start_aria')}
            >
              <Ruler aria-hidden="true" className="h-3 w-3" />
            </button>
          )}
          {onScreenshot !== undefined && (
            <button
              type="button"
              onClick={() => {
                void handleCapture();
              }}
              disabled={capturing || activeTab === null}
              className="rounded-md border border-hairline bg-surface-card px-xs py-xxs text-caption text-text-secondary hover:bg-surface-strong disabled:opacity-40 disabled:cursor-not-allowed"
              aria-label={t('preview.screenshot_capture_aria')}
              data-testid="preview-screenshot-capture"
              title={t('preview.screenshot_capture_aria')}
            >
              <Camera className="h-3 w-3" />
            </button>
          )}
          {onDomDump !== undefined && (
            <button
              type="button"
              onClick={() => {
                void handleDumpDom();
              }}
              disabled={activeTab === null}
              className="rounded-md border border-hairline bg-surface-card px-xs py-xxs text-caption text-text-secondary hover:bg-surface-strong disabled:opacity-40 disabled:cursor-not-allowed"
              aria-label={t('preview.dom_dump_capture_aria')}
              data-testid="preview-dom-dump"
              title={t('preview.dom_dump_capture_aria')}
            >
              <Code className="h-3 w-3" />
            </button>
          )}
          {activeTab === null && (
            <span className="ml-xxs text-caption text-text-tertiary">
              {t('preview.inspector.tab_required')}
            </span>
          )}
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
            mode={annotationMode}
            onModeChange={setAnnotationMode}
            hoverRect={hoverRect}
            hoverMeta={hoverMeta}
          />
        )}
      </div>
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
    // v1.1.7 (a11y) — outer container 는 layout 만. tablist role 은 안쪽 div
    // 만 carry — WAI-ARIA 명세: tablist 의 required children 은 role=tab only.
    // 이전엔 같은 element 가 role=tablist + new-tab button 자식 → axe critical
    // (aria-required-children). 새 탭 button 을 tablist 형제로 분리.
    <div className="flex h-9 items-center border-b border-border-primary bg-bg-secondary">
      <div role="tablist" className="flex items-center">
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
      </div>
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
      <div className="flex justify-center text-text-tertiary">
        <Globe aria-hidden="true" className="h-12 w-12" />
      </div>
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
