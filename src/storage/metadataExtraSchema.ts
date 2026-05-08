/**
 * v1.8.2 — Canonical zod schema for `metadata_json._extra`.
 *
 * 목적
 * ────
 * SessionStore 의 `MetadataExtra` interface 는 typescript-only — 런타임에
 * 새 필드가 무성의하게 추가되어도 컴파일은 통과한다. 본 schema 는
 * `_extra` 의 **strict** zod schema 로:
 *
 *   1. 새 필드를 schema 에 등록 안 하면 contract test 가 실패 →
 *      "schema 등록 강제" lint 효과.
 *   2. 기존 필드 타입 변경 시도도 contract test 가 잡음.
 *   3. canonical reference — 한 곳에서 모든 _extra 형태 확인 가능.
 *
 * 변경 가이드 (PR 추가 시)
 * ──────────────────────
 *   1. SessionStore 의 `MetadataExtra` interface 에 새 필드 추가.
 *   2. 본 schema 의 해당 namespace 에 동일 zod 정의 추가.
 *   3. 변경이 column promote (sessions 테이블) 면 dual-write 코드도 같이
 *      추가하고 docs/extra-namespace-schema.md 의 promote 표 갱신.
 *   4. tests/storage/extraSchemaContract.test.ts 가 자동 검증.
 */

import { z } from 'zod';
import { FileRefSchema } from '../types/workspace';

const PendingInputSchema = z
  .object({
    text: z.string(),
    cursor: z.number().optional(),
  })
  .passthrough();

const ConversationExtraSchema = z
  .object({
    pending_input: PendingInputSchema.optional(),
    current_model: z.string(),
    current_effort: z.string(),
    current_mode: z.string(),
  })
  .strict();

const WorkspaceExtraSchema = z
  .object({
    recent_files: z.array(FileRefSchema),
    open_files: z.array(FileRefSchema),
    ignore_patterns: z.array(z.string()),
    active_worktree_id: z.string().optional(),
  })
  .strict();

const TerminalExtraSchema = z
  .object({
    active_pane_id: z.string().optional(),
    panel_open: z.boolean(),
    height_px: z.number(),
  })
  .strict();

const BrowserExtraSchema = z
  .object({
    active_tab_id: z.string().optional(),
    panel_visible: z.boolean(),
    layout: z.unknown(), // BrowserState['layout'] — 향후 promote 시 strict 화.
    partition_id: z.string(),
  })
  .strict();

const PlanExtraSchema = z
  .object({
    // v2.0.0 (ADR-0002): plan.active 제거. column `sessions.plan_active` 가
    // 단일 source. migration 016 이 모든 row 의 _extra 에서 strip.
    browser_tool_enabled: z.boolean(),
    current_item_index: z.number().optional(),
  })
  .strict();

const PermissionExtraSchema = z
  .object({
    // v2.0.0 (ADR-0002): permission.default_level 제거. column
    // `sessions.permission_default_level` 가 단일 source. migration 016 이
    // 모든 row 의 _extra 에서 strip.
    last_denied: z.object({ capability: z.string(), ts: z.string() }).optional(),
    temporarily_blocked_capabilities: z.array(z.string()),
  })
  .strict();

/**
 * Strict schema for `metadata_json._extra`. 등록되지 않은 namespace 는
 * `.strict()` 에 의해 거부 (contract test 가 fail).
 *
 * 현재 promoted columns (v1.8.1):
 *   - `permission.default_level` → `sessions.permission_default_level TEXT`
 *   - `plan.active` → `sessions.plan_active INTEGER`
 *   - `conversation.{current_model, current_effort, current_mode}` →
 *     `sessions.{current_model, current_effort, current_mode}` (v1.4.2)
 *
 * 향후 _extra 필드 제거 (v1.8.3 이후) 시에도 본 schema 는 *과거 데이터
 * 호환* 을 위해 유지. 새 필드 추가는 column 직접 또는 본 schema 등록
 * 둘 중 하나 강제.
 */
export const MetadataExtraSchema = z
  .object({
    conversation: ConversationExtraSchema,
    workspace: WorkspaceExtraSchema,
    terminal: TerminalExtraSchema,
    browser: BrowserExtraSchema,
    plan: PlanExtraSchema,
    permission: PermissionExtraSchema,
  })
  .strict();

export type MetadataExtraSchemaShape = z.infer<typeof MetadataExtraSchema>;
