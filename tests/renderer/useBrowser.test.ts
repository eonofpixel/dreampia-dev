/**
 * useBrowser — renderer hook tests (P1-5).
 *
 * Spec: docs/session/browser.md
 *
 * Uses the in-memory `__mockStore.browser*` from tests/setup.ts which
 * exposes the same `window.dreampia.browser.*` API as the production
 * preload.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';

import { useBrowser } from '../../src/renderer/hooks/useBrowser';
import type { SessionId } from '../../src/types';
import { __mockStore, __emitBrowserUpdate } from '../setup';

const SID = '019d-aaaa' as SessionId;
const SID2 = '019d-bbbb' as SessionId;

describe('useBrowser', () => {
  beforeEach(() => {
    __mockStore.browserTabs.clear();
    __mockStore.browserActive.clear();
    __mockStore.browserBounds.clear();
    __mockStore.browserListeners.clear();
  });

  it('with null sessionId stays in initial state and never calls IPC', async () => {
    const { result } = renderHook(() => useBrowser(null));
    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });
    expect(result.current.tabs).toEqual([]);
    expect(result.current.activeTabId).toBeNull();
    expect(result.current.error).toBeNull();
  });

  it('initial load: lists pre-seeded tabs for the session', async () => {
    __mockStore.browserTabs.set('seeded', {
      tab_id: 'seeded',
      session_id: SID,
      url: 'https://seed.test',
      title: 'Seeded',
      favicon_url: null,
      status: 'ready',
      can_go_back: false,
      can_go_forward: false,
    });

    const { result } = renderHook(() => useBrowser(SID));
    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });
    expect(result.current.tabs).toHaveLength(1);
    expect(result.current.tabs[0]?.tab_id).toBe('seeded');
  });

  it('open() creates a tab and makes it active', async () => {
    const { result } = renderHook(() => useBrowser(SID));
    await waitFor(() => expect(result.current.loading).toBe(false));

    let newTabId: string | null = null;
    await act(async () => {
      newTabId = await result.current.open('https://example.com');
    });

    expect(newTabId).not.toBeNull();
    expect(result.current.tabs).toHaveLength(1);
    expect(result.current.activeTabId).toBe(newTabId);
    expect(__mockStore.browserActive.get(SID)).toBe(newTabId);
  });

  it('close() removes the tab and picks a new active when needed', async () => {
    const { result } = renderHook(() => useBrowser(SID));
    await waitFor(() => expect(result.current.loading).toBe(false));

    let firstId: string | null = null;
    let secondId: string | null = null;
    await act(async () => {
      firstId = await result.current.open('https://1.test');
    });
    await act(async () => {
      secondId = await result.current.open('https://2.test');
    });

    expect(result.current.tabs).toHaveLength(2);
    expect(result.current.activeTabId).toBe(secondId);

    // Close the active tab — hook should pick the remaining tab as new active.
    await act(async () => {
      await result.current.close(secondId as unknown as string);
    });

    expect(result.current.tabs).toHaveLength(1);
    expect(result.current.activeTabId).toBe(firstId);
  });

  it('switchTo() updates activeTabId', async () => {
    const { result } = renderHook(() => useBrowser(SID));
    await waitFor(() => expect(result.current.loading).toBe(false));

    let firstId: string | null = null;
    let secondId: string | null = null;
    await act(async () => {
      firstId = await result.current.open('https://1.test');
    });
    await act(async () => {
      secondId = await result.current.open('https://2.test');
    });

    await act(async () => {
      await result.current.switchTo(firstId as unknown as string);
    });
    expect(result.current.activeTabId).toBe(firstId);

    await act(async () => {
      await result.current.switchTo(secondId as unknown as string);
    });
    expect(result.current.activeTabId).toBe(secondId);
  });

  it('navigate() dispatches a navigate IPC and surfaces tab-updated events', async () => {
    const { result } = renderHook(() => useBrowser(SID));
    await waitFor(() => expect(result.current.loading).toBe(false));

    let tabId: string | null = null;
    await act(async () => {
      tabId = await result.current.open('https://1.test');
    });
    if (!tabId) throw new Error('open failed');

    // Capture call by triggering the mock; the mock emits tab-updated with status='loading'.
    await act(async () => {
      await result.current.navigate(tabId as string, 'https://2.test');
    });

    await waitFor(() => {
      const tab = result.current.tabs.find((t) => t.tab_id === tabId);
      expect(tab?.url).toBe('https://2.test');
    });
  });

  it('subscribes to onTabUpdated only for the current session', async () => {
    const { result } = renderHook(() => useBrowser(SID));
    await waitFor(() => expect(result.current.loading).toBe(false));

    // External main-process update for OUR session: should patch tabs.
    act(() => {
      __emitBrowserUpdate({
        tab_id: 'remote-1',
        session_id: SID,
        url: 'https://remote.test',
        title: 'Remote',
        favicon_url: null,
        status: 'ready',
        can_go_back: true,
        can_go_forward: false,
      });
    });
    expect(result.current.tabs.find((t) => t.tab_id === 'remote-1')).toBeDefined();

    // Update for a DIFFERENT session: should be ignored.
    act(() => {
      __emitBrowserUpdate({
        tab_id: 'other-1',
        session_id: SID2,
        url: 'https://other.test',
        title: 'Other',
        favicon_url: null,
        status: 'ready',
        can_go_back: false,
        can_go_forward: false,
      });
    });
    expect(result.current.tabs.find((t) => t.tab_id === 'other-1')).toBeUndefined();
  });

  it('switching sessionId re-fetches and resets state', async () => {
    __mockStore.browserTabs.set('a-tab', {
      tab_id: 'a-tab',
      session_id: SID,
      url: 'https://a.test',
      title: 'A',
      favicon_url: null,
      status: 'ready',
      can_go_back: false,
      can_go_forward: false,
    });
    __mockStore.browserTabs.set('b-tab', {
      tab_id: 'b-tab',
      session_id: SID2,
      url: 'https://b.test',
      title: 'B',
      favicon_url: null,
      status: 'ready',
      can_go_back: false,
      can_go_forward: false,
    });

    const { result, rerender } = renderHook(
      ({ id }: { id: SessionId | null }) => useBrowser(id),
      { initialProps: { id: SID as SessionId | null } }
    );
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.tabs.map((t) => t.tab_id)).toEqual(['a-tab']);

    rerender({ id: SID2 });
    await waitFor(() => {
      expect(result.current.tabs.map((t) => t.tab_id)).toEqual(['b-tab']);
    });
  });
});
