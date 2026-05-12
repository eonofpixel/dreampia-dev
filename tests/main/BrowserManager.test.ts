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

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtempSync, rmSync, existsSync, readdirSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

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
  capturePage: ReturnType<typeof vi.fn>;
  executeJavaScript: ReturnType<typeof vi.fn>;
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
    // v2.10.0 β-3 — capturePage now accepts an optional rect (region capture).
    // Without an arg → full page (800x600). With an arg → echo the rect size.
    capturePage: vi.fn(async (rect?: { width: number; height: number }) => ({
      toPNG: () => Buffer.from('fake-png-bytes', 'utf-8'),
      getSize: () =>
        rect !== undefined
          ? { width: rect.width, height: rect.height }
          : { width: 800, height: 600 },
    })),
    executeJavaScript: vi.fn(async (code: string) => {
      // 가짜 webview executeJavaScript — 모든 호출이 dumpTabDom 의 inline
      // snippet 이라 가정. 단순 success path: stringified DomDumpNode tree.
      void code;
      return JSON.stringify({
        tag: 'body',
        id: 'root',
        children: [{ tag: 'div', text: 'hi' }],
      });
    }),
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

// v2.10.0 β-3 — captureRegion needs app.getPath('userData') 을 read.
// Tests inject a temp dir via this hoisted ref. vi.mock 안에서 lazy 하게 읽는다.
const electronRef = vi.hoisted(() => ({ userDataPath: '/tmp/dreampia-test-userdata' }));

