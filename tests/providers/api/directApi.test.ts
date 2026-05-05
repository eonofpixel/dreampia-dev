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

  it('AnthropicProvider.stream → not_implemented error', async () => {
    const p = new AnthropicProvider({ apiKey: 'sk-x' });
    const events: StreamEvent[] = [];
    for await (const ev of p.stream({ turns: [], model: 'claude-sonnet' })) {
      events.push(ev);
    }
    expect(events.length).toBe(1);
    expect(events[0]?.type).toBe('error');
    if (events[0]?.type === 'error') {
      expect(events[0].error).toMatch(/not yet implemented/);
    }
  });

  it('OpenAIProvider.stream → not_implemented error', async () => {
    const p = new OpenAIProvider({ apiKey: 'sk-y' });
    const events: StreamEvent[] = [];
    for await (const ev of p.stream({ turns: [], model: 'gpt-4' })) {
      events.push(ev);
    }
    expect(events.length).toBe(1);
    expect(events[0]?.type).toBe('error');
  });

  it('baseUrl override 가능', () => {
    const p = new AnthropicProvider({ apiKey: 'k', baseUrl: 'https://proxy/' });
    expect(p).toBeDefined();
  });
});
