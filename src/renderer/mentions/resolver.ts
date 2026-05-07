/**
 * @ mention resolver — F-019 (v0.6.0).
 *
 * 사용자가 메시지를 submit 할 때, 입력에 포함된 모든 멘션 (`@<query>`) 을
 * 일괄 fetch 해 본문 / 컨텍스트로 변환한다. v0.6.0 MVP 는 의도적으로 plain-text
 * prepend 만 수행 — Turn.content schema 변경 X.
 *
 * 입력은 parser.findAllMentions() 의 결과. fetch 는 IPC (file 경우) 또는 호출자
 * 가 주는 getSession callback (session 경우). 각 멘션 fetch 는 독립이므로
 * `Promise.all` 로 병렬 실행. 한 멘션이 실패해도 다른 멘션은 정상 resolve.
 *
 * Spec: docs/ux/patterns/F-019-mention-palette.md
 */

import type { ContentBlock, Session } from '@/types';
import type { FileContent } from '@/types/workspace';
import type { Result } from '@/main/types';
import type { MentionMatch } from './parser';

/**
 * 한 멘션의 resolved 결과. kind 별로 채워지는 필드가 다르다.
 *   - file    : path, snippet, line_count, truncated 채움
 *   - session : session_id, context_text 채움
 *   - error   : error 메시지 채움 (다른 필드 모두 undefined)
 */
export interface ResolvedMention {
  match: MentionMatch;
  kind: 'file' | 'session' | 'error';
  // file
  path?: string;
  snippet?: string;
  line_count?: number;
  truncated?: boolean;
  // session
  session_id?: string;
  context_text?: string;
  /**
   * v0.13.0 — fetch 시점의 session.title snapshot. typed
   * `session_reference` block 의 chip 표시용. context_text 만으로는 어떤
   * 세션을 가리키는지 사용자에게 보여주기 어려워 함께 캡처.
   */
  session_title?: string;
  /** v0.13.0 — fetch 시점의 turn 수. chip footer 표시용. */
  session_turn_count?: number;
  // error
  error?: string;
}

/** Resolver 가 IPC / store 와 통신하기 위한 의존성. 테스트는 mock 주입. */
export interface ResolverContext {
  workspaceRoot: string;
  /**
   * 파일 한 건 read 위임. 보통 `(args) => window.dreampia.workspace.readFile(args)`
   * 그대로지만, IPC 가 누락된 환경에서도 sliently fail 하도록 `Result<...>` 만 반환.
   */
  readFile: (args: {
    workspace_root: string;
    rel_path: string;
    max_bytes?: number;
  }) => Promise<Result<FileContent>>;
  /** 세션 한 건 fetch. 미 발견 시 null. */
  getSession: (id: string) => Promise<Session | null>;
}

/** read-file IPC 가 받는 max_bytes — chat 컨텍스트로 적당한 크기. */
const FILE_SNIPPET_MAX_BYTES = 8192;
/** session 컨텍스트 추출 시 사용할 최근 turn 개수 + 텍스트 cap. */
const SESSION_CONTEXT_TURN_LIMIT = 5;
const SESSION_CONTEXT_CHAR_LIMIT = 2000;

// ────────────────────────────────────────────────────────────
// v1.0.13 (MENT-1): mention rate-limit
//
// Spec: docs/v1.x-roadmap.md (MENT-1), Codex 외부 검토 (codex-question-4).
//
// 한도:
//  - 총 50개 (turn 한 건당). 그 이상은 mention 자체가 의도일 가능성 낮음 +
//    AI context window 부담.
//  - dedupe: 같은 path/session 의 중복 mention 은 첫 1건만.
//  - cumulative 200KB: file mention 의 snippet 합계가 200KB 초과 시 truncate.
//
// 초과 시 caller (ChatInput / submitBlocks) 가 사용자에게 "N개 / X KB 제외됨"
// 안내. dropMention 결과를 result 에 별도 키로 노출 — UI 가 toast / banner.
// ────────────────────────────────────────────────────────────

export const MENTION_MAX_COUNT = 50;
export const MENTION_CUMULATIVE_BYTES = 200 * 1024;

