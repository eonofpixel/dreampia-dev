/**
 * useSessionStore — IPC-backed session list + active session management.
 *
 * Replaces the in-memory `useState<Session[]>` from Day 6/7 with a hook
 * that round-trips through `window.dreampia.session.*` to the SQLite-backed
 * `SessionStore` in the main process.
 *
 * Architecture
 * ────────────
 *   sessions: SessionMeta[]     // lightweight list (used by Sidebar)
 *   activeSession: Session|null // full session for the active chat
 *
 * `listSessions` (main) deliberately omits sub-states (conversation,
 * workspace, …) so the sidebar stays cheap. The active chat needs the
 * full thing, so `selectSession(id)` fetches it via `session/get`.
 *
 * Streaming UX
 * ────────────
 * The renderer must NOT call `appendTurn` on every text_delta event —
 * that would round-trip through IPC + SQLite for each character. Pattern:
 *   1. user submit       → optimistic local push + appendTurn(userTurn)
 *   2. text_delta events → local state only
 *   3. message_complete  → appendTurn(assistantTurn) → refresh()
 *
 * Spec: docs/session/persistence.md, docs/ia/chat-flow.md
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import type { Session, SessionId, Turn } from '@/types';
import type {
  ConversationPatch,
  PermissionPatch,
  Result,
  SessionMetaPatch,
} from '@/main/types';

// SessionMeta shape (kept in sync with `@/storage` and preload).
// Defined here (not imported from `@/storage`) so the renderer never
// transitively pulls better-sqlite3.
export interface SessionMeta {
  id: SessionId;
  schema_version: number;
  provider: 'claude' | 'codex';
  workspace_id: string;
  title: string;
  pinned: boolean;
  archived: boolean;
  parent_session_id?: SessionId;
  created_at: string;
  updated_at: string;
}

export interface UseSessionStoreState {
  sessions: SessionMeta[];
  loading: boolean;
  error: string | null;
}

export interface UseSessionStoreApi {
  state: UseSessionStoreState;

  /** Re-fetch the session list from the main process. */
  refresh: () => Promise<void>;

  /** Persist a fresh session and refresh the list. Returns the session on success. */
  create: (session: Session) => Promise<Session | null>;

  /** Fetch a full session (with conversation, workspace, …) by id. */
  get: (id: SessionId) => Promise<Session | null>;

  /** Append one turn. Refreshes the list afterward. */
  appendTurn: (id: SessionId, turn: Turn) => Promise<boolean>;

  /** Update meta (title, pinned, archived). */
  updateMeta: (id: SessionId, patch: SessionMetaPatch) => Promise<boolean>;

  /** Delete a session and all child rows. */
  remove: (id: SessionId) => Promise<boolean>;

  /**
   * v0.5.0 (F-018) — `/clear` 슬래시 명령. 현재 세션의 모든 turn 삭제.
   * Refresh 까지 수행해 sidebar updated_at 도 즉시 반영.
   */
  clearTurns: (id: SessionId) => Promise<boolean>;

  /**
   * v0.5.0 (F-018) — `/model <name>` 슬래시 명령. conversation 의
   * current_model / current_effort / current_mode 갱신. 갱신된 Session 을
   * 반환해 caller 가 즉시 UI 에 반영할 수 있도록 한다 (활성 session shadow).
   */
  updateConversation: (id: SessionId, patch: ConversationPatch) => Promise<Session | null>;

  /**
   * v0.8.0 — H Permission Dropdown. 세션의 permission.default_level 갱신.
   * 갱신된 Session 을 반환해 caller (App.tsx) 가 local activeSession shadow
   * 즉시 갱신. 실패 (preload 누락 / store error) 시 null.
   */
  updatePermission: (id: SessionId, patch: PermissionPatch) => Promise<Session | null>;
}

/**
 * Has the IPC bridge been wired up yet? Tests may not mount it,
 * and SSR/preview environments definitely won't.
 */
function hasSessionApi(): boolean {
  return (
    typeof window !== 'undefined' &&
    window.dreampia !== undefined &&
    typeof window.dreampia.session === 'object' &&
    window.dreampia.session !== null
  );
}

