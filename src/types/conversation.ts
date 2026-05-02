/**
 * Conversation sub-schema: Turn, ContentBlock, Annotation.
 *
 * Spec: docs/session/conversation.md
 */

import { z } from 'zod';
import {
  TurnIdSchema,
  ToolCallIdSchema,
  ISO8601Schema,
  UriSchema,
  EffortLevelSchema,
  ChatModeSchema,
} from './common';

// ────────────────────────────────────────────────────────────
// Content blocks
// ────────────────────────────────────────────────────────────

const TextBlockSchema = z.object({
  type: z.literal('text'),
  text: z.string(),
});

const ImageBlockSchema = z.object({
  type: z.literal('image'),
  mime: z.string().regex(/^image\//, 'Must be image MIME type'),
  data: z.string(), // Base64 or URI
  alt: z.string().optional(),
});

const FileBlockSchema = z.object({
  type: z.literal('file'),
  mime: z.string(),
  uri: UriSchema,
  size_bytes: z.number().int().nonnegative(),
  name: z.string(),
});

const MentionRefSchema = z.object({
  kind: z.enum(['agent', 'file', 'skill']),
  id: z.string().min(1),
  display: z.string().min(1),
});

const MentionBlockSchema = z.object({
  type: z.literal('mention'),
  ref: MentionRefSchema,
});

const EmbeddedCardSchema = z.object({
  kind: z.enum(['web_preview', 'image', 'pdf', 'chart']),
  title: z.string(),
  url: UriSchema.optional(),
  thumbnail: UriSchema.optional(),
  meta: z.record(z.unknown()).optional(),
});

const EmbeddedCardBlockSchema = z.object({
  type: z.literal('embedded_card'),
  card: EmbeddedCardSchema,
});

export const ContentBlockSchema = z.discriminatedUnion('type', [
  TextBlockSchema,
  ImageBlockSchema,
  FileBlockSchema,
  MentionBlockSchema,
  EmbeddedCardBlockSchema,
]);

export type ContentBlock = z.infer<typeof ContentBlockSchema>;
export type MentionRef = z.infer<typeof MentionRefSchema>;
export type EmbeddedCard = z.infer<typeof EmbeddedCardSchema>;

// ────────────────────────────────────────────────────────────
// Annotation (DOM Inspector / 주석 모드)
// ────────────────────────────────────────────────────────────

const BoundingBoxSchema = z.object({
  x: z.number(),
  y: z.number(),
  w: z.number().nonnegative(),
  h: z.number().nonnegative(),
});

const DomMetaSchema = z.object({
  tag: z.string().min(1),
  color: z.string().optional(),
  bg_color: z.string().optional(),
  font: z.string().optional(),
  dimensions: z.string().optional(),
});

export const AnnotationSchema = z.object({
  id: z.string().min(1),
  marker_index: z.number().int().positive(),

  selector: z.string().min(1),
  bounding_box: BoundingBoxSchema,
  screenshot_uri: UriSchema,

  dom_meta: DomMetaSchema,

  comment: z.string(),
  comment_audio_uri: UriSchema.optional(),

  page_url: z.string().min(1),
  created_at: ISO8601Schema,
});

export type Annotation = z.infer<typeof AnnotationSchema>;

// ────────────────────────────────────────────────────────────
// Tool call / result references (kept light here; full def in tools/)
// ────────────────────────────────────────────────────────────

const ToolCallRefSchema = z.object({
  id: ToolCallIdSchema,
  tool_id: z.string().min(1),
  input: z.unknown(),
});

export type ToolCallRef = z.infer<typeof ToolCallRefSchema>;

const ToolResultRefSchema = z.object({
  call_id: ToolCallIdSchema,
  status: z.enum(['success', 'failed', 'cancelled', 'timeout']),
  output: z.unknown().optional(),
  error: z
    .object({
      code: z.string(),
      message: z.string(),
    })
    .optional(),
  duration_ms: z.number().int().nonnegative(),
});

export type ToolResultRef = z.infer<typeof ToolResultRefSchema>;

// ────────────────────────────────────────────────────────────
// Reactions / Edits
// ────────────────────────────────────────────────────────────

export const ReactionSchema = z.object({
  kind: z.enum(['thumbs_up', 'thumbs_down', 'shared']),
  timestamp: ISO8601Schema,
  comment: z.string().optional(),
});

export type Reaction = z.infer<typeof ReactionSchema>;

export const TurnEditSchema = z.object({
  edited_at: ISO8601Schema,
  prev_content: z.array(ContentBlockSchema),
  reason: z.string().optional(),
});

export type TurnEdit = z.infer<typeof TurnEditSchema>;

// ────────────────────────────────────────────────────────────
// Turn status & role
// ────────────────────────────────────────────────────────────

export const TurnStatusSchema = z.enum([
  'pending',
  'streaming',
  'completed',
  'cancelled',
  'failed',
]);

export type TurnStatus = z.infer<typeof TurnStatusSchema>;

export const TurnRoleSchema = z.enum(['user', 'assistant', 'system', 'tool']);

export type TurnRole = z.infer<typeof TurnRoleSchema>;

// ────────────────────────────────────────────────────────────
// Turn (the unit of conversation)
// ────────────────────────────────────────────────────────────

export const TurnSchema = z.object({
  id: TurnIdSchema,
  role: TurnRoleSchema,
  timestamp: ISO8601Schema,
  status: TurnStatusSchema,

  content: z.array(ContentBlockSchema),

  tool_calls: z.array(ToolCallRefSchema).optional(),
  tool_results: z.array(ToolResultRefSchema).optional(),

  // Per-turn settings (override session default)
  model: z.string().optional(),
  effort: EffortLevelSchema.optional(),

  edited: z.array(TurnEditSchema).optional(),
  reactions: z.array(ReactionSchema).optional(),
  annotations: z.array(AnnotationSchema).optional(),
});

export type Turn = z.infer<typeof TurnSchema>;

// ────────────────────────────────────────────────────────────
// Pending input (탭 전환 시 보존)
// ────────────────────────────────────────────────────────────

export const PendingInputSchema = z.object({
  content: z.array(ContentBlockSchema),
  draft_at: ISO8601Schema,
  model: z.string().optional(),
  effort: EffortLevelSchema.optional(),
  mode: ChatModeSchema.optional(),
});

export type PendingInput = z.infer<typeof PendingInputSchema>;

// ────────────────────────────────────────────────────────────
// Conversation (top-level for this sub-schema)
// ────────────────────────────────────────────────────────────

export const ConversationSchema = z.object({
  turns: z.array(TurnSchema),
  pending_input: PendingInputSchema.optional(),

  current_model: z.string().min(1),
  current_effort: EffortLevelSchema,
  current_mode: ChatModeSchema,
});

export type Conversation = z.infer<typeof ConversationSchema>;
