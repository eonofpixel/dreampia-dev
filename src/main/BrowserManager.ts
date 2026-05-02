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
  WebContentsView,
  session as electronSession,
  type BrowserWindow,
  type WebContents,
} from 'electron';
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
}

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

// ────────────────────────────────────────────────────────────
// BrowserManager
// ────────────────────────────────────────────────────────────

export class BrowserManager {
  private readonly tabs = new Map<string, ManagedTab>();
  private readonly activeTabBySession = new Map<SessionId, string>();

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
      url: args.url,
      title: 'Loading...',
      favicon_url: null,
      status: 'loading',
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

    wc.on('did-start-loading', onLoadStart);
    wc.on('did-finish-load', onLoadEnd);
    wc.on('did-fail-load', onLoadFail);
    wc.on('page-title-updated', onTitleChange);
    wc.on('page-favicon-updated', onFaviconChange);

    tab.detachListeners = (): void => {
      try {
        wc.off('did-start-loading', onLoadStart);
        wc.off('did-finish-load', onLoadEnd);
        wc.off('did-fail-load', onLoadFail);
        wc.off('page-title-updated', onTitleChange);
        wc.off('page-favicon-updated', onFaviconChange);
      } catch {
        // already destroyed — harmless
      }
    };

    // Kick off the initial load. Failures route through the same emit pipeline.
    void wc.loadURL(args.url).catch(() => emit({ status: 'failed' }));

    return tab.state;
  }

  /** Tear down a single tab — removes from window, releases listeners + WebContents. */
  closeTab(tab_id: string): void {
    const tab = this.tabs.get(tab_id);
    if (!tab) return;

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
    tab.emitState({ status: 'loading', url });
    void tab.view.webContents.loadURL(url).catch(() => {
      tab.emitState({ status: 'failed', url });
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
    for (const tab of this.tabs.values()) {
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
