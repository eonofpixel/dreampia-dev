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

import type { Session } from '@/types';
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

/**
 * 모든 멘션을 병렬 resolve. 한 멘션이 throw 하더라도 ResolvedMention.kind='error'
 * 로 catch 되어 다른 멘션 처리에는 영향이 없다.
 */
export async function resolveMentions(
  mentions: ReadonlyArray<MentionMatch>,
  ctx: ResolverContext
): Promise<ResolvedMention[]> {
  if (mentions.length === 0) return [];
  const tasks = mentions.map(async (match): Promise<ResolvedMention> => {
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
  return Promise.all(tasks);
}

async function resolveFile(
  match: MentionMatch,
  ctx: ResolverContext
): Promise<ResolvedMention> {
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

async function resolveSession(
  match: MentionMatch,
  ctx: ResolverContext
): Promise<ResolvedMention> {
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
