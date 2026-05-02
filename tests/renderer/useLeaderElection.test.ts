/**
 * useLeaderElection — renderer hook tests (SS-5).
 *
 * Uses the in-memory `__mockStore.locks` from tests/setup.ts which
 * exposes the same `window.dreampia.lock.*` API as the production preload.
 *
 * Spec: docs/session/multi-window.md
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';

import { useLeaderElection } from '../../src/renderer/hooks/useLeaderElection';
import type { SessionId } from '../../src/types';
import { __mockStore } from '../setup';

const SID = '019d0099-0000-7000-8000-000000000001' as SessionId;

describe('useLeaderElection', () => {
  beforeEach(() => {
    __mockStore.locks.clear();
    __mockStore.windowId = 'test-window-1';
  });

  it('with null sessionId stays in initial state and never calls IPC', async () => {
    const { result } = renderHook(() => useLeaderElection(null));

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });
    expect(result.current.isLeader).toBe(false);
    expect(result.current.leader).toBeNull();
    expect(result.current.error).toBeNull();
  });

  it('valid sessionId loads the current leader on mount', async () => {
    // Pre-seed a lock owned by another window so the hook doesn't claim it.
    __mockStore.locks.set(SID, {
      session_id: SID,
      leader_window_id: 'other-window',
      leader_pid: 9999,
      acquired_at: '2026-05-02T00:00:00.000Z',
      heartbeat_at: '2026-05-02T00:00:01.000Z',
      ttl_seconds: 30,
    });

    const { result } = renderHook(() => useLeaderElection(SID));

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });
    expect(result.current.leader).not.toBeNull();
    expect(result.current.leader?.window_id).toBe('other-window');
    expect(result.current.isLeader).toBe(false);
  });

  it('acquire() updates isLeader and leader info on success', async () => {
    const { result } = renderHook(() => useLeaderElection(SID));
    await waitFor(() => expect(result.current.loading).toBe(false));

    let acquired = false;
    await act(async () => {
      acquired = await result.current.acquire();
    });

    expect(acquired).toBe(true);
    expect(result.current.isLeader).toBe(true);
    expect(result.current.leader?.window_id).toBe('test-window-1');
  });

  it('acquire() returns false when another window holds a fresh lock', async () => {
    __mockStore.locks.set(SID, {
      session_id: SID,
      leader_window_id: 'other-window',
      leader_pid: 9999,
      acquired_at: new Date().toISOString(),
      heartbeat_at: new Date().toISOString(),
      ttl_seconds: 30,
    });

    const { result } = renderHook(() => useLeaderElection(SID));
    await waitFor(() => expect(result.current.loading).toBe(false));

    let acquired = true;
    await act(async () => {
      acquired = await result.current.acquire();
    });

    expect(acquired).toBe(false);
    expect(result.current.isLeader).toBe(false);
    expect(result.current.leader?.window_id).toBe('other-window');
  });

  it('release() clears local state and removes the lock', async () => {
    const { result } = renderHook(() => useLeaderElection(SID));
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await result.current.acquire();
    });
    expect(result.current.isLeader).toBe(true);

    await act(async () => {
      await result.current.release();
    });

    expect(result.current.isLeader).toBe(false);
    expect(result.current.leader).toBeNull();
    expect(__mockStore.locks.has(SID)).toBe(false);
  });

  it('refresh() re-fetches when lock changes externally', async () => {
    const { result } = renderHook(() => useLeaderElection(SID));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.leader).toBeNull();

    // Simulate external acquisition by another window.
    __mockStore.locks.set(SID, {
      session_id: SID,
      leader_window_id: 'external-window',
      leader_pid: 5555,
      acquired_at: new Date().toISOString(),
      heartbeat_at: new Date().toISOString(),
      ttl_seconds: 30,
    });

    await act(async () => {
      await result.current.refresh();
    });

    expect(result.current.leader?.window_id).toBe('external-window');
    expect(result.current.isLeader).toBe(false);
  });

  it('switching sessionId causes a re-fetch', async () => {
    const SID2 = '019d0099-0000-7000-8000-000000000002' as SessionId;
    __mockStore.locks.set(SID2, {
      session_id: SID2,
      leader_window_id: 'sid2-owner',
      leader_pid: 1111,
      acquired_at: new Date().toISOString(),
      heartbeat_at: new Date().toISOString(),
      ttl_seconds: 30,
    });

    const { result, rerender } = renderHook(
      ({ id }: { id: SessionId | null }) => useLeaderElection(id),
      { initialProps: { id: SID as SessionId | null } }
    );
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.leader).toBeNull();

    rerender({ id: SID2 });
    await waitFor(() => {
      expect(result.current.leader?.window_id).toBe('sid2-owner');
    });
  });
});
