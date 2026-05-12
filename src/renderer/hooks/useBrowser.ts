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

export function normalizeBrowserUrl(input: string): string {
  const trimmed = input.trim();
  if (trimmed.length === 0) return trimmed;
  if (trimmed.toLowerCase() === 'about:blank') return 'about:blank';
  if (/^[a-z][a-z0-9+.-]*:/i.test(trimmed)) {
    try {
      const parsed = new URL(trimmed);
      if (parsed.protocol === 'http:' || parsed.protocol === 'https:') {
        return trimmed;
      }
    } catch {
      return 'about:blank';
    }
    return 'about:blank';
  }
  return `https://${trimmed}`;
}

// ────────────────────────────────────────────────────────────
// Inline IPC shapes (avoid importing from `@/main`)
// ────────────────────────────────────────────────────────────

// v2.10.0 β-2 (F-021 + F-033) — Inspector event shapes mirrored from
// preload.ts. Renderer keeps a local copy to avoid cross-boundary imports.
export type InspectorEvent =
  | { type: 'hover'; x: number; y: number; w: number; h: number; tag: string }
  | {
      type: 'pick';
      selector: string;
      x: number;
      y: number;
      w: number;
      h: number;
      tag: string;
      page_url: string;
      ts: number;
    };

export interface BrowserInspectorPayload {
  tab_id: string;
  session_id: SessionId;
  event: InspectorEvent;
}

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
  // v2.10.0 β-2 — optional (preload may be older during gradual rollout).
  enableInspector?: (tabId: string) => Promise<Result<void>>;
  disableInspector?: (tabId: string) => Promise<Result<void>>;
  onInspectorEvent?: (listener: (payload: BrowserInspectorPayload) => void) => () => void;
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

export function useBrowser(
  sessionId: SessionId | null,
  preferredActiveTabId?: string | null
): UseBrowserReturn {
  const [state, setState] = useState<UseBrowserState>(INITIAL_STATE);

  const mountedRef = useRef(true);
  const activeTabIdRef = useRef<string | null>(null);
  const tabsRef = useRef<BrowserTabUI[]>([]);
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);
  useEffect(() => {
    activeTabIdRef.current = state.activeTabId;
  }, [state.activeTabId]);
  useEffect(() => {
    tabsRef.current = state.tabs;
  }, [state.tabs]);

  const safeSet = useCallback((updater: (s: UseBrowserState) => UseBrowserState): void => {
    if (!mountedRef.current) return;
    setState(updater);
  }, []);

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
    const tabIds = new Set(result.value.map((t) => t.tab_id));
    const previous = activeTabIdRef.current;
    const preferred = preferredActiveTabId !== undefined ? preferredActiveTabId : null;
    const nextActiveTabId =
      previous !== null && tabIds.has(previous)
        ? previous
        : preferred !== null && tabIds.has(preferred)
          ? preferred
          : (result.value[0]?.tab_id ?? null);

    safeSet((s) => ({
      ...s,
      tabs: result.value,
      activeTabId: nextActiveTabId,
      loading: false,
      error: null,
    }));
    if (nextActiveTabId !== null) {
      const switched = await api.switchTab(sessionId, nextActiveTabId);
      if (!switched.ok) {
        safeSet((s) => ({ ...s, error: switched.error }));
      }
    }
  }, [preferredActiveTabId, sessionId, safeSet]);

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
      const normalizedUrl = normalizeBrowserUrl(url);
      const created = await api.openTab({
        session_id: sessionId,
        tab_id,
        url: normalizedUrl,
      });
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
      const wasActive = activeTabIdRef.current === tabId;
      const remainingTabs = tabsRef.current.filter((t) => t.tab_id !== tabId);
      const replacementActiveTabId = wasActive
        ? (remainingTabs[remainingTabs.length - 1]?.tab_id ?? null)
        : activeTabIdRef.current;
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
      if (wasActive && replacementActiveTabId !== null && sessionId !== null) {
        const switched = await api.switchTab(sessionId, replacementActiveTabId);
        if (!switched.ok) {
          safeSet((s) => ({ ...s, error: switched.error }));
        }
      }
    },
    [safeSet, sessionId]
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
      const result = await api.navigate(tabId, normalizeBrowserUrl(url));
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
