/**
 * MockProvider — 결정적 streaming provider (dev/test 용).
 *
 * Spec: docs/session/cross-ai-sync.md (Phase 1 P0 MVP — end-to-end pipeline foundation)
 *
 * 목적:
 *   - API key 없이 UI streaming + tool call display 검증
 *   - 통합 테스트에서 deterministic 한 stream 시퀀스 발생
 *   - TO-4 (Tool Queue) + ChatPanel 등 후속 task 의 빌딩블록
 *
 * 동작:
 *   - 마지막 user turn 의 텍스트를 echo (또는 사용자 지정 응답)
 *   - 한 글자씩 text_delta 로 emit
 *   - injectToolCall 옵션으로 임의 tool call 삽입 가능
 *   - 항상 message_complete 로 종료 (finite stream guarantee)
 */

import type { Turn, ToolCallId, ToolCallRef } from '@/types';
import { newTurnId, newToolCallId, nowIso } from '@/types';
import type { StreamEvent, StreamingProvider } from './types';

// ────────────────────────────────────────────────────────────
// Options
// ────────────────────────────────────────────────────────────

export interface MockProviderOptions {
  /** 청크 사이 지연 (ms). 0 또는 생략 시 즉시. */
  delayMs?: number;

  /** 응답 텍스트 override. 미지정 시 마지막 user 메시지 echo. */
  responseText?: string;

  /** 응답 중간에 tool call 1개 삽입. */
  injectToolCall?: {
    tool_id: string;
    input: Record<string, unknown>;
  };

  /** Provider 식별자 (테스트 격리용). 기본 'claude'. */
  provider?: 'claude' | 'codex';
}

// ────────────────────────────────────────────────────────────
// MockProvider
// ────────────────────────────────────────────────────────────

export class MockProvider implements StreamingProvider {
  readonly provider: 'claude' | 'codex';
  private readonly opts: MockProviderOptions;

  constructor(opts: MockProviderOptions = {}) {
    this.opts = opts;
    this.provider = opts.provider ?? 'claude';
  }

  async *stream(input: {
    turns: Turn[];
    model: string;
    config?: Record<string, unknown>;
  }): AsyncIterable<StreamEvent> {
    const turnId = newTurnId();
    const userText = this.extractLastUserText(input.turns);
    const responseText =
      this.opts.responseText ??
      `Mock response. You said: "${userText.slice(0, 80)}"`;

    yield { type: 'message_start', turn_id: turnId, model: input.model };

    // 한 글자씩 streaming. Iterator 는 code-point 단위 (이모지 안전).
    for (const ch of responseText) {
      if (this.opts.delayMs && this.opts.delayMs > 0) {
        await this.sleep(this.opts.delayMs);
      }
      yield { type: 'text_delta', text: ch };
    }

    const toolCalls: ToolCallRef[] = [];
    if (this.opts.injectToolCall) {
      const toolCallId = newToolCallId();
      const tc = this.opts.injectToolCall;

      yield {
        type: 'tool_call_start',
        tool_call: { id: toolCallId, tool_id: tc.tool_id, input: tc.input },
      };

      const fullCall: ToolCallRef = {
        id: toolCallId as ToolCallId,
        tool_id: tc.tool_id,
        input: tc.input,
      };

      yield { type: 'tool_call_complete', tool_call: fullCall };
      toolCalls.push(fullCall);
    }

    const finalTurn: Turn = {
      id: turnId,
      role: 'assistant',
      timestamp: nowIso(),
      status: 'completed',
      content: [{ type: 'text', text: responseText }],
      ...(toolCalls.length > 0 && { tool_calls: toolCalls }),
      model: input.model,
    };

    yield { type: 'message_complete', turn: finalTurn };
  }

  // ─────────── helpers ───────────

  private extractLastUserText(turns: Turn[]): string {
    for (let i = turns.length - 1; i >= 0; i -= 1) {
      const t = turns[i];
      if (t && t.role === 'user') {
        return t.content
          .filter((b) => b.type === 'text')
          .map((b) => (b as { type: 'text'; text: string }).text)
          .join(' ');
      }
    }
    return '';
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => {
      setTimeout(resolve, ms);
    });
  }
}
