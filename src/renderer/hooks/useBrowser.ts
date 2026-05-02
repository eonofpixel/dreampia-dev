/**
 * useBrowser — Renderer hook for the in-app browser (P1-5).
 *
 * Spec: docs/session/browser.md
 *
 * Wraps the `window.dreampia.browser.*` IPC namespace. Mirrors the
 * pattern of `useSessionStore` / `useLeaderElection`: never imports from
 * `@/main` (preload-only) and gracefully degrades when the IPC bridge is
 * absent (e.g. SSR, certain test setups).
 *
 * Architecture
 * ────────────
 *   tabs[]          — full state of every tab for the current session
 *   activeTabId     — the tab whose WebContentsView is overlaid on screen
 *
 *   open()  / close()    — create / destroy a WebContentsView in main
 *   switchTo()           — flips which tab's view is attached to the window
 *   navigate / back / forward / reload — webContents controls
 *   setBounds(rect)      — renderer reports placeholder geometry
 *
 * The hook subscribes to `browser/tab-updated` events from main and
 * patches `tabs` in place so the URL bar / titles / nav buttons update
 * live as pages load.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import type { SessionId } from '@/types';
import type { Result } from '@/main/types';

// ────────────────────────────────────────────────────────────
// Public types (mirrored from BrowserManager via preload)
// ────────────────────────────────────────────────────────────

export interface BrowserTabUI {
  tab_id: string;
  session_id: SessionId;
  url: string;
  title: string;
  favicon_url: string | null;
  status: 'loading' | 'ready' | 'failed';
  can_go_back: boolean;
  can_go_forward: boolean;
}

export interface BrowserBoundsRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface UseBrowserState {
  tabs: BrowserTabUI[];
  activeTabId: string | null;
  loading: boolean;
  error: string | null;
}

export interface UseBrowserReturn extends UseBrowserState {
  /** Open a new tab at `url` and switch to it. Returns the new tab_id. */
  open: (url: string) => Promise<string | null>;
  /** Close a tab and clear activeTabId if it was the active one. */
  close: (tabId: string) => Promise<void>;
  /** Make `tabId` the visible tab for this session. */
  switchTo: (tabId: string) => Promise<void>;
  navigate: (tabId: string, url: string) => Promise<void>;
  back: (tabId: string) => Promise<void>;
  forward: (tabId: string) => Promise<void>;
  reload: (tabId: string) => Promise<void>;
  /** Report placeholder geometry — main re-positions the WebContentsView. */
  setBounds: (tabId: string, rect: BrowserBoundsRect) => Promise<void>;
  /** Re-fetch the tab list from main. */
  refresh: () => Promise<void>;
}

// ────────────────────────────────────────────────────────────
// Inline IPC shapes (avoid importing from `@/main`)
// ────────────────────────────────────────────────────────────

interface BrowserApi {
  openTab: (args: {
    session_id: SessionId;
    tab_id: string;
    url: string;
  }) => Promise<Result<BrowserTabUI>>;
  closeTab: (tabId: string) => Promise<Result<void>>;
  switchTab: (sessionId: SessionId, tabId: string) => Promise<Result<void>>;
  navigate: (tabId: string, url: string) => Promise<Result<void>>;
  back: (tabId: string) => Promise<Result<void>>;
  forward: (tabId: string) => Promise<Result<void>>;
  reload: (tabId: string) => Promise<Result<void>>;
  setBounds: (tabId: string, bounds: BrowserBoundsRect) => Promise<Result<void>>;
  listTabs: (sessionId: SessionId) => Promise<Result<BrowserTabUI[]>>;
  onTabUpdated: (listener: (state: BrowserTabUI) => void) => () => void;
}

// ────────────────────────────────────────────────────────────
// Helpers
// ────────────────────────────────────────────────────────────

function getBrowserApi(): BrowserApi | null {
  if (typeof window === 'undefined') return null;
  const dp = (window as unknown as { dreampia?: { browser?: BrowserApi } }).dreampia;
  if (!dp || typeof dp.browser !== 'object' || dp.browser === null) return null;
  return dp.browser;
}

/** Generate a tab id. Uses `Date.now() + random` because the renderer is
 * the source of truth for tab identity (main echoes it back). */
