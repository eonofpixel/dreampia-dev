/**
 * Helpers for ID generation and normalization.
 *
 * All functions here are browser-safe (no node:* imports) so they work
 * in both Electron main and renderer (sandboxed).
 *
 * Spec: docs/session/schema.md (UUIDv7 + workspace hash)
 */

import { v7 as uuidv7 } from 'uuid';
import type {
  SessionId,
  TurnId,
  ToolCallId,
  WorkspaceId,
  WorkTreeId,
  PaneId,
  TabId,
} from './common';

// ────────────────────────────────────────────────────────────
// ID factories (branded types)
// ────────────────────────────────────────────────────────────

export const newSessionId = (): SessionId => uuidv7() as SessionId;
export const newTurnId = (): TurnId => uuidv7() as TurnId;
export const newToolCallId = (): ToolCallId => uuidv7() as ToolCallId;
export const newWorkTreeId = (): WorkTreeId => uuidv7() as WorkTreeId;
export const newPaneId = (): PaneId => uuidv7() as PaneId;
export const newTabId = (): TabId => uuidv7() as TabId;

// ────────────────────────────────────────────────────────────
// FNV-1a 64-bit hash (browser + node safe, no deps)
// ────────────────────────────────────────────────────────────

const FNV_OFFSET = 0xcbf29ce484222325n;
const FNV_PRIME = 0x100000001b3n;
const FNV_MASK = 0xffffffffffffffffn;

/** Deterministic 64-bit hash. Not cryptographic. */
function fnv1a(str: string): string {
  let h = FNV_OFFSET;
  const bytes = new TextEncoder().encode(str);
  for (let i = 0; i < bytes.length; i += 1) {
    h ^= BigInt(bytes[i]!);
    h = (h * FNV_PRIME) & FNV_MASK;
  }
  return h.toString(16).padStart(16, '0');
}

// ────────────────────────────────────────────────────────────
// WorkspaceId derivation (deterministic from path)
// ────────────────────────────────────────────────────────────

/**
 * Derive a stable WorkspaceId from an absolute path.
 *
 * Normalization:
 *   - Lowercase (Windows case-insensitive)
 *   - Forward-slash separators
 *   - FNV-1a 64-bit hash (16 hex chars)
 *
 * Same path → same id. Different cases / separators → same id.
 *
 * Example:
 *   workspaceIdFor('C:\\Dev\\foo')   → "ws-<16 hex>"
 *   workspaceIdFor('c:/dev/foo')     → "ws-<same>"
 *
 * Note: FNV-1a is not cryptographic. For workspace identification it's
 * sufficient (collision risk negligible for human-scale path counts).
 */
export function workspaceIdFor(absolutePath: string): WorkspaceId {
  const normalized = absolutePath.toLowerCase().replace(/\\/g, '/');
  const hash = fnv1a(normalized);
  return `ws-${hash}` as WorkspaceId;
}

// ────────────────────────────────────────────────────────────
// Browser partition id (Codex codex-browser-app pattern)
// ────────────────────────────────────────────────────────────

/**
 * Generate the Electron Partition id for a session's in-app browser.
 * Each session gets an isolated partition.
 *
 * Spec: docs/findings/round5-msix-paths.md (codex-browser-app pattern)
 */
export function partitionIdFor(sessionId: SessionId): string {
  return `persist:dreampia-browser-app-${sessionId}`;
}

// ────────────────────────────────────────────────────────────
// ISO8601 helpers
// ────────────────────────────────────────────────────────────

export const nowIso = (): string => new Date().toISOString();
