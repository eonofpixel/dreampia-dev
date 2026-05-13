/**
 * useStreamingTurn test
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { useStreamingTurn } from '../../src/renderer/hooks/useStreamingTurn';
import { MockProvider } from '../../src/providers';
import type { ToolCallId, Turn } from '../../src/types';

function makeUserTurn(text: string): Turn {
  return {
    id: '00000000-0000-7000-8000-000000000001' as Turn['id'],
    role: 'user',
    timestamp: new Date().toISOString(),
    status: 'completed',
    content: [{ type: 'text', text }],
  };
}

describe('useStreamingTurn', () => {
  const input = { turns: [makeUserTurn('hello')], model: 'mock-model' };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('isStreaming is false initially', () => {
    const provider = new MockProvider({ responseText: 'hi', delayMs: 0 });
    const { result } = renderHook(() =>
      useStreamingTurn({ provider, onTurnUpdate: vi.fn(), onComplete: vi.fn() })
    );
    expect(result.current.isStreaming).toBe(false);
  });

  it('isStreaming becomes true during stream, false after', async () => {
    const provider = new MockProvider({ responseText: 'hi', delayMs: 0 });
    const { result } = renderHook(() =>
      useStreamingTurn({ provider, onTurnUpdate: vi.fn(), onComplete: vi.fn() })
    );
    act(() => {
      void result.current.start(input);
    });
    expect(result.current.isStreaming).toBe(true);
    await waitFor(() => expect(result.current.isStreaming).toBe(false));
  });

  it('onTurnUpdate fires and text accumulates', async () => {
    const provider = new MockProvider({ responseText: 'abc', delayMs: 0 });
    const onTurnUpdate = vi.fn();
    const { result } = renderHook(() =>
      useStreamingTurn({ provider, onTurnUpdate, onComplete: vi.fn() })
    );
    await act(async () => {
      await result.current.start(input);
    });
    expect(onTurnUpdate.mock.calls.length).toBeGreaterThanOrEqual(4);
    const lastCall = onTurnUpdate.mock.calls.at(-1) as [Turn];
    const tb = lastCall[0].content.find((b) => b.type === 'text');
    expect(tb?.type === 'text' && tb.text).toBe('abc');
  });

  it('text_delta events accumulate into same content block', async () => {
    const provider = new MockProvider({ responseText: 'xyz', delayMs: 0 });
    const received: Turn[] = [];
    const { result } = renderHook(() =>
      useStreamingTurn({ provider, onTurnUpdate: (t) => received.push(t), onComplete: vi.fn() })
    );
    await act(async () => {
      await result.current.start(input);
    });
    for (const t of received.filter((t) => t.status === 'streaming')) {
      expect(t.content.length).toBe(1);
    }
    const tb = received.at(-1)?.content[0];
    expect(tb?.type === 'text' && tb.text).toBe('xyz');
  });

  it('onComplete fires once with completed turn', async () => {
    const provider = new MockProvider({ responseText: 'done', delayMs: 0 });
    const onComplete = vi.fn();
    const { result } = renderHook(() =>
      useStreamingTurn({ provider, onTurnUpdate: vi.fn(), onComplete })
    );
    await act(async () => {
      await result.current.start(input);
    });
    expect(onComplete).toHaveBeenCalledTimes(1);
    const ct = (onComplete.mock.calls[0] as [Turn])[0];
    expect(ct.status).toBe('completed');
  });

  it('tool_calls appear after tool_call events', async () => {
    const provider = new MockProvider({
      responseText: 'calling tool',
      delayMs: 0,
      injectToolCall: { tool_id: 'shell.run', input: { cmd: 'ls' } },
    });
    const received: Turn[] = [];
    const { result } = renderHook(() =>
      useStreamingTurn({ provider, onTurnUpdate: (t) => received.push(t), onComplete: vi.fn() })
    );
    await act(async () => {
      await result.current.start(input);
    });
    const fin = received.at(-1);
    expect(fin?.tool_calls?.length).toBe(1);
    expect(fin?.tool_calls?.[0]?.tool_id).toBe('shell.run');
  });

  it('preserves accumulated tool calls when final message omits them', async () => {
    const provider = {
      provider: 'claude' as const,
      async *stream() {
        yield { type: 'message_start' as const, turn_id: 't-1', model: 'mock-model' };
        yield {
          type: 'tool_call_start' as const,
          tool_call: { id: 'call-1', tool_id: 'shell.run' },
        };
        yield {
          type: 'tool_call_input_delta' as const,
          tool_call_id: 'call-1',
          partial_input: '{"cmd":"npm test"}',
        };
        yield {
          type: 'message_complete' as const,
          turn: {
            id: 't-1' as Turn['id'],
            role: 'assistant' as const,
            timestamp: new Date().toISOString(),
            status: 'completed' as const,
            content: [{ type: 'text' as const, text: 'done' }],
            model: 'mock-model',
          },
        };
      },
    };
    const onComplete = vi.fn();
    const { result } = renderHook(() =>
      useStreamingTurn({ provider, onTurnUpdate: vi.fn(), onComplete })
    );
    await act(async () => {
      await result.current.start(input);
    });

    const completed = (onComplete.mock.calls[0] as [Turn])[0];
    expect(completed.tool_calls?.[0]?.tool_id).toBe('shell.run');
    expect(completed.tool_calls?.[0]?.input).toBe('{"cmd":"npm test"}');
  });

  it('passes tool_result events as a role=tool turn after completion', async () => {
    const callId = '019d0003-0000-7000-8000-000000000001' as ToolCallId;
    const provider = {
      provider: 'claude' as const,
      async *stream() {
        yield { type: 'message_start' as const, turn_id: 't-1', model: 'mock-model' };
        yield {
          type: 'tool_call_complete' as const,
          tool_call: { id: callId, tool_id: 'shell.run', input: { cmd: 'echo hi' } },
        };
        yield {
          type: 'tool_result' as const,
          result: {
            call_id: callId,
            status: 'success' as const,
            output: { stdout: 'hi' },
            duration_ms: 10,
          },
        };
        yield {
          type: 'message_complete' as const,
          turn: {
            id: 't-1' as Turn['id'],
            role: 'assistant' as const,
            timestamp: new Date().toISOString(),
            status: 'completed' as const,
            content: [{ type: 'text' as const, text: 'done' }],
            tool_calls: [{ id: callId, tool_id: 'shell.run', input: { cmd: 'echo hi' } }],
            model: 'mock-model',
          },
        };
      },
    };
    const onComplete = vi.fn();
    const { result } = renderHook(() =>
      useStreamingTurn({ provider, onTurnUpdate: vi.fn(), onComplete })
    );

    await act(async () => {
      await result.current.start(input);
    });

    const [, toolTurn] = onComplete.mock.calls[0] as [Turn, Turn | undefined];
    expect(toolTurn?.role).toBe('tool');
    expect(toolTurn?.tool_results?.[0]?.call_id).toBe(callId);
  });

  it('handles error event by calling onError', async () => {
    const errorProvider = {
      provider: 'claude' as const,
      async *stream() {
        yield { type: 'error' as const, error: 'test error' };
      },
    };
    const onError = vi.fn();
    const received: Turn[] = [];
    const { result } = renderHook(() =>
      useStreamingTurn({
        provider: errorProvider,
        onTurnUpdate: (t) => received.push(t),
        onComplete: vi.fn(),
        onError,
      })
    );
    await act(async () => {
      await result.current.start(input);
    });
    expect(onError).toHaveBeenCalledWith('test error');
    expect(received.at(-1)?.status).toBe('failed');
    expect(received.at(-1)?.content[0]).toEqual({
      type: 'text',
      text: '오류: test error',
    });
  });

  it('cancel aborts stream — no further updates after cancel', async () => {
    const provider = new MockProvider({ responseText: 'abcdefghij', delayMs: 10 });
    const onTurnUpdate = vi.fn();
    const { result } = renderHook(() =>
      useStreamingTurn({ provider, onTurnUpdate, onComplete: vi.fn() })
    );
    act(() => {
      void result.current.start(input);
    });
    act(() => {
      result.current.cancel();
    });
    await waitFor(() => expect(result.current.isStreaming).toBe(false));
    const cnt = onTurnUpdate.mock.calls.length;
    await new Promise((r) => setTimeout(r, 50));
    expect(onTurnUpdate.mock.calls.length).toBe(cnt);
  });

  it('on cancel, final turn status is cancelled', async () => {
    const provider = new MockProvider({ responseText: 'abcdefghij', delayMs: 10 });
    const received: Turn[] = [];
    const { result } = renderHook(() =>
      useStreamingTurn({ provider, onTurnUpdate: (t) => received.push(t), onComplete: vi.fn() })
    );
    act(() => {
      void result.current.start(input);
    });
    act(() => {
      result.current.cancel();
    });
    await waitFor(() => expect(result.current.isStreaming).toBe(false));
    expect(received.at(-1)?.status).toBe('cancelled');
  });

  it('start() is no-op if already streaming', async () => {
    const provider = new MockProvider({ responseText: 'slow', delayMs: 50 });
    const { result } = renderHook(() =>
      useStreamingTurn({ provider, onTurnUpdate: vi.fn(), onComplete: vi.fn() })
    );
    act(() => {
      void result.current.start(input);
    });
    act(() => {
      void result.current.start(input);
    });
    expect(result.current.isStreaming).toBe(true);
    act(() => {
      result.current.cancel();
    });
    await waitFor(() => expect(result.current.isStreaming).toBe(false));
  });
});
