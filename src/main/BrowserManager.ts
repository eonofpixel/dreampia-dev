/**
 * BrowserManager — main-process owner of in-app browser tabs (P1-5).
 *
 * Spec: docs/session/browser.md
 *
 * One BrowserManager per main process. It creates/owns a WebContentsView
 * per tab, with each session getting an isolated Electron Partition
 * (`persist:dreampia-browser-app-{session_id}` — Codex `codex-browser-app`
 * pattern). Tabs from different sessions never share cookies or storage.
 *
 * Architecture
 * ────────────
 *   tab_id    → ManagedTab { view, listeners, last-known state, bounds }
 *   session_id → tab_id    (active visible tab per session)
 *
 * The renderer reports placeholder bounds via `browser/set-bounds`; only
 * the active tab is attached to `mainWindow.contentView`. Switching tabs
 * detaches the previous and attaches the new at the cached bounds.
 *
 * IPC events from this module reach the renderer via `onTabUpdate` —
 * the consumer (ipc.ts) wraps that into `mainWindow.webContents.send(
 * 'browser/tab-updated', state)`.
 *
 * Iron rule: never throws across the IPC boundary. All public methods
 * are best-effort and degrade silently if the WebContents has been
 * destroyed or the main window is gone.
 */

import {
  app,
  WebContentsView,
  session as electronSession,
  type BrowserWindow,
  type Session as ElectronSession,
  type WebContents,
} from 'electron';
import { mkdir, writeFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import type { SessionId } from '@/types';
import { partitionIdFor } from '@/types';

// ────────────────────────────────────────────────────────────
// Public types (mirrored to renderer via preload)
// ────────────────────────────────────────────────────────────

export interface BrowserTabState {
  tab_id: string;
  session_id: SessionId;
  url: string;
  title: string;
  favicon_url: string | null;
  status: 'loading' | 'ready' | 'failed';
  can_go_back: boolean;
  can_go_forward: boolean;
}

export interface BrowserBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface BrowserManagerOptions {
  /** Function returning the current main BrowserWindow (or null if destroyed). */
  getMainWindow: () => BrowserWindow | null;
  /** Optional: emit per-tab state changes to the renderer. */
  onTabUpdate?: (state: BrowserTabState) => void;
  /**
   * v2.10.0 β-2 (F-021 + F-033) — Inspector event sink. Renderer 가
   * enableInspector 후 webview 안 hover/click 이벤트를 받음. tab_id +
   * session_id 와 함께 forward (renderer 가 자기 tab 인지 필터링).
   */
  onInspectorEvent?: (tabId: string, sessionId: SessionId, event: InspectorEvent) => void;
}

// v2.10.0 β-2 — Inspector event discriminated union. webview 안 inspector
// script 가 push 한 큐를 main 이 drain → 본 형식으로 emit. F-033 spec.
//
// v2.10.0 β-3 (F-033 meta card) — hover / pick 모두 computed-style 메타
// (id / classes / color / bg_color / font / dimensions) 를 동봉. dimensions
// 만 required (항상 채워짐), 나머지는 cross-origin / shadow DOM 같은 환경에서
// 조용히 omit. selector / page_url / ts 는 pick 전용.
export interface InspectorElementMeta {
  /** Element tag name (lowercased). 항상 채워짐. */
  tag: string;
  /** "WxH" — 소수점 round 후 join. 항상 채워짐. */
  dimensions: string;
  /** element.id (없거나 빈 문자열이면 omit). */
  id?: string;
  /** classList → array. 최대 5개 cap. 빈 list 면 omit. */
  classes?: string[];
  /** getComputedStyle.color (rgb/rgba string). 접근 실패 시 omit. */
  color?: string;
  /** getComputedStyle.backgroundColor. */
  bg_color?: string;
  /** "<family> <size>px" — family 의 first comma split 만 사용. */
  font?: string;
}

export type InspectorEvent =
  | ({
      type: 'hover';
      /** viewport-relative bounding rect (CSS px). */
      x: number;
      y: number;
      w: number;
      h: number;
    } & InspectorElementMeta)
  | ({
      type: 'pick';
      /** Auto-generated CSS selector (id > tag.class > nth-of-type chain, max 6). */
      selector: string;
      x: number;
      y: number;
      w: number;
      h: number;
      /** Picked element's owner document URL. */
      page_url: string;
      /** Picked epoch ms (webview clock). */
      ts: number;
    } & InspectorElementMeta);

// ────────────────────────────────────────────────────────────
// Internal types
// ────────────────────────────────────────────────────────────

interface ManagedTab {
  tab_id: string;
  session_id: SessionId;
  view: WebContentsView;
  state: BrowserTabState;
  bounds: BrowserBounds | null;
  attached: boolean;
  emitState: (patch?: Partial<BrowserTabState>) => void;
  detachListeners: () => void;
  /**
   * v2.10.0 β-2 hardening (P1-3 — nav re-arm) — Inspector active 중 페이지
   * navigation (link click / F5) 시 새 document 가 `window.__dreampia_inspector_*`
   * 를 잃는다. enableInspector 가 본 listener 를 `did-finish-load` 에 attach 해
   * 재주입한다. disableInspector / closeTab / shutdown 이 detach.
   */
  inspectorNavListener?: () => void;
  /**
   * v2.10.0 β-2 hardening (P0-2 — drain reentrancy) — interval tick 이
   * executeJavaScript Promise 미해소 상태로 또 fire 하면 큐가 piling.
   * tick 시 in-flight 면 skip, resolve/reject 후 false 로 clear.
   */
  inspectorDrainInFlight?: boolean;
}

// ────────────────────────────────────────────────────────────
// Helpers
// ────────────────────────────────────────────────────────────

/** Best-effort access to a WebContents method. Some calls are flaky after
 * destroy; we swallow any error since the IPC handler must not throw. */
function safeCall<T>(fn: () => T, fallback: T): T {
  try {
    return fn();
  } catch {
    return fallback;
  }
}

function readNavState(wc: WebContents): {
  can_go_back: boolean;
  can_go_forward: boolean;
} {
  // navigationHistory is the modern Electron 33 API. Fall back to the
  // deprecated direct webContents methods if a future Electron drops them.
  const nav = (wc as { navigationHistory?: { canGoBack(): boolean; canGoForward(): boolean } })
    .navigationHistory;
  if (nav) {
    return {
      can_go_back: safeCall(() => nav.canGoBack(), false),
      can_go_forward: safeCall(() => nav.canGoForward(), false),
    };
  }
  const legacy = wc as unknown as { canGoBack?: () => boolean; canGoForward?: () => boolean };
  return {
    can_go_back: safeCall(() => legacy.canGoBack?.() ?? false, false),
    can_go_forward: safeCall(() => legacy.canGoForward?.() ?? false, false),
  };
}

function normalizeAllowedBrowserUrl(rawUrl: string): string | null {
  const trimmed = rawUrl.trim();
  if (trimmed.toLowerCase() === 'about:blank') return 'about:blank';

  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol === 'http:' || parsed.protocol === 'https:') {
      return trimmed;
    }
  } catch {
    return null;
  }

  return null;
}

