/**
 * useLeaderElection — Renderer hook for multi-window leader election (SS-5).
 *
 * Spec: docs/session/multi-window.md
 *
 * Wraps the `window.dreampia.lock.*` IPC namespace. Tracks current leader
 * and whether THIS window holds the lock. The hook does NOT auto-acquire;
 * the UI decides when to attempt acquisition (e.g., "open in mini window"
 * intent).
 *
 * Architecture
 * ────────────
 *   The renderer never knows its own window_id. `isLeader` is computed in
 *   the main process (which has the LeaderElection instance) and surfaced
 *   via the `lock/is-leader` IPC channel. This avoids leaking the internal
 *   window identifier across the boundary.
 *
 *   `leader` is the public-facing shape: a subset of SessionLock that
 *   followers may want to display (e.g. "leader since 11:43 AM"). It does
 *   NOT include ttl_seconds since that's an internal lifetime knob.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import type { SessionId } from '@/types';
import type { Result } from '@/main/types';

// ────────────────────────────────────────────────────────────
// Public types
// ────────────────────────────────────────────────────────────

/** Display-friendly subset of SessionLock for renderer consumption. */
export interface LeaderInfo {
  window_id: string;
  pid: number;
  acquired_at: string;
  heartbeat_at: string;
}

export interface UseLeaderElectionState {
  isLeader: boolean;
  leader: LeaderInfo | null;
  loading: boolean;
  error: string | null;
}

export interface UseLeaderElectionReturn extends UseLeaderElectionState {
  /** Try to acquire leadership. Returns true on success. */
  acquire: () => Promise<boolean>;
  /** Release leadership. No-op if we don't own it. */
  release: () => Promise<void>;
  /** Re-fetch current leader from main. */
  refresh: () => Promise<void>;
}

// SessionLock shape mirrored from `@/storage/LeaderElection.ts`. Inlined here
// so the renderer never pulls better-sqlite3 transitively. Keep in sync.
interface SessionLockShape {
  session_id: SessionId;
  leader_window_id: string;
  leader_pid: number;
  acquired_at: string;
  heartbeat_at: string;
  ttl_seconds: number;
}

// Re-declared locally to avoid coupling to a private preload type.
interface LockApi {
  acquire: (
    sessionId: SessionId
  ) => Promise<Result<{ acquired: boolean; leader: SessionLockShape | null }>>;
  release: (sessionId: SessionId) => Promise<Result<void>>;
  get: (sessionId: SessionId) => Promise<Result<SessionLockShape | null>>;
  heartbeat: (sessionId: SessionId) => Promise<Result<boolean>>;
  isLeader: (sessionId: SessionId) => Promise<Result<boolean>>;
}

// ────────────────────────────────────────────────────────────
// Helpers
// ────────────────────────────────────────────────────────────

function getLockApi(): LockApi | null {
  if (typeof window === 'undefined') return null;
  const dp = (window as unknown as { dreampia?: { lock?: LockApi } }).dreampia;
  if (!dp || typeof dp.lock !== 'object' || dp.lock === null) return null;
  return dp.lock;
}

function lockToInfo(lock: SessionLockShape | null): LeaderInfo | null {
  if (!lock) return null;
  return {
    window_id: lock.leader_window_id,
    pid: lock.leader_pid,
    acquired_at: lock.acquired_at,
    heartbeat_at: lock.heartbeat_at,
  };
}

// ────────────────────────────────────────────────────────────
// Hook
// ────────────────────────────────────────────────────────────

const INITIAL_STATE: UseLeaderElectionState = {
  isLeader: false,
  leader: null,
  loading: false,
  error: null,
};

export function useLeaderElection(
  sessionId: SessionId | null
): UseLeaderElectionReturn {
  const [state, setState] = useState<UseLeaderElectionState>(INITIAL_STATE);

  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const safeSet = useCallback(
    (
      updater: (s: UseLeaderElectionState) => UseLeaderElectionState
    ): void => {
      if (!mountedRef.current) return;
      setState(updater);
    },
    []
  );

  const refresh = useCallback(async (): Promise<void> => {
    const api = getLockApi();
    if (!api || !sessionId) {
      safeSet(() => ({ ...INITIAL_STATE }));
      return;
    }
    safeSet((s) => ({ ...s, loading: true, error: null }));
    const [getRes, isLeaderRes] = await Promise.all([
      api.get(sessionId),
      api.isLeader(sessionId),
    ]);
    if (!getRes.ok) {
      safeSet((s) => ({ ...s, loading: false, error: getRes.error }));
      return;
    }
    if (!isLeaderRes.ok) {
      safeSet((s) => ({ ...s, loading: false, error: isLeaderRes.error }));
      return;
    }
    safeSet(() => ({
      leader: lockToInfo(getRes.value),
      isLeader: isLeaderRes.value,
      loading: false,
      error: null,
    }));
  }, [sessionId, safeSet]);

  const acquire = useCallback(async (): Promise<boolean> => {
    const api = getLockApi();
    if (!api || !sessionId) return false;
    safeSet((s) => ({ ...s, loading: true, error: null }));
    const result = await api.acquire(sessionId);
    if (!result.ok) {
      safeSet((s) => ({ ...s, loading: false, error: result.error }));
      return false;
    }
    safeSet(() => ({
      leader: lockToInfo(result.value.leader),
      // If we acquired, we ARE the leader. Otherwise refresh isLeader from main.
      // For simplicity we trust `acquired` here — the hook caller can call
      // refresh() afterward if they need an authoritative re-check.
      isLeader: result.value.acquired,
      loading: false,
      error: null,
    }));
    return result.value.acquired;
  }, [sessionId, safeSet]);

  const release = useCallback(async (): Promise<void> => {
    const api = getLockApi();
    if (!api || !sessionId) return;
    const result = await api.release(sessionId);
    if (!result.ok) {
      safeSet((s) => ({ ...s, error: result.error }));
      return;
    }
    safeSet(() => ({ ...INITIAL_STATE }));
  }, [sessionId, safeSet]);

  // Auto-fetch when sessionId changes (initial mount or session swap).
  // For P1-6 we don't auto-acquire; UI decides.
  useEffect(() => {
    void refresh();
  }, [refresh]);

  return { ...state, acquire, release, refresh };
}
