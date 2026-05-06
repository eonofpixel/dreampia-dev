/**
 * AnthropicProvider — Direct Anthropic Messages API SSE (v1.4.4 실 구현 / P4).
 *
 * Spec:
 *   https://docs.anthropic.com/en/api/messages (POST /v1/messages, stream: true)
 *
 * 동작:
 *   1. Turns → Anthropic messages 변환 (text 만 — tool/image 후속).
 *   2. fetch + Accept: text/event-stream.
 *   3. SseParser 로 SSE event 누적 → JSON parse → StreamEvent emit:
 *      - message_start (turn_id + model).
 *      - content_block_delta (text_delta) → text_delta event.
 *      - message_delta (usage 포함) → usage event.
 *      - message_stop → message_complete (synthesized turn).
 *      - error → error event.
 *
 * Tool_use / image / prompt caching 은 v1.4.6 후속.
 * 401/429/5xx retry 는 v1.4.6 후속.
 */

import { newTurnId, nowIso, type Provider, type Turn, type TurnId } from '../../types';
import type { StreamEvent } from '../types';
import { SseParser } from './sseParser';
import type { DirectApiOptions, DirectApiProvider, DirectApiVendor } from './types';

const DEFAULT_BASE_URL = 'https://api.anthropic.com';
const ANTHROPIC_VERSION = '2023-06-01';

export class AnthropicProvider implements DirectApiProvider {
  readonly vendor: DirectApiVendor = 'anthropic';
  readonly provider: Provider = 'claude';
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
    let stopped = false;

    try {
      const body = buildAnthropicBody(input.turns, input.model);
      const url = `${this.baseUrl.replace(/\/+$/, '')}/v1/messages`;
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'x-api-key': this.opts.apiKey,
          'anthropic-version': ANTHROPIC_VERSION,
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
          error: `Anthropic API ${response.status} ${response.statusText}: ${text.slice(0, 500)}`,
        };
        return;
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      const parser = new SseParser();

      while (!stopped) {
        const { value, done } = await reader.read();
        if (done) break;
        const chunk = decoder.decode(value, { stream: true });
        for (const ev of parser.push(chunk)) {
          for (const out of translateAnthropicEvent(ev, accumulatedText, turnId)) {
            yield out;
            if (out.type === 'message_complete') stopped = true;
          }
        }
      }
      // flush
      for (const ev of parser.flush()) {
        for (const out of translateAnthropicEvent(ev, accumulatedText, turnId)) {
          yield out;
        }
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      yield { type: 'error', error: `Anthropic API request failed: ${msg}` };
    }
  }
}

interface AnthropicMessageBody {
  model: string;
  max_tokens: number;
  stream: true;
  messages: Array<AnthropicMessage>;
}

interface AnthropicMessage {
  role: 'user' | 'assistant';
  content: string | AnthropicContentBlock[];
}

interface AnthropicContentBlock {
  type: 'text';
  text: string;
  cache_control?: { type: 'ephemeral' };
}

/**
 * v1.4.6: Prompt caching — `cache_control: { type: 'ephemeral' }` 를 turns
 * 의 처음 N 개 (default 모든 user/assistant pair 의 첫 user) 에 마킹. Anthropic
 * 의 5분 ephemeral cache 가 동일 prefix 의 다음 호출에서 cache_read_input_tokens
 * 으로 비용 절감.
 *
 * 정책 (Codex 권고):
 *  - cache breakpoint 는 system prompt + 첫 user message 만 (large prefix).
 *  - 본 commit MVP: 첫 user message 만 캐시. system 은 추후.
 */
function buildAnthropicBody(turns: Turn[], model: string): AnthropicMessageBody {
  const messages: AnthropicMessage[] = [];
  let firstUserCached = false;
  for (const t of turns) {
    if (t.role !== 'user' && t.role !== 'assistant') continue;
    const text = renderTurnTextOnly(t);
    if (text.length === 0) continue;
    if (t.role === 'user' && !firstUserCached && text.length >= 1024) {
      // 1024 chars+ 의 첫 user → cache_control. 짧은 prompt 는 캐시 비용보다
      // 손해 — Anthropic 권고대로 large prefix 만.
      messages.push({
        role: 'user',
        content: [{ type: 'text', text, cache_control: { type: 'ephemeral' } }],
      });
      firstUserCached = true;
    } else {
      messages.push({ role: t.role, content: text });
    }
  }
  return { model, max_tokens: 4096, stream: true, messages };
}

function renderTurnTextOnly(turn: Turn): string {
  const parts: string[] = [];
  for (const block of turn.content) {
    if (block.type === 'text') parts.push(block.text);
  }
  return parts.join('\n');
}

function* translateAnthropicEvent(
  ev: { event: string; data: string },
  accumulatedText: string[],
  turnId: TurnId
): Generator<StreamEvent> {
  if (ev.data.length === 0) return;
  let parsed: unknown;
  try {
    parsed = JSON.parse(ev.data);
  } catch {
    return;
  }
  if (typeof parsed !== 'object' || parsed === null) return;
  const obj = parsed as Record<string, unknown>;

  switch (ev.event) {
    case 'content_block_delta': {
      const delta = obj.delta as Record<string, unknown> | undefined;
      if (delta !== undefined && delta.type === 'text_delta' && typeof delta.text === 'string') {
        accumulatedText.push(delta.text);
        yield { type: 'text_delta', text: delta.text };
      }
      break;
    }
    case 'message_delta': {
      const usage = obj.usage as Record<string, unknown> | undefined;
      if (usage !== undefined) {
        const inputTokens = typeof usage.input_tokens === 'number' ? usage.input_tokens : 0;
        const outputTokens = typeof usage.output_tokens === 'number' ? usage.output_tokens : 0;
        // v1.4.6: cache_creation_input_tokens / cache_read_input_tokens 도 emit.
        const cacheCreate =
          typeof usage.cache_creation_input_tokens === 'number'
            ? usage.cache_creation_input_tokens
            : 0;
        const cacheRead =
          typeof usage.cache_read_input_tokens === 'number'
            ? usage.cache_read_input_tokens
            : 0;
        yield {
          type: 'usage',
          data: {
            provider: 'claude',
            model: 'claude-direct',
            turn_id: turnId,
            input_tokens: inputTokens,
            output_tokens: outputTokens,
            cache_creation_input_tokens: cacheCreate,
            cache_read_input_tokens: cacheRead,
            total_cost_usd: 0,
            recorded_at: nowIso(),
            unknown_pricing: true,
          },
        };
      }
      break;
    }
    case 'message_stop': {
      // Synthesize message_complete turn.
      const fullText = accumulatedText.join('');
      const turn: Turn = {
        id: turnId,
        role: 'assistant',
        timestamp: nowIso(),
        status: 'completed',
        content: fullText.length > 0 ? [{ type: 'text', text: fullText }] : [],
      };
      yield { type: 'message_complete', turn };
      break;
    }
    case 'error': {
      const errObj = obj.error as Record<string, unknown> | undefined;
      const msg = typeof errObj?.message === 'string' ? errObj.message : ev.data;
      yield { type: 'error', error: msg };
      break;
    }
    default:
      // ping / message_start / content_block_start / content_block_stop —
      // 정보성. 무시 (turnId 는 우리가 자체 생성).
      break;
  }
}
