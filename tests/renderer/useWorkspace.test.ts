/**
 * useWorkspace test — Phase 2 picker hook.
 *
 * window.dreampia.workspace.* mock 은 tests/setup.ts 가 제공.
 * Tests 가 __mockStore.workspace / workspacePickNext 로 시나리오 inject.
 */

import { describe, it, expect, vi } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { useWorkspace } from '../../src/renderer/hooks/useWorkspace';
import { __mockStore } from '../setup';

describe('useWorkspace', () => {
  it('initial state: loading then null when no saved workspace', async () => {
    const { result } = renderHook(() => useWorkspace());
    expect(result.current.loading).toBe(true);
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.workspace).toBeNull();
  });

  it('loads saved workspace on mount', async () => {
    __mockStore.workspace = { path: '/saved/dir', name: 'dir' };
    const { result } = renderHook(() => useWorkspace());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.workspace).toEqual({ path: '/saved/dir', name: 'dir' });
  });

  it('pick() updates workspace and returns picked value', async () => {
    __mockStore.workspacePickNext = { path: '/just/picked', name: 'picked' };
    const { result } = renderHook(() => useWorkspace());
    await waitFor(() => expect(result.current.loading).toBe(false));

    let picked: { path: string; name: string } | null = null;
    await act(async () => {
      picked = await result.current.pick();
    });
    expect(picked).toEqual({ path: '/just/picked', name: 'picked' });
    expect(result.current.workspace).toEqual({ path: '/just/picked', name: 'picked' });
  });

  it('pick() returns null when user cancels (no state change)', async () => {
    __mockStore.workspace = { path: '/before', name: 'before' };
    __mockStore.workspacePickNext = null;
    const { result } = renderHook(() => useWorkspace());
    await waitFor(() => expect(result.current.loading).toBe(false));

    let picked: { path: string; name: string } | null = { path: 'x', name: 'x' };
    await act(async () => {
      picked = await result.current.pick();
    });
    expect(picked).toBeNull();
    // Workspace unchanged on cancel.
    expect(result.current.workspace).toEqual({ path: '/before', name: 'before' });
  });

  it('refresh() re-reads from main', async () => {
    __mockStore.workspace = null;
    const { result } = renderHook(() => useWorkspace());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.workspace).toBeNull();

    __mockStore.workspace = { path: '/changed', name: 'changed' };
    await act(async () => {
      await result.current.refresh();
    });
    expect(result.current.workspace).toEqual({ path: '/changed', name: 'changed' });
  });

  it('error path: get returns ok:false → sets error', async () => {
    const original = window.dreampia.workspace.get;
    window.dreampia.workspace.get = vi.fn(async () => ({
      ok: false as const,
      error: 'boom',
    }));
    try {
      const { result } = renderHook(() => useWorkspace());
      await waitFor(() => expect(result.current.loading).toBe(false));
      expect(result.current.error).toBe('boom');
    } finally {
      window.dreampia.workspace.get = original;
    }
  });
});
