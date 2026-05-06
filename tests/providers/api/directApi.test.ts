/**
 * Direct API provider stub tests (v1.2.1).
 *
 * 본 commit 은 stub — stream() 가 'not_implemented' error event 즉시 emit.
 * 실제 SSE 동작은 v1.2.2 에서.
 */

import { describe, it, expect } from 'vitest';
import { AnthropicProvider } from '../../../src/providers/api/AnthropicProvider';
import { OpenAIProvider } from '../../../src/providers/api/OpenAIProvider';
import type { StreamEvent } from '../../../src/providers/types';

describe('v1.2.1 — Direct API stubs', () => {
  it('AnthropicProvider — instantiate + vendor', () => {
    const p = new AnthropicProvider({ apiKey: 'sk-test' });
    expect(p.vendor).toBe('anthropic');
    expect(p.provider).toBe('claude');
  });

  it('OpenAIProvider — instantiate + vendor', () => {
    const p = new OpenAIProvider({ apiKey: 'sk-test' });
    expect(p.vendor).toBe('openai');
    expect(p.provider).toBe('codex');
  });

  it('AnthropicProvider.stream → message_start + (fetch fail → error event)', async () => {
    // v1.4.4: 실 fetch 시도. 잘못된 baseUrl 로 즉시 실패 유도.
    const p = new AnthropicProvider({
      apiKey: 'sk-x',
      baseUrl: 'http://127.0.0.1:9/invalid',
    });
    const events: StreamEvent[] = [];
    for await (const ev of p.stream({ turns: [], model: 'claude-sonnet' })) {
      events.push(ev);
    }
    // 첫 event 는 message_start, 마지막은 error.
    expect(events[0]?.type).toBe('message_start');
    const errors = events.filter((e) => e.type === 'error');
    expect(errors.length).toBeGreaterThan(0);
  });

  it('OpenAIProvider.stream → message_start + (fetch fail → error) (v1.4.5)', async () => {
    const p = new OpenAIProvider({
      apiKey: 'sk-y',
      baseUrl: 'http://127.0.0.1:9/invalid',
    });
    const events: StreamEvent[] = [];
    for await (const ev of p.stream({ turns: [], model: 'gpt-4' })) {
      events.push(ev);
    }
    expect(events[0]?.type).toBe('message_start');
    const errors = events.filter((e) => e.type === 'error');
    expect(errors.length).toBeGreaterThan(0);
  });

  it('baseUrl override 가능', () => {
    const p = new AnthropicProvider({ apiKey: 'k', baseUrl: 'https://proxy/' });
    expect(p).toBeDefined();
  });
});