export function useSessionStore(): UseSessionStoreApi {
  const [state, setState] = useState<UseSessionStoreState>({
    sessions: [],
    loading: true,
    error: null,
  });

  // Track mount state so async callbacks don't update state after unmount.
  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const safeSetState = useCallback(
    (updater: (s: UseSessionStoreState) => UseSessionStoreState): void => {
      if (!mountedRef.current) return;
      setState(updater);
    },
    []
  );

  const refresh = useCallback(async (): Promise<void> => {
    if (!hasSessionApi()) {
      safeSetState(() => ({
        sessions: [],
        loading: false,
        error: 'IPC not available',
      }));
      return;
    }

    safeSetState((s) => ({ ...s, loading: true, error: null }));
    const result = (await window.dreampia.session.list()) as Result<SessionMeta[]>;

    if (result.ok) {
      safeSetState(() => ({
        sessions: result.value,
        loading: false,
        error: null,
      }));
    } else {
      safeSetState(() => ({
        sessions: [],
        loading: false,
        error: result.error,
      }));
    }
  }, [safeSetState]);

  // Initial fetch — runs once on mount.
  useEffect(() => {
    void refresh();
  }, [refresh]);

  const create = useCallback(
    async (session: Session): Promise<Session | null> => {
      if (!hasSessionApi()) return null;
      const result = await window.dreampia.session.create(session);
      if (result.ok) {
        await refresh();
        return result.value;
      }
      safeSetState((s) => ({ ...s, error: result.error }));
      return null;
    },
    [refresh, safeSetState]
  );

  const get = useCallback(
    async (id: SessionId): Promise<Session | null> => {
      if (!hasSessionApi()) return null;
      const result = await window.dreampia.session.get(id);
      if (result.ok) return result.value;
      safeSetState((s) => ({ ...s, error: result.error }));
      return null;
    },
    [safeSetState]
  );

  const appendTurn = useCallback(
    async (id: SessionId, turn: Turn): Promise<boolean> => {
      if (!hasSessionApi()) return false;
      const result = await window.dreampia.session.appendTurn(id, turn);
      if (result.ok) {
        // Bumps updated_at — refresh so Sidebar re-orders.
        await refresh();
        return true;
      }
      safeSetState((s) => ({ ...s, error: result.error }));
      return false;
    },
    [refresh, safeSetState]
  );

  const updateMeta = useCallback(
    async (id: SessionId, patch: SessionMetaPatch): Promise<boolean> => {
      if (!hasSessionApi()) return false;
      const result = await window.dreampia.session.updateMeta(id, patch);
      if (result.ok) {
        await refresh();
        return true;
      }
      safeSetState((s) => ({ ...s, error: result.error }));
      return false;
    },
    [refresh, safeSetState]
  );

  const remove = useCallback(
    async (id: SessionId): Promise<boolean> => {
      if (!hasSessionApi()) return false;
      const result = await window.dreampia.session.delete(id);
      if (result.ok) {
        await refresh();
        return true;
      }
      safeSetState((s) => ({ ...s, error: result.error }));
      return false;
    },
    [refresh, safeSetState]
  );

  const clearTurns = useCallback(
    async (id: SessionId): Promise<boolean> => {
      if (!hasSessionApi()) return false;
      // clearTurns 는 v0.5.0 추가 — preload 가 안 갱신된 환경 (테스트 격리,
      // 구버전 build) 에서도 안전하게 false 반환.
      const sessionApi = window.dreampia.session;
      if (typeof sessionApi.clearTurns !== 'function') return false;
      const result = await sessionApi.clearTurns(id);
      if (result.ok) {
        await refresh();
        return true;
      }
      safeSetState((s) => ({ ...s, error: result.error }));
      return false;
    },
    [refresh, safeSetState]
  );

  const updateConversation = useCallback(
    async (id: SessionId, patch: ConversationPatch): Promise<Session | null> => {
      if (!hasSessionApi()) return null;
      const sessionApi = window.dreampia.session;
      if (typeof sessionApi.updateConversation !== 'function') return null;
      const result = await sessionApi.updateConversation(id, patch);
      if (result.ok) {
        await refresh();
        return result.value;
      }
      safeSetState((s) => ({ ...s, error: result.error }));
      return null;
    },
    [refresh, safeSetState]
  );

  const updatePermission = useCallback(
    async (id: SessionId, patch: PermissionPatch): Promise<Session | null> => {
      if (!hasSessionApi()) return null;
      const sessionApi = window.dreampia.session;
      // updatePermission 은 v0.8.0 추가 — 구버전 preload / 테스트 격리에서
      // 안전하게 null 반환.
      if (typeof sessionApi.updatePermission !== 'function') return null;
      const result = await sessionApi.updatePermission(id, patch);
      if (result.ok) {
        await refresh();
        return result.value;
      }
      safeSetState((s) => ({ ...s, error: result.error }));
      return null;
    },
    [refresh, safeSetState]
  );

  return {
    state,
    refresh,
    create,
    get,
    appendTurn,
    updateMeta,
    remove,
    clearTurns,
    updateConversation,
    updatePermission,
  };
}
