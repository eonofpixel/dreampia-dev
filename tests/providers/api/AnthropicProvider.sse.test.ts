/**
 * AnthropicProvider 실 SSE 변환 테스트 (v1.4.4).
 *
 * vi.fn() 으로 fetch mock — Anthropic Messages API SSE 응답 형식의 chunked
 * stream 을 emit → AnthropicProvider 가 text_delta / message_complete /
 * usage StreamEvent 를 정확히 변환하는지 검증.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { AnthropicProvider } from '../../../src/providers/api/AnthropicProvider';
import type { StreamEvent } from '../../../src/providers/types';
import type { Turn } from '../../../src/types';
import { newTurnId, nowIso } from '../../../src/types';

const originalFetch = globalThis.fetch;

beforeEach(() => {
  vi.restoreAllMocks();
});

afterEach(() => {
  globalThis.fetch = originalFetch;
});

function makeUserTurn(text: string): Turn {
  return {
    id: newTurnId(),
    role: 'user',
    timestamp: nowIso(),
    status: 'completed',
    content: [{ type: 'text', text }],
  };
}

function makeMockSseResponse(chunks: string[]): Response {
  const encoder = new TextEncoder();
  let i = 0;
  const stream = new ReadableStream<Uint8Array>({
    pull(controller): void {
      if (i >= chunks.length) {
        controller.close();
        return;
      }
      controller.enqueue(encoder.encode(chunks[i]));
      i += 1;
    },
  });
  return new Response(stream, { status: 200, headers: { 'content-type': 'text/event-stream' } });
}

async function collect(provider: AnthropicProvider, turns: Turn[]): Promise<StreamEvent[]> {
  const events: StreamEvent[] = [];
  for await (const ev of provider.stream({ turns, model: 'claude-sonnet-4-6' })) {
    events.push(ev);
  }
  return events;
}

describe('v1.4.4 — AnthropicProvider SSE 변환', () => {
  it('happy path: text_delta + message_delta + message_stop', async () => {
    const sseChunks = [
      'event: message_start\ndata: {"type":"message_start","message":{"id":"m1","model":"claude-sonnet-4-6"}}\n\n',
      'event: content_block_start\ndata: {"type":"content_block_start","index":0,"content_block":{"type":"text","text":""}}\n\n',
      'event: content_block_delta\ndata: {"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"안녕"}}\n\n',
      'event: content_block_delta\ndata: {"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"하세요"}}\n\n',
      'event: content_block_stop\ndata: {"type":"content_block_stop","index":0}\n\n',
      'event: message_delta\ndata: {"type":"message_delta","delta":{"stop_reason":"end_turn"},"usage":{"input_tokens":5,"output_tokens":3}}\n\n',
      'event: message_stop\ndata: {"type":"message_stop"}\n\n',
    ];
    globalThis.fetch = vi.fn().mockResolvedValue(makeMockSseResponse(sseChunks));

    const p = new AnthropicProvider({ apiKey: 'sk-test' });
    const events = await collect(p, [makeUserTurn('hi')]);

    const types = events.map((e) => e.type);
    expect(types).toContain('message_start');
    expect(types).toContain('text_delta');
    expect(types).toContain('usage');
    expect(types).toContain('message_complete');

    const deltas = events.filter((e) => e.type === 'text_delta');
    expect(deltas.length).toBe(2);
    if (deltas[0]?.type === 'text_delta') {
      expect(deltas[0].text).toBe('안녕');
    }

    const usage = events.find((e) => e.type === 'usage');
    if (usage?.type === 'usage') {
      expect(usage.data.input_tokens).toBe(5);
      expect(usage.data.output_tokens).toBe(3);
    }

    const complete = events.find((e) => e.type === 'message_complete');
    if (complete?.type === 'message_complete') {
      const text = complete.turn.content
        .map((b) => (b.type === 'text' ? b.text : ''))
        .join('');
      expect(text).toBe('안녕하세요');
    }
  });

  it('non-200 응답 → error event', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(
      new Response('{"error":{"message":"invalid api key"}}', {
        status: 401,
        statusText: 'Unauthorized',
      })
    );
    const p = new AnthropicProvider({ apiKey: 'bad' });
    const events = await collect(p, [makeUserTurn('hi')]);
    const errors = events.filter((e) => e.type === 'error');
    expect(errors.length).toBeGreaterThan(0);
    if (errors[0]?.type === 'error') {
      expect(errors[0].error).toMatch(/401/);
    }
  });

  it('SSE error event → error StreamEvent', async () => {
    const sseChunks = [
      'event: error\ndata: {"type":"error","error":{"type":"overloaded_error","message":"server busy"}}\n\n',
    ];
    globalThis.fetch = vi.fn().mockResolvedValue(makeMockSseResponse(sseChunks));
    const p = new AnthropicProvider({ apiKey: 'sk' });
    const events = await collect(p, [makeUserTurn('x')]);
    const err = events.find((e) => e.type === 'error');
    expect(err).toBeDefined();
    if (err?.type === 'error') {
      expect(err.error).toMatch(/server busy/);
    }
  });

  it('chunked SSE — event split across chunks', async () => {
    const sseChunks = [
      'event: content_block_delta\ndata: {"type":"content_block_delta","index":0,"delta":{"type":"text',
      '_delta","text":"hello"}}\n\n',
      'event: message_stop\ndata: {"type":"message_stop"}\n\n',
    ];
    globalThis.fetch = vi.fn().mockResolvedValue(makeMockSseResponse(sseChunks));
    const p = new AnthropicProvider({ apiKey: 'sk' });
    const events = await collect(p, [makeUserTurn('x')]);
    const deltas = events.filter((e) => e.type === 'text_delta');
    expect(deltas.length).toBe(1);
    if (deltas[0]?.type === 'text_delta') {
      expect(deltas[0].text).toBe('hello');
    }
  });

  it('빈 turns → 정상 fetch 시도 + message_start', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(makeMockSseResponse([
      'event: message_stop\ndata: {"type":"message_stop"}\n\n',
    ]));
    const p = new AnthropicProvider({ apiKey: 'sk' });
    const events = await collect(p, []);
    expect(events[0]?.type).toBe('message_start');
  });
});
