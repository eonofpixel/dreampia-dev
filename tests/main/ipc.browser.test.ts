/**
 * IPC handler tests — `browser/*` namespace (P1-5).
 *
 * Mirrors the pattern from ipc.session.test.ts / ipc.lock.test.ts: mock
 * `electron`, capture each `ipcMain.handle` registration, and invoke
 * handlers directly with synthetic IpcMainInvokeEvent objects.
 *
 * BrowserManager is replaced with a stub that records every call so we
 * can verify the handlers wire arguments correctly without booting
 * Electron / WebContentsView.
 *
 * Spec: docs/session/browser.md
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

// ────────────────────────────────────────────────────────────
// Mock electron — must come before importing anything that uses it
// ────────────────────────────────────────────────────────────

type Handler = (
  evt: unknown,
  ...args: unknown[]
) => unknown | Promise<unknown>;

const handlers = new Map<string, Handler>();

vi.mock('electron', () => {
  return {
    app: { getVersion: () => '0.0.1-test' },
    ipcMain: {
      handle: (channel: string, handler: Handler): void => {
        handlers.set(channel, handler);
      },
      removeHandler: (channel: string): void => {
        handlers.delete(channel);
      },
    },
  };
});

// Imports MUST come after vi.mock so they pick up the stub.
import { registerIpcHandlers } from '../../src/main/ipc';
import type {
  BrowserManager,
  BrowserTabState,
} from '../../src/main/BrowserManager';
import type { Result } from '../../src/main/types';
import type { SessionId } from '../../src/types';

// ────────────────────────────────────────────────────────────
// Stub BrowserManager (records calls; returns canned data)
// ────────────────────────────────────────────────────────────

interface StubManager {
  openTab: ReturnType<typeof vi.fn>;
  closeTab: ReturnType<typeof vi.fn>;
  switchTab: ReturnType<typeof vi.fn>;
  navigate: ReturnType<typeof vi.fn>;
  goBack: ReturnType<typeof vi.fn>;
  goForward: ReturnType<typeof vi.fn>;
  reload: ReturnType<typeof vi.fn>;
  setBounds: ReturnType<typeof vi.fn>;
  getTab: ReturnType<typeof vi.fn>;
  listTabs: ReturnType<typeof vi.fn>;
  shutdown: ReturnType<typeof vi.fn>;
}

const SID = '019d-aaaa' as SessionId;

function makeStub(): StubManager {
  const sample: BrowserTabState = {
    tab_id: 't1',
    session_id: SID,
    url: 'https://example.com',
    title: 'Loading...',
    favicon_url: null,
    status: 'loading',
    can_go_back: false,
    can_go_forward: false,
  };
  return {
    openTab: vi.fn(() => sample),
    closeTab: vi.fn(),
    switchTab: vi.fn(),
    navigate: vi.fn(),
    goBack: vi.fn(),
    goForward: vi.fn(),
    reload: vi.fn(),
    setBounds: vi.fn(),
    getTab: vi.fn(() => sample),
    listTabs: vi.fn(() => [sample]),
    shutdown: vi.fn(),
  };
}

const evt = {} as unknown;

async function call<T>(channel: string, ...args: unknown[]): Promise<T> {
  const handler = handlers.get(channel);
  if (handler === undefined) {
    throw new Error(`no handler registered for ${channel}`);
  }
  return (await handler(evt, ...args)) as T;
}

const stubApp = { getVersion: () => '0.0.1-test' } as unknown as Parameters<
  typeof registerIpcHandlers
>[0];

// ────────────────────────────────────────────────────────────
// Suite
// ────────────────────────────────────────────────────────────

describe('IPC browser handlers', () => {
  let mgr: StubManager;

  beforeEach(() => {
    handlers.clear();
    mgr = makeStub();
    // Pass the stub via the public BrowserManager position. It's structurally
    // compatible with the public surface that ipc.ts exercises.
    registerIpcHandlers(
      stubApp,
      undefined,
      undefined,
      mgr as unknown as BrowserManager
    );
  });

  // ── registration ────────────────────────────────────────────

  it('registers all 9 browser channels', () => {
    expect(handlers.has('browser/open-tab')).toBe(true);
    expect(handlers.has('browser/close-tab')).toBe(true);
    expect(handlers.has('browser/switch-tab')).toBe(true);
    expect(handlers.has('browser/navigate')).toBe(true);
    expect(handlers.has('browser/back')).toBe(true);
    expect(handlers.has('browser/forward')).toBe(true);
    expect(handlers.has('browser/reload')).toBe(true);
    expect(handlers.has('browser/set-bounds')).toBe(true);
    expect(handlers.has('browser/list-tabs')).toBe(true);
  });

  it('does NOT register browser/* when manager is omitted', () => {
    handlers.clear();
    registerIpcHandlers(stubApp);
    expect(handlers.has('browser/open-tab')).toBe(false);
    expect(handlers.has('browser/list-tabs')).toBe(false);
  });

  // ── browser/open-tab ────────────────────────────────────────

  describe('browser/open-tab', () => {
    it('forwards args and returns the tab state', async () => {
      const result = await call<Result<BrowserTabState>>('browser/open-tab', {
        session_id: SID,
        tab_id: 't1',
        url: 'https://example.com',
      });
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.value.tab_id).toBe('t1');
      expect(mgr.openTab).toHaveBeenCalledWith({
        session_id: SID,
        tab_id: 't1',
        url: 'https://example.com',
      });
    });

    it('rejects malformed payload', async () => {
      const result = await call<Result<BrowserTabState>>(
        'browser/open-tab',
        { session_id: SID, tab_id: 't1' } // missing url
      );
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.error).toMatch(/url/);
    });
  });

  // ── browser/close-tab ───────────────────────────────────────

  describe('browser/close-tab', () => {
    it('forwards a string tabId', async () => {
      const result = await call<Result<void>>('browser/close-tab', 't1');
      expect(result).toEqual({ ok: true, value: undefined });
      expect(mgr.closeTab).toHaveBeenCalledWith('t1');
    });

    it('rejects non-string tabId', async () => {
      const result = await call<Result<void>>('browser/close-tab', 42);
      expect(result.ok).toBe(false);
    });
  });

  // ── browser/switch-tab ──────────────────────────────────────

  it('switch-tab forwards both ids', async () => {
    const result = await call<Result<void>>('browser/switch-tab', SID, 't1');
    expect(result.ok).toBe(true);
    expect(mgr.switchTab).toHaveBeenCalledWith(SID, 't1');
  });

  // ── browser/navigate ────────────────────────────────────────

  it('navigate forwards tabId + url', async () => {
    const result = await call<Result<void>>(
      'browser/navigate',
      't1',
      'https://x.test'
    );
    expect(result.ok).toBe(true);
    expect(mgr.navigate).toHaveBeenCalledWith('t1', 'https://x.test');
  });

  it('navigate rejects empty url', async () => {
    const result = await call<Result<void>>('browser/navigate', 't1', '');
    expect(result.ok).toBe(false);
  });

  // ── browser/back, forward, reload ──────────────────────────

  it('back/forward/reload forward tabId only', async () => {
    await call<Result<void>>('browser/back', 't1');
    await call<Result<void>>('browser/forward', 't1');
    await call<Result<void>>('browser/reload', 't1');
    expect(mgr.goBack).toHaveBeenCalledWith('t1');
    expect(mgr.goForward).toHaveBeenCalledWith('t1');
    expect(mgr.reload).toHaveBeenCalledWith('t1');
  });

  // ── browser/set-bounds ──────────────────────────────────────

  describe('browser/set-bounds', () => {
    it('forwards a valid bounds object', async () => {
      const result = await call<Result<void>>('browser/set-bounds', 't1', {
        x: 10,
        y: 20,
        width: 100,
        height: 200,
      });
      expect(result).toEqual({ ok: true, value: undefined });
      expect(mgr.setBounds).toHaveBeenCalledWith('t1', {
        x: 10,
        y: 20,
        width: 100,
        height: 200,
      });
    });

    it('rejects negative width', async () => {
      const result = await call<Result<void>>('browser/set-bounds', 't1', {
        x: 0,
        y: 0,
        width: -1,
        height: 100,
      });
      expect(result.ok).toBe(false);
    });

    it('rejects non-finite values (NaN/Infinity from buggy callers)', async () => {
      const result = await call<Result<void>>('browser/set-bounds', 't1', {
        x: 0,
        y: 0,
        width: Number.POSITIVE_INFINITY,
        height: 100,
      });
      expect(result.ok).toBe(false);
    });
  });

  // ── browser/list-tabs ───────────────────────────────────────

  it('list-tabs returns the manager output', async () => {
    const result = await call<Result<BrowserTabState[]>>(
      'browser/list-tabs',
      SID
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value).toHaveLength(1);
    expect(mgr.listTabs).toHaveBeenCalledWith(SID);
  });
});
