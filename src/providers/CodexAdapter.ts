/**
 * CodexAdapter — OpenAI 호환 (Codex / GPT) 변환기.
 *
 * Spec: docs/session/cross-ai-sync.md lines 190-248
 *
 * 메시지 구조:
 *   - user turn → role 'user' + content (string 또는 array)
 *   - assistant turn → role 'assistant' + content (joined text) + tool_calls (별도 필드)
 *   - tool turn → SPLIT 됨: tool_results 배열 각 element 가 role='tool' 메시지 (각각 tool_call_id)
 *   - system turn → 우리 P0 정책: filter out (cross-ai-sync.md 가 명시 안 함 — IMPL_NOTES 참조)
 *
 * Tool ID 인코딩: shell.run ↔ shell_run (점 ↔ 언더스코어; OpenAI function name 규칙)
 *
 * Lossy 변환:
 *   - thinking 블록 (Claude only) → drop
 *   - mention / embedded_card → text fallback
 *   - cross-ai-sync.md 322-352: "정보 손실은 필연 (provider 별 unique feature 는 전송 불가)"
 *
 * Capability:
 *   - extended thinking 미지원 (o1 reasoning 은 별도 메커니즘)
 *   - prompt caching 자동 (사용자 제어 X)
 *   - max context: 256,000 tokens (GPT-5.5 / 4.1 가정)
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
// Tool name 인코딩
// ────────────────────────────────────────────────────────────

function encodeToolName(toolId: string): string {
  return toolId.replace(/\./g, '_');
}

function decodeToolName(name: string): string {
  return name.replace(/_/g, '.');
}

// ────────────────────────────────────────────────────────────
// CodexAdapter
// ────────────────────────────────────────────────────────────

export class CodexAdapter implements ProviderAdapter {
  readonly provider = 'codex' as const;

  // ─────────── Outgoing ───────────

  toProviderMessages(turns: Turn[]): ProviderMessage[] {
    return turns.flatMap((turn) => this.turnToMessages(turn));
  }

  /**
   * 단일 Turn → 0개 이상의 OpenAI message.
   *  - system turn → [] (drop)
   *  - tool turn → 각 tool_result 가 별도 메시지 (1:N split)
   *  - user / assistant → 단일 메시지
   */
  private turnToMessages(turn: Turn): ProviderMessage[] {
    switch (turn.role) {
      case 'user':
        return [{ role: 'user', content: this.toUserContent(turn.content) }];

      case 'assistant': {
        const textContent = turn.content
          .filter((b) => b.type === 'text')
          .map((b) => (b as Extract<ContentBlock, { type: 'text' }>).text)
          .join('\n');

        // 비-텍스트 블록 (mention/embedded_card) 텍스트 fallback 추가
        const fallbackText = turn.content
          .filter((b) => b.type === 'mention' || b.type === 'embedded_card')
          .map((b) => this.fallbackBlockToText(b))
          .filter((t) => t.length > 0)
          .join('\n');

        const fullText = [textContent, fallbackText].filter((s) => s.length > 0).join('\n');

        const msg: Record<string, unknown> = {
          role: 'assistant',
          content: fullText,
        };

        const calls = turn.tool_calls ?? [];
        if (calls.length > 0) {
          msg.tool_calls = calls.map((tc) => this.toOpenAIFunctionCall(tc));
        }
        return [msg];
      }

      case 'tool': {
        // 1:N split — 각 tool_result 가 별도 OpenAI 메시지
        const results = turn.tool_results ?? [];
        return results.map((r) => ({
          role: 'tool',
          tool_call_id: r.call_id,
          content: this.serializeToolResult(r),
        }));
      }

      case 'system':
        // system prompt 는 별도 처리 — cross-ai-sync.md 가 OpenAI side 명시 안 함.
        // 안전하게 drop. 호출자가 system prompt 별도 전달.
        // IMPL_NOTES: future — system turn 의 text 만 발췌해 message[0] 으로 prepend?
        return [];
    }
  }

  /**
   * user message 의 content 변환.
   *  - 모두 텍스트면 string 으로 join (OpenAI 의 단순 형식)
   *  - 이미지/멀티모달 포함이면 content array 로
   */
  private toUserContent(blocks: ContentBlock[]): unknown {
    const allText = blocks.every(
      (b) =>
        b.type === 'text' ||
        b.type === 'mention' ||
        b.type === 'embedded_card' ||
        b.type === 'file_reference' ||
        b.type === 'session_reference'
    );

    if (allText) {
      // 모두 string 화 가능 → 하나의 string 으로
      return blocks.map((b) => this.blockToText(b)).join('\n');
    }

    // 이미지/파일 포함 — array 형식
    return blocks.map((b) => this.toOpenAIContentPart(b));
  }

  private blockToText(block: ContentBlock): string {
    switch (block.type) {
      case 'text':
        return block.text;
      case 'mention':
        return `@${block.ref.display}`;
      case 'embedded_card':
        return `[${block.card.title}](${block.card.url ?? ''})`;
      case 'image':
        return `[이미지: ${block.alt ?? block.mime}]`;
      case 'file':
        return `[파일: ${block.name} (${block.mime})]`;
      case 'file_reference':
        // v0.13.0 — typed file_reference. fenced code 로 직렬화.
        return CodexAdapter.formatFileReferenceText(block);
      case 'session_reference':
        // v0.13.0 — typed session_reference. quote block 으로 직렬화.
        return CodexAdapter.formatSessionReferenceText(block);
      case 'dom_dump':
        // v1.6.2 — DOM dump. fenced JSON 으로 plain text 직렬화.
        return CodexAdapter.formatDomDumpText(block);
      case 'annotation_block':
        return CodexAdapter.formatAnnotationBlockText(block);
    }
  }

  private fallbackBlockToText(block: ContentBlock): string {
    if (block.type === 'mention') return `@${block.ref.display}`;
    if (block.type === 'embedded_card') {
      return `[${block.card.title}](${block.card.url ?? ''})`;
    }
    if (block.type === 'file_reference') {
      return CodexAdapter.formatFileReferenceText(block);
    }
    if (block.type === 'session_reference') {
      return CodexAdapter.formatSessionReferenceText(block);
    }
    if (block.type === 'dom_dump') {
      return CodexAdapter.formatDomDumpText(block);
    }
    if (block.type === 'annotation_block') {
      return CodexAdapter.formatAnnotationBlockText(block);
    }
    return '';
  }

  private toOpenAIContentPart(block: ContentBlock): Record<string, unknown> {
    switch (block.type) {
      case 'text':
        return { type: 'text', text: block.text };
      case 'image':
        return {
          type: 'image_url',
          image_url: { url: `data:${block.mime};base64,${block.data}` },
        };
      case 'file':
        return {
          type: 'text',
          text: `[파일: ${block.name} (${block.mime}, ${block.size_bytes} bytes)]`,
        };
      case 'mention':
        return { type: 'text', text: `@${block.ref.display}` };
      case 'embedded_card':
        return {
          type: 'text',
          text: `[${block.card.title}](${block.card.url ?? ''})`,
        };
      case 'file_reference':
        return { type: 'text', text: CodexAdapter.formatFileReferenceText(block) };
      case 'session_reference':
        return {
          type: 'text',
          text: CodexAdapter.formatSessionReferenceText(block),
        };
      case 'dom_dump':
        return { type: 'text', text: CodexAdapter.formatDomDumpText(block) };
      case 'annotation_block':
        return { type: 'text', text: CodexAdapter.formatAnnotationBlockText(block) };
    }
  }

  /**
   * v0.13.0 — file_reference block 을 fenced code 형식의 plain text 로 직렬화.
   * Adapter (Codex) + CliProvider (Claude/Codex CLI) 가 동일한 형식을 사용해
   * 사용자 의도가 일관되게 model 에 전달되도록 한다.
   */
  static formatFileReferenceText(block: {
    path: string;
    snippet: string;
    line_count: number;
    truncated: boolean;
    language?: string;
  }): string {
    const lang = block.language ?? '';
    const trunc = block.truncated ? ', truncated' : '';
    const header = `[파일] ${block.path} (line 1-${block.line_count}${trunc})`;
    return `${header}\n\`\`\`${lang}\n${block.snippet}\n\`\`\``;
  }

  /**
   * v0.13.0 — session_reference block 을 quote 형식의 plain text 로 직렬화.
   */
  static formatSessionReferenceText(block: {
    session_id: string;
    title: string;
    context_text: string;
    turn_count: number;
  }): string {
    const header = `[세션] ${block.title || block.session_id} (${block.turn_count}턴)`;
    const body = block.context_text
      .split('\n')
      .map((l) => `> ${l}`)
      .join('\n');
    return `${header}\n${body}`;
  }

  /**
   * v1.6.2 — DOM dump block 을 plain text 로 직렬화. URL + selector +
   * summary header + JSON fenced. AI 가 페이지 구조를 정확히 파악하도록.
   */
  static formatDomDumpText(block: {
    url: string;
    selector?: string;
    dump_json: string;
    summary: string;
  }): string {
    const sel =
      block.selector !== undefined && block.selector.length > 0
        ? ` selector="${block.selector}"`
        : '';
    const header = `[DOM] ${block.url}${sel} — ${block.summary}`;
    return `${header}\n\`\`\`json\n${block.dump_json}\n\`\`\``;
  }

  /**
   * v1.6.0 follow-up — annotation block 을 plain text 로. URL + bbox +
   * 사용자 주석 + screenshot URI. ClaudeAdapter 의 dom_dump case 와 동일 형식.
   */
  static formatAnnotationBlockText(block: {
    url: string;
    bounding_box: { x: number; y: number; w: number; h: number };
    comment: string;
    screenshot_uri?: string;
  }): string {
    const bb = block.bounding_box;
    const head = `[Annotation] ${block.url} (bbox ${bb.x},${bb.y},${bb.w}×${bb.h})`;
    const cmt = block.comment.length > 0 ? `\n주석: ${block.comment}` : '';
    const shot =
      block.screenshot_uri !== undefined ? `\n스크린샷: ${block.screenshot_uri}` : '';
    return `${head}${cmt}${shot}`;
  }

  private toOpenAIFunctionCall(call: ToolCall): Record<string, unknown> {
    const args = call.input === undefined ? '{}' : JSON.stringify(call.input);
    return {
      id: call.id,
      type: 'function',
      function: {
        name: encodeToolName(call.tool_id),
        arguments: args,
      },
    };
  }

  private serializeToolResult(result: ToolResult): string {
    if (result.status === 'success') {
      if (typeof result.output === 'string') return result.output;
      return JSON.stringify(result.output ?? null);
    }
    return JSON.stringify({
      status: result.status,
      error: result.error ?? { code: 'unknown', message: 'no detail' },
    });
  }

  toProviderTools(tools: ToolDefinition[]): ProviderTool[] {
    // P0 placeholder — OpenAI function tool 형식.
    return tools.map((t) => ({
      type: 'function',
      function: {
        name: encodeToolName(t.id),
        description: t.description ?? '',
        parameters: t.input_schema ?? { type: 'object', properties: {} },
      },
    }));
  }

  toProviderConfig(turn: Turn): ProviderRequestConfig {
    const config: ProviderRequestConfig = {};
    if (turn.model) config.model = turn.model;
    if (turn.effort) {
      // OpenAI 의 reasoning_effort 와 매핑 (o1/o3 모델 대응)
      config.reasoning_effort = turn.effort;
    }
    return config;
  }

  // ─────────── Incoming ───────────

  fromProviderResponse(response: ProviderResponse): AdapterFromResponse {
    const tool_calls: ToolCall[] = [];
    const content: ContentBlock[] = [];

    // OpenAI: response.choices[0].message.{ content, tool_calls }
    // 단순화 — caller 가 message 형태로 normalize 했다고 가정 (또는 raw response 양쪽 지원)
    const message = this.extractMessage(response);

    if (typeof message.content === 'string' && message.content.length > 0) {
      content.push({ type: 'text', text: message.content });
    } else if (Array.isArray(message.content)) {
      for (const part of message.content as Array<Record<string, unknown>>) {
        if (part.type === 'text' && typeof part.text === 'string') {
          content.push({ type: 'text', text: part.text });
        }
      }
    }

    if (Array.isArray(message.tool_calls)) {
      for (const raw of message.tool_calls as Array<Record<string, unknown>>) {
        const id = (typeof raw.id === 'string' ? raw.id : newToolCallId()) as ToolCallId;
        const fn = (raw.function ?? {}) as Record<string, unknown>;
        const rawName = typeof fn.name === 'string' ? fn.name : 'unknown';
        const tool_id = decodeToolName(rawName);
        let input: unknown = {};
        if (typeof fn.arguments === 'string') {
          try {
            input = JSON.parse(fn.arguments);
          } catch {
            input = fn.arguments; // 잘못된 JSON 이면 raw string 보존
          }
        } else if (fn.arguments !== undefined) {
          input = fn.arguments;
        }
        tool_calls.push({ id, tool_id, input });
      }
    }

    const model = typeof response.model === 'string' ? response.model : 'gpt-unknown';

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

  /**
   * Response 에서 assistant message 부분 추출.
   *  - { choices: [{ message }] } 형식
   *  - 이미 message 직접 전달된 형식
   */
  private extractMessage(response: ProviderResponse): Record<string, unknown> {
    const choices = response.choices;
    if (Array.isArray(choices) && choices.length > 0) {
      const first = choices[0] as Record<string, unknown> | undefined;
      if (first && typeof first.message === 'object' && first.message !== null) {
        return first.message as Record<string, unknown>;
      }
    }
    // direct shape
    return response as Record<string, unknown>;
  }

  fromProviderToolResult(result: ProviderToolResult): ToolResult {
    const callId = (
      typeof result.tool_call_id === 'string' ? result.tool_call_id : 'unknown'
    ) as ToolCallId;
    const content = result.content;
    const duration_ms = typeof result.duration_ms === 'number' ? result.duration_ms : 0;

    // OpenAI 는 success/error 명시 X — content 가 string 이면 success 로 가정
    return {
      call_id: callId,
      status: 'success',
      output: content,
      duration_ms,
    };
  }

  // ─────────── Streaming (P1) ───────────

  parseStreamChunk(_chunk: string): StreamEvent[] {
    // TODO(P1): OpenAI SSE 파싱 — data: {...} 라인 단위 + delta 누적
    return [];
  }

  // ─────────── Capability ───────────

  supportsExtendedThinking(): boolean {
    return false;
  }

  supportsPromptCaching(): boolean {
    return false;
  }

  maxContextTokens(): number {
    return 256_000;
  }
}
