/**
 * v2.0.0 (A2) — `PermissionRequest` 의 zod schema.
 *
 * 책임:
 *  - IPC boundary 에서 main → renderer 로 전송되는 `PermissionRequest` 의
 *    runtime validation. 잘못된 shape 가 renderer 로 새는 것 차단.
 *  - 향후 strict union (kind discriminator) 으로 확장 가능한 토대.
 *
 * Spec: docs/v2.x-roadmap.md (A2 Phase B 통합 land)
 *
 * 본 schema 는 현재 모든 PermissionRequest variants (Tool / Plugin /
 * High-risk) 가 동일 shape 라는 ralph 세션 inventory 결과를 반영한다 —
 * 단일 schema + `kind` literal marker 로 충분. 향후 variant 별 다른 shape 가
 * 필요해지면 `z.discriminatedUnion('kind', [...])` 로 확장.
 */

import { z } from 'zod';
import { SessionIdSchema, TurnIdSchema, ToolCallIdSchema, ISO8601Schema } from '../types/common';

// ────────────────────────────────────────────────────────────
// PermissionTargetKind — types.ts 의 string union 과 동기.
// ────────────────────────────────────────────────────────────

export const PermissionTargetKindSchema = z.enum(['path', 'url', 'domain', 'global']);

// ────────────────────────────────────────────────────────────
// PermissionRequestSchema
// ────────────────────────────────────────────────────────────

export const PermissionRequestSchema = z.object({
  /**
   * v2.0.0 (A2) — discriminator marker. 현재 단일 variant 'permission_confirmation'.
   * 향후 plugin / tool 분리 시 z.literal 추가 예정. 미지정 (legacy) 호환을 위해
   * `.default()` 로 자동 채움.
   */
  kind: z.literal('permission_confirmation').default('permission_confirmation'),
  request_id: z.string().min(1),
  session_id: SessionIdSchema,
  turn_id: TurnIdSchema,
  call_id: ToolCallIdSchema,
  tool_id: z.string().min(1),
  capability: z.string().min(1),
  target: z.object({
    kind: PermissionTargetKindSchema,
    value: z.string(),
  }),
  hint: z.string().optional(),
  is_dangerous: z.boolean(),
  tool_display_name: z.string(),
  requested_at: ISO8601Schema,
});

/**
 * Zod 가 추론한 type. legacy `PermissionRequest` interface 와 호환되어야
 * 한다 — `kind` 필드만 추가됐고 default 가 있어 caller 가 set 안 해도 OK.
 */
export type PermissionRequestZod = z.infer<typeof PermissionRequestSchema>;

/**
 * IPC boundary 의 safeParse helper. 잘못된 shape 면 `null` 반환 + 호출자가
 * audit / drop 결정. throw X — fail-closed pattern.
 */
export function parsePermissionRequest(raw: unknown): PermissionRequestZod | null {
  const result = PermissionRequestSchema.safeParse(raw);
  return result.success ? result.data : null;
}
