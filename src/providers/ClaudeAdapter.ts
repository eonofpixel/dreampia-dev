/**
 * ClaudeAdapter — Anthropic Claude API 변환기.
 *
 * Spec: docs/session/cross-ai-sync.md lines 76-181
 *
 * 메시지 구조:
 *   - user turn → role 'user' + content blocks (text/image/...)
 *   - assistant turn → role 'assistant' + content blocks + tool_use blocks
 *   - tool turn → role 'user' (Claude convention) + tool_result blocks
 *   - system turn → 별도 system prompt 로 → 변환에서 filter out
 *
 * Tool ID 인코딩: shell.run ↔ shell_run (점 ↔ 언더스코어)
 *
 * Capability:
 *   - extended thinking 지원 (Claude 4)
 *   - prompt caching 지원 (ephemeral cache_control)
 *   - max context: 200,000 tokens (또는 1M beta)
 *
 * Phase 1 P0: text + tool_use 만. Image 는 P1.
 */

import type { Turn, ContentBlock, ToolCallId } from '@/types';
import { newTurnId, newToolCallId, nowIso } from '@/types';
import type {
  AdapterFromResponse,
  ProviderAdapter,
  ProviderMessage,
  ProviderRequestConfig,
  ProviderResponse,
  ProviderTool,
  ProviderToolResult,
  StreamEvent,
  ToolCall,
  ToolDefinition,
  ToolResult,
} from './types';

// ────────────────────────────────────────────────────────────
// Tool name 인코딩 helpers
// ────────────────────────────────────────────────────────────

/** "shell.run" → "shell_run" (Claude API tool name convention) */
function encodeToolName(toolId: string): string {
  return toolId.replace(/\./g, '_');
}

/** "shell_run" → "shell.run" (역변환) */
function decodeToolName(name: string): string {
  return name.replace(/_/g, '.');
}

// ────────────────────────────────────────────────────────────
// ClaudeAdapter
// ────────────────────────────────────────────────────────────

export class ClaudeAdapter implements ProviderAdapter {
  readonly provider = 'claude' as const;

  // ─────────── Outgoing ───────────

  toProviderMessages(turns: Turn[]): ProviderMessage[] {
    const out: ProviderMessage[] = [];
    for (const turn of turns) {
      const msg = this.turnToMessage(turn);
      if (msg !== null) out.push(msg);
    }
    return out;
  }

  /**
   * 단일 Turn → Claude message. system turn 은 null 반환 (filter out).
   */
  private turnToMessage(turn: Turn): ProviderMessage | null {
    switch (turn.role) {
      case 'user':
        return {
          role: 'user',
          content: turn.content.map((b) => this.toClaudeContent(b)),
        };
      case 'assistant': {
        const content = [
          ...turn.content.map((b) => this.toClaudeContent(b)),
          ...(turn.tool_calls ?? []).map((tc) => this.toClaudeToolUse(tc)),
        ];
        return { role: 'assistant', content };
      }
      case 'tool':
        return {
          role: 'user', // Claude convention: tool result는 user message 로 전송
          content: (turn.tool_results ?? []).map((r) => this.toClaudeToolResult(r)),
        };
      case 'system':
        // system prompt 는 messages 배열 외 별도 필드 → 여기서 drop
        return null;
    }
  }

  private toClaudeContent(block: ContentBlock): Record<string, unknown> {
    switch (block.type) {
      case 'text':
        return { type: 'text', text: block.text };
      case 'image':
        return {
          type: 'image',
          source: {
            type: 'base64',
            media_type: block.mime,
            data: block.data,
          },
        };
      case 'file':
        // Claude 는 파일 첨부 직접 지원 X → 텍스트 fallback
        return {
          type: 'text',
          text: `[파일: ${block.name} (${block.mime}, ${block.size_bytes} bytes)]`,
        };
      case 'mention':
        // Claude 는 @멘션 별도 처리 X → 텍스트로 변환
        return { type: 'text', text: `@${block.ref.display}` };
      case 'embedded_card': {
        // Card 는 [title](url) 텍스트로 표시
        const url = block.card.url ?? '';
        return { type: 'text', text: `[${block.card.title}](${url})` };
      }
      case 'file_reference': {
        // v0.13.0 — typed file reference. Claude 에는 fenced code block 으로 전달.
        // header 는 path + line range 정보, body 는 snippet.
        const lang = block.language ?? '';
        const trunc = block.truncated ? ', truncated' : '';
        const header = `[파일] ${block.path} (line 1-${block.line_count}${trunc})`;
        const fenced = '```' + lang + '\n' + block.snippet + '\n```';
        return { type: 'text', text: `${header}\n${fenced}` };
      }
      case 'session_reference': {
        // v0.13.0 — typed session reference. Claude 에는 quote block + meta 로 전달.
        const header = `[세션] ${block.title || block.session_id} (${block.turn_count}턴)`;
        const body = block.context_text
          .split('\n')
          .map((l) => `> ${l}`)
          .join('\n');
        return { type: 'text', text: `${header}\n${body}` };
      }
      case 'dom_dump': {
        // v1.6.2 — DOM dump. Claude 에는 페이지 URL + structured JSON dump 를
        // fenced code block 으로 전달. node_count / summary 는 사용자 hint.
        const sel = block.selector !== undefined && block.selector.length > 0
          ? ` selector="${block.selector}"`
          : '';
        const header = `[DOM] ${block.url}${sel} — ${block.summary}`;
        const fenced = '```json\n' + block.dump_json + '\n```';
        return { type: 'text', text: `${header}\n${fenced}` };
      }
      case 'annotation_block': {
        // v1.6.0 follow-up — bbox + comment + optional screenshot URI.
        const bb = block.bounding_box;
        const head = `[Annotation] ${block.url} (bbox ${bb.x},${bb.y},${bb.w}×${bb.h})`;
        const cmt = block.comment.length > 0 ? `\n주석: ${block.comment}` : '';
        const shot = block.screenshot_uri !== undefined
          ? `\n스크린샷: ${block.screenshot_uri}`
          : '';
        return { type: 'text', text: `${head}${cmt}${shot}` };
      }
    }
  }

