/**
 * Permission sub-schema: PermissionState, PermissionGrant.
 *
 * Note: This is the session-embedded view of permissions. Full permission
 * definition (capabilities, resolver, etc.) lives in src/permission/ and
 * docs/permission/. We keep this slice minimal to avoid duplication.
 *
 * Spec: docs/permission/grants.md, docs/permission/levels.md
 */

import { z } from 'zod';
import { SessionIdSchema, ISO8601Schema, AbsolutePathSchema } from './common';

// ────────────────────────────────────────────────────────────
// PermissionLevel
// ────────────────────────────────────────────────────────────

export const PermissionLevelSchema = z.enum([
  'read_only',
  'workspace_write',
  'full_access',
  'custom',
]);

export type PermissionLevel = z.infer<typeof PermissionLevelSchema>;

/** UI labels (Korean-first). */
export const PERMISSION_LEVEL_LABELS_KO: Record<PermissionLevel, string> = {
  read_only: '읽기 전용',
  workspace_write: '워크스페이스 쓰기',
  full_access: '전체 접근',
  custom: '사용자 지정',
};

// ────────────────────────────────────────────────────────────
// Capability (subset — full enum in src/permission/Capability.ts)
//
// Phase 1 minimum: parse string. Full type checking in PM-1 (Phase 1).
// ────────────────────────────────────────────────────────────

export const CapabilitySchema = z.string().min(1);
export type Capability = string;

// ────────────────────────────────────────────────────────────
// GrantTarget
// ────────────────────────────────────────────────────────────

const PathTargetSchema = z.object({
  kind: z.literal('path'),
  path: AbsolutePathSchema,
  recursive: z.boolean().optional(),
});

const UrlTargetSchema = z.object({
  kind: z.literal('url'),
  url: z.string().min(1),
});

const DomainTargetSchema = z.object({
  kind: z.literal('domain'),
  domain: z.string().min(1),
});

const GlobalTargetSchema = z.object({
  kind: z.literal('global'),
});

export const GrantTargetSchema = z.discriminatedUnion('kind', [
  PathTargetSchema,
  UrlTargetSchema,
  DomainTargetSchema,
  GlobalTargetSchema,
]);

export type GrantTarget = z.infer<typeof GrantTargetSchema>;

// ────────────────────────────────────────────────────────────
// GrantScope
// ────────────────────────────────────────────────────────────

export const GrantScopeSchema = z.enum(['one_time', 'turn', 'session', 'persistent']);

export type GrantScope = z.infer<typeof GrantScopeSchema>;

// ────────────────────────────────────────────────────────────
// PermissionGrant
// ────────────────────────────────────────────────────────────

export const PermissionGrantSchema = z.object({
  id: z.string().min(1),
  session_id: SessionIdSchema,

  capability: CapabilitySchema,
  target: GrantTargetSchema,
  scope: GrantScopeSchema,

  granted_at: ISO8601Schema,
  granted_by: z.enum(['user', 'auto', 'automation']),

  expires_at: ISO8601Schema.optional(),
  revoked_at: ISO8601Schema.optional(),

  reason: z.string().optional(),
});

export type PermissionGrant = z.infer<typeof PermissionGrantSchema>;

// ────────────────────────────────────────────────────────────
// PermissionState (session-embedded)
// ────────────────────────────────────────────────────────────

export const PermissionStateSchema = z.object({
  grants: z.array(PermissionGrantSchema),
  default_level: PermissionLevelSchema,

  last_denied: z
    .object({
      capability: CapabilitySchema,
      ts: ISO8601Schema,
    })
    .optional(),

  temporarily_blocked_capabilities: z.array(CapabilitySchema),
});

export type PermissionState = z.infer<typeof PermissionStateSchema>;
