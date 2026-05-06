/**
 * OpenAIProvider 실 SSE 변환 테스트 (v1.4.5).
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { OpenAIProvider } from '../../../src/providers/api/OpenAIProvider';
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

async function collect(provider: OpenAIProvider, turns: Turn[]): Promise<StreamEvent[]> {
  const events: StreamEvent[] = [];
  for await (const ev of provider.stream({ turns, model: 'gpt-4o' })) {
    events.push(ev);
  }
  return events;
}

describe('v1.4.5 — OpenAIProvider SSE 변환', () => {
  it('happy path: delta.content + usage + [DONE]', async () => {
    const sseChunks = [
      'data: {"id":"c1","model":"gpt-4o","choices":[{"index":0,"delta":{"role":"assistant","content":""}}]}\n\n',
      'data: {"id":"c1","model":"gpt-4o","choices":[{"index":0,"delta":{"content":"hello "}}]}\n\n',
      'data: {"id":"c1","model":"gpt-4o","choices":[{"index":0,"delta":{"content":"world"}}]}\n\n',
      'data: {"id":"c1","model":"gpt-4o","choices":[{"index":0,"delta":{},"finish_reason":"stop"}]}\n\n',
      'data: {"id":"c1","model":"gpt-4o","choices":[],"usage":{"prompt_tokens":7,"completion_tokens":2,"total_tokens":9}}\n\n',
      'data: [DONE]\n\n',
    ];
    globalThis.fetch = vi.fn().mockResolvedValue(makeMockSseResponse(sseChunks));

    const p = new OpenAIProvider({ apiKey: 'sk-test' });
    const events = await collect(p, [makeUserTurn('hi')]);

    const types = events.map((e) => e.type);
    expect(types).toContain('message_start');
    expect(types).toContain('text_delta');
    expect(types).toContain('usage');
    expect(types).toContain('message_complete');

    const deltas = events.filter((e) => e.type === 'text_delta');
    expect(deltas.length).toBe(2);

    const complete = events.find((e) => e.type === 'message_complete');
    if (complete?.type === 'message_complete') {
      const text = complete.turn.content
        .map((b) => (b.type === 'text' ? b.text : ''))
        .join('');
      expect(text).toBe('hello world');
    }

    const usage = events.find((e) => e.type === 'usage');
    if (usage?.type === 'usage') {
      expect(usage.data.input_tokens).toBe(7);
      expect(usage.data.output_tokens).toBe(2);
    }
  });

  it('non-200 → error event', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(
      new Response('{"error":{"message":"invalid"}}', {
        status: 401,
        statusText: 'Unauthorized',
      })
    );
    const p = new OpenAIProvider({ apiKey: 'bad' });
    const events = await collect(p, [makeUserTurn('hi')]);
    const errors = events.filter((e) => e.type === 'error');
    expect(errors.length).toBeGreaterThan(0);
  });

  it('SSE error chunk → StreamEvent error', async () => {
    const chunks = [
      'data: {"error":{"message":"rate limit"}}\n\n',
      'data: [DONE]\n\n',
    ];
    globalThis.fetch = vi.fn().mockResolvedValue(makeMockSseResponse(chunks));
    const p = new OpenAIProvider({ apiKey: 'sk' });
    const events = await collect(p, [makeUserTurn('x')]);
    const err = events.find((e) => e.type === 'error');
    expect(err).toBeDefined();
    if (err?.type === 'error') {
      expect(err.error).toMatch(/rate limit/);
    }
  });

  it('chunked SSE — JSON split', async () => {
    const chunks = [
      'data: {"id":"c1","choices":[{"delta":{"content":"foo',
      '"}}]}\n\ndata: [DONE]\n\n',
    ];
    globalThis.fetch = vi.fn().mockResolvedValue(makeMockSseResponse(chunks));
    const p = new OpenAIProvider({ apiKey: 'sk' });
    const events = await collect(p, [makeUserTurn('x')]);
    const deltas = events.filter((e) => e.type === 'text_delta');
    expect(deltas.length).toBe(1);
    if (deltas[0]?.type === 'text_delta') {
      expect(deltas[0].text).toBe('foo');
    }
  });

  it('[DONE] 없이 stream 종료 → message_complete 자체 emit', async () => {
    const chunks = [
      'data: {"id":"c1","choices":[{"delta":{"content":"x"}}]}\n\n',
    ];
    globalThis.fetch = vi.fn().mockResolvedValue(makeMockSseResponse(chunks));
    const p = new OpenAIProvider({ apiKey: 'sk' });
    const events = await collect(p, [makeUserTurn('x')]);
    expect(events.some((e) => e.type === 'message_complete')).toBe(true);
  });
});
