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
import type { Result, SessionMetaPatch, WorkspaceInfo } from './types';

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

// BrowserTabState mirrored from `@/main/BrowserManager.ts`. Inlined here so
// preload doesn't transitively import Electron-only modules. Keep in sync.
interface BrowserTabStateShape {
  tab_id: string;
  session_id: SessionId;
  url: string;
  title: string;
  favicon_url: string | null;
  status: 'loading' | 'ready' | 'failed';
  can_go_back: boolean;
  can_go_forward: boolean;
}

interface BrowserBoundsShape {
  x: number;
  y: number;
  width: number;
  height: number;
}

// AI shapes (P1-4). Inlined here so preload doesn't import @/providers
// (which transitively pulls in Node-only modules — child_process, fs).
// Keep these in sync with @/providers/cli/detect.ts and @/providers/types.ts.
interface CliInfoShape {
  path: string;
  version: string | null;
}
interface CliDetectionShape {
  claude: CliInfoShape | null;
  codex: CliInfoShape | null;
}

// StreamEvent shape — discriminated union mirrored from @/providers/types.
// Renderer-side IpcStreamingProvider casts this back to the strict type.
type StreamEventShape =
  | { type: 'message_start'; turn_id: string; model: string }
  | { type: 'text_delta'; text: string }
  | {
      type: 'tool_call_start';
      tool_call: { id: string; tool_id: string; input?: unknown };
    }
  | { type: 'tool_call_input_delta'; tool_call_id: string; partial_input: string }
  | { type: 'tool_call_complete'; tool_call: { id: string; tool_id: string; input?: unknown } }
  | { type: 'tool_result'; result: ToolResultRefShape }
  | { type: 'message_complete'; turn: Turn }
  | { type: 'error'; error: string };

interface AiStreamEventPayload {
  stream_id: string;
  event: StreamEventShape;
}
interface AiStreamEndPayload {
  stream_id: string;
}

interface ToolCallShape {
  id: string;
  tool_id: string;
  session_id: string;
  turn_id: string;
  parent_call_id?: string;
  input: unknown;
  timeout_ms?: number;
  priority?: 'high' | 'normal' | 'low';
  origin: 'ai' | 'user' | 'automation';
  created_at: string;
}

interface ToolResultRefShape {
  call_id: string;
  status: 'success' | 'failed' | 'cancelled' | 'timeout';
  output?: unknown;
  error?: {
    code: string;
    message: string;
  };
  duration_ms: number;
}

interface ToolResultShape {
  call_id: string;
  tool_id: string;
  status: 'success' | 'failed' | 'cancelled' | 'timeout';
  output?: unknown;
  error?: {
    code: string;
    message: string;
    details?: Record<string, unknown>;
    retryable: boolean;
    user_visible_hint?: string;
  };
  started_at: string;
  completed_at: string;
  duration_ms: number;
  attempt_count: number;
  side_effects: never[];
  log_tail: Array<{
    level: 'debug' | 'info' | 'warn' | 'error';
    timestamp: string;
    message: string;
    data?: Record<string, unknown>;
  }>;
}

// Whitelist of IPC channels (security)
const ALLOWED_INVOKE_CHANNELS = [
  'app:get-version',
  'app:get-platform',
  'app:get-default-workspace',
  'app:get-onboarding-status',
  'app:complete-onboarding',
  'workspace/pick-folder',
  'workspace/get',
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
  'browser/open-tab',
  'browser/close-tab',
  'browser/switch-tab',
  'browser/navigate',
  'browser/back',
  'browser/forward',
  'browser/reload',
  'browser/set-bounds',
  'browser/list-tabs',
  'ai/detect-cli',
  'ai/start-stream',
  'ai/stop-stream',
  'tool/list',
  'tool/execute',
  'tool/cancel-call',
  'tool/cancel-turn',
  'tool/stats',
] as const;

