/**
 * Common types shared across the schema.
 *
 * Spec: docs/session/schema.md, docs/session/principles.md
 */

import { z } from 'zod';

// ────────────────────────────────────────────────────────────
// Branded ID types (UUIDv7)
// ────────────────────────────────────────────────────────────

/**
 * Session identifier. UUIDv7 for time-ordered.
 * Example: "019de353-be46-7631-8000-827cfdb87ef8"
 */
export type SessionId = string & { readonly __brand: 'SessionId' };

/** Turn identifier within a session. UUIDv7. */
export type TurnId = string & { readonly __brand: 'TurnId' };

/** Tool call identifier. UUIDv7. */
export type ToolCallId = string & { readonly __brand: 'ToolCallId' };

/** Workspace identifier. SHA256(normalized_root) prefix-16. */
export type WorkspaceId = string & { readonly __brand: 'WorkspaceId' };

/** WorkTree identifier within a workspace. */
export type WorkTreeId = string & { readonly __brand: 'WorkTreeId' };

/** Terminal pane identifier. */
export type PaneId = string & { readonly __brand: 'PaneId' };

/** Browser tab identifier. */
export type TabId = string & { readonly __brand: 'TabId' };

// ────────────────────────────────────────────────────────────
// Primitive types (validated)
// ────────────────────────────────────────────────────────────

/** ISO 8601 date string. Example: "2026-05-02T01:54:00.000Z" */
export type ISO8601 = string;

/** URI - file://, blob://, http(s)://, dreampia-dev:// */
export type Uri = string;

/** Absolute file system path. */
export type AbsolutePath = string;

/** Base64 encoded data. */
export type Base64 = string;

// ────────────────────────────────────────────────────────────
// Zod schemas (runtime validation)
// ────────────────────────────────────────────────────────────

/** UUIDv7 pattern: time-ordered UUID. */
const UUIDV7_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export const SessionIdSchema = z
  .string()
  .regex(UUIDV7_REGEX, 'Must be UUIDv7')
  .transform((v) => v as SessionId);

export const TurnIdSchema = z.string().min(1).transform((v) => v as TurnId);

export const ToolCallIdSchema = z.string().min(1).transform((v) => v as ToolCallId);

export const WorkspaceIdSchema = z
  .string()
  .min(1)
  .transform((v) => v as WorkspaceId);

export const WorkTreeIdSchema = z.string().min(1).transform((v) => v as WorkTreeId);

export const PaneIdSchema = z.string().min(1).transform((v) => v as PaneId);

export const TabIdSchema = z.string().min(1).transform((v) => v as TabId);

export const ISO8601Schema = z.string().datetime({ offset: true });

export const UriSchema = z.string().min(1);

export const AbsolutePathSchema = z.string().min(1);

// ────────────────────────────────────────────────────────────
// Provider type
// ────────────────────────────────────────────────────────────

export const ProviderSchema = z.enum(['claude', 'codex']);
export type Provider = z.infer<typeof ProviderSchema>;

// ────────────────────────────────────────────────────────────
// Effort level (reasoning depth)
// ────────────────────────────────────────────────────────────

export const EffortLevelSchema = z.enum(['minimum', 'low', 'medium', 'high', 'maximum']);
export type EffortLevel = z.infer<typeof EffortLevelSchema>;

/** UI display labels (Korean-first). */
export const EFFORT_LABELS_KO: Record<EffortLevel, string> = {
  minimum: '최소',
  low: '낮음',
  medium: '중간',
  high: '높음',
  maximum: '매우 높음',
};

// ────────────────────────────────────────────────────────────
// Chat mode
// ────────────────────────────────────────────────────────────

export const ChatModeSchema = z.enum(['standard', 'plan', 'speed', 'custom']);
export type ChatMode = z.infer<typeof ChatModeSchema>;

// ────────────────────────────────────────────────────────────
// Schema version
// ────────────────────────────────────────────────────────────

export const SCHEMA_VERSION = 1 as const;
