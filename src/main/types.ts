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
export type Result<T> =
  | { ok: true; value: T }
  | { ok: false; error: string };

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
