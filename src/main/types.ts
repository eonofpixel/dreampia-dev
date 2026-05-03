/**
 * Types shared between main and renderer (preload-safe).
 *
 * IMPORTANT: This module MUST stay free of Node-only imports
 * (better-sqlite3, fs, path 등). Preload runs in a sandboxed
 * context where those modules are unavailable.
 *
 * Spec: docs/findings/round5-ipc-telemetry.md
 */

/**
 * Result wrapper for IPC handlers.
 *
 * IPC handlers must NEVER throw across the main↔renderer boundary —
 * stack traces leak file paths and internal structure. Wrap every
 * call in `Result<T>` and surface a string-only error to the renderer.
 */
export type Result<T> = { ok: true; value: T } | { ok: false; error: string };

/**
 * Patch shape for `session/update-meta` IPC.
 *
 * Defined here (not in `@/storage`) so preload can reference it
 * without importing the SessionStore module.
 */
export interface SessionMetaPatch {
  title?: string;
  pinned?: boolean;
  archived?: boolean;
}

/**
 * v0.5.0 (F-018) — Patch shape for `session/update-conversation` IPC.
 *
 * 슬래시 명령 `/model <name>` 에서 호출. current_effort / current_mode 도
 * 같은 채널로 변경 가능하도록 함께 노출 — 향후 `/effort high` 같은 명령을
 * 추가할 때 IPC 채널을 늘리지 않아도 된다.
 *
 * Defined here (not in `@/storage`) so preload can reference it without
 * pulling in SessionStore.
 */
export interface ConversationPatch {
  current_model?: string;
  current_effort?: 'minimum' | 'low' | 'medium' | 'high' | 'maximum';
  current_mode?: 'standard' | 'plan' | 'speed' | 'custom';
}

/**
 * Default workspace surfaced to the renderer for new sessions.
 *
 * Kept preload-safe: no branded types here because the renderer derives the
 * WorkspaceId from `root` with the browser-safe helper.
 */
export interface WorkspaceInfo {
  root: string;
  name: string;
}

/**
 * v0.8.0 — Patch shape for `session/update-permission` IPC.
 *
 * 세션의 permission.default_level 만 바꾸는 metadata 변경. grants 는 별도
 * 채널 (향후 추가 예정 — v0.13.0 custom 권한 management). Defined here (not
 * in `@/storage`) so preload can reference it without pulling in SessionStore.
 */
export interface PermissionPatch {
  default_level?: 'read_only' | 'workspace_write' | 'full_access' | 'custom';
}