/**
 * v2.10.0 β-2 — Validate raw drain payload from inspector script. The script
 * runs untrusted page JS context (we control the source but a hostile page
 * could overwrite the queue), so each event is shape-checked before forward.
 *
 * v2.10.0 β-2 hardening — drain JSON shape moved from a flat event array to
 * `{ hover: Event|null, picks: Event[] }`. The single-event path still goes
 * through this validator (called once per hover, once per pick element).
 */
function parseInspectorEvent(raw: unknown): InspectorEvent | null {
  if (raw === null || typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;
  const t = o['type'];
  const x = o['x'];
  const y = o['y'];
  const w = o['w'];
  const h = o['h'];
  const tag = o['tag'];
  const dimensions = o['dimensions'];
  if (
    typeof x !== 'number' ||
    typeof y !== 'number' ||
    typeof w !== 'number' ||
    typeof h !== 'number' ||
    typeof tag !== 'string' ||
    typeof dimensions !== 'string'
  ) {
    return null;
  }
  // v2.10.0 β-3 — Optional computed-style meta fields. Each field validated
  // independently — a single bad field doesn't reject the whole event; we
  // just omit it. cross-origin iframe / shadow DOM 환경에서 일부 필드가
  // 빠지는 정상 경로를 받아주기 위함.
  const meta: Omit<InspectorElementMeta, 'tag' | 'dimensions'> = {};
  const rawId = o['id'];
  if (typeof rawId === 'string' && rawId.length > 0) meta.id = rawId;
  const rawClasses = o['classes'];
  if (Array.isArray(rawClasses)) {
    const cls = rawClasses.filter((c): c is string => typeof c === 'string').slice(0, 5);
    if (cls.length > 0) meta.classes = cls;
  }
  const rawColor = o['color'];
  if (typeof rawColor === 'string' && rawColor.length > 0) meta.color = rawColor;
  const rawBg = o['bg_color'];
  if (typeof rawBg === 'string' && rawBg.length > 0) meta.bg_color = rawBg;
  const rawFont = o['font'];
  if (typeof rawFont === 'string' && rawFont.length > 0) meta.font = rawFont;

  if (t === 'hover') {
    return { type: 'hover', x, y, w, h, tag, dimensions, ...meta };
  }
  if (t === 'pick') {
    const selector = o['selector'];
    const page_url = o['page_url'];
    const ts = o['ts'];
    if (typeof selector !== 'string' || typeof page_url !== 'string' || typeof ts !== 'number') {
      return null;
    }
    return {
      type: 'pick',
      selector,
      x,
      y,
      w,
      h,
      tag,
      dimensions,
      page_url,
      ts,
      ...meta,
    };
  }
  return null;
}

function denyBrowserSessionPermissions(sess: ElectronSession): void {
  const maybeSession = sess as ElectronSession & {
    setPermissionCheckHandler?: (handler: () => boolean) => void;
  };
  try {
    maybeSession.setPermissionRequestHandler((_wc, _permission, callback) => {
      callback(false);
    });
  } catch {
    // Best effort. Older Electron versions can differ here.
  }
  try {
    maybeSession.setPermissionCheckHandler?.(() => false);
  } catch {
    // Best effort.
  }
}

// ────────────────────────────────────────────────────────────
// BrowserManager
// ────────────────────────────────────────────────────────────

// v2.10.0 β-2 (F-033) — Webview-side inspector script. main 이
// `webContents.executeJavaScript(INSPECTOR_SCRIPT)` 으로 inject. dashed
// overlay div 그리기 + hover/click 이벤트를 in-page 큐에 push. main 이 50ms
// 마다 `__dreampia_inspector_drain()` 호출해 fetch.
//
// Why polling and not preload IPC: BrowserManager 의 WebContentsView 는
// preload 없이 sandbox=true 로 생성 (그대로 둔다 — preload 추가는 permission
// model 영향이 큼). executeJavaScript 가 가장 변경 폭 작은 방법. Codex
// chrome-recorder 도 같은 패턴.
//
// v2.10.0 β-2 hardening (architect P0-1):
//   - Queue split into hover (latest-only, ring-of-1 overwrite-on-push) and
//     picks (FIFO, cap 16). Previous single-queue (cap 32, shift-on-overflow)
//     could evict a `pick` under fast hover storms — sad path for the very
//     event we care most about. 16 click overflow is essentially unreachable
//     in normal use; pick eviction is acceptable.
//   - drain returns `{ hover: latest|null, picks: [...] }` JSON.
//
// v2.10.0 β-2 hardening (architect P1-4):
//   - `__dreampia_inspector_uninstall` added. Capture-phase listeners stay
//     attached even when active=false (current code's active guard is the
//     first statement, so user clicks pass through). disableInspector does
//     NOT call uninstall — re-enable cost stays zero. closeTab/shutdown
//     paths can call it explicitly; in practice the webContents is being
//     torn down anyway so it's defensive-only, but the contract is now
//     explicit if the inspector script ever sprouts non-no-op listeners.
//
// Cross-origin iframe targets are NOT covered — document-level capture-phase
// listeners 가 닿지 않음. β-2 known limitation; β-3 (또는 docs PR) 에서 별도
// 처리 (each-frame inject) 검토.
const INSPECTOR_SCRIPT = `(function(){
  if (window.__dreampia_inspector_installed) return;
  window.__dreampia_inspector_installed = true;
  // v2.10.0 β-2 hardening (P0-1) — split queues. hover = latest only.
  window.__dreampia_inspector_hover_latest = null;
  window.__dreampia_inspector_picks = [];
  window.__dreampia_inspector_active = false;

  var overlay = document.createElement('div');
  overlay.setAttribute('data-dreampia-inspector', '');
  overlay.style.cssText = 'position:fixed;pointer-events:none;z-index:2147483647;border:2px dashed #f54e00;background:rgba(245,78,0,0.08);display:none;box-sizing:border-box;transition:all 0.05s linear;';
  document.documentElement.appendChild(overlay);

  // NOTE: generateSelector 결과는 annotation hint 용 — renderer 가 이걸로
  // "re-pick 가능한 locator" 처럼 사용하면 안 된다. uniqueness 보장 X
  // (sibling 카운트 변동 / 동적 클래스명 등으로 stale 가능). AI 가 사람에게
  // "이 element" 를 가리키는 단서로만 활용.
  function generateSelector(el){
    if (!el || el === document.documentElement) return 'html';
    if (el.id) return '#' + CSS.escape(el.id);
    var parts = [];
    var node = el;
    while (node && node.nodeType === 1 && node !== document.documentElement){
      var part = node.tagName.toLowerCase();
      if (node.classList && node.classList.length){
        var cls = Array.prototype.slice.call(node.classList).filter(function(c){return c && !/^[0-9]/.test(c);}).slice(0,3);
        if (cls.length) part += '.' + cls.map(function(c){return CSS.escape(c);}).join('.');
      }
      var parent = node.parentElement;
      if (parent){
        var siblings = Array.prototype.slice.call(parent.children).filter(function(s){return s.tagName === node.tagName;});
        if (siblings.length > 1){
          part += ':nth-of-type(' + (siblings.indexOf(node)+1) + ')';
        }
      }
      parts.unshift(part);
      if (parts.length >= 6) break;
      node = parent;
    }
    return parts.join(' > ');
  }

  function pushPick(e){
    var picks = window.__dreampia_inspector_picks;
    // cap 16 — overflow oldest drop. 16 누적 클릭은 실용상 도달 X.
    if (picks.length >= 16) picks.shift();
    picks.push(e);
  }

  // v2.10.0 β-3 (F-033 meta card) — Extract computed-style meta. dimensions
  // always set; remaining fields omitted when getComputedStyle fails (cross-
  // origin iframe / closed shadow root). classList capped at 5 entries so the
  // host-side card has stable width.
  function extractMeta(el, rect){
    var meta = {
      tag: el.tagName.toLowerCase(),
      dimensions: Math.round(rect.width) + 'x' + Math.round(rect.height)
    };
    try {
      if (typeof el.id === 'string' && el.id.length > 0) meta.id = el.id;
    } catch (e) {}
    try {
      if (el.classList && el.classList.length > 0){
        var cls = [];
        for (var i = 0; i < el.classList.length && cls.length < 5; i++){
          var c = el.classList[i];
          if (typeof c === 'string' && c.length > 0) cls.push(c);
        }
        if (cls.length > 0) meta.classes = cls;
      }
    } catch (e) {}
    try {
      var cs = window.getComputedStyle(el);
      if (cs){
        if (cs.color) meta.color = cs.color;
        if (cs.backgroundColor) meta.bg_color = cs.backgroundColor;
        var fam = (cs.fontFamily || '').split(',')[0];
        if (fam) fam = fam.replace(/^["'\\s]+|["'\\s]+$/g, '');
        var size = cs.fontSize || '';
        if (fam || size) meta.font = (fam + ' ' + size).trim();
      }
    } catch (e) {}
    return meta;
  }

  function onMove(e){
    if (!window.__dreampia_inspector_active) return;
    var t = e.target;
    if (!t || t === overlay) return;
    var r = t.getBoundingClientRect();
    overlay.style.display = 'block';
    overlay.style.left = r.left + 'px';
    overlay.style.top = r.top + 'px';
    overlay.style.width = r.width + 'px';
    overlay.style.height = r.height + 'px';
    var meta = extractMeta(t, r);
    // Latest-only ring buffer of size 1 — overwrite on every push so a hover
    // storm 이 pick 큐를 누르지 못한다 (architect P0-1).
    var ev = { type:'hover', x:r.left, y:r.top, w:r.width, h:r.height };
    for (var k in meta){ if (Object.prototype.hasOwnProperty.call(meta, k)) ev[k] = meta[k]; }
    window.__dreampia_inspector_hover_latest = ev;
  }

  function onClick(e){
    if (!window.__dreampia_inspector_active) return;
    e.preventDefault();
    e.stopPropagation();
    var t = e.target;
    if (!t) return;
    var r = t.getBoundingClientRect();
    var meta = extractMeta(t, r);
    var ev = {
      type:'pick',
      selector: generateSelector(t),
      x:r.left, y:r.top, w:r.width, h:r.height,
      page_url: location.href,
      ts: Date.now()
    };
    for (var k in meta){ if (Object.prototype.hasOwnProperty.call(meta, k)) ev[k] = meta[k]; }
    pushPick(ev);
  }

  document.addEventListener('mousemove', onMove, true);
  document.addEventListener('click', onClick, true);

  window.__dreampia_inspector_enable = function(){ window.__dreampia_inspector_active = true; };
  window.__dreampia_inspector_disable = function(){
    window.__dreampia_inspector_active = false;
    overlay.style.display = 'none';
    // hover latest 비움 — 재활성화 시 stale outline 방지.
    window.__dreampia_inspector_hover_latest = null;
  };
  // v2.10.0 β-2 hardening (P1-4) — explicit uninstall. disableInspector 가
  // 호출하지 않음 (re-enable 비용 회피). closeTab / shutdown 시 호출 — 사실상
  // webContents 가 폐기되므로 noop 이지만 contract 명시화.
  window.__dreampia_inspector_uninstall = function(){
    try { document.removeEventListener('mousemove', onMove, true); } catch (e) {}
    try { document.removeEventListener('click', onClick, true); } catch (e) {}
    try { if (overlay && overlay.parentNode) overlay.parentNode.removeChild(overlay); } catch (e) {}
    window.__dreampia_inspector_active = false;
    window.__dreampia_inspector_installed = false;
    window.__dreampia_inspector_hover_latest = null;
    window.__dreampia_inspector_picks = [];
  };
  window.__dreampia_inspector_drain = function(){
    var hover = window.__dreampia_inspector_hover_latest;
    window.__dreampia_inspector_hover_latest = null;
    var picks = window.__dreampia_inspector_picks;
    window.__dreampia_inspector_picks = [];
    return JSON.stringify({ hover: hover, picks: picks });
  };
})();`;

/** Drain poll interval — 50ms keeps hover latency under one paint frame at 60Hz. */
const INSPECTOR_POLL_MS = 50;

export class BrowserManager {
  private readonly tabs = new Map<string, ManagedTab>();
  private readonly activeTabBySession = new Map<SessionId, string>();
  /** v2.10.0 β-2 — tab_id → drain interval. inspector active 일 때만 set. */
  private readonly inspectorIntervals = new Map<string, NodeJS.Timeout>();

  constructor(private readonly opts: BrowserManagerOptions) {}

  // ── lifecycle ──────────────────────────────────────────────

  /**
   * Create a new tab for a session at a URL. The view is constructed but
   * NOT attached to the main window — the renderer must call setBounds()
   * (which auto-attaches when this tab is active) before content is visible.
   */
  openTab(args: { session_id: SessionId; tab_id: string; url: string }): BrowserTabState {
    if (this.tabs.has(args.tab_id)) {
      // Idempotent: return existing state. Caller can decide whether to navigate.
      const existing = this.tabs.get(args.tab_id);
      if (existing) return existing.state;
    }

    const partition = partitionIdFor(args.session_id);
    const sess = electronSession.fromPartition(partition);
    denyBrowserSessionPermissions(sess);
    const safeInitialUrl = normalizeAllowedBrowserUrl(args.url);

    const view = new WebContentsView({
      webPreferences: {
        session: sess,
        sandbox: true,
        contextIsolation: true,
        nodeIntegration: false,
      },
    });

    const wc = view.webContents;
    const initialState: BrowserTabState = {
      tab_id: args.tab_id,
      session_id: args.session_id,
      url: safeInitialUrl ?? args.url,
      title: safeInitialUrl === null ? 'Blocked URL' : 'Loading...',
      favicon_url: null,
      status: safeInitialUrl === null ? 'failed' : 'loading',
      can_go_back: false,
      can_go_forward: false,
    };

    const tab: ManagedTab = {
      tab_id: args.tab_id,
      session_id: args.session_id,
      view,
      state: initialState,
      bounds: null,
      attached: false,
      emitState: () => {},
      detachListeners: () => {},
    };
    this.tabs.set(args.tab_id, tab);

    // Build state diff-emitter. We always re-read the live URL/title from
    // webContents (after navigation, the supplied `url` lags reality).
    const emit = (patch: Partial<BrowserTabState> = {}): void => {
      if (wc.isDestroyed()) return;
      const nav = readNavState(wc);
      tab.state = {
        ...tab.state,
        ...patch,
        url: safeCall(() => wc.getURL(), tab.state.url) || tab.state.url,
        title: safeCall(() => wc.getTitle(), tab.state.title) || tab.state.title,
        can_go_back: nav.can_go_back,
        can_go_forward: nav.can_go_forward,
      };
      try {
        this.opts.onTabUpdate?.(tab.state);
      } catch {
        // Listener errors must never bubble into Electron event loops.
      }
    };
    tab.emitState = emit;

    const onLoadStart = (): void => emit({ status: 'loading' });
    const onLoadEnd = (): void => emit({ status: 'ready' });
    const onLoadFail = (_event: unknown, errorCode?: number): void => {
      if (errorCode === -3) return; // ERR_ABORTED during a normal redirect/navigation.
      emit({ status: 'failed' });
    };
    const onTitleChange = (_e: unknown, title: string): void => emit({ title });
    const onFaviconChange = (_e: unknown, favicons: string[]): void =>
      emit({ favicon_url: favicons[0] ?? null });
    const onWillNavigate = (event: { preventDefault?: () => void }, url: string): void => {
      if (normalizeAllowedBrowserUrl(url) !== null) return;
      event.preventDefault?.();
      emit({ status: 'failed', title: 'Blocked URL' });
    };

    wc.setWindowOpenHandler(() => ({ action: 'deny' }));
    wc.on('did-start-loading', onLoadStart);
    wc.on('did-finish-load', onLoadEnd);
    wc.on('did-fail-load', onLoadFail);
    wc.on('page-title-updated', onTitleChange);
    wc.on('page-favicon-updated', onFaviconChange);
    wc.on('will-navigate', onWillNavigate);

    tab.detachListeners = (): void => {
      try {
        wc.off('did-start-loading', onLoadStart);
        wc.off('did-finish-load', onLoadEnd);
        wc.off('did-fail-load', onLoadFail);
        wc.off('page-title-updated', onTitleChange);
        wc.off('page-favicon-updated', onFaviconChange);
        wc.off('will-navigate', onWillNavigate);
      } catch {
        // already destroyed — harmless
      }
    };

    // Kick off the initial load. Failures route through the same emit pipeline.
    if (safeInitialUrl !== null) {
      void wc.loadURL(safeInitialUrl).catch(() => emit({ status: 'failed' }));
    }

    return tab.state;
  }

  /** Tear down a single tab — removes from window, releases listeners + WebContents. */
  closeTab(tab_id: string): void {
    const tab = this.tabs.get(tab_id);
    if (!tab) return;

    // v2.10.0 β-2 — inspector polling 도 stop. wc 가 사라지기 전에 정리.
    this.stopInspectorPolling(tab_id);
    // v2.10.0 β-2 hardening (P1-3) — did-finish-load re-arm listener detach.
    this.detachInspectorNavListener(tab);
    // v2.10.0 β-2 hardening (P1-4) — explicit in-page uninstall. webContents
    // 가 곧 close 되므로 사실상 noop 이지만 contract 명시화.
    this.tryUninstallInspector(tab);

    this.detachFromWindow(tab);
    tab.detachListeners();

    if (!tab.view.webContents.isDestroyed()) {
      // close() is the documented Electron 33 way to release a WebContents
      // (same as window.close() inside the page). It triggers the `destroyed`
      // event; the partition's on-disk cookies survive (`persist:` prefix).
      safeCall(() => tab.view.webContents.close(), undefined);
    }

    this.tabs.delete(tab_id);
    if (this.activeTabBySession.get(tab.session_id) === tab_id) {
      this.activeTabBySession.delete(tab.session_id);
    }
  }

  /** Switch the visible tab for a session. No-op if tab_id doesn't belong to session. */
  switchTab(session_id: SessionId, tab_id: string): void {
    const newTab = this.tabs.get(tab_id);
    if (!newTab) return;
    if (newTab.session_id !== session_id) return;

    const prevTabId = this.activeTabBySession.get(session_id);
    if (prevTabId && prevTabId !== tab_id) {
      const prev = this.tabs.get(prevTabId);
      if (prev) this.detachFromWindow(prev);
    }

    this.activeTabBySession.set(session_id, tab_id);
    if (newTab.bounds) {
      this.attachToWindow(newTab, newTab.bounds);
    }
  }

  // ── navigation ────────────────────────────────────────────

  navigate(tab_id: string, url: string): void {
    const tab = this.tabs.get(tab_id);
    if (!tab) return;
    if (tab.view.webContents.isDestroyed()) return;
    const safeUrl = normalizeAllowedBrowserUrl(url);
    if (safeUrl === null) {
      tab.emitState({ status: 'failed', title: 'Blocked URL' });
      return;
    }
    tab.emitState({ status: 'loading', url: safeUrl });
    void tab.view.webContents.loadURL(safeUrl).catch(() => {
      tab.emitState({ status: 'failed', url: safeUrl });
    });
  }

  goBack(tab_id: string): void {
    const tab = this.tabs.get(tab_id);
    if (!tab) return;
    const wc = tab.view.webContents;
    if (wc.isDestroyed()) return;
    const nav = (wc as { navigationHistory?: { canGoBack(): boolean; goBack(): void } })
      .navigationHistory;
    if (nav) {
      if (nav.canGoBack()) safeCall(() => nav.goBack(), undefined);
      return;
    }
    // Legacy fallback (should not happen on Electron 33+)
    const legacy = wc as unknown as { canGoBack?: () => boolean; goBack?: () => void };
    if (legacy.canGoBack?.()) safeCall(() => legacy.goBack?.(), undefined);
  }

  goForward(tab_id: string): void {
    const tab = this.tabs.get(tab_id);
    if (!tab) return;
    const wc = tab.view.webContents;
    if (wc.isDestroyed()) return;
    const nav = (wc as { navigationHistory?: { canGoForward(): boolean; goForward(): void } })
      .navigationHistory;
    if (nav) {
      if (nav.canGoForward()) safeCall(() => nav.goForward(), undefined);
      return;
    }
    const legacy = wc as unknown as { canGoForward?: () => boolean; goForward?: () => void };
    if (legacy.canGoForward?.()) safeCall(() => legacy.goForward?.(), undefined);
  }

  reload(tab_id: string): void {
    const tab = this.tabs.get(tab_id);
    if (!tab) return;
    if (tab.view.webContents.isDestroyed()) return;
    try {
      tab.emitState({ status: 'loading' });
      tab.view.webContents.reload();
    } catch {
      tab.emitState({ status: 'failed' });
    }
  }

  /**
   * v1.6.14 — Capture a structural DOM dump from the active tab. webview 의
   * 별도 process 라 renderer 가 직접 접근 불가 — webContents.executeJavaScript
   * 를 통해 평가된 결과를 받아옴. 결과는 stringified DomDumpNode tree.
   *
   * 옵션:
   *  - selector: 캡처 대상 element 의 CSS selector (default 'body').
   *  - maxDepth / maxText: domDump.ts 와 동일 의미.
   */
  async dumpTabDom(
    tab_id: string,
    options: { selector?: string; maxDepth?: number; maxText?: number } = {}
  ): Promise<{ url: string; selector: string; dump_json: string } | null> {
    const tab = this.tabs.get(tab_id);
    if (!tab) return null;
    const wc = tab.view.webContents as {
      isDestroyed(): boolean;
      executeJavaScript?: (code: string, userGesture?: boolean) => Promise<unknown>;
      getURL?: () => string;
    };
    if (wc.isDestroyed()) return null;
    if (typeof wc.executeJavaScript !== 'function') return null;
    const selector = options.selector ?? 'body';
    const maxDepth = options.maxDepth ?? 3;
    const maxText = options.maxText ?? 200;
    // Self-contained snippet — renderer 의 domDump.ts 미사용 (webview process 는
    // 별도). 단순한 inline 직렬화 — depth/text cap 만 적용.
    const code = `(function () {
      try {
        var el = document.querySelector(${JSON.stringify(selector)});
        if (!el) return null;
        function dump(node, depth) {
          var out = { tag: node.tagName.toLowerCase() };
          if (node.id) out.id = node.id;
          if (node.classList && node.classList.length > 0) out.classes = Array.prototype.slice.call(node.classList);
          var attrs = {};
          for (var i = 0; i < node.attributes.length; i++) {
            var a = node.attributes[i];
            if (a.name === 'id' || a.name === 'class' || a.name === 'style') continue;
            attrs[a.name] = (a.value || '').slice(0, 100);
          }
          if (Object.keys(attrs).length > 0) out.attrs = attrs;
          var text = '';
          for (var j = 0; j < node.childNodes.length; j++) {
            var c = node.childNodes[j];
            if (c.nodeType === 3) text += c.nodeValue || '';
          }
          text = text.trim();
          if (text.length > 0) out.text = text.length > ${maxText} ? text.slice(0, ${maxText}) + '…' : text;
          if (depth < ${maxDepth}) {
            var children = [];
            for (var k = 0; k < node.children.length; k++) {
              children.push(dump(node.children[k], depth + 1));
            }
            if (children.length > 0) out.children = children;
          } else if (node.children.length > 0) {
            out.truncated = true;
          }
          return out;
        }
        return JSON.stringify(dump(el, 0));
      } catch (e) {
        return null;
      }
    })();`;
    try {
      const result = await wc.executeJavaScript(code);
      if (typeof result !== 'string') return null;
      const url = typeof wc.getURL === 'function' ? wc.getURL() : '';
      return { url, selector, dump_json: result };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.warn(`[BrowserManager] dumpTabDom(${tab_id}) failed: ${msg}`);
      return null;
    }
  }

  /**
   * v1.6.1 — Capture the visible page as a PNG. Returns base64-encoded PNG
   * bytes (no `data:` prefix — caller decides whether to embed or save).
   *
   * - Tab 미존재 / 파괴된 webContents → null.
   * - capturePage() 실패 → null + console.warn (사용자 액션이라 silent fail
   *   허용; renderer 가 toast 처리).
   *
   * Electron NativeImage 의 `toPNG()` 는 Buffer 반환. base64 변환은 caller
   * 가 결정 가능하지만 IPC 직렬화 호환을 위해 본 메서드는 base64 string 반환.
   */
  async captureTab(
    tab_id: string
  ): Promise<{ png_base64: string; width: number; height: number } | null> {
    const tab = this.tabs.get(tab_id);
    if (!tab) return null;
    const wc = tab.view.webContents as {
      isDestroyed(): boolean;
      capturePage?: () => Promise<{
        toPNG(): Buffer | Uint8Array;
        getSize(): { width: number; height: number };
      }>;
    };
    if (wc.isDestroyed()) return null;
    if (typeof wc.capturePage !== 'function') return null;
    try {
      const image = await wc.capturePage();
      const png = image.toPNG();
      const buf = png instanceof Buffer ? png : Buffer.from(png);
      const size = image.getSize();
      return {
        png_base64: buf.toString('base64'),
        width: size.width,
        height: size.height,
      };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.warn(`[BrowserManager] captureTab(${tab_id}) failed: ${msg}`);
      return null;
    }
  }

  /**
   * v2.10.0 β-3 (F-021 partial screenshot) — Capture a rectangular region of
   * the webview. bbox coords are viewport-relative CSS px (same as inspector
   * `getBoundingClientRect` output). On success the PNG is written to
   * `app.getPath('userData')/annotations/<sessionId>/<uuid>.png` and the
   * file:// URI returned alongside base64 for renderer-side preview without
   * a second disk read.
   *
   * Iron rule: never throws across IPC. capturePage / fs failures → null +
   * console.warn; renderer falls back to annotation block without screenshot.
   *
   * bbox is clamped to the live webview viewport bounds before the capture
   * call so partial overflow (overlay drawing past the right edge) does not
   * cause an Electron rejection.
   */
  async captureRegion(
    tab_id: string,
    bbox: { x: number; y: number; w: number; h: number }
  ): Promise<{ uri: string; png_base64: string; width: number; height: number } | null> {
    const tab = this.tabs.get(tab_id);
    if (!tab) return null;
    const wc = tab.view.webContents as {
      isDestroyed(): boolean;
      capturePage?: (rect?: {
        x: number;
        y: number;
        width: number;
        height: number;
      }) => Promise<{
        toPNG(): Buffer | Uint8Array;
        getSize(): { width: number; height: number };
      }>;
    };
    if (wc.isDestroyed()) return null;
    if (typeof wc.capturePage !== 'function') return null;

    // Clamp the rect to the tab's known bounds (renderer-reported placeholder
    // geometry). Without this, Electron rejects out-of-bounds capture rects.
    const tabBounds = tab.bounds;
    const viewportW = tabBounds?.width ?? Number.POSITIVE_INFINITY;
    const viewportH = tabBounds?.height ?? Number.POSITIVE_INFINITY;
    const x = Math.max(0, Math.round(bbox.x));
    const y = Math.max(0, Math.round(bbox.y));
    let width = Math.max(0, Math.round(bbox.w));
    let height = Math.max(0, Math.round(bbox.h));
    if (Number.isFinite(viewportW)) width = Math.max(0, Math.min(width, viewportW - x));
    if (Number.isFinite(viewportH)) height = Math.max(0, Math.min(height, viewportH - y));
    if (width <= 0 || height <= 0) return null;

    let pngBuf: Buffer;
    let size: { width: number; height: number };
    try {
      const image = await wc.capturePage({ x, y, width, height });
      const png = image.toPNG();
      pngBuf = png instanceof Buffer ? png : Buffer.from(png);
      size = image.getSize();
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.warn(`[BrowserManager] captureRegion(${tab_id}) capturePage failed: ${msg}`);
      return null;
    }

    // Persist to userData/annotations/<session>/<uuid>.png. Filename uses
    // crypto.randomUUID so concurrent picks never collide.
    try {
      const userData = app.getPath('userData');
      const dir = join(userData, 'annotations', String(tab.session_id));
      await mkdir(dir, { recursive: true });
      const filePath = join(dir, `${randomUUID()}.png`);
      await writeFile(filePath, pngBuf);
      // pathToFileURL handles Windows drive-letter + spaces correctly.
      const uri = pathToFileURL(filePath).toString();
      return {
        uri,
        png_base64: pngBuf.toString('base64'),
        width: size.width,
        height: size.height,
      };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.warn(`[BrowserManager] captureRegion(${tab_id}) fs write failed: ${msg}`);
      return null;
    }
  }

  // ── v2.10.0 β-2 (F-021 + F-033) — Inspector / element pick ──

  /**
   * Inject (idempotent) the inspector script into a tab's webContents and
   * start polling the in-page event queue. Hovering or clicking inside the
   * webview after this call forwards {hover,pick} events to
   * `opts.onInspectorEvent`.
   *
   * Iron rule (BrowserManager): executeJavaScript failures must not throw
   * across IPC — log + best-effort. The caller's renderer simply sees no
   * inspector events.
   */
  async enableInspector(tab_id: string): Promise<void> {
    const tab = this.tabs.get(tab_id);
    if (!tab) return;
    const wc = tab.view.webContents as {
      isDestroyed(): boolean;
      executeJavaScript?: (code: string, userGesture?: boolean) => Promise<unknown>;
      on?: (event: string, listener: (...args: unknown[]) => void) => unknown;
      off?: (event: string, listener: (...args: unknown[]) => void) => unknown;
    };
    if (wc.isDestroyed()) return;
    if (typeof wc.executeJavaScript !== 'function') return;

    try {
      // 두 번째 호출은 idempotent — script 안 `__dreampia_inspector_installed`
      // 플래그가 막아준다. enable flip 만 매번 수행.
      await wc.executeJavaScript(INSPECTOR_SCRIPT);
      await wc.executeJavaScript(
        'window.__dreampia_inspector_enable && window.__dreampia_inspector_enable();'
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.warn(`[BrowserManager] enableInspector(${tab_id}) inject failed: ${msg}`);
      return;
    }

    // v2.10.0 β-2 hardening (architect P1-3) — re-arm on navigation.
    // User-driven nav (link click / F5 / programmatic loadURL) destroys the
    // old document → `window.__dreampia_inspector_*` evaporates. Re-attach
    // via `did-finish-load` so inspector keeps working across pages.
    if (tab.inspectorNavListener === undefined && typeof wc.on === 'function') {
      const navListener = (): void => {
        const live = this.tabs.get(tab_id);
        if (!live) return;
        const liveWc = live.view.webContents as {
          isDestroyed(): boolean;
          executeJavaScript?: (code: string) => Promise<unknown>;
        };
        if (liveWc.isDestroyed()) return;
        if (typeof liveWc.executeJavaScript !== 'function') return;
        // Polling 은 이미 돌고 있다 — 다음 tick 이 새 document 의 큐를 본다.
        // 우리는 script + active flag 만 새 document 에 다시 inject.
        liveWc
          .executeJavaScript(INSPECTOR_SCRIPT)
          .then(() =>
            liveWc.executeJavaScript!(
              'window.__dreampia_inspector_enable && window.__dreampia_inspector_enable();'
            )
          )
          .catch((err: unknown) => {
            const msg = err instanceof Error ? err.message : String(err);
            console.warn(
              `[BrowserManager] inspector re-inject after navigation(${tab_id}) failed: ${msg}`
            );
          });
      };
      tab.inspectorNavListener = navListener;
      try {
        wc.on('did-finish-load', navListener);
      } catch {
        // wc may have been destroyed in race — accept silently.
        tab.inspectorNavListener = undefined;
      }
    }

    // 기존 polling 있으면 그대로 사용 — 두 번 시작하지 않음.
    if (this.inspectorIntervals.has(tab_id)) return;

    // v2.10.0 β-2 hardening (architect P0-2) — drain reentrancy guard.
    // Reset the per-tab flag; a stale `true` from a previous enable can never
    // happen in practice (disable clears it), but be defensive.
    tab.inspectorDrainInFlight = false;

    const interval = setInterval((): void => {
      // tab 이 사라졌거나 wc 가 파괴됐으면 polling 종료.
      const live = this.tabs.get(tab_id);
      const liveWc = live?.view.webContents as
        | { isDestroyed(): boolean; executeJavaScript?: (code: string) => Promise<unknown> }
        | undefined;
      if (
        !live ||
        !liveWc ||
        liveWc.isDestroyed() ||
        typeof liveWc.executeJavaScript !== 'function'
      ) {
        this.stopInspectorPolling(tab_id);
        return;
      }
      // architect P0-2: skip when a previous drain has not resolved. Page
      // stall 시 setInterval 이 Promise 를 piling 하지 않도록.
      if (live.inspectorDrainInFlight === true) return;
      live.inspectorDrainInFlight = true;
      liveWc
        .executeJavaScript(
          'window.__dreampia_inspector_drain ? window.__dreampia_inspector_drain() : null'
        )
        .then((raw) => {
          try {
            if (typeof raw !== 'string' || raw.length === 0) return;
            let parsedJson: unknown;
            try {
              parsedJson = JSON.parse(raw);
            } catch {
              return;
            }
            // v2.10.0 β-2 hardening (architect P0-1) — drain JSON shape
            // changed from flat array → `{ hover, picks }`. Forward hover
            // (if any) first then each pick in FIFO order.
            if (parsedJson === null || typeof parsedJson !== 'object') return;
            const obj = parsedJson as { hover?: unknown; picks?: unknown };
            const hoverParsed = parseInspectorEvent(obj.hover);
            if (hoverParsed !== null) {
              try {
                this.opts.onInspectorEvent?.(tab_id, live.session_id, hoverParsed);
              } catch {
                // Listener errors must never bubble into the timer loop.
              }
            }
            if (Array.isArray(obj.picks)) {
              for (const raw_pick of obj.picks) {
                const parsed = parseInspectorEvent(raw_pick);
                if (parsed === null) continue;
                try {
                  this.opts.onInspectorEvent?.(tab_id, live.session_id, parsed);
                } catch {
                  // Listener errors must never bubble into the timer loop.
                }
              }
            }
          } finally {
            // P0-2: clear flag on the live tab (may differ from `tab` if a
            // racing close/reopen replaced it — `live` is the freshest ref).
            const stillLive = this.tabs.get(tab_id);
            if (stillLive !== undefined) stillLive.inspectorDrainInFlight = false;
          }
        })
        .catch(() => {
          // executeJavaScript 가 transient 실패 — 다음 tick 에 재시도.
          const stillLive = this.tabs.get(tab_id);
          if (stillLive !== undefined) stillLive.inspectorDrainInFlight = false;
        });
    }, INSPECTOR_POLL_MS);
    this.inspectorIntervals.set(tab_id, interval);
  }

  /** Stop polling + flip the in-page `active` flag off + hide overlay. */
  async disableInspector(tab_id: string): Promise<void> {
    this.stopInspectorPolling(tab_id);
    const tab = this.tabs.get(tab_id);
    if (!tab) return;
    // v2.10.0 β-2 hardening (P1-3) — disable detaches the nav listener so
    // inspector stays off after subsequent navigations.
    this.detachInspectorNavListener(tab);
    // P0-2: clear any stale drain-in-flight flag — the next enable starts fresh.
    tab.inspectorDrainInFlight = false;
    const wc = tab.view.webContents as {
      isDestroyed(): boolean;
      executeJavaScript?: (code: string) => Promise<unknown>;
    };
    if (wc.isDestroyed()) return;
    if (typeof wc.executeJavaScript !== 'function') return;
    try {
      await wc.executeJavaScript(
        'window.__dreampia_inspector_disable && window.__dreampia_inspector_disable();'
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.warn(`[BrowserManager] disableInspector(${tab_id}) failed: ${msg}`);
    }
  }

  private stopInspectorPolling(tab_id: string): void {
    const existing = this.inspectorIntervals.get(tab_id);
    if (existing !== undefined) {
      clearInterval(existing);
      this.inspectorIntervals.delete(tab_id);
    }
  }

  /**
   * v2.10.0 β-2 hardening (architect P1-3) — remove the `did-finish-load`
   * re-injector. Called on disableInspector / closeTab / shutdown.
   */
  private detachInspectorNavListener(tab: ManagedTab): void {
    const listener = tab.inspectorNavListener;
    if (listener === undefined) return;
    const wc = tab.view.webContents as {
      isDestroyed(): boolean;
      off?: (event: string, listener: (...args: unknown[]) => void) => unknown;
    };
    try {
      if (!wc.isDestroyed() && typeof wc.off === 'function') {
        wc.off('did-finish-load', listener);
      }
    } catch {
      // already destroyed — harmless
    }
    tab.inspectorNavListener = undefined;
  }

  /**
   * v2.10.0 β-2 hardening (architect P1-4) — fire the in-page uninstall hook.
   * Used by closeTab + shutdown only. Best-effort: webContents may already be
   * destroyed, in which case there's nothing to do.
   */
  private tryUninstallInspector(tab: ManagedTab): void {
    const wc = tab.view.webContents as {
      isDestroyed(): boolean;
      executeJavaScript?: (code: string) => Promise<unknown>;
    };
    if (wc.isDestroyed()) return;
    if (typeof wc.executeJavaScript !== 'function') return;
    // Fire-and-forget — closeTab path can't await without slowing tab close.
    wc.executeJavaScript(
      'window.__dreampia_inspector_uninstall && window.__dreampia_inspector_uninstall();'
    ).catch(() => {
      // best-effort
    });
  }

  // ── geometry ──────────────────────────────────────────────

  /** Renderer reports where the placeholder div lives so the WebContentsView
   * can be positioned over it. Coordinates are content-area DIPs (matches
   * `getBoundingClientRect`). Auto-attaches if this tab is the active one. */
  setBounds(tab_id: string, bounds: BrowserBounds): void {
    const tab = this.tabs.get(tab_id);
    if (!tab) return;
    tab.bounds = bounds;
    if (this.activeTabBySession.get(tab.session_id) === tab_id) {
      this.attachToWindow(tab, bounds);
    }
  }

  // ── inspection ────────────────────────────────────────────

  getTab(tab_id: string): BrowserTabState | null {
    return this.tabs.get(tab_id)?.state ?? null;
  }

  listTabs(session_id: SessionId): BrowserTabState[] {
    return Array.from(this.tabs.values())
      .filter((t) => t.session_id === session_id)
      .map((t) => t.state);
  }

  /** Cleanup all tabs (app shutdown). */
  shutdown(): void {
    // v2.10.0 β-2 — inspector polling 모두 stop. tabs.clear 전에 처리.
    for (const interval of this.inspectorIntervals.values()) {
      clearInterval(interval);
    }
    this.inspectorIntervals.clear();
    for (const tab of this.tabs.values()) {
      // v2.10.0 β-2 hardening (P1-3 / P1-4) — clean inspector wiring per tab.
      this.detachInspectorNavListener(tab);
      this.tryUninstallInspector(tab);
      this.detachFromWindow(tab);
      tab.detachListeners();
      if (!tab.view.webContents.isDestroyed()) {
        safeCall(() => tab.view.webContents.close(), undefined);
      }
    }
    this.tabs.clear();
    this.activeTabBySession.clear();
  }

  // ── private ───────────────────────────────────────────────

  private attachToWindow(tab: ManagedTab, bounds: BrowserBounds): void {
    const win = this.opts.getMainWindow();
    if (!win) return;
    if (win.isDestroyed?.()) return;
    try {
      // addChildView is idempotent — re-adding moves the view to top-most.
      win.contentView.addChildView(tab.view);
      tab.view.setBounds({
        x: Math.round(bounds.x),
        y: Math.round(bounds.y),
        width: Math.max(0, Math.round(bounds.width)),
        height: Math.max(0, Math.round(bounds.height)),
      });
      tab.attached = true;
    } catch {
      // window/view destroyed mid-call — leave attached=false so a later
      // setBounds will retry.
      tab.attached = false;
    }
  }

  private detachFromWindow(tab: ManagedTab): void {
    if (!tab.attached) return;
    const win = this.opts.getMainWindow();
    if (!win || win.isDestroyed?.()) {
      tab.attached = false;
      return;
    }
    try {
      win.contentView.removeChildView(tab.view);
    } catch {
      // already detached
    }
    tab.attached = false;
  }
}