export interface MentionLimitsApplied {
  /** 총 한도 초과로 잘린 mention 개수. 0 이면 정상. */
  dropped_over_count: number;
  /** dedupe 으로 제거된 중복 mention 개수. */
  dropped_duplicate: number;
  /** cumulative byte 한도 초과로 snippet 가 비워진 file mention 개수. */
  dropped_over_bytes: number;
  /** 적용된 누적 byte (실제로 흐른 값). */
  cumulative_bytes: number;
}

export interface ResolveMentionsResult {
  resolved: ResolvedMention[];
  limits: MentionLimitsApplied;
}

/**
 * 모든 멘션을 병렬 resolve. 한 멘션이 throw 하더라도 ResolvedMention.kind='error'
 * 로 catch 되어 다른 멘션 처리에는 영향이 없다.
 *
 * v1.0.13 (MENT-1): 결과에 limits 포함 — UI 가 사용자에게 "N개 / X KB 제외됨"
 * 안내. 기존 caller 호환을 위해 별도 thin wrapper 도 export (resolveMentionsRich).
 */
export async function resolveMentions(
  mentions: ReadonlyArray<MentionMatch>,
  ctx: ResolverContext
): Promise<ResolvedMention[]> {
  return (await resolveMentionsRich(mentions, ctx)).resolved;
}

export async function resolveMentionsRich(
  mentions: ReadonlyArray<MentionMatch>,
  ctx: ResolverContext
): Promise<ResolveMentionsResult> {
  const limits: MentionLimitsApplied = {
    dropped_over_count: 0,
    dropped_duplicate: 0,
    dropped_over_bytes: 0,
    cumulative_bytes: 0,
  };
  if (mentions.length === 0) {
    return { resolved: [], limits };
  }

  // dedupe (kind + value) — 첫 occurrence 만 유지, 같은 mention 다중 입력
  // 시 두 번째 이후 dropped_duplicate 증가.
  const seen = new Set<string>();
  const dedupedInputs: MentionMatch[] = [];
  for (const m of mentions) {
    const key = `${m.kind}::${m.value}`;
    if (seen.has(key)) {
      limits.dropped_duplicate += 1;
      continue;
    }
    seen.add(key);
    dedupedInputs.push(m);
  }

  // count limit — 50개 초과는 그냥 잘라냄.
  const limitedInputs = dedupedInputs.slice(0, MENTION_MAX_COUNT);
  limits.dropped_over_count = Math.max(0, dedupedInputs.length - MENTION_MAX_COUNT);

  const tasks = limitedInputs.map(async (match): Promise<ResolvedMention> => {
    try {
      if (match.kind === 'file') return await resolveFile(match, ctx);
      if (match.kind === 'session') return await resolveSession(match, ctx);
      // 'unknown' — submit 단계에서는 의미 없는 빈 멘션. error 로 분류.
      return { match, kind: 'error', error: '빈 멘션 (`@` 만 입력됨)' };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return { match, kind: 'error', error: message };
    }
  });

  const resolvedRaw = await Promise.all(tasks);

  // cumulative byte limit — file mention 의 snippet 누적이 200KB 초과 시
  // 그 시점 이후의 file mention 은 snippet 비우고 placeholder error 로 변경.
  const resolved: ResolvedMention[] = [];
  for (const r of resolvedRaw) {
    if (r.kind !== 'file') {
      resolved.push(r);
      continue;
    }
    const snippetBytes = byteLength(r.snippet ?? '');
    if (limits.cumulative_bytes + snippetBytes > MENTION_CUMULATIVE_BYTES) {
      limits.dropped_over_bytes += 1;
      resolved.push({
        match: r.match,
        kind: 'error',
        error: `cumulative byte 한도 (${MENTION_CUMULATIVE_BYTES} bytes) 초과로 제외됨`,
      });
      continue;
    }
    limits.cumulative_bytes += snippetBytes;
    resolved.push(r);
  }

  return { resolved, limits };
}

function byteLength(text: string): number {
  // Browser-safe — TextEncoder 가 renderer / Node 모두에 있음.
  if (typeof TextEncoder !== 'undefined') {
    return new TextEncoder().encode(text).length;
  }
  // Fallback (테스트 환경 typed array missing) — UTF-8 추정 (각 char 가
  // 평균 1.5 byte).
  return Math.ceil(text.length * 1.5);
}

