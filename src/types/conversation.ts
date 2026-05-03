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

// ────────────────────────────────────────────────────────────
// v0.13.0 (J) — Typed file/session reference blocks.
//
// Background: v0.6.0 (F-019) 의 `@` 멘션은 plain-text prepend (`--- 컨텍스트 ---`
// 섹션) 으로 처리되었다. v0.13.0 부터는 typed block 으로 승격해 UI 가 chip
// 으로 표현하고, provider 가 정해진 형식으로 재구성한다.
//
// 마이그레이션 전략 — ADDITIVE ONLY:
//   - 기존 TextBlock / MentionBlock / EmbeddedCardBlock 등은 변경 X
//   - 새 mention 부터 file_reference / session_reference block 사용
//   - 기존 plain-text "--- 컨텍스트 ---" 데이터는 read-time 호환 (별도 처리 X
//     — text block 그대로 렌더). DB 스키마 변경 없음.
//
// Spec: docs/session/conversation.md (typed reference blocks)
// ────────────────────────────────────────────────────────────

const FileReferenceBlockSchema = z.object({
  type: z.literal('file_reference'),
  /** Workspace-relative 경로 (resolver 가 채움). */
  path: z.string().min(1),
  /** 파일 내용 발췌. read-file IPC 의 max_bytes 캡 적용된 값. */
  snippet: z.string(),
  /** 발췌 line 수. truncated 와 함께 chip 의 footer 표시. */
  line_count: z.number().int().nonnegative(),
  /** 발췌가 잘렸는지 여부. */
  truncated: z.boolean(),
  /** Optional — syntax highlighting hint (e.g. 'ts', 'md', 'py'). */
  language: z.string().optional(),
});

const SessionReferenceBlockSchema = z.object({
  type: z.literal('session_reference'),
  /** 첨부된 세션 id. chip 클릭 시 그 세션으로 전환. */
  session_id: z.string().min(1),
  /** 표시용 제목 — resolver 가 fetch 시점의 session.title snapshot. */
  title: z.string(),
  /** 마지막 N (=5) 턴을 직렬화한 컨텍스트 텍스트. */
  context_text: z.string(),
  /** 첨부 시점의 turn 수 — chip footer 정보. */
  turn_count: z.number().int().nonnegative(),
});

// ────────────────────────────────────────────────────────────
// v1.1.0 — Image / PDF mention extension (Codex post-v1.0 권고).
//
// 디자인:
//   - file_reference / session_reference 와 동일한 typed-block 패턴
//   - image_reference: local file 만, base64 data URL inline (영구 저장 X 권장)
//   - pdf_reference : 텍스트 추출 결과만 (OCR 없음, 페이지 cap)
//   - 양쪽 모두 size / mime / page_count 등 기준선 표시 정보 포함
//
// Provider mapping (provider adapter 가 처리):
//   - vision-capable model (claude-3-5-sonnet, gpt-4o, ...) → image content block
//   - non-vision model → "[이미지: path]" placeholder text fallback
//   - PDF 는 어느 모델이든 text fallback (직접 PDF 입력 X)
//
// Spec: docs/session/conversation.md (v1.1.0 image/pdf reference blocks)
// ────────────────────────────────────────────────────────────

/**
 * v1.1.0 — Image MIME 화이트리스트.
 *
 * IPC handler 의 magic-byte detector 와 동기화된 4개. 실수로 SVG (XSS 위험)
 * 또는 BMP/TIFF (브라우저 렌더 보장 X) 가 흘러들어가지 않도록 명시적 enum.
 */
export const ALLOWED_IMAGE_MIME_VALUES = [
  'image/png',
  'image/jpeg',
  'image/gif',
  'image/webp',
] as const;

const ImageReferenceBlockSchema = z.object({
  type: z.literal('image_reference'),
  /** Workspace-relative 경로 (resolver 가 채움). chip 표시 + provider fallback 용. */
  path: z.string().min(1),
  /** base64-encoded data URL: "data:image/png;base64,...". inline 표시 + API 전송용. */
  data_url: z.string().min(1),
  /** Magic-byte 로 판정된 mime. enum 으로 vision-capable provider 가 곧장 사용. */
  mime: z.enum(ALLOWED_IMAGE_MIME_VALUES),
  /** 원본 파일 byte 수 — chip footer 표시 + 한도 검증 evidence. */
  size_bytes: z.number().int().positive(),
  /** Optional decoded width (pixels). */
  width: z.number().int().positive().optional(),
  /** Optional decoded height (pixels). */
  height: z.number().int().positive().optional(),
}).strict();

const PdfReferenceBlockSchema = z.object({
  type: z.literal('pdf_reference'),
  /** Workspace-relative 경로. */
  path: z.string().min(1),
  /** 추출된 텍스트 (page cap + byte cap 적용된 결과). */
  text: z.string(),
  /** 원본 PDF 의 총 페이지 수 (pdf-parse 로 측정). */
  page_count: z.number().int().positive(),
  /** 실제로 텍스트로 추출된 페이지 수 (보통 min(page_count, MAX_PDF_PAGES)). */
  pages_extracted: z.number().int().positive(),
  /** page cap 또는 byte cap 으로 인해 잘렸으면 true. chip 에 표시. */
  truncated: z.boolean(),
}).strict();

export const ContentBlockSchema = z.discriminatedUnion('type', [
  TextBlockSchema,
  ImageBlockSchema,
  FileBlockSchema,
  MentionBlockSchema,
  EmbeddedCardBlockSchema,
  FileReferenceBlockSchema,
  SessionReferenceBlockSchema,
  ImageReferenceBlockSchema,
  PdfReferenceBlockSchema,
]);

export type ContentBlock = z.infer<typeof ContentBlockSchema>;
export type FileReferenceBlock = z.infer<typeof FileReferenceBlockSchema>;
export type SessionReferenceBlock = z.infer<typeof SessionReferenceBlockSchema>;
export type ImageReferenceBlock = z.infer<typeof ImageReferenceBlockSchema>;
export type PdfReferenceBlock = z.infer<typeof PdfReferenceBlockSchema>;
export type MentionRef = z.infer<typeof MentionRefSchema>;
export type EmbeddedCard = z.infer<typeof EmbeddedCardSchema>;
export type AllowedImageMime = (typeof ALLOWED_IMAGE_MIME_VALUES)[number];

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
