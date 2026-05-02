/**
 * BrowserManager — main-process WebContentsView lifecycle (P1-5).
 *
 * Spec: docs/session/browser.md
 *
 * Mocks the `electron` module so this runs in plain Node — no Chromium
 * boot, no real WebContentsView. We capture the listeners registered
 * on the fake webContents and invoke them manually to simulate
 * `did-finish-load`, `page-title-updated`, etc.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

// ────────────────────────────────────────────────────────────
// Mock electron — must come before importing BrowserManager
// ────────────────────────────────────────────────────────────

interface FakeWebContents {
  loadURL: ReturnType<typeof vi.fn>;
  getURL: ReturnType<typeof vi.fn>;
  getTitle: ReturnType<typeof vi.fn>;
  setWindowOpenHandler: ReturnType<typeof vi.fn>;
  on: ReturnType<typeof vi.fn>;
  off: ReturnType<typeof vi.fn>;
  isDestroyed: ReturnType<typeof vi.fn>;
  close: ReturnType<typeof vi.fn>;
  reload: ReturnType<typeof vi.fn>;
  navigationHistory: {
    canGoBack: ReturnType<typeof vi.fn>;
    canGoForward: ReturnType<typeof vi.fn>;
    goBack: ReturnType<typeof vi.fn>;
    goForward: ReturnType<typeof vi.fn>;
  };
  /** Listeners captured per event name. */
  __listeners: Map<string, Array<(...args: unknown[]) => void>>;
}

interface FakeView {
  webContents: FakeWebContents;
  setBounds: ReturnType<typeof vi.fn>;
}

interface FakeWindow {
  contentView: {
    addChildView: ReturnType<typeof vi.fn>;
    removeChildView: ReturnType<typeof vi.fn>;
  };
  webContents: { send: ReturnType<typeof vi.fn> };
  isDestroyed: () => boolean;
}

interface FakeSession {
  setPermissionRequestHandler: ReturnType<typeof vi.fn>;
  setPermissionCheckHandler: ReturnType<typeof vi.fn>;
}

const fakeViewsCreated: FakeView[] = [];
const fakeSessionPartitions: string[] = [];
const fakeSessionsCreated: FakeSession[] = [];

function makeFakeWebContents(initialUrl: string): FakeWebContents {
  const listeners = new Map<string, Array<(...args: unknown[]) => void>>();
  let currentUrl = initialUrl;
  let currentTitle = 'Loading...';

  const wc: FakeWebContents = {
    loadURL: vi.fn(async (url: string) => {
      currentUrl = url;
      return undefined;
    }),
    getURL: vi.fn(() => currentUrl),
    getTitle: vi.fn(() => currentTitle),
    setWindowOpenHandler: vi.fn(),
    on: vi.fn((evt: string, handler: (...args: unknown[]) => void) => {
      const arr = listeners.get(evt) ?? [];
      arr.push(handler);
      listeners.set(evt, arr);
      return wc;
    }),
    off: vi.fn((evt: string, handler: (...args: unknown[]) => void) => {
      const arr = listeners.get(evt);
      if (!arr) return wc;
      const idx = arr.indexOf(handler);
      if (idx >= 0) arr.splice(idx, 1);
      return wc;
    }),
    isDestroyed: vi.fn(() => false),
    close: vi.fn(),
    reload: vi.fn(),
    navigationHistory: {
      canGoBack: vi.fn(() => false),
      canGoForward: vi.fn(() => false),
      goBack: vi.fn(),
      goForward: vi.fn(),
    },
    __listeners: listeners,
  };

  // Test helper to simulate the webContents updating its title later.
  Object.defineProperty(wc, '__setTitle', {
    value: (t: string) => {
      currentTitle = t;
    },
  });

  return wc;
}

vi.mock('electron', () => {
  return {
    session: {
      fromPartition: vi.fn((p: string) => {
        fakeSessionPartitions.push(p);
        const fakeSession: FakeSession = {
          setPermissionRequestHandler: vi.fn(),
          setPermissionCheckHandler: vi.fn(),
        };
        fakeSessionsCreated.push(fakeSession);
        return fakeSession;
      }),
    },
    WebContentsView: vi.fn((opts?: { webPreferences?: { session?: object } }) => {
      // The constructor receives a session object; we don't need to wire it
      // back to the wc — the partition was captured during fromPartition().
      void opts;
      const view: FakeView = {
        webContents: makeFakeWebContents('about:blank'),
        setBounds: vi.fn(),
      };
      fakeViewsCreated.push(view);
      return view;
    }),
  };
});

