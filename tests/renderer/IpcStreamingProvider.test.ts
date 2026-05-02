/**
 * IpcStreamingProvider tests — renderer-side adapter for ai/* IPC.
 *
 * Spec: docs/session/cross-ai-sync.md
 *
 * Uses the existing tests/setup.ts mock window.dreampia.ai with
 * __emitAiStreamEvent / __emitAiStreamEnd helpers.
 */

import { describe, it, expect, vi } from 'vitest';
import { __mockStore, __emitAiStreamEvent, __emitAiStreamEnd } from '../setup';
import { IpcStreamingProvider } from '../../src/renderer/providers/IpcStreamingProvider';
import type { StreamEvent } from '../../src/providers/types';
import type { Turn } from '../../src/types';
import { newTurnId, nowIso } from '../../src/types';

function userTurn(text: string): Turn {
  return {
    id: newTurnId(),
    role: 'user',
    timestamp: nowIso(),
    status: 'completed',
    content: [{ type: 'text', text }],
  };
}

async function consume(
  iter: AsyncIterable<StreamEvent>,
  emit: (streamId: string) => void
): Promise<StreamEvent[]> {
  const out: StreamEvent[] = [];
  // Start consumer; emit events after a tick so listeners are in place.
  const consumePromise = (async () => {
    for await (const ev of iter) {
      out.push(ev);
    }
  })();

  // Wait for startStream → listener registration.
  await new Promise((r) => setTimeout(r, 5));
  // Find the stream_id used (only one started).
  const ids = [...__mockStore.aiStartedStreams.keys()];
  const sid = ids[ids.length - 1] ?? 'unknown';
  emit(sid);

  await consumePromise;
  return out;
}

describe('IpcStreamingProvider', () => {
  it('completes when message_complete arrives', async () => {
    const p = new IpcStreamingProvider();
    const events = await consume(
      p.stream({ turns: [userTurn('hi')], model: 'claude-test' }),
      (sid) => {
        __emitAiStreamEvent({
          stream_id: sid,
          event: { type: 'text_delta', text: 'hello' },
        });
        __emitAiStreamEvent({
          stream_id: sid,
          event: {
            type: 'message_complete',
            turn: {
              id: newTurnId(),
              role: 'assistant',
              timestamp: nowIso(),
              status: 'completed',
              content: [{ type: 'text', text: 'hello' }],
              model: 'claude-test',
            },
          },
        });
        __emitAiStreamEnd({ stream_id: sid });
      }
    );
    const types = events.map((e) => e.type);
    expect(types).toContain('text_delta');
    expect(types).toContain('message_complete');
  });

  it('routes events by stream_id (other streams ignored)', async () => {
    const p = new IpcStreamingProvider();
    const events = await consume(
      p.stream({ turns: [userTurn('hi')], model: 'claude-test' }),
      (sid) => {
        __emitAiStreamEvent({
          stream_id: 'OTHER',
          event: { type: 'text_delta', text: 'NOPE' },
        });
        __emitAiStreamEvent({
          stream_id: sid,
          event: { type: 'text_delta', text: 'YES' },
        });
        __emitAiStreamEnd({ stream_id: 'OTHER' });
        __emitAiStreamEnd({ stream_id: sid });
      }
    );
    const deltas = events.filter((e) => e.type === 'text_delta');
    expect(deltas.length).toBe(1);
    expect((deltas[0] as { text: string }).text).toBe('YES');
  });

  it('ends gracefully on stream-end even without explicit complete', async () => {
    const p = new IpcStreamingProvider();
    const events = await consume(
      p.stream({ turns: [userTurn('hi')], model: 'claude-test' }),
      (sid) => {
        __emitAiStreamEvent({
          stream_id: sid,
          event: { type: 'text_delta', text: 'a' },
        });
        // immediate end — no message_complete
        __emitAiStreamEnd({ stream_id: sid });
      }
    );
    const types = events.map((e) => e.type);
    expect(types).toContain('text_delta');
    // No throw, iterator concluded.
  });

  it('yields error when window.dreampia.ai is missing', async () => {
    // 동일 setup 의 window.dreampia 를 임시로 ai 없이 교체.
    const original = window.dreampia;
    Object.defineProperty(window, 'dreampia', {
      writable: true,
      configurable: true,
      value: {},
    });
    try {
      const p = new IpcStreamingProvider();
      const out: StreamEvent[] = [];
      for await (const ev of p.stream({
        turns: [userTurn('hi')],
        model: 'claude-test',
      })) {
        out.push(ev);
      }
      expect(out).toHaveLength(1);
      expect(out[0]?.type).toBe('error');
    } finally {
      Object.defineProperty(window, 'dreampia', {
        writable: true,
        configurable: true,
        value: original,
      });
    }
  });

  it('calls stopStream on cleanup (best-effort cancel)', async () => {
    const stopSpy = vi.spyOn(window.dreampia.ai, 'stopStream');
    const p = new IpcStreamingProvider();
    await consume(p.stream({ turns: [userTurn('hi')], model: 'claude-test' }), (sid) => {
      __emitAiStreamEnd({ stream_id: sid });
    });
    expect(stopSpy).toHaveBeenCalled();
  });

  it('passes session_id and workspace_root config to ai/start-stream', async () => {
    const p = new IpcStreamingProvider();
    await consume(
      p.stream({
        turns: [userTurn('hi')],
        model: 'claude-test',
        config: {
          session_id: '019d0003-0000-7000-8000-000000000001',
          workspace_root: 'C:\\Dev\\workspace',
        },
      }),
      (sid) => {
        __emitAiStreamEnd({ stream_id: sid });
      }
    );
    const started = [...__mockStore.aiStartedStreams.values()].at(-1);
    expect(started?.session_id).toBe('019d0003-0000-7000-8000-000000000001');
    expect(started?.workspace_root).toBe('C:\\Dev\\workspace');
  });

  it('aborts immediately via input signal while waiting for events', async () => {
    const ctrl = new AbortController();
    const p = new IpcStreamingProvider();
    const out: StreamEvent[] = [];
    const consumePromise = (async () => {
      for await (const ev of p.stream({
        turns: [userTurn('hi')],
        model: 'claude-test',
        signal: ctrl.signal,
      })) {
        out.push(ev);
      }
    })();

    await new Promise((r) => setTimeout(r, 5));
    const ids = [...__mockStore.aiStartedStreams.keys()];
    const sid = ids[ids.length - 1];
    expect(sid).toBeDefined();
    ctrl.abort();

    await consumePromise;
    expect(out).toEqual([]);
    expect(__mockStore.aiStoppedStreams.has(sid as string)).toBe(true);
  });

  it('yields error when startStream returns ok:false', async () => {
    const startSpy = vi
      .spyOn(window.dreampia.ai, 'startStream')
      .mockResolvedValueOnce({ ok: false, error: 'no provider' });
    const p = new IpcStreamingProvider();
    const out: StreamEvent[] = [];
    for await (const ev of p.stream({
      turns: [userTurn('hi')],
      model: 'claude-test',
    })) {
      out.push(ev);
    }
    expect(out).toHaveLength(1);
    expect(out[0]?.type).toBe('error');
    expect((out[0] as { error: string }).error).toBe('no provider');
    startSpy.mockRestore();
  });
});
