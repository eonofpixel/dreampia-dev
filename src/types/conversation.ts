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

// v1.6.2 — DOM dump typed block.
//
// 사용자가 PreviewPanel 에서 [DOM 캡처] 클릭 → renderer 가 페이지 DOM 을
// `dumpElement` 로 직렬화 + 본 block 으로 ChatInput 에 prepend. AI 가 페이지
// 구조를 정확히 파악하도록.
//
// 저장 정책:
//  - `dump_json` 은 stringified DomDumpNode tree. SQLite 에 그대로 저장 가능.
//  - `summary` 는 chip footer 표시용 (예: "div#root, 12 children, 47 nodes").
//  - `node_count` 는 chip 에서 정량 hint.
// v1.6.0 follow-up — Annotation typed block.
//
// AnnotationOverlay 가 사용자 영역 캡처 시 본 block 으로 ChatInput 에 prepend.
// 기존 `Annotation` schema 는 per-turn metadata (DOM Inspector 결과 + selector
// + dom_meta) 인 반면, 본 block 은 chat-injectable summary — bbox + 페이지 URL
// + optional screenshot URI + optional comment.
const AnnotationBlockSchema = z.object({
  type: z.literal('annotation_block'),
  /** 캡처된 페이지의 URL (preview tab 의 src). */
  url: z.string(),
  /** Overlay-relative pixel coordinates (AnnotationOverlay 가 capture). */
  bounding_box: z.object({
    x: z.number(),
    y: z.number(),
    w: z.number().nonnegative(),
    h: z.number().nonnegative(),
  }),
  /** 사용자 메모. 빈 string 허용 (UI 가 placeholder 분기). */
  comment: z.string(),
  /**
   * v2.10.0 β-2 (F-021 + F-033) — pick 모드 캡처 시 CSS selector. region 모드는
   * undefined. AI 가 "이 element" 가 어떤 DOM 위치인지 알 수 있게 함.
   *
   * 주의: 본 selector 는 annotation hint 일 뿐 uniqueness 보장 X — sibling
   * count / 동적 class 명 변경으로 stale 될 수 있다. renderer / AI 는 이 값을
   * "사람이 가리킨 element" 단서로만 사용하고 re-pick 용 stable locator 로
   * 취급해서는 안 된다 (architect 권고 5).
   */
  selector: z.string().optional(),
  /**
   * Optional — 해당 영역 screenshot URI. v1.6.1 의 capture-tab 결과를
   * userData/screenshots/<id>.png 로 저장 후 파일 URI.
   */
  screenshot_uri: z.string().optional(),
  /**
   * v2.10.0 β-4 (F-021 inline panel) — WebM/Opus 음성 메모 file URI.
   * userData/annotations/<sessionId>/audio/<uuid>.webm. 사용자가 inline
   * panel 의 마이크 버튼으로 녹음했을 때만 set. annotation block 의
   * `comment` 와 동등한 user input — AI 가 양쪽 모두를 첨부 컨텍스트로 인식.
   */
  comment_audio_uri: z.string().optional(),
  /**
   * v2.10.0 β-4 — 녹음 길이 (ms). chip footer 에 "0:NN" 형태로 표시용.
   * 음성 파일 size 자체는 file system 에서 stat 가능하므로 schema 에는
   * 포함하지 않는다.
   */
  comment_audio_duration_ms: z.number().int().nonnegative().optional(),
  /** 캡처 시각 (ISO 8601). */
  captured_at: z.string(),
});

const DomDumpBlockSchema = z.object({
  type: z.literal('dom_dump'),
  /** 캡처 시점의 page URL (webview 의 src 또는 location.href). */
  url: z.string(),
  /**
   * 선택된 element 의 CSS selector — 전체 페이지 캡처 시 'body' 또는 ''.
   * Annotation pick 결과를 그대로 받을 수 있음.
   */
  selector: z.string().optional(),
  /** Stringified DomDumpNode tree (JSON). renderer 의 domDump.ts 와 호환. */
  dump_json: z.string(),
  /** Chip footer 표시용 한 줄 요약. */
  summary: z.string(),
  /** Tree 안 element 노드 총 수 — chip 에 정량 표시. */
  node_count: z.number().int().nonnegative(),
  /** 캡처 시점 timestamp (ISO 8601). */
  captured_at: z.string(),
});

export const ContentBlockSchema = z.discriminatedUnion('type', [
  TextBlockSchema,
  ImageBlockSchema,
  FileBlockSchema,
  MentionBlockSchema,
  EmbeddedCardBlockSchema,
  FileReferenceBlockSchema,
  SessionReferenceBlockSchema,
  DomDumpBlockSchema,
  AnnotationBlockSchema,
]);

export type ContentBlock = z.infer<typeof ContentBlockSchema>;
export type FileReferenceBlock = z.infer<typeof FileReferenceBlockSchema>;
export type SessionReferenceBlock = z.infer<typeof SessionReferenceBlockSchema>;
export type DomDumpBlock = z.infer<typeof DomDumpBlockSchema>;
export type AnnotationBlock = z.infer<typeof AnnotationBlockSchema>;
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
