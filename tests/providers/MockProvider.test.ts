/**
 * MockProvider — deterministic streaming + Zod schema validation 테스트.
 *
 * Spec: docs/session/cross-ai-sync.md (Phase 1 P0 MVP)
 */

import { describe, it, expect } from 'vitest';
import { MockProvider, TEST_TOOL_CALL_MARKER } from '../../src/providers/MockProvider';
import { TurnSchema, type Turn, type TurnId } from '../../src/types';
import type { StreamEvent } from '../../src/providers/types';

// ────────────────────────────────────────────────────────────
// Helper: collect entire stream into array
// ────────────────────────────────────────────────────────────

async function collect(
  provider: MockProvider,
  turns: Turn[],
  model = 'claude-sonnet-4.6'
): Promise<StreamEvent[]> {
  const events: StreamEvent[] = [];
  for await (const ev of provider.stream({ turns, model })) {
    events.push(ev);
  }
  return events;
}

function userTurn(text: string): Turn {
  return {
    id: 'turn-user-1' as TurnId,
    role: 'user',
    timestamp: '2026-05-02T01:00:00.000Z',
    status: 'completed',
    content: [{ type: 'text', text }],
  };
}

// ────────────────────────────────────────────────────────────
// Stream order + termination
// ────────────────────────────────────────────────────────────

describe('MockProvider — stream lifecycle', () => {
  it('emits message_start, text_deltas, usage, message_complete in order', async () => {
    const provider = new MockProvider({ responseText: 'abc' });
    const events = await collect(provider, [userTurn('hi')]);

    expect(events.length).toBeGreaterThanOrEqual(5); // start + 3 deltas + usage + complete
    expect(events[0]?.type).toBe('message_start');
    expect(events[events.length - 1]?.type).toBe('message_complete');
    // v0.4.0 — usage event 가 message_complete 직전에 emit.
    expect(events[events.length - 2]?.type).toBe('usage');

    // text_deltas in middle (usage 빼고). slice(1, -2) 로 first/last/usage 제외.
    const middleTypes = events.slice(1, -2).map((e) => e.type);
    expect(middleTypes.every((t) => t === 'text_delta')).toBe(true);
  });

  it('text_deltas concat to responseText', async () => {
    const provider = new MockProvider({ responseText: 'hello world' });
    const events = await collect(provider, [userTurn('x')]);

    const fullText = events
      .filter((e): e is Extract<StreamEvent, { type: 'text_delta' }> => e.type === 'text_delta')
      .map((e) => e.text)
      .join('');
    expect(fullText).toBe('hello world');
  });

  it('stream terminates (no infinite loop)', async () => {
    const provider = new MockProvider({ responseText: 'short' });
    const events = await collect(provider, [userTurn('go')]);
    // If the loop didn't terminate, we'd never get here
    expect(events[events.length - 1]?.type).toBe('message_complete');
  });

  it('delayMs 0 = synchronous (fast collection)', async () => {
    const provider = new MockProvider({
      responseText: 'a'.repeat(100),
      delayMs: 0,
    });
    const start = Date.now();
    await collect(provider, [userTurn('x')]);
    const elapsed = Date.now() - start;
    // 100 chars + bookends, with no delay should be near-instant
    expect(elapsed).toBeLessThan(500);
  });

  it('delayMs > 0 introduces measurable delay', async () => {
    const provider = new MockProvider({
      responseText: 'abc',
      delayMs: 5,
    });
    const start = Date.now();
    await collect(provider, [userTurn('x')]);
    const elapsed = Date.now() - start;
    // 3 chars * 5ms = at least 15ms (allow margin)
    expect(elapsed).toBeGreaterThanOrEqual(10);
  });
});

// ────────────────────────────────────────────────────────────
// Echo behavior + defaults
// ────────────────────────────────────────────────────────────

describe('MockProvider — echo and defaults', () => {
  it('without responseText, echoes last user message', async () => {
    const provider = new MockProvider();
    const events = await collect(provider, [userTurn('hello there')]);
    const fullText = events
      .filter((e): e is Extract<StreamEvent, { type: 'text_delta' }> => e.type === 'text_delta')
      .map((e) => e.text)
      .join('');
    expect(fullText).toContain('hello there');
  });

  it('with no user turn, still emits a complete stream (graceful default)', async () => {
    const provider = new MockProvider();
    const events = await collect(provider, []);
    expect(events[0]?.type).toBe('message_start');
    expect(events[events.length - 1]?.type).toBe('message_complete');
  });

  it('returns a transparent structured coding-loop guide for README install requests', async () => {
    const provider = new MockProvider();
    const events = await collect(provider, [userTurn('README 설치 안내를 더 명확하게 바꿔줘')]);
    const fullText = events
      .filter((e): e is Extract<StreamEvent, { type: 'text_delta' }> => e.type === 'text_delta')
      .map((e) => e.text)
      .join('');

    expect(fullText).toContain('## 작업 계획');
    expect(fullText).toContain('## 변경 후보');
    expect(fullText).toContain('## 테스트 명령');
    expect(fullText).toContain('Mock/dry-run');
    expect(fullText).toContain('```md');
  });

  it('finds the LAST user turn (not first)', async () => {
    const provider = new MockProvider();
    const turns: Turn[] = [
      userTurn('first message'),
      {
        id: 'turn-asst-1' as TurnId,
        role: 'assistant',
        timestamp: '2026-05-02T01:00:01.000Z',
        status: 'completed',
        content: [{ type: 'text', text: 'reply' }],
      },
      {
        id: 'turn-user-2' as TurnId,
        role: 'user',
        timestamp: '2026-05-02T01:00:02.000Z',
        status: 'completed',
        content: [{ type: 'text', text: 'second message' }],
      },
    ];
    const events = await collect(provider, turns);
    const fullText = events
      .filter((e): e is Extract<StreamEvent, { type: 'text_delta' }> => e.type === 'text_delta')
      .map((e) => e.text)
      .join('');
    expect(fullText).toContain('second message');
    expect(fullText).not.toContain('first message');
  });
});

