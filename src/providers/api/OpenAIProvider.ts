/**
 * OpenAIProvider — Direct OpenAI Chat Completions API SSE (v1.4.5 실 구현).
 *
 * Spec:
 *   https://platform.openai.com/docs/api-reference/chat/streaming
 *
 * 동작:
 *   1. Turns → OpenAI messages 변환 (text only, role-based).
 *   2. POST /v1/chat/completions with stream: true.
 *   3. SSE format — 각 'data' chunk 가 JSON 한 객체. `[DONE]` 가 종료 신호.
 *   4. choices[0].delta.content → text_delta.
 *   5. usage 는 stream_options.include_usage 가 true 면 마지막 chunk 에 포함.
 *
 * Tool calling / vision / o1-mini 같은 reasoning model 의 reasoning_content
 * 변환은 후속.
 */

import { newTurnId, nowIso, type Provider, type Turn, type TurnId } from '../../types';
import type { StreamEvent } from '../types';
import { SseParser } from './sseParser';
import type { DirectApiOptions, DirectApiProvider, DirectApiVendor } from './types';

const DEFAULT_BASE_URL = 'https://api.openai.com';

export class OpenAIProvider implements DirectApiProvider {
  readonly vendor: DirectApiVendor = 'openai';
  readonly provider: Provider = 'codex';
  private readonly opts: DirectApiOptions;
  private readonly baseUrl: string;

  constructor(opts: DirectApiOptions) {
    this.opts = opts;
    this.baseUrl = opts.baseUrl ?? DEFAULT_BASE_URL;
  }

  async *stream(input: {
    turns: Turn[];
    model: string;
    config?: Record<string, unknown>;
    signal?: AbortSignal;
  }): AsyncIterable<StreamEvent> {
    const turnId = newTurnId();
    yield { type: 'message_start', turn_id: turnId, model: input.model };

    const accumulatedText: string[] = [];

    try {
      const body = buildOpenAIBody(input.turns, input.model);
      const url = `${this.baseUrl.replace(/\/+$/, '')}/v1/chat/completions`;
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          authorization: `Bearer ${this.opts.apiKey}`,
          'content-type': 'application/json',
          accept: 'text/event-stream',
        },
        body: JSON.stringify(body),
        ...(input.signal !== undefined && { signal: input.signal }),
        ...(this.opts.signal !== undefined && { signal: this.opts.signal }),
      });

      if (!response.ok || response.body === null) {
        const text = await response.text().catch(() => '');
        yield {
          type: 'error',
          error: `OpenAI API ${response.status} ${response.statusText}: ${text.slice(0, 500)}`,
        };
        return;
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      const parser = new SseParser();

      let done = false;
      while (!done) {
        const { value, done: readerDone } = await reader.read();
        if (readerDone) break;
        const chunk = decoder.decode(value, { stream: true });
        for (const ev of parser.push(chunk)) {
          for (const out of translateOpenAiEvent(ev, accumulatedText, turnId)) {
            yield out;
            if (out.type === 'message_complete') done = true;
          }
        }
      }
      // flush
      for (const ev of parser.flush()) {
        for (const out of translateOpenAiEvent(ev, accumulatedText, turnId)) {
          yield out;
        }
      }

      // Emit message_complete if not yet emitted (e.g. stream cut without [DONE]).
      if (!done) {
        const fullText = accumulatedText.join('');
        const turn: Turn = {
          id: turnId,
          role: 'assistant',
          timestamp: nowIso(),
          status: 'completed',
          content: fullText.length > 0 ? [{ type: 'text', text: fullText }] : [],
        };
        yield { type: 'message_complete', turn };
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      yield { type: 'error', error: `OpenAI API request failed: ${msg}` };
    }
  }
}

interface OpenAIChatBody {
  model: string;
  messages: Array<{ role: 'user' | 'assistant' | 'system'; content: string }>;
  stream: true;
  stream_options: { include_usage: true };
}

function buildOpenAIBody(turns: Turn[], model: string): OpenAIChatBody {
  const messages: Array<{ role: 'user' | 'assistant' | 'system'; content: string }> = [];
  for (const t of turns) {
    if (t.role !== 'user' && t.role !== 'assistant' && t.role !== 'system') continue;
    const text = renderTurnTextOnly(t);
    if (text.length === 0) continue;
    messages.push({ role: t.role, content: text });
  }
  return { model, messages, stream: true, stream_options: { include_usage: true } };
}

function renderTurnTextOnly(turn: Turn): string {
  const parts: string[] = [];
  for (const block of turn.content) {
    if (block.type === 'text') parts.push(block.text);
  }
  return parts.join('\n');
}

function* translateOpenAiEvent(
  ev: { event: string; data: string },
  accumulatedText: string[],
  turnId: TurnId
): Generator<StreamEvent> {
  // OpenAI 는 모든 event 가 default 'message' kind. data 가 '[DONE]' 또는 JSON.
  if (ev.data === '[DONE]') {
    const fullText = accumulatedText.join('');
    const turn: Turn = {
      id: turnId,
      role: 'assistant',
      timestamp: nowIso(),
      status: 'completed',
      content: fullText.length > 0 ? [{ type: 'text', text: fullText }] : [],
    };
    yield { type: 'message_complete', turn };
    return;
  }
  if (ev.data.length === 0) return;

  let parsed: unknown;
  try {
    parsed = JSON.parse(ev.data);
  } catch {
    return;
  }
  if (typeof parsed !== 'object' || parsed === null) return;
  const obj = parsed as Record<string, unknown>;

  // error chunk.
  const errObj = obj.error as Record<string, unknown> | undefined;
  if (errObj !== undefined && typeof errObj.message === 'string') {
    yield { type: 'error', error: errObj.message };
    return;
  }

  // choices[0].delta.content.
  const choices = obj.choices as unknown[] | undefined;
  if (Array.isArray(choices) && choices.length > 0) {
    const c = choices[0] as Record<string, unknown>;
    const delta = c.delta as Record<string, unknown> | undefined;
    if (delta !== undefined && typeof delta.content === 'string' && delta.content.length > 0) {
      accumulatedText.push(delta.content);
      yield { type: 'text_delta', text: delta.content };
    }
  }

  // usage chunk (stream_options.include_usage = true 의 마지막 직전 chunk).
  const usage = obj.usage as Record<string, unknown> | undefined;
  if (usage !== undefined) {
    const inputTokens = typeof usage.prompt_tokens === 'number' ? usage.prompt_tokens : 0;
    const outputTokens =
      typeof usage.completion_tokens === 'number' ? usage.completion_tokens : 0;
    yield {
      type: 'usage',
      data: {
        provider: 'codex',
        model: typeof obj.model === 'string' ? obj.model : 'openai-direct',
        turn_id: turnId,
        input_tokens: inputTokens,
        output_tokens: outputTokens,
        cache_creation_input_tokens: 0,
        cache_read_input_tokens: 0,
        total_cost_usd: 0,
        recorded_at: nowIso(),
        unknown_pricing: true,
      },
    };
  }
}
