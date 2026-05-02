/**
 * CliProvider tests — child_process.spawn 을 가짜 EventEmitter 로 대체.
 *
 * 검증 포인트:
 *   - message_start 가 항상 처음 emit
 *   - stdout JSONL → translate 결과 emit
 *   - stderr 에러 키워드 → error event
 *   - non-zero exit → error event
 *   - AbortSignal → child.kill 호출
 *   - 누락된 message_complete 합성
 *   - 명시적 message_complete 시 중복 X
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { EventEmitter } from 'node:events';

// ────────────────────────────────────────────────────────────
// Mock child_process — vi.mock 은 hoisted
// ────────────────────────────────────────────────────────────

interface FakeChild extends EventEmitter {
  stdout: EventEmitter;
  stderr: EventEmitter;
  stdin: { write: (s: string) => boolean; end: () => void };
  kill: ReturnType<typeof vi.fn>;
}

const fakeChildren: FakeChild[] = [];
let nextChildHandler: ((child: FakeChild) => void) | null = null;

vi.mock('node:child_process', () => ({
  spawn: vi.fn(() => {
    const child: FakeChild = Object.assign(new EventEmitter(), {
      stdout: new EventEmitter(),
      stderr: new EventEmitter(),
      stdin: {
        write: vi.fn(() => true),
        end: vi.fn(),
      },
      kill: vi.fn(),
    });
    fakeChildren.push(child);
    const handler = nextChildHandler;
    nextChildHandler = null;
    if (handler !== null) {
      // setImmediate — provider 가 listener 를 attach 한 후 emit.
      setImmediate(() => handler(child));
    }
    return child;
  }),
}));

import { CliProvider } from '../../../src/providers/cli/CliProvider';
import type { StreamEvent } from '../../../src/providers/types';
import type { Turn } from '../../../src/types';
import { newTurnId, nowIso } from '../../../src/types';

beforeEach(() => {
  fakeChildren.length = 0;
  nextChildHandler = null;
});

function userTurn(text: string): Turn {
  return {
    id: newTurnId(),
    role: 'user',
    timestamp: nowIso(),
    status: 'completed',
    content: [{ type: 'text', text }],
  };
}

// 단순 translate: text_delta 만 통과시킴.
function passthroughTranslate(parsed: unknown): StreamEvent[] {
  if (typeof parsed !== 'object' || parsed === null) return [];
  const obj = parsed as Record<string, unknown>;
  if (obj.type === 'text_delta' && typeof obj.text === 'string') {
    return [{ type: 'text_delta', text: obj.text }];
  }
  if (obj.type === 'message_complete' && typeof obj.text === 'string') {
    const text = obj.text;
    return [
      {
        type: 'message_complete',
        turn: {
          id: newTurnId(),
          role: 'assistant',
          timestamp: nowIso(),
          status: 'completed',
          content: [{ type: 'text', text }],
          model: 'mock',
        },
      },
    ];
  }
  return [];
}

async function consume(p: CliProvider, t: Turn[]): Promise<StreamEvent[]> {
  const events: StreamEvent[] = [];
  for await (const ev of p.stream({ turns: t, model: 'claude-test' })) {
    events.push(ev);
  }
  return events;
}

describe('CliProvider', () => {
  it('emits message_start first', async () => {
    nextChildHandler = (child) => {
      child.stdout.emit('data', Buffer.from('{"type":"text_delta","text":"hi"}\n'));
      child.emit('close', 0);
    };
    const p = new CliProvider({
      binaryPath: '/fake/claude',
      provider: 'claude',
      translate: passthroughTranslate,
    });
    const events = await consume(p, [userTurn('hello')]);
    expect(events[0]?.type).toBe('message_start');
  });

  it('translates stdout JSONL into text_delta events', async () => {
    nextChildHandler = (child) => {
      child.stdout.emit(
        'data',
        Buffer.from(
          '{"type":"text_delta","text":"a"}\n{"type":"text_delta","text":"b"}\n'
        )
      );
      child.emit('close', 0);
    };
    const p = new CliProvider({
      binaryPath: '/fake/claude',
      provider: 'claude',
      translate: passthroughTranslate,
    });
    const events = await consume(p, [userTurn('hi')]);
    const deltas = events.filter((e) => e.type === 'text_delta');
    expect(deltas.map((e) => (e as { text: string }).text)).toEqual(['a', 'b']);
  });

  it('emits error event when stderr contains error keyword', async () => {
    nextChildHandler = (child) => {
      child.stderr.emit('data', Buffer.from('Error: auth failed\n'));
      child.emit('close', 1);
    };
    const p = new CliProvider({
      binaryPath: '/fake/claude',
      provider: 'claude',
      translate: passthroughTranslate,
    });
    const events = await consume(p, [userTurn('hi')]);
    const err = events.find((e) => e.type === 'error');
    expect(err).toBeDefined();
    expect((err as { error: string }).error).toMatch(/Error|exit code/);
  });

  it('emits error event with exit code on non-zero exit', async () => {
    nextChildHandler = (child) => {
      child.emit('close', 2);
    };
    const p = new CliProvider({
      binaryPath: '/fake/claude',
      provider: 'claude',
      translate: passthroughTranslate,
    });
    const events = await consume(p, [userTurn('hi')]);
    const err = events.find((e) => e.type === 'error');
    expect(err).toBeDefined();
    expect((err as { error: string }).error).toMatch(/exit code 2/);
  });

  it('aborts via signal -> calls child.kill', async () => {
    const ctrl = new AbortController();
    let capturedChild: FakeChild | null = null;
    nextChildHandler = (child) => {
      capturedChild = child;
      // Trigger abort right after first delta.
      child.stdout.emit('data', Buffer.from('{"type":"text_delta","text":"x"}\n'));
      setImmediate(() => {
        ctrl.abort();
        // Simulate child死 after kill
        setImmediate(() => child.emit('close', null));
      });
    };
    const p = new CliProvider({
      binaryPath: '/fake/claude',
      provider: 'claude',
      translate: passthroughTranslate,
      signal: ctrl.signal,
    });
    await consume(p, [userTurn('hi')]);
    expect(capturedChild).not.toBeNull();
    expect(capturedChild!.kill).toHaveBeenCalledWith('SIGTERM');
  });

  it('flushes a partial line at EOF (no trailing newline)', async () => {
    nextChildHandler = (child) => {
      // emit two deltas, the second WITHOUT trailing \n.
      child.stdout.emit('data', Buffer.from('{"type":"text_delta","text":"a"}\n'));
      child.stdout.emit('data', Buffer.from('{"type":"text_delta","text":"b"}'));
      child.emit('close', 0);
    };
    const p = new CliProvider({
      binaryPath: '/fake/claude',
      provider: 'claude',
      translate: passthroughTranslate,
    });
    const events = await consume(p, [userTurn('hi')]);
    const texts = events
      .filter((e) => e.type === 'text_delta')
      .map((e) => (e as { text: string }).text);
    expect(texts).toEqual(['a', 'b']);
  });

  it('synthesizes message_complete from accumulated deltas if translator never emitted one', async () => {
    nextChildHandler = (child) => {
      child.stdout.emit('data', Buffer.from('{"type":"text_delta","text":"hi"}\n'));
      child.stdout.emit('data', Buffer.from('{"type":"text_delta","text":"!"}\n'));
      child.emit('close', 0);
    };
    const p = new CliProvider({
      binaryPath: '/fake/claude',
      provider: 'claude',
      translate: passthroughTranslate,
    });
    const events = await consume(p, [userTurn('hi')]);
    const complete = events.find((e) => e.type === 'message_complete');
    expect(complete).toBeDefined();
    const turn = (complete as { turn: Turn }).turn;
    expect(turn.role).toBe('assistant');
    expect(turn.status).toBe('completed');
    const text = turn.content.find((b) => b.type === 'text') as
      | { type: 'text'; text: string }
      | undefined;
    expect(text?.text).toBe('hi!');
  });

  it('does NOT duplicate message_complete when translator already emitted one', async () => {
    nextChildHandler = (child) => {
      child.stdout.emit('data', Buffer.from('{"type":"text_delta","text":"x"}\n'));
      child.stdout.emit(
        'data',
        Buffer.from('{"type":"message_complete","text":"x"}\n')
      );
      child.emit('close', 0);
    };
    const p = new CliProvider({
      binaryPath: '/fake/claude',
      provider: 'claude',
      translate: passthroughTranslate,
    });
    const events = await consume(p, [userTurn('hi')]);
    const completes = events.filter((e) => e.type === 'message_complete');
    expect(completes.length).toBe(1);
  });

  it('writes the last user turn text to stdin and closes it', async () => {
    nextChildHandler = (child) => {
      child.emit('close', 0);
    };
    const p = new CliProvider({
      binaryPath: '/fake/claude',
      provider: 'claude',
      translate: passthroughTranslate,
    });
    await consume(p, [userTurn('the prompt')]);
    expect(fakeChildren[0]?.stdin.write).toHaveBeenCalledWith('the prompt\n');
    expect(fakeChildren[0]?.stdin.end).toHaveBeenCalled();
  });
});