const ALLOWED_RECEIVE_CHANNELS = [
  'browser/tab-updated',
  'ai/stream-event',
  'ai/stream-end',
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
   * App/runtime information that is safe to expose to the renderer.
   */
  app: {
    /**
     * Phase 3 audit: packaged build 에서 settings 가 없으면 null 반환.
     * Renderer 는 null 시 picker / onboarding 으로 안내.
     */
    getDefaultWorkspace: (): Promise<Result<WorkspaceInfo | null>> =>
      ipcRenderer.invoke('app:get-default-workspace') as Promise<Result<WorkspaceInfo | null>>,

    /**
     * Phase 3 B2: 첫 실행 wizard 표시 여부 결정용.
     * settings.onboarding_completed === true 인 경우만 completed:true.
     * Spec: docs/ia/onboarding.md
     */
    getOnboardingStatus: (): Promise<Result<{ completed: boolean }>> =>
      ipcRenderer.invoke('app:get-onboarding-status') as Promise<Result<{ completed: boolean }>>,

    /**
     * Phase 3 B2: 사용자가 wizard 끝냈을 때 또는 건너뛰기 클릭 시 호출.
     * settings.onboarding_completed=true 로 영속.
     */
    completeOnboarding: (): Promise<Result<void>> =>
      ipcRenderer.invoke('app:complete-onboarding') as Promise<Result<void>>,
  },

  /**
   * Workspace picker — main 이 OS-native 폴더 다이얼로그 표시 +
   * 선택된 경로를 settings.json 에 저장.
   *
   * Spec: docs/permission/levels.md (workspace_write 는 사용자 의도된 폴더 한정)
   */
  workspace: {
    pickFolder: (): Promise<Result<{ path: string; name: string } | null>> =>
      ipcRenderer.invoke('workspace/pick-folder') as Promise<
        Result<{ path: string; name: string } | null>
      >,

    get: (): Promise<Result<{ path: string; name: string } | null>> =>
      ipcRenderer.invoke('workspace/get') as Promise<Result<{ path: string; name: string } | null>>,
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

    updateMeta: (id: SessionId, patch: SessionMetaPatch): Promise<Result<void>> =>
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
    ): Promise<Result<{ acquired: boolean; leader: SessionLockShape | null }>> =>
      ipcRenderer.invoke('lock/acquire', sessionId) as Promise<
        Result<{ acquired: boolean; leader: SessionLockShape | null }>
      >,

    release: (sessionId: SessionId): Promise<Result<void>> =>
      ipcRenderer.invoke('lock/release', sessionId) as Promise<Result<void>>,

    get: (sessionId: SessionId): Promise<Result<SessionLockShape | null>> =>
      ipcRenderer.invoke('lock/get', sessionId) as Promise<Result<SessionLockShape | null>>,

    heartbeat: (sessionId: SessionId): Promise<Result<boolean>> =>
      ipcRenderer.invoke('lock/heartbeat', sessionId) as Promise<Result<boolean>>,

    isLeader: (sessionId: SessionId): Promise<Result<boolean>> =>
      ipcRenderer.invoke('lock/is-leader', sessionId) as Promise<Result<boolean>>,
  },

  /**
   * In-app browser (P1-5).
   *
   * Spec: docs/session/browser.md
   *
   * Renderer drives tab CRUD; main owns the WebContentsView lifecycle.
   * Per-session partition isolation matches the Codex codex-browser-app
   * pattern (see `partitionIdFor` in @/types/helpers).
   *
   * `onTabUpdated` returns an unsubscribe function — callers MUST invoke
   * it on unmount to avoid leaking listeners.
   */
  browser: {
    openTab: (args: {
      session_id: SessionId;
      tab_id: string;
      url: string;
    }): Promise<Result<BrowserTabStateShape>> =>
      ipcRenderer.invoke('browser/open-tab', args) as Promise<Result<BrowserTabStateShape>>,

    closeTab: (tabId: string): Promise<Result<void>> =>
      ipcRenderer.invoke('browser/close-tab', tabId) as Promise<Result<void>>,

    switchTab: (sessionId: SessionId, tabId: string): Promise<Result<void>> =>
      ipcRenderer.invoke('browser/switch-tab', sessionId, tabId) as Promise<Result<void>>,

    navigate: (tabId: string, url: string): Promise<Result<void>> =>
      ipcRenderer.invoke('browser/navigate', tabId, url) as Promise<Result<void>>,

    back: (tabId: string): Promise<Result<void>> =>
      ipcRenderer.invoke('browser/back', tabId) as Promise<Result<void>>,

    forward: (tabId: string): Promise<Result<void>> =>
      ipcRenderer.invoke('browser/forward', tabId) as Promise<Result<void>>,

    reload: (tabId: string): Promise<Result<void>> =>
      ipcRenderer.invoke('browser/reload', tabId) as Promise<Result<void>>,

    setBounds: (tabId: string, bounds: BrowserBoundsShape): Promise<Result<void>> =>
      ipcRenderer.invoke('browser/set-bounds', tabId, bounds) as Promise<Result<void>>,

    listTabs: (sessionId: SessionId): Promise<Result<BrowserTabStateShape[]>> =>
      ipcRenderer.invoke('browser/list-tabs', sessionId) as Promise<Result<BrowserTabStateShape[]>>,

    onTabUpdated: (listener: (state: BrowserTabStateShape) => void): (() => void) => {
      const handler = (_event: Electron.IpcRendererEvent, state: BrowserTabStateShape): void => {
        listener(state);
      };
      ipcRenderer.on('browser/tab-updated', handler);
      return () => ipcRenderer.removeListener('browser/tab-updated', handler);
    },
  },

  /**
   * AI streaming via real CLI subprocesses (P1-4).
   *
   * Spec: docs/session/cross-ai-sync.md
   *
   * Flow:
   *   1) detectCli() — onboarding 에서 호출, 설치된 CLI 위치+버전 표시
   *   2) startStream({stream_id, model, turns}) — main 이 적합한 provider 선택,
   *      stream_id 단위로 격리된 stream 시작. main 은 즉시 응답, 후속
   *      이벤트는 onStreamEvent / onStreamEnd 로 흘러옴.
   *   3) stopStream(stream_id) — mid-stream cancel.
   *
   * onStreamEvent / onStreamEnd 는 unsubscribe 함수를 반환 — 반드시 호출!
   */
  ai: {
    detectCli: (): Promise<Result<CliDetectionShape>> =>
      ipcRenderer.invoke('ai/detect-cli') as Promise<Result<CliDetectionShape>>,

    startStream: (args: {
      stream_id: string;
      model: string;
      turns: Turn[];
      session_id?: string;
      workspace_root?: string;
      // PermissionLevel mirrored as string-literal union so preload doesn't
      // depend on @/types runtime import (preload sandbox-safety). Keep
      // in sync with `PermissionLevelSchema` in @/types/permission.
      permission_level?: 'read_only' | 'workspace_write' | 'full_access' | 'custom';
    }): Promise<Result<{ stream_id: string; source: string }>> =>
      ipcRenderer.invoke('ai/start-stream', args) as Promise<
        Result<{ stream_id: string; source: string }>
      >,

    stopStream: (streamId: string): Promise<Result<void>> =>
      ipcRenderer.invoke('ai/stop-stream', streamId) as Promise<Result<void>>,

    onStreamEvent: (listener: (payload: AiStreamEventPayload) => void): (() => void) => {
      const handler = (_event: Electron.IpcRendererEvent, payload: AiStreamEventPayload): void => {
        listener(payload);
      };
      ipcRenderer.on('ai/stream-event', handler);
      return () => ipcRenderer.removeListener('ai/stream-event', handler);
    },

    onStreamEnd: (listener: (payload: AiStreamEndPayload) => void): (() => void) => {
      const handler = (_event: Electron.IpcRendererEvent, payload: AiStreamEndPayload): void => {
        listener(payload);
      };
      ipcRenderer.on('ai/stream-end', handler);
      return () => ipcRenderer.removeListener('ai/stream-end', handler);
    },
  },

  /**
   * Tool Queue bridge. Main owns the registry and execution queue; renderer
   * receives only serializable call/result objects.
   */
  tool: {
    list: (): Promise<
      Result<Array<{ id: string; version: string; source: string; name: string }>>
    > =>
      ipcRenderer.invoke('tool/list') as Promise<
        Result<Array<{ id: string; version: string; source: string; name: string }>>
      >,

    execute: (call: ToolCallShape): Promise<Result<ToolResultShape>> =>
      ipcRenderer.invoke('tool/execute', call) as Promise<Result<ToolResultShape>>,

    cancelCall: (callId: string, reason?: string): Promise<Result<boolean>> =>
      ipcRenderer.invoke('tool/cancel-call', callId, reason) as Promise<Result<boolean>>,

    cancelTurn: (turnId: string, reason?: string): Promise<Result<number>> =>
      ipcRenderer.invoke('tool/cancel-turn', turnId, reason) as Promise<Result<number>>,

    stats: (): Promise<
      Result<{ active: number; pending: number; by_session: Record<string, number> }>
    > =>
      ipcRenderer.invoke('tool/stats') as Promise<
        Result<{ active: number; pending: number; by_session: Record<string, number> }>
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