// ────────────────────────────────────────────────────────────
// Tool call injection
// ────────────────────────────────────────────────────────────

describe('MockProvider — tool call injection', () => {
  it('injectToolCall produces tool_call_start and tool_call_complete events', async () => {
    const provider = new MockProvider({
      responseText: 'ok',
      injectToolCall: {
        tool_id: 'shell.run',
        input: { cmd: 'ls' },
      },
    });
    const events = await collect(provider, [userTurn('run it')]);

    const startEv = events.find((e) => e.type === 'tool_call_start');
    const completeEv = events.find((e) => e.type === 'tool_call_complete');

    expect(startEv).toBeDefined();
    expect(completeEv).toBeDefined();
    if (startEv?.type === 'tool_call_start') {
      expect(startEv.tool_call.tool_id).toBe('shell.run');
      expect(startEv.tool_call.input).toEqual({ cmd: 'ls' });
    }
    if (completeEv?.type === 'tool_call_complete') {
      expect(completeEv.tool_call.tool_id).toBe('shell.run');
    }
  });

  it('without injectToolCall, no tool_call events emitted', async () => {
    const provider = new MockProvider({ responseText: 'plain' });
    const events = await collect(provider, [userTurn('x')]);
    expect(events.find((e) => e.type === 'tool_call_start')).toBeUndefined();
    expect(events.find((e) => e.type === 'tool_call_complete')).toBeUndefined();
  });

  it('testToolTrigger parses marker JSON into a tool call only when enabled', async () => {
    const message = `${TEST_TOOL_CALL_MARKER} {"tool_id":"shell.run","input":{"cmd":"echo hi"}}`;
    const enabledEvents = await collect(
      new MockProvider({ responseText: 'ok', testToolTrigger: true }),
      [userTurn(message)]
    );
    const completeEv = enabledEvents.find((e) => e.type === 'tool_call_complete');
    expect(completeEv?.type).toBe('tool_call_complete');
    if (completeEv?.type === 'tool_call_complete') {
      expect(completeEv.tool_call.tool_id).toBe('shell.run');
      expect(completeEv.tool_call.input).toEqual({ cmd: 'echo hi' });
    }

    const disabledEvents = await collect(new MockProvider({ responseText: 'ok' }), [
      userTurn(message),
    ]);
    expect(disabledEvents.find((e) => e.type === 'tool_call_complete')).toBeUndefined();
  });

  it('final turn includes tool_calls array when injected', async () => {
    const provider = new MockProvider({
      responseText: 'done',
      injectToolCall: {
        tool_id: 'fs.read',
        input: { path: '/tmp/x.txt' },
      },
    });
    const events = await collect(provider, [userTurn('hi')]);
    const last = events[events.length - 1];
    expect(last?.type).toBe('message_complete');
    if (last?.type === 'message_complete') {
      expect(last.turn.tool_calls).toBeDefined();
      expect(last.turn.tool_calls).toHaveLength(1);
      expect(last.turn.tool_calls?.[0]?.tool_id).toBe('fs.read');
    }
  });
});

// ────────────────────────────────────────────────────────────
// Schema validation — final turn passes Zod
// ────────────────────────────────────────────────────────────

describe('MockProvider — final turn schema validation', () => {
  it('message_complete.turn passes TurnSchema.parse', async () => {
    const provider = new MockProvider({ responseText: 'hello' });
    const events = await collect(provider, [userTurn('hi')]);
    const last = events[events.length - 1];
    expect(last?.type).toBe('message_complete');
    if (last?.type === 'message_complete') {
      // This will throw if invalid
      const parsed = TurnSchema.parse(last.turn);
      expect(parsed.role).toBe('assistant');
      expect(parsed.status).toBe('completed');
    }
  });

  it('final turn schema-valid even with tool_calls injected', async () => {
    const provider = new MockProvider({
      responseText: 'done',
      injectToolCall: { tool_id: 'shell.run', input: { cmd: 'pwd' } },
    });
    const events = await collect(provider, [userTurn('go')]);
    const last = events[events.length - 1];
    if (last?.type === 'message_complete') {
      const parsed = TurnSchema.parse(last.turn);
      expect(parsed.tool_calls?.[0]?.tool_id).toBe('shell.run');
    }
  });

  it('final turn id matches message_start.turn_id', async () => {
    const provider = new MockProvider({ responseText: 'x' });
    const events = await collect(provider, [userTurn('hi')]);
    const start = events[0];
    const last = events[events.length - 1];
    if (start?.type === 'message_start' && last?.type === 'message_complete') {
      expect(last.turn.id).toBe(start.turn_id);
    }
  });

  it('model field propagates to final turn', async () => {
    const provider = new MockProvider({ responseText: 'x' });
    const events: StreamEvent[] = [];
    for await (const ev of provider.stream({
      turns: [userTurn('hi')],
      model: 'gpt-5.5',
    })) {
      events.push(ev);
    }
    const last = events[events.length - 1];
    if (last?.type === 'message_complete') {
      expect(last.turn.model).toBe('gpt-5.5');
    }
  });
});

// ────────────────────────────────────────────────────────────
// Provider field
// ────────────────────────────────────────────────────────────

describe('MockProvider — provider field', () => {
  it('defaults to claude', () => {
    expect(new MockProvider().provider).toBe('claude');
  });

  it('accepts codex via opts', () => {
    expect(new MockProvider({ provider: 'codex' }).provider).toBe('codex');
  });
});
