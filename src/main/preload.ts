/**
 * Electron Preload Script
 *
 * IPC bridge between main and renderer.
 *
 * Spec: docs/findings/round5-ipc-telemetry.md (AppServerConnection 패턴)
 *
 * IMPORTANT — sandbox safety:
 *   This file runs in a sandboxed renderer-side context. Node-only modules
 *   (better-sqlite3, fs, path) are unavailable. Only `electron` and pure
 *   type-only imports are safe. Specifically: do NOT `import { SessionStore }
 *   from '@/storage'` here — that pulls in better-sqlite3 and crashes preload.
 */

import { contextBridge, ipcRenderer } from 'electron';
import type { Session, SessionId, Turn } from '@/types';
import type { Result, SessionMetaPatch } from './types';

// SessionMeta is a struct from `@/storage`. Re-declare inline so this file
// stays free of the storage module. Keep this in sync with `SessionStore`.
interface SessionMetaShape {
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

// SessionLock shape mirrored from `@/storage/LeaderElection.ts`. Inlined here
// so this preload script stays free of the better-sqlite3 import chain.
// Keep in sync with `LeaderElection.SessionLock`.
interface SessionLockShape {
  session_id: SessionId;
  leader_window_id: string;
  leader_pid: number;
  acquired_at: string;
  heartbeat_at: string;
  ttl_seconds: number;
}

// Whitelist of IPC channels (security)
const ALLOWED_INVOKE_CHANNELS = [
  'app:get-version',
  'app:get-platform',
  'session/list',
  'session/get',
  'session/create',
  'session/append-turn',
  'session/update-meta',
  'session/delete',
  'lock/acquire',
  'lock/release',
  'lock/get',
  'lock/heartbeat',
  'lock/is-leader',
] as const;

const ALLOWED_RECEIVE_CHANNELS = [
  // Phase 2+:
  // 'session:updated',
  // 'tool:result',
] as const;

type AllowedInvokeChannel = (typeof ALLOWED_INVOKE_CHANNELS)[number];
type AllowedReceiveChannel = (typeof ALLOWED_RECEIVE_CHANNELS)[number];

const api = {
  /**
   * Invoke main process method (request/response).
   */
  invoke: (channel: AllowedInvokeChannel, ...args: unknown[]): Promise<unknown> => {
    if (!ALLOWED_INVOKE_CHANNELS.includes(channel)) {
      throw new Error(`IPC channel not allowed: ${channel}`);
    }
    return ipcRenderer.invoke(channel, ...args);
  },

  /**
   * Listen for main process events.
   */
  on: (channel: AllowedReceiveChannel, listener: (...args: unknown[]) => void): (() => void) => {
    if (!ALLOWED_RECEIVE_CHANNELS.includes(channel)) {
      throw new Error(`IPC channel not allowed: ${channel}`);
    }
    const handler = (_event: Electron.IpcRendererEvent, ...args: unknown[]): void => {
      listener(...args);
    };
    ipcRenderer.on(channel, handler);
    return () => ipcRenderer.removeListener(channel, handler);
  },

  /**
   * Typed SessionStore API.
   *
   * Each method returns `Result<T>` so callers can branch on `.ok`
   * without try/catch around IPC. `Result.error` is always a string —
   * stack traces never cross the boundary.
   */
  session: {
    list: (): Promise<Result<SessionMetaShape[]>> =>
      ipcRenderer.invoke('session/list') as Promise<Result<SessionMetaShape[]>>,

    get: (id: SessionId): Promise<Result<Session | null>> =>
      ipcRenderer.invoke('session/get', id) as Promise<Result<Session | null>>,

    create: (session: Session): Promise<Result<Session>> =>
      ipcRenderer.invoke('session/create', session) as Promise<Result<Session>>,

    appendTurn: (id: SessionId, turn: Turn): Promise<Result<void>> =>
      ipcRenderer.invoke('session/append-turn', id, turn) as Promise<Result<void>>,

    updateMeta: (
      id: SessionId,
      patch: SessionMetaPatch
    ): Promise<Result<void>> =>
      ipcRenderer.invoke('session/update-meta', id, patch) as Promise<Result<void>>,

    delete: (id: SessionId): Promise<Result<void>> =>
      ipcRenderer.invoke('session/delete', id) as Promise<Result<void>>,
  },

  /**
   * Multi-window leader election (SS-5).
   *
   * Spec: docs/session/multi-window.md
   *
   * `acquire` returns whether THIS window is now leader plus the current
   * leader info. `isLeader` is computed in main (which knows the window_id);
   * the renderer never sees its own window_id directly.
   */
  lock: {
    acquire: (
      sessionId: SessionId
    ): Promise<
      Result<{ acquired: boolean; leader: SessionLockShape | null }>
    > =>
      ipcRenderer.invoke('lock/acquire', sessionId) as Promise<
        Result<{ acquired: boolean; leader: SessionLockShape | null }>
      >,

    release: (sessionId: SessionId): Promise<Result<void>> =>
      ipcRenderer.invoke('lock/release', sessionId) as Promise<Result<void>>,

    get: (sessionId: SessionId): Promise<Result<SessionLockShape | null>> =>
      ipcRenderer.invoke('lock/get', sessionId) as Promise<
        Result<SessionLockShape | null>
      >,

    heartbeat: (sessionId: SessionId): Promise<Result<boolean>> =>
      ipcRenderer.invoke('lock/heartbeat', sessionId) as Promise<
        Result<boolean>
      >,

    isLeader: (sessionId: SessionId): Promise<Result<boolean>> =>
      ipcRenderer.invoke('lock/is-leader', sessionId) as Promise<
        Result<boolean>
      >,
  },
};

contextBridge.exposeInMainWorld('dreampia', api);

// TypeScript: window.dreampia type
declare global {
  interface Window {
    dreampia: typeof api;
  }
}