async function resolveFile(match: MentionMatch, ctx: ResolverContext): Promise<ResolvedMention> {
  if (match.value.length === 0) {
    return { match, kind: 'error', error: '파일 경로가 비어있습니다' };
  }
  const result = await ctx.readFile({
    workspace_root: ctx.workspaceRoot,
    rel_path: match.value,
    max_bytes: FILE_SNIPPET_MAX_BYTES,
  });
  if (!result.ok) {
    return { match, kind: 'error', error: result.error };
  }
  return {
    match,
    kind: 'file',
    path: match.value,
    snippet: result.value.content,
    line_count: result.value.line_count,
    truncated: result.value.truncated,
  };
}

async function resolveSession(match: MentionMatch, ctx: ResolverContext): Promise<ResolvedMention> {
  if (match.value.length === 0) {
    return { match, kind: 'error', error: '세션 ID 가 비어있습니다' };
  }
  const session = await ctx.getSession(match.value);
  if (session === null) {
    return { match, kind: 'error', error: `세션을 찾을 수 없습니다: ${match.value}` };
  }
  const context_text = sessionToContextText(session);
  return {
    match,
    kind: 'session',
    session_id: session.id,
    context_text,
    // v0.13.0 — typed block 생성 시 chip 에 표시할 metadata.
    session_title: session.title,
    session_turn_count: session.conversation.turns.length,
  };
}

/**
 * 세션의 마지막 N 턴을 한 줄씩 정리해 string 으로 직렬화. 너무 길면 끝부터
 * cap. tool turn 은 표시 가치가 낮아 skip — 사용자/AI 텍스트만 추출.
 */
function sessionToContextText(session: Session): string {
  const turns = session.conversation.turns;
  // 끝에서부터 최대 SESSION_CONTEXT_TURN_LIMIT 개의 user/assistant 만 모은다.
  const picked: string[] = [];
  for (let i = turns.length - 1; i >= 0 && picked.length < SESSION_CONTEXT_TURN_LIMIT; i--) {
    const t = turns[i];
    if (t === undefined) continue;
    if (t.role !== 'user' && t.role !== 'assistant') continue;
    const text = extractText(t.content);
    if (text.length === 0) continue;
    const speaker = t.role === 'user' ? '사용자' : 'AI';
    picked.push(`${speaker}: ${text}`);
  }
  // 시간 순서 (옛 → 새) 로 reverse.
  picked.reverse();
  let joined = picked.join('\n');
  if (joined.length > SESSION_CONTEXT_CHAR_LIMIT) {
    joined = joined.slice(0, SESSION_CONTEXT_CHAR_LIMIT) + '\n…(생략됨)';
  }
  return joined;
}

function extractText(content: ReadonlyArray<unknown>): string {
  // Turn.content 는 ContentBlock[] 이지만 import 순환을 피하려 unknown 으로
  // 받아 type-narrow. 'text' block 만 수집.
  let acc = '';
  for (const block of content) {
    if (block !== null && typeof block === 'object' && 'type' in block) {
      const b = block as { type: string; text?: unknown };
      if (b.type === 'text' && typeof b.text === 'string') {
        acc += (acc.length === 0 ? '' : ' ') + b.text;
      }
    }
  }
  return acc;
}

/**
 * Resolved 멘션을 prompt 에 prepend 가능한 plain-text 컨텍스트로 직렬화.
 * 원본 사용자 텍스트는 그대로 두고 — 멘션 자체는 그대로 남는다 — 끝에
 * `--- 컨텍스트 ---` 섹션을 추가하는 형태.
 *
 * MVP: Turn.content schema 변경 없이 그냥 텍스트 prepend. provider 가 받는
 * input 은 단일 'text' block 으로 합쳐진다.
 */