function newTabId(): string {
  return `tab-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

const INITIAL_STATE: UseBrowserState = {
  tabs: [],
  activeTabId: null,
  loading: false,
  error: null,
};

// ────────────────────────────────────────────────────────────
// Hook
// ────────────────────────────────────────────────────────────

export function useBrowser(sessionId: SessionId | null): UseBrowserReturn {
  const [state, setState] = useState<UseBrowserState>(INITIAL_STATE);

  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const safeSet = useCallback(
    (updater: (s: UseBrowserState) => UseBrowserState): void => {
      if (!mountedRef.current) return;
      setState(updater);
    },
    []
  );

  // ── refresh: full tab-list re-fetch ─────────────────────────
  const refresh = useCallback(async (): Promise<void> => {
    const api = getBrowserApi();
    if (!api || !sessionId) {
      safeSet(() => ({ ...INITIAL_STATE }));
      return;
    }
    safeSet((s) => ({ ...s, loading: true, error: null }));
    const result = await api.listTabs(sessionId);
    if (!result.ok) {
      safeSet((s) => ({ ...s, loading: false, error: result.error }));
      return;
    }
    safeSet((s) => ({
      ...s,
      tabs: result.value,
      // If the previous active tab no longer exists, clear it. Otherwise keep.
      activeTabId:
        s.activeTabId && result.value.some((t) => t.tab_id === s.activeTabId)
          ? s.activeTabId
          : null,
      loading: false,
      error: null,
    }));
  }, [sessionId, safeSet]);

  // ── live updates: subscribe to main's `browser/tab-updated` ──
  useEffect(() => {
    const api = getBrowserApi();
    if (!api || !sessionId) return undefined;
    const unsub = api.onTabUpdated((nextState) => {
      if (nextState.session_id !== sessionId) return;
      safeSet((s) => {
        const idx = s.tabs.findIndex((t) => t.tab_id === nextState.tab_id);
        if (idx >= 0) {
          const next = s.tabs.slice();
          next[idx] = nextState;
          return { ...s, tabs: next };
        }
        return { ...s, tabs: [...s.tabs, nextState] };
      });
    });
    return unsub;
  }, [sessionId, safeSet]);

  // Auto-refresh when sessionId changes.
  useEffect(() => {
    void refresh();
  }, [refresh]);

  // ── mutations ───────────────────────────────────────────────

  const open = useCallback(
    async (url: string): Promise<string | null> => {
      const api = getBrowserApi();
      if (!api || !sessionId) return null;
      const tab_id = newTabId();
      const created = await api.openTab({ session_id: sessionId, tab_id, url });
      if (!created.ok) {
        safeSet((s) => ({ ...s, error: created.error }));
        return null;
      }
      // Optimistically push; the `browser/tab-updated` event will refine fields.
      safeSet((s) => ({
        ...s,
        tabs: [...s.tabs.filter((t) => t.tab_id !== tab_id), created.value],
        activeTabId: created.value.tab_id,
        error: null,
      }));
      // Tell main we want this tab attached.
      const sw = await api.switchTab(sessionId, created.value.tab_id);
      if (!sw.ok) {
        safeSet((s) => ({ ...s, error: sw.error }));
      }
      return created.value.tab_id;
    },
    [sessionId, safeSet]
  );

  const close = useCallback(
    async (tabId: string): Promise<void> => {
      const api = getBrowserApi();
      if (!api) return;
      const result = await api.closeTab(tabId);
      if (!result.ok) {
        safeSet((s) => ({ ...s, error: result.error }));
        return;
      }
      safeSet((s) => {
        const tabs = s.tabs.filter((t) => t.tab_id !== tabId);
        const stillActive = s.activeTabId !== tabId;
        let nextActive: string | null = null;
        if (stillActive) {
          nextActive = s.activeTabId;
        } else if (tabs.length > 0) {
          // Pick the last remaining tab as the new active.
          nextActive = tabs[tabs.length - 1]?.tab_id ?? null;
        }
        return { ...s, tabs, activeTabId: nextActive, error: null };
      });
    },
    [safeSet]
  );

  const switchTo = useCallback(
    async (tabId: string): Promise<void> => {
      const api = getBrowserApi();
      if (!api || !sessionId) return;
      const result = await api.switchTab(sessionId, tabId);
      if (!result.ok) {
        safeSet((s) => ({ ...s, error: result.error }));
        return;
      }
      safeSet((s) => ({ ...s, activeTabId: tabId, error: null }));
    },
    [sessionId, safeSet]
  );

  const navigate = useCallback(
    async (tabId: string, url: string): Promise<void> => {
      const api = getBrowserApi();
      if (!api) return;
      const result = await api.navigate(tabId, url);
      if (!result.ok) {
        safeSet((s) => ({ ...s, error: result.error }));
      }
    },
    [safeSet]
  );

  const back = useCallback(
    async (tabId: string): Promise<void> => {
      const api = getBrowserApi();
      if (!api) return;
      const result = await api.back(tabId);
      if (!result.ok) {
        safeSet((s) => ({ ...s, error: result.error }));
      }
    },
    [safeSet]
  );

  const forward = useCallback(
    async (tabId: string): Promise<void> => {
      const api = getBrowserApi();
      if (!api) return;
      const result = await api.forward(tabId);
      if (!result.ok) {
        safeSet((s) => ({ ...s, error: result.error }));
      }
    },
    [safeSet]
  );

  const reload = useCallback(
    async (tabId: string): Promise<void> => {
      const api = getBrowserApi();
      if (!api) return;
      const result = await api.reload(tabId);
      if (!result.ok) {
        safeSet((s) => ({ ...s, error: result.error }));
      }
    },
    [safeSet]
  );

  const setBounds = useCallback(
    async (tabId: string, rect: BrowserBoundsRect): Promise<void> => {
      const api = getBrowserApi();
      if (!api) return;
      const result = await api.setBounds(tabId, {
        x: rect.x,
        y: rect.y,
        width: rect.width,
        height: rect.height,
      });
      if (!result.ok) {
        safeSet((s) => ({ ...s, error: result.error }));
      }
    },
    [safeSet]
  );

  return {
    ...state,
    open,
    close,
    switchTo,
    navigate,
    back,
    forward,
    reload,
    setBounds,
    refresh,
  };
}