  private toClaudeToolUse(call: ToolCall): Record<string, unknown> {
    return {
      type: 'tool_use',
      id: call.id,
      name: encodeToolName(call.tool_id),
      input: call.input ?? {},
    };
  }

  private toClaudeToolResult(result: ToolResult): Record<string, unknown> {
    const content = this.serializeToolResultContent(result);
    const block: Record<string, unknown> = {
      type: 'tool_result',
      tool_use_id: result.call_id,
      content,
    };
    if (result.status !== 'success') {
      block.is_error = true;
    }
    return block;
  }

  private serializeToolResultContent(result: ToolResult): string {
    if (result.status === 'success') {
      return typeof result.output === 'string'
        ? result.output
        : JSON.stringify(result.output ?? null);
    }
    return JSON.stringify({
      status: result.status,
      error: result.error ?? { code: 'unknown', message: 'no detail' },
    });
  }

  toProviderTools(tools: ToolDefinition[]): ProviderTool[] {
    // P0 placeholder: 실제 input_schema → JSON Schema 변환은 P1+
    // 우선 형태만 맞춰 두고, 빈 input_schema 는 무시.
    return tools.map((t) => ({
      name: encodeToolName(t.id),
      description: t.description ?? '',
      input_schema: t.input_schema ?? { type: 'object', properties: {} },
    }));
  }

  toProviderConfig(turn: Turn): ProviderRequestConfig {
    const config: ProviderRequestConfig = {};
    if (turn.model) config.model = turn.model;
    if (turn.effort) config.effort = turn.effort;
    return config;
  }

  // ─────────── Incoming ───────────

  fromProviderResponse(response: ProviderResponse): AdapterFromResponse {
    const tool_calls: ToolCall[] = [];
    const content: ContentBlock[] = [];

    const blocks = Array.isArray(response.content) ? response.content : [];
    for (const raw of blocks as Array<Record<string, unknown>>) {
      const type = raw.type;
      if (type === 'text' && typeof raw.text === 'string') {
        content.push({ type: 'text', text: raw.text });
      } else if (type === 'tool_use') {
        const id = (typeof raw.id === 'string' ? raw.id : newToolCallId()) as ToolCallId;
        const rawName = typeof raw.name === 'string' ? raw.name : 'unknown';
        const tool_id = decodeToolName(rawName);
        const input = (raw.input ?? {}) as unknown;
        tool_calls.push({ id, tool_id, input });
      }
      // thinking/other blocks: 무시 (P1+ 에서 metadata.thinking 으로 보존)
    }

    const model = typeof response.model === 'string' ? response.model : 'claude-unknown';

    const new_turn: Turn = {
      id: newTurnId(),
      role: 'assistant',
      timestamp: nowIso(),
      status: 'completed',
      content,
      ...(tool_calls.length > 0 && { tool_calls }),
      model,
    };

    return { new_turn, tool_calls };
  }

  fromProviderToolResult(result: ProviderToolResult): ToolResult {
    const callId = (
      typeof result.tool_use_id === 'string' ? result.tool_use_id : 'unknown'
    ) as ToolCallId;
    const isError = result.is_error === true;
    const content = result.content;
    const duration_ms = typeof result.duration_ms === 'number' ? result.duration_ms : 0;

    if (!isError) {
      return {
        call_id: callId,
        status: 'success',
        output: content,
        duration_ms,
      };
    }
    return {
      call_id: callId,
      status: 'failed',
      error: { code: 'tool_error', message: String(content ?? 'unknown error') },
      duration_ms,
    };
  }

  // ─────────── Streaming (P1) ───────────

  parseStreamChunk(_chunk: string): StreamEvent[] {
    // TODO(P1): SSE 파싱 — message_start, content_block_delta, message_stop 등
    // P0 에선 MockProvider 가 직접 StreamEvent 를 emit 하므로 여기는 stub.
    return [];
  }

  // ─────────── Capability ───────────

  supportsExtendedThinking(): boolean {
    return true;
  }

  supportsPromptCaching(): boolean {
    return true;
  }

  maxContextTokens(): number {
    return 200_000;
  }
}
