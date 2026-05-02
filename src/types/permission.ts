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
import { CapabilitySchema as StrictCapabilitySchema } from '../permission/Capability';

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
// Capability re-exports
//
// 전체 enum / schema / 헬퍼는 src/permission/Capability.ts 에서 정의되며
// 여기선 단순 re-export. 이렇게 하면 Capability ↔ permission 모듈 간 cycle 없음.
// ────────────────────────────────────────────────────────────

export {
  ALL_CAPABILITIES,
  CapabilitySchema,
  type Capability,
  isParentCapability,
} from '../permission/Capability';

// ────────────────────────────────────────────────────────────
// GrantCapability — 일반 Capability 또는 deny 표기.
//
// PermissionGrant.capability 필드는 다음 중 하나:
//  - 일반 Capability (예: 'LOCAL_WRITE.modify')
//  - Deny 표기 (예: '__deny__:LOCAL_EXECUTE') — resolver.md 168-185
//
// 따라서 grant schema 의 capability 는 strict enum 보다 약간 느슨하게:
//  - 정상 Capability 통과
//  - '__deny__:' prefix + 정상 Capability 통과
// ────────────────────────────────────────────────────────────

const DENY_PREFIX = '__deny__:';

const GrantCapabilitySchema = z.string().refine(
  (v) => {
    if (v.startsWith(DENY_PREFIX)) {
      return StrictCapabilitySchema.safeParse(v.slice(DENY_PREFIX.length)).success;
    }
    return StrictCapabilitySchema.safeParse(v).success;
  },
  { message: 'Must be a valid Capability or __deny__:Capability' }
);

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

  capability: GrantCapabilitySchema,
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
      capability: GrantCapabilitySchema,
      ts: ISO8601Schema,
    })
    .optional(),

  temporarily_blocked_capabilities: z.array(GrantCapabilitySchema),
});

export type PermissionState = z.infer<typeof PermissionStateSchema>;