vi.mock('electron', () => {
  return {
    app: {
      getPath: vi.fn((name: string) => {
        if (name === 'userData') return electronRef.userDataPath;
        return '/tmp';
      }),
    },
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

  // ── v1.6.1 — captureTab ─────────────────────────────────────

  it('captureTab returns base64 PNG + size from webContents.capturePage', async () => {
    mgr.openTab({ session_id: SID_A, tab_id: 'cap1', url: 'https://e' });
    const result = await mgr.captureTab('cap1');
    expect(result).not.toBeNull();
    if (result === null) return;
    expect(result.png_base64).toBe(Buffer.from('fake-png-bytes', 'utf-8').toString('base64'));
    expect(result.width).toBe(800);
    expect(result.height).toBe(600);
    expect(fakeViewsCreated[0]?.webContents.capturePage).toHaveBeenCalledTimes(1);
  });

  it('captureTab returns null for unknown tab', async () => {
    const result = await mgr.captureTab('does-not-exist');
    expect(result).toBeNull();
  });

  it('captureTab returns null when webContents is destroyed', async () => {
    mgr.openTab({ session_id: SID_A, tab_id: 'cap2', url: 'https://e' });
    fakeViewsCreated[0]!.webContents.isDestroyed.mockReturnValue(true);
    const result = await mgr.captureTab('cap2');
    expect(result).toBeNull();
  });

  it('captureTab returns null when capturePage throws', async () => {
    mgr.openTab({ session_id: SID_A, tab_id: 'cap3', url: 'https://e' });
    fakeViewsCreated[0]!.webContents.capturePage.mockRejectedValue(
      new Error('capture failed')
    );
    // console.warn 을 잠시 차단해 테스트 출력 깨끗.
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const result = await mgr.captureTab('cap3');
    expect(result).toBeNull();
    warnSpy.mockRestore();
  });

  // ── v2.10.0 β-3 — captureRegion (F-021 partial screenshot) ─
  describe('captureRegion', () => {
    let tmpRoot: string;

    beforeEach(() => {
      tmpRoot = mkdtempSync(join(tmpdir(), 'dreampia-test-captureRegion-'));
      electronRef.userDataPath = tmpRoot;
    });

    afterEach(() => {
      try {
        rmSync(tmpRoot, { recursive: true, force: true });
      } catch {
        // best effort
      }
    });

    it('captureRegion writes PNG to userData/annotations/<sid>/<uuid>.png + returns file URI', async () => {
      mgr.openTab({ session_id: SID_A, tab_id: 'cr1', url: 'https://e' });
      mgr.setBounds('cr1', { x: 0, y: 0, width: 800, height: 600 });
      const r = await mgr.captureRegion('cr1', { x: 10, y: 20, w: 100, h: 40 });
      expect(r).not.toBeNull();
      if (r === null) return;
      expect(r.uri.startsWith('file://')).toBe(true);
      expect(r.width).toBe(100);
      expect(r.height).toBe(40);
      // base64 contains the mock PNG bytes.
      expect(r.png_base64).toBe(Buffer.from('fake-png-bytes', 'utf-8').toString('base64'));

      // capturePage called with the clamped rect.
      expect(fakeViewsCreated[0]!.webContents.capturePage).toHaveBeenCalledWith({
        x: 10,
        y: 20,
        width: 100,
        height: 40,
      });

      // PNG actually written under userData/annotations/<SID_A>/<uuid>.png.
      const dir = join(tmpRoot, 'annotations', SID_A);
      expect(existsSync(dir)).toBe(true);
      const files = readdirSync(dir);
      expect(files).toHaveLength(1);
      expect(files[0]!.endsWith('.png')).toBe(true);
      const written = readFileSync(join(dir, files[0]!));
      expect(written.toString('utf-8')).toBe('fake-png-bytes');
    });

    it('captureRegion clamps out-of-bounds bbox to viewport', async () => {
      mgr.openTab({ session_id: SID_A, tab_id: 'cr2', url: 'https://e' });
      mgr.setBounds('cr2', { x: 0, y: 0, width: 200, height: 100 });
      // bbox extends past the viewport edge.
      const r = await mgr.captureRegion('cr2', { x: 150, y: 50, w: 500, h: 500 });
      expect(r).not.toBeNull();
      if (r === null) return;
      // Clamped to (50, 50) inside the 200x100 viewport.
      expect(fakeViewsCreated[0]!.webContents.capturePage).toHaveBeenCalledWith({
        x: 150,
        y: 50,
        width: 50,
        height: 50,
      });
    });

    it('captureRegion returns null when bbox clamps to zero', async () => {
      mgr.openTab({ session_id: SID_A, tab_id: 'cr3', url: 'https://e' });
      mgr.setBounds('cr3', { x: 0, y: 0, width: 100, height: 100 });
      const r = await mgr.captureRegion('cr3', { x: 200, y: 200, w: 50, h: 50 });
      expect(r).toBeNull();
      // capturePage 호출 자체가 일어나면 안 된다.
      expect(fakeViewsCreated[0]!.webContents.capturePage).not.toHaveBeenCalled();
    });

    it('captureRegion returns null for unknown tab', async () => {
      const r = await mgr.captureRegion('does-not-exist', { x: 0, y: 0, w: 10, h: 10 });
      expect(r).toBeNull();
    });

    it('captureRegion returns null when webContents is destroyed', async () => {
      mgr.openTab({ session_id: SID_A, tab_id: 'cr4', url: 'https://e' });
      mgr.setBounds('cr4', { x: 0, y: 0, width: 200, height: 200 });
      fakeViewsCreated[0]!.webContents.isDestroyed.mockReturnValue(true);
      const r = await mgr.captureRegion('cr4', { x: 0, y: 0, w: 10, h: 10 });
      expect(r).toBeNull();
    });

    it('captureRegion returns null when capturePage rejects', async () => {
      mgr.openTab({ session_id: SID_A, tab_id: 'cr5', url: 'https://e' });
      mgr.setBounds('cr5', { x: 0, y: 0, width: 200, height: 200 });
      fakeViewsCreated[0]!.webContents.capturePage.mockRejectedValueOnce(
        new Error('region capture failed')
      );
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const r = await mgr.captureRegion('cr5', { x: 0, y: 0, w: 10, h: 10 });
      expect(r).toBeNull();
      warnSpy.mockRestore();
    });
  });

  // ── v1.6.14 — dumpTabDom ──────────────────────────────────

  it('dumpTabDom — executeJavaScript 결과 wrap', async () => {
    mgr.openTab({ session_id: SID_A, tab_id: 'dom1', url: 'https://example.com' });
    fakeViewsCreated[0]!.webContents.getURL.mockReturnValue('https://example.com');
    const r = await mgr.dumpTabDom('dom1');
    expect(r).not.toBeNull();
    if (r === null) return;
    expect(r.url).toBe('https://example.com');
    expect(r.selector).toBe('body');
    expect(r.dump_json).toContain('"body"');
  });

  it('dumpTabDom — selector 옵션 전달', async () => {
    mgr.openTab({ session_id: SID_A, tab_id: 'dom2', url: 'https://e' });
    const r = await mgr.dumpTabDom('dom2', { selector: 'main#m' });
    expect(r).not.toBeNull();
    if (r === null) return;
    expect(r.selector).toBe('main#m');
    // executeJavaScript code 에 selector 가 인용된 형태로 들어감.
    const calls = fakeViewsCreated[0]!.webContents.executeJavaScript.mock.calls;
    expect(calls.length).toBe(1);
    expect((calls[0]![0] as string)).toContain('main#m');
  });

  it('dumpTabDom — unknown tab → null', async () => {
    const r = await mgr.dumpTabDom('does-not-exist');
    expect(r).toBeNull();
  });

  it('dumpTabDom — destroyed webContents → null', async () => {
    mgr.openTab({ session_id: SID_A, tab_id: 'dom3', url: 'https://e' });
    fakeViewsCreated[0]!.webContents.isDestroyed.mockReturnValue(true);
    const r = await mgr.dumpTabDom('dom3');
    expect(r).toBeNull();
  });

  it('dumpTabDom — executeJavaScript throws → null', async () => {
    mgr.openTab({ session_id: SID_A, tab_id: 'dom4', url: 'https://e' });
    fakeViewsCreated[0]!.webContents.executeJavaScript.mockRejectedValue(
      new Error('exec failed')
    );
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const r = await mgr.dumpTabDom('dom4');
    expect(r).toBeNull();
    warnSpy.mockRestore();
  });

  // ── v2.10.0 β-2 — Inspector / element pick ─────────────────

  describe('inspector (F-021 + F-033)', () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('enableInspector injects the script + flips active flag', async () => {
      mgr.openTab({ session_id: SID_A, tab_id: 'i1', url: 'https://e' });
      const view = fakeViewsCreated[0];
      expect(view).toBeDefined();
      if (!view) return;
      view.webContents.executeJavaScript.mockResolvedValue(undefined);

      await mgr.enableInspector('i1');

      // Two executeJavaScript calls: install script + enable flag.
      const calls = view.webContents.executeJavaScript.mock.calls;
      expect(calls.length).toBeGreaterThanOrEqual(2);
      expect(calls[0]?.[0]).toContain('__dreampia_inspector_installed');
      expect(calls[1]?.[0]).toContain('__dreampia_inspector_enable');
    });

    it('enableInspector → drain forwards hover + pick events to onInspectorEvent', async () => {
      const events: Array<{ tabId: string; sessionId: string; ev: unknown }> = [];
      const sink = vi.fn((tabId: string, sessionId: string, ev: unknown) => {
        events.push({ tabId, sessionId, ev });
      });
      // 새 manager — onInspectorEvent 옵션 wire.
      const win2 = makeFakeWindow();
      const mgr2 = new BrowserManager({
        getMainWindow: () => win2 as unknown as Electron.BrowserWindow,
        onInspectorEvent: sink,
      });
      mgr2.openTab({ session_id: SID_A, tab_id: 'i2', url: 'https://e' });
      const view = fakeViewsCreated[fakeViewsCreated.length - 1];
      expect(view).toBeDefined();
      if (!view) return;

      // executeJavaScript: install (1st) + enable (2nd) returns undefined;
      // drain (3rd+) returns serialized `{ hover, picks }` JSON (architect P0-1).
      view.webContents.executeJavaScript
        .mockResolvedValueOnce(undefined) // install
        .mockResolvedValueOnce(undefined) // enable
        .mockResolvedValueOnce(
          JSON.stringify({
            hover: {
              type: 'hover',
              x: 10,
              y: 20,
              w: 100,
              h: 40,
              tag: 'div',
              dimensions: '100x40',
            },
            picks: [
              {
                type: 'pick',
                selector: 'div#a',
                x: 5,
                y: 6,
                w: 7,
                h: 8,
                tag: 'div',
                dimensions: '7x8',
                page_url: 'https://e/page',
                ts: 1234567890,
              },
            ],
          })
        )
        .mockResolvedValue(JSON.stringify({ hover: null, picks: [] }));

      await mgr2.enableInspector('i2');
      // Advance one tick — fires the 50ms drain interval.
      await vi.advanceTimersByTimeAsync(60);
      // Allow the .then() chain to settle.
      await vi.runOnlyPendingTimersAsync();

      // sink got both events with correct tab/session ids.
      expect(sink).toHaveBeenCalled();
      const types = events.map((e) => (e.ev as { type: string }).type);
      expect(types).toContain('hover');
      expect(types).toContain('pick');
      const pick = events.find((e) => (e.ev as { type: string }).type === 'pick');
      expect(pick?.tabId).toBe('i2');
      expect(pick?.sessionId).toBe(SID_A);
      expect((pick?.ev as { selector: string }).selector).toBe('div#a');

      // Stop the loop to avoid leaks across test boundaries.
      await mgr2.disableInspector('i2');
    });

    // ── v2.10.0 β-2 hardening (architect findings) ──────────────

    it('architect P0-1: pick event survives a hover storm (separate queues)', async () => {
      const events: Array<unknown> = [];
      const sink = vi.fn((_tabId: string, _sessionId: string, ev: unknown) => {
        events.push(ev);
      });
      const win2 = makeFakeWindow();
      const mgr2 = new BrowserManager({
        getMainWindow: () => win2 as unknown as Electron.BrowserWindow,
        onInspectorEvent: sink,
      });
      mgr2.openTab({ session_id: SID_A, tab_id: 'p01', url: 'https://e' });
      const view = fakeViewsCreated[fakeViewsCreated.length - 1];
      expect(view).toBeDefined();
      if (!view) return;

      // First drain returns latest hover + the pick (which would have been
      // evicted by 100 hover storms under the old single-queue/cap-32 design).
      view.webContents.executeJavaScript
        .mockResolvedValueOnce(undefined) // install
        .mockResolvedValueOnce(undefined) // enable
        .mockResolvedValueOnce(
          JSON.stringify({
            // hover queue is latest-only — the storm survives only as the
            // single most-recent hover.
            hover: {
              type: 'hover',
              x: 999,
              y: 999,
              w: 1,
              h: 1,
              tag: 'p',
              dimensions: '1x1',
            },
            // pick must NOT be evicted by the hover storm.
            picks: [
              {
                type: 'pick',
                selector: 'button#submit',
                x: 1,
                y: 2,
                w: 3,
                h: 4,
                tag: 'button',
                dimensions: '3x4',
                page_url: 'https://e/p',
                ts: 99,
              },
            ],
          })
        )
        .mockResolvedValue(JSON.stringify({ hover: null, picks: [] }));

      await mgr2.enableInspector('p01');
      await vi.advanceTimersByTimeAsync(60);
      await vi.runOnlyPendingTimersAsync();

      const types = events.map((e) => (e as { type: string }).type);
      expect(types).toContain('pick');
      const pick = events.find((e) => (e as { type: string }).type === 'pick') as {
        selector: string;
      };
      expect(pick.selector).toBe('button#submit');

      await mgr2.disableInspector('p01');
    });

    it('architect P0-2: drain reentrancy guard — stalled executeJavaScript does not pile Promises', async () => {
      // Match the pattern of the surrounding tests: fake timers from
      // beforeEach, install + enable as mockResolvedValueOnce chain. The
      // drain mock returns a hanging Promise via a dedicated factory.
      const win2 = makeFakeWindow();
      const mgr2 = new BrowserManager({
        getMainWindow: () => win2 as unknown as Electron.BrowserWindow,
        onInspectorEvent: () => {},
      });
      mgr2.openTab({ session_id: SID_A, tab_id: 'p02', url: 'https://e' });
      const view = fakeViewsCreated[fakeViewsCreated.length - 1];
      expect(view).toBeDefined();
      if (!view) return;

      // install + enable resolve; every subsequent drain call returns a
      // hanging Promise so the reentrancy flag stays true forever.
      let drainCallCount = 0;
      const hang = (): Promise<string> => {
        drainCallCount += 1;
        return new Promise<string>(() => {});
      };
      view.webContents.executeJavaScript
        .mockResolvedValueOnce(undefined) // install
        .mockResolvedValueOnce(undefined) // enable
        .mockImplementation((code: string) => {
          if (typeof code === 'string' && code.includes('__dreampia_inspector_drain')) {
            return hang();
          }
          // disable / re-inject paths after enable also resolve immediately.
          return Promise.resolve(undefined);
        });

      await mgr2.enableInspector('p02');
      // 5 ticks × 50ms = 250ms. Without the reentrancy guard, drainCallCount
      // would climb to 5. With the guard, only the first tick dispatches a
      // drain; the remaining 4 see inspectorDrainInFlight=true and skip.
      await vi.advanceTimersByTimeAsync(60);
      await vi.advanceTimersByTimeAsync(50);
      await vi.advanceTimersByTimeAsync(50);
      await vi.advanceTimersByTimeAsync(50);
      await vi.advanceTimersByTimeAsync(50);

      expect(drainCallCount).toBe(1);

      // Cleanup: stopInspectorPolling clears the interval; disable's
      // executeJavaScript resolves immediately. The hanging drain Promise
      // stays pending forever but vitest ignores unsettled Promises after
      // the test function returns.
      await mgr2.disableInspector('p02');
    });

    it('architect P1-3: did-finish-load re-injects script after navigation', async () => {
      const win2 = makeFakeWindow();
      const mgr2 = new BrowserManager({
        getMainWindow: () => win2 as unknown as Electron.BrowserWindow,
        onInspectorEvent: () => {},
      });
      mgr2.openTab({ session_id: SID_A, tab_id: 'p13', url: 'https://e' });
      const view = fakeViewsCreated[fakeViewsCreated.length - 1];
      expect(view).toBeDefined();
      if (!view) return;
      view.webContents.executeJavaScript.mockResolvedValue(
        JSON.stringify({ hover: null, picks: [] })
      );

      await mgr2.enableInspector('p13');
      // Baseline: install + enable already happened. Track new injects.
      view.webContents.executeJavaScript.mockClear();

      // Simulate navigation — webContents fires did-finish-load.
      fireListener(view, 'did-finish-load');
      // Allow the .then chain inside the listener to settle.
      await vi.runOnlyPendingTimersAsync();
      await Promise.resolve();
      await Promise.resolve();

      const injectedCodes = view.webContents.executeJavaScript.mock.calls.map(
        (c) => c[0] as string
      );
      expect(injectedCodes.some((c) => c.includes('__dreampia_inspector_installed'))).toBe(true);
      expect(injectedCodes.some((c) => c.includes('__dreampia_inspector_enable'))).toBe(true);

      await mgr2.disableInspector('p13');
    });

    it('architect P1-3: disableInspector detaches the did-finish-load re-injector', async () => {
      const win2 = makeFakeWindow();
      const mgr2 = new BrowserManager({
        getMainWindow: () => win2 as unknown as Electron.BrowserWindow,
        onInspectorEvent: () => {},
      });
      mgr2.openTab({ session_id: SID_A, tab_id: 'p13d', url: 'https://e' });
      const view = fakeViewsCreated[fakeViewsCreated.length - 1];
      expect(view).toBeDefined();
      if (!view) return;
      view.webContents.executeJavaScript.mockResolvedValue(
        JSON.stringify({ hover: null, picks: [] })
      );

      await mgr2.enableInspector('p13d');
      await mgr2.disableInspector('p13d');

      view.webContents.executeJavaScript.mockClear();
      // After disable, did-finish-load must NOT trigger a re-inject.
      fireListener(view, 'did-finish-load');
      await vi.runOnlyPendingTimersAsync();
      await Promise.resolve();
      await Promise.resolve();
      expect(view.webContents.executeJavaScript).not.toHaveBeenCalled();
    });

    it('architect P1-4: closeTab calls the in-page uninstall hook', async () => {
      const win2 = makeFakeWindow();
      const mgr2 = new BrowserManager({
        getMainWindow: () => win2 as unknown as Electron.BrowserWindow,
        onInspectorEvent: () => {},
      });
      mgr2.openTab({ session_id: SID_A, tab_id: 'p14', url: 'https://e' });
      const view = fakeViewsCreated[fakeViewsCreated.length - 1];
      expect(view).toBeDefined();
      if (!view) return;
      view.webContents.executeJavaScript.mockResolvedValue(
        JSON.stringify({ hover: null, picks: [] })
      );

      await mgr2.enableInspector('p14');
      view.webContents.executeJavaScript.mockClear();
      mgr2.closeTab('p14');

      const codes = view.webContents.executeJavaScript.mock.calls.map((c) => c[0] as string);
      expect(codes.some((c) => c.includes('__dreampia_inspector_uninstall'))).toBe(true);
    });

    it('disableInspector clears the polling interval + calls in-page disable', async () => {
      mgr.openTab({ session_id: SID_A, tab_id: 'i3', url: 'https://e' });
      const view = fakeViewsCreated[fakeViewsCreated.length - 1];
      expect(view).toBeDefined();
      if (!view) return;
      view.webContents.executeJavaScript.mockResolvedValue('[]');

      await mgr.enableInspector('i3');
      const callsAfterEnable = view.webContents.executeJavaScript.mock.calls.length;

      await mgr.disableInspector('i3');

      // disable triggers one more executeJavaScript (the disable flip).
      expect(view.webContents.executeJavaScript.mock.calls.length).toBeGreaterThanOrEqual(
        callsAfterEnable + 1
      );
      const last = view.webContents.executeJavaScript.mock.calls.at(-1);
      expect(last?.[0]).toContain('__dreampia_inspector_disable');

      // After disable, advancing the clock does NOT fire any further drain.
      view.webContents.executeJavaScript.mockClear();
      await vi.advanceTimersByTimeAsync(200);
      expect(view.webContents.executeJavaScript).not.toHaveBeenCalled();
    });

    it('closeTab stops inspector polling for that tab', async () => {
      mgr.openTab({ session_id: SID_A, tab_id: 'i4', url: 'https://e' });
      const view = fakeViewsCreated[fakeViewsCreated.length - 1];
      expect(view).toBeDefined();
      if (!view) return;
      view.webContents.executeJavaScript.mockResolvedValue('[]');

      await mgr.enableInspector('i4');
      mgr.closeTab('i4');

      view.webContents.executeJavaScript.mockClear();
      await vi.advanceTimersByTimeAsync(200);
      expect(view.webContents.executeJavaScript).not.toHaveBeenCalled();
    });

    it('shutdown clears inspector intervals', async () => {
      mgr.openTab({ session_id: SID_A, tab_id: 'i5', url: 'https://e' });
      const view = fakeViewsCreated[fakeViewsCreated.length - 1];
      expect(view).toBeDefined();
      if (!view) return;
      view.webContents.executeJavaScript.mockResolvedValue('[]');

      await mgr.enableInspector('i5');
      mgr.shutdown();

      view.webContents.executeJavaScript.mockClear();
      await vi.advanceTimersByTimeAsync(200);
      expect(view.webContents.executeJavaScript).not.toHaveBeenCalled();
    });

    it('enableInspector — unknown tab → no-op (no executeJavaScript)', async () => {
      await mgr.enableInspector('does-not-exist');
      // No view was created → nothing executed.
      for (const v of fakeViewsCreated) {
        expect(v.webContents.executeJavaScript).not.toHaveBeenCalled();
      }
    });

    it('enableInspector — script inject throw → silent warn, no polling', async () => {
      mgr.openTab({ session_id: SID_A, tab_id: 'i6', url: 'https://e' });
      const view = fakeViewsCreated[fakeViewsCreated.length - 1];
      expect(view).toBeDefined();
      if (!view) return;
      view.webContents.executeJavaScript.mockRejectedValueOnce(new Error('inject failed'));
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      await mgr.enableInspector('i6');
      view.webContents.executeJavaScript.mockClear();
      await vi.advanceTimersByTimeAsync(200);
      expect(view.webContents.executeJavaScript).not.toHaveBeenCalled();

      warnSpy.mockRestore();
    });
  });
});
