/**
 * Top-level Session schema.
 *
 * The root of the session state model. Combines all sub-schemas.
 *
 * Spec: docs/session/schema.md, docs/session/principles.md
 */

import { z } from 'zod';
import {
  SessionIdSchema,
  WorkspaceIdSchema,
  ProviderSchema,
  ISO8601Schema,
  SCHEMA_VERSION,
} from './common';
import { ConversationSchema } from './conversation';
import { WorkspaceSchema } from './workspace';
import { TerminalStateSchema } from './terminal';
import { BrowserStateSchema } from './browser';
import { PlanStateSchema } from './plan';
import { PermissionStateSchema } from './permission';

// ────────────────────────────────────────────────────────────
// Provider-specific metadata (namespaced — P5 Provider-neutral)
// ────────────────────────────────────────────────────────────

const CodexMetadataSchema = z.object({
  deep_link: z.string().optional(),
  imported_from: z.string().optional(),
  usage_buckets: z
    .object({
      last_5h_at: ISO8601Schema,
      last_7d_at: ISO8601Schema,
    })
    .optional(),
});

export type CodexMetadata = z.infer<typeof CodexMetadataSchema>;

const ClaudeMetadataSchema = z.object({
  thread_id: z.string().optional(),
  hooks_active: z.array(z.string()).optional(),
});

export type ClaudeMetadata = z.infer<typeof ClaudeMetadataSchema>;

const SessionMetadataSchema = z.object({
  codex: CodexMetadataSchema.optional(),
  claude: ClaudeMetadataSchema.optional(),
});

export type SessionMetadata = z.infer<typeof SessionMetadataSchema>;

// ────────────────────────────────────────────────────────────
// Session (top-level)
// ────────────────────────────────────────────────────────────

export const SessionSchema = z
  .object({
    // ── Identity ──
    id: SessionIdSchema,
    schema_version: z.literal(SCHEMA_VERSION),
    created_at: ISO8601Schema,
    updated_at: ISO8601Schema,

    // ── Origin ──
    provider: ProviderSchema,
    workspace_id: WorkspaceIdSchema,

    // ── Display ──
    title: z.string().min(1),
    pinned: z.boolean(),
    archived: z.boolean(),
    parent_session_id: SessionIdSchema.optional(),

    // ── Sub-states ──
    conversation: ConversationSchema,
    workspace: WorkspaceSchema,
    terminal: TerminalStateSchema,
    browser: BrowserStateSchema,
    plan: PlanStateSchema,
    permission: PermissionStateSchema,

    // ── Provider-specific (namespaced) ──
    metadata: SessionMetadataSchema,
  })
  // ── Invariants ──
  .superRefine((s, ctx) => {
    // INV-3: created_at <= updated_at
    if (s.created_at > s.updated_at) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['updated_at'],
        message: `updated_at (${s.updated_at}) must be >= created_at (${s.created_at})`,
      });
    }

    // INV-6: archived=true 면 pinned=false
    if (s.archived && s.pinned) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['pinned'],
        message: 'archived session cannot be pinned',
      });
    }

    // INV-2 (conversation): pending/streaming 턴 은 세션당 최대 1개
    const inflight = s.conversation.turns.filter(
      (t) => t.status === 'pending' || t.status === 'streaming'
    );
    if (inflight.length > 1) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['conversation', 'turns'],
        message: `at most one pending/streaming turn allowed (got ${inflight.length})`,
      });
    }

    // INV-3 (conversation): tool_calls 가 있는 턴 다음엔 role='tool' 턴
    const turns = s.conversation.turns;
    for (let i = 0; i < turns.length - 1; i += 1) {
      const turn = turns[i]!;
      const next = turns[i + 1]!;
      if (turn.tool_calls && turn.tool_calls.length > 0 && next.role !== 'tool') {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['conversation', 'turns', i + 1, 'role'],
          message: `turn ${turn.id} has tool_calls but next turn is not 'tool' (got '${next.role}')`,
        });
      }
    }

    // INV-7 (PlanState): active=true → temporarily_blocked_capabilities 비어있지 않음
    if (s.plan.active && s.permission.temporarily_blocked_capabilities.length === 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['permission', 'temporarily_blocked_capabilities'],
        message:
          'plan mode active but no temporarily_blocked_capabilities (LOCAL_WRITE etc. should be blocked)',
      });
    }
  });

export type Session = z.infer<typeof SessionSchema>;