export function formatMentionsAsContext(
  originalText: string,
  resolved: ReadonlyArray<ResolvedMention>
): string {
  if (resolved.length === 0) return originalText;
  const lines: string[] = [];
  lines.push(originalText);
  lines.push('');
  lines.push('--- 컨텍스트 ---');
  for (const r of resolved) {
    if (r.kind === 'file') {
      const path = r.path ?? r.match.value;
      const lc = r.line_count ?? 0;
      const trunc = r.truncated === true ? ', truncated' : '';
      lines.push(`[파일] @${path} (line 1-${lc}${trunc}):`);
      const snippet = r.snippet ?? '';
      lines.push('```');
      lines.push(snippet);
      lines.push('```');
    } else if (r.kind === 'session') {
      const sid = r.session_id ?? r.match.value;
      lines.push(`[세션] @session:${sid} (최근 ${SESSION_CONTEXT_TURN_LIMIT}개 턴):`);
      lines.push(r.context_text ?? '(빈 세션)');
    } else {
      lines.push(`[오류] @${r.match.query} → ${r.error ?? '알 수 없는 오류'}`);
    }
  }
  return lines.join('\n');
}

/**
 * v0.13.0 — Resolved mentions 를 typed `ContentBlock[]` 으로 직렬화한다.
 *
 * v0.6.0 의 `formatMentionsAsContext` 가 plain-text 단일 string 을 반환하던
 * 것과 달리, 이 helper 는 mention 별로 별도 block 을 생성한다. 결과:
 *   - `file` mention → `file_reference` block (path + snippet + line_count + truncated)
 *   - `session` mention → `session_reference` block (session_id + title + context_text)
 *   - `error` mention → `text` block (사용자에게 읽히는 inline 오류 메시지)
 *
 * Caller (ChatInput) 는 strip 된 사용자 텍스트를 첫 `text` block 으로,
 * 이 helper 의 결과를 그 뒤에 append 한다. 결과가 빈 배열이면 caller 가
 * mention 없는 평범한 single-text turn 으로 처리.
 *
 * Spec: docs/session/conversation.md (typed reference blocks)
 */
export function resolveMentionsToTypedBlocks(
  resolved: ReadonlyArray<ResolvedMention>
): ContentBlock[] {
  const blocks: ContentBlock[] = [];
  for (const r of resolved) {
    if (r.kind === 'file') {
      blocks.push({
        type: 'file_reference',
        path: r.path ?? r.match.value,
        snippet: r.snippet ?? '',
        line_count: r.line_count ?? 0,
        truncated: r.truncated ?? false,
      });
    } else if (r.kind === 'session') {
      blocks.push({
        type: 'session_reference',
        session_id: r.session_id ?? r.match.value,
        title: r.session_title ?? '',
        context_text: r.context_text ?? '',
        turn_count: r.session_turn_count ?? 0,
      });
    } else {
      // 오류는 사용자에게 보이도록 text block 으로 inline 표시.
      // submit 자체를 막지 않고 turn 안에 명시적 흔적을 남긴다.
      blocks.push({
        type: 'text',
        text: `[오류] @${r.match.query} → ${r.error ?? '알 수 없는 오류'}`,
      });
    }
  }
  return blocks;
}

/**
 * v0.13.0 — 사용자 텍스트에서 멘션 토큰 (`@<value>`) 을 제거한다. typed
 * block 시대의 user turn 은 첫 text block 에 "사용자가 의도한 메시지" 만
 * 두고, 멘션 자체는 별도 chip block 으로 분리된다.
 *
 * 멘션 위치는 parser 가 이미 `start`/`end` 로 알고 있으므로 우측에서부터
 * 잘라내며 (인덱스 안정성) 양옆 공백 정규화. 빈 입력이거나 멘션이 없으면
 * 입력 그대로 반환.
 */
export function stripMentionTokens(text: string, mentions: ReadonlyArray<MentionMatch>): string {
  if (mentions.length === 0) return text;
  // 우측에서부터 잘라내면 앞쪽 인덱스가 손상되지 않는다.
  const sorted = [...mentions].sort((a, b) => b.start - a.start);
  let out = text;
  for (const m of sorted) {
    const before = out.slice(0, m.start);
    const after = out.slice(m.end);
    // 인접 공백 흡수 — `"a @x b"` → `"a b"` (양 옆 공백이 모두 있을 때 한 칸으로).
    const beforeTrim = before.replace(/\s+$/, '');
    const afterTrim = after.replace(/^\s+/, '');
    if (beforeTrim.length > 0 && afterTrim.length > 0) {
      out = `${beforeTrim} ${afterTrim}`;
    } else {
      out = `${beforeTrim}${afterTrim}`;
    }
  }
  return out.trim();
}