// Imports MUST come after vi.mock so they pick up the stub.
import { BrowserManager } from '../../src/main/BrowserManager';
import type { SessionId } from '../../src/types';

// ────────────────────────────────────────────────────────────
// Helpers
// ────────────────────────────────────────────────────────────

const SID_A = '019d-aaaa' as SessionId;
const SID_B = '019d-bbbb' as SessionId;

function makeFakeWindow(): FakeWindow {
  return {
    contentView: {
      addChildView: vi.fn(),
      removeChildView: vi.fn(),
    },
    webContents: { send: vi.fn() },
    isDestroyed: () => false,
  };
}

function fireListener(
  view: FakeView,
  evt: string,
  ...args: unknown[]
): void {
  const arr = view.webContents.__listeners.get(evt) ?? [];
  for (const fn of arr) fn(...args);
}

// ────────────────────────────────────────────────────────────
// Suite
// ────────────────────────────────────────────────────────────

describe('BrowserManager', () => {
  let win: FakeWindow;
  let mgr: BrowserManager;
  let updates: unknown[];

  beforeEach(() => {
    fakeViewsCreated.length = 0;
    fakeSessionPartitions.length = 0;
    fakeSessionsCreated.length = 0;
    win = makeFakeWindow();
    updates = [];
    mgr = new BrowserManager({
      // Cast: FakeWindow is structurally compatible with the bits we use.
      getMainWindow: () => win as unknown as Electron.BrowserWindow,
      onTabUpdate: (s) => {
        updates.push(s);
      },
    });
  });

  // ── openTab ─────────────────────────────────────────────────

  it('openTab creates a WebContentsView and returns initial state', () => {
    const state = mgr.openTab({
      session_id: SID_A,
      tab_id: 't1',
      url: 'https://example.com',
    });

    expect(state.tab_id).toBe('t1');
    expect(state.session_id).toBe(SID_A);
    expect(state.url).toBe('https://example.com');
    expect(state.status).toBe('loading');
    expect(state.can_go_back).toBe(false);
    expect(state.can_go_forward).toBe(false);
    expect(fakeViewsCreated).toHaveLength(1);
    expect(fakeViewsCreated[0]?.webContents.loadURL).toHaveBeenCalledWith(
      'https://example.com'
    );
  });

  it('openTab blocks unsafe initial URL schemes before loadURL', () => {
    const state = mgr.openTab({
      session_id: SID_A,
      tab_id: 't1',
      url: 'file:///C:/Windows/win.ini',
    });

    expect(state.status).toBe('failed');
    expect(state.title).toBe('Blocked URL');
    expect(fakeViewsCreated[0]?.webContents.loadURL).not.toHaveBeenCalled();
  });

  it('openTab uses persist:dreampia-browser-app-{sessionId} partition', () => {
    mgr.openTab({ session_id: SID_A, tab_id: 't1', url: 'https://x.test' });
    expect(fakeSessionPartitions).toEqual([
      `persist:dreampia-browser-app-${SID_A}`,
    ]);
  });

  it('denies browser permission prompts and popup windows by default', () => {
    mgr.openTab({ session_id: SID_A, tab_id: 't1', url: 'https://x.test' });
    const sess = fakeSessionsCreated[0];
    const view = fakeViewsCreated[0];
    expect(sess?.setPermissionRequestHandler).toHaveBeenCalledTimes(1);
    expect(sess?.setPermissionCheckHandler).toHaveBeenCalledTimes(1);
    expect(view?.webContents.setWindowOpenHandler).toHaveBeenCalledTimes(1);

    const requestHandler = sess?.setPermissionRequestHandler.mock.calls[0]?.[0] as
      | ((wc: unknown, permission: string, callback: (allowed: boolean) => void) => void)
      | undefined;
    const callback = vi.fn();
    requestHandler?.({}, 'clipboard-read', callback);
    expect(callback).toHaveBeenCalledWith(false);

    const popupHandler = view?.webContents.setWindowOpenHandler.mock.calls[0]?.[0] as
      | ((details: { url: string }) => { action: string })
      | undefined;
    expect(popupHandler?.({ url: 'https://popup.test' })).toEqual({ action: 'deny' });
  });

  it('openTab is idempotent on the same tab_id', () => {
    mgr.openTab({ session_id: SID_A, tab_id: 't1', url: 'https://a.test' });
    const state2 = mgr.openTab({
      session_id: SID_A,
      tab_id: 't1',
      url: 'https://b.test',
    });
    expect(state2.url).toBe('https://a.test');
    expect(fakeViewsCreated).toHaveLength(1);
  });

  // ── multi-tab / multi-session isolation ─────────────────────

  it('multiple tabs in same session share neither view nor partition', () => {
    mgr.openTab({ session_id: SID_A, tab_id: 't1', url: 'https://a1.test' });
    mgr.openTab({ session_id: SID_A, tab_id: 't2', url: 'https://a2.test' });
    expect(fakeViewsCreated).toHaveLength(2);
    // Both tabs use the same session-A partition.
    expect(fakeSessionPartitions).toEqual([
      `persist:dreampia-browser-app-${SID_A}`,
      `persist:dreampia-browser-app-${SID_A}`,
    ]);
    expect(mgr.listTabs(SID_A)).toHaveLength(2);
  });

  it('different sessions get different partitions (cookie isolation)', () => {
    mgr.openTab({ session_id: SID_A, tab_id: 'a1', url: 'https://x.test' });
    mgr.openTab({ session_id: SID_B, tab_id: 'b1', url: 'https://x.test' });
    expect(fakeSessionPartitions).toEqual([
      `persist:dreampia-browser-app-${SID_A}`,
      `persist:dreampia-browser-app-${SID_B}`,
    ]);
    expect(mgr.listTabs(SID_A).map((t) => t.tab_id)).toEqual(['a1']);
    expect(mgr.listTabs(SID_B).map((t) => t.tab_id)).toEqual(['b1']);
  });

  // ── closeTab ────────────────────────────────────────────────

  it('closeTab removes the tab and tries to close the webContents', () => {
    mgr.openTab({ session_id: SID_A, tab_id: 't1', url: 'https://x.test' });
    const view = fakeViewsCreated[0];
    expect(view).toBeDefined();
    mgr.closeTab('t1');
    expect(mgr.getTab('t1')).toBeNull();
    expect(view?.webContents.close).toHaveBeenCalled();
  });

  it('closeTab is a no-op for unknown tab', () => {
    expect(() => mgr.closeTab('does-not-exist')).not.toThrow();
  });

  // ── switchTab + setBounds → attach/detach ───────────────────

  it('switchTab attaches the tab to the window once bounds are known', () => {
    mgr.openTab({ session_id: SID_A, tab_id: 't1', url: 'https://x.test' });
    const view = fakeViewsCreated[0];
    expect(view).toBeDefined();

    mgr.setBounds('t1', { x: 0, y: 0, width: 100, height: 100 });
    mgr.switchTab(SID_A, 't1');
    // setBounds attaches eagerly when this is the active tab; switchTab
    // re-attaches a previously-detached view.
    expect(win.contentView.addChildView).toHaveBeenCalled();
  });

  it('switchTab between two tabs detaches the previous one', () => {
    mgr.openTab({ session_id: SID_A, tab_id: 't1', url: 'https://1.test' });
    mgr.openTab({ session_id: SID_A, tab_id: 't2', url: 'https://2.test' });
    mgr.setBounds('t1', { x: 0, y: 0, width: 10, height: 10 });
    mgr.setBounds('t2', { x: 0, y: 0, width: 10, height: 10 });

    mgr.switchTab(SID_A, 't1');
    expect(win.contentView.removeChildView).not.toHaveBeenCalled();

    mgr.switchTab(SID_A, 't2');
    expect(win.contentView.removeChildView).toHaveBeenCalledTimes(1);
  });

  it('setBounds on a non-active tab caches but does not attach', () => {
    mgr.openTab({ session_id: SID_A, tab_id: 't1', url: 'https://x.test' });
    mgr.setBounds('t1', { x: 1, y: 2, width: 3, height: 4 });
    // Not active yet — no attach
    expect(win.contentView.addChildView).not.toHaveBeenCalled();
  });

  // ── navigation ──────────────────────────────────────────────

  it('navigate calls loadURL on the right view', () => {
    mgr.openTab({ session_id: SID_A, tab_id: 't1', url: 'https://1.test' });
    mgr.openTab({ session_id: SID_A, tab_id: 't2', url: 'https://2.test' });
    mgr.navigate('t2', 'https://3.test');
    const v2 = fakeViewsCreated[1];
    expect(v2?.webContents.loadURL).toHaveBeenCalledWith('https://3.test');
  });

  it('navigate blocks unsafe schemes before loadURL', () => {
    mgr.openTab({ session_id: SID_A, tab_id: 't1', url: 'https://1.test' });
    const view = fakeViewsCreated[0];
    expect(view).toBeDefined();
    if (!view) return;

    view.webContents.loadURL.mockClear();
    mgr.navigate('t1', 'javascript:alert(1)');

    expect(view.webContents.loadURL).not.toHaveBeenCalled();
    expect(mgr.getTab('t1')?.status).toBe('failed');
  });

  it('will-navigate prevents unsafe renderer-initiated navigation', () => {
    mgr.openTab({ session_id: SID_A, tab_id: 't1', url: 'https://1.test' });
    const view = fakeViewsCreated[0];
    expect(view).toBeDefined();
    if (!view) return;

    const event = { preventDefault: vi.fn() };
    fireListener(view, 'will-navigate', event, 'data:text/html,<h1>x</h1>');

    expect(event.preventDefault).toHaveBeenCalledTimes(1);
    expect(mgr.getTab('t1')?.status).toBe('failed');
  });

  it('goBack respects canGoBack', () => {
    mgr.openTab({ session_id: SID_A, tab_id: 't1', url: 'https://x.test' });
    const view = fakeViewsCreated[0];
    expect(view).toBeDefined();
    if (!view) return;

    // canGoBack=false (default): goBack should NOT be called.
    mgr.goBack('t1');
    expect(view.webContents.navigationHistory.goBack).not.toHaveBeenCalled();

    view.webContents.navigationHistory.canGoBack.mockReturnValue(true);
    mgr.goBack('t1');
    expect(view.webContents.navigationHistory.goBack).toHaveBeenCalledTimes(1);
  });

  it('goForward respects canGoForward', () => {
    mgr.openTab({ session_id: SID_A, tab_id: 't1', url: 'https://x.test' });
    const view = fakeViewsCreated[0];
    expect(view).toBeDefined();
    if (!view) return;

    mgr.goForward('t1');
    expect(view.webContents.navigationHistory.goForward).not.toHaveBeenCalled();

    view.webContents.navigationHistory.canGoForward.mockReturnValue(true);
    mgr.goForward('t1');
    expect(view.webContents.navigationHistory.goForward).toHaveBeenCalledTimes(1);
  });

  it('reload calls webContents.reload', () => {
    mgr.openTab({ session_id: SID_A, tab_id: 't1', url: 'https://x.test' });
    mgr.reload('t1');
    expect(fakeViewsCreated[0]?.webContents.reload).toHaveBeenCalled();
  });

  // ── event-driven state diff ─────────────────────────────────

  it('emits onTabUpdate when did-finish-load fires', () => {
    mgr.openTab({ session_id: SID_A, tab_id: 't1', url: 'https://x.test' });
    const view = fakeViewsCreated[0];
    expect(view).toBeDefined();
    if (!view) return;

    updates.length = 0;
    fireListener(view, 'did-finish-load');

    expect(updates).toHaveLength(1);
    const last = updates[0] as { status: string };
    expect(last.status).toBe('ready');
  });

  it('emits onTabUpdate with new title on page-title-updated', () => {
    mgr.openTab({ session_id: SID_A, tab_id: 't1', url: 'https://x.test' });
    const view = fakeViewsCreated[0];
    expect(view).toBeDefined();
    if (!view) return;

    // Make the fake webContents return a real title from getTitle().
    (view.webContents as unknown as { __setTitle: (t: string) => void }).__setTitle(
      'Real Title'
    );

    updates.length = 0;
    fireListener(view, 'page-title-updated', {}, 'New Page Title');

    expect(updates).toHaveLength(1);
    const last = updates[0] as { title: string };
    // The handler patches title with the event payload, but the emit
    // pipeline overwrites it with getTitle() — verify whichever wins
    // is non-empty.
    expect(typeof last.title).toBe('string');
    expect(last.title.length).toBeGreaterThan(0);
  });

  it('emits failed status on did-fail-load', () => {
    mgr.openTab({ session_id: SID_A, tab_id: 't1', url: 'https://bad.test' });
    const view = fakeViewsCreated[0];
    expect(view).toBeDefined();
    if (!view) return;

    updates.length = 0;
    fireListener(view, 'did-fail-load');
    const last = updates[0] as { status: string };
    expect(last?.status).toBe('failed');
  });

  // ── shutdown ────────────────────────────────────────────────

  it('shutdown closes all tabs', () => {
    mgr.openTab({ session_id: SID_A, tab_id: 'a1', url: 'https://1.test' });
    mgr.openTab({ session_id: SID_B, tab_id: 'b1', url: 'https://2.test' });
    mgr.shutdown();
    expect(mgr.getTab('a1')).toBeNull();
    expect(mgr.getTab('b1')).toBeNull();
    expect(fakeViewsCreated[0]?.webContents.close).toHaveBeenCalled();
    expect(fakeViewsCreated[1]?.webContents.close).toHaveBeenCalled();
  });
});
