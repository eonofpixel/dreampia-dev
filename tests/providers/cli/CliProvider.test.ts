/**
 * CliProvider tests -- child_process.spawn replaced with fake EventEmitter.
 *
 * Verified behaviors:
 *   - message_start always emitted first
 *   - stdout JSONL -> translate results emitted
 *   - stderr error keyword -> error event
 *   - non-zero exit -> error event
 *   - AbortSignal -> child.kill called
 *   - missing message_complete synthesized from accumulated deltas
 *   - explicit message_complete not duplicated
 *   - prompt passed as positional arg (NOT stdin.write)
 *   - buildArgs: correct claude / codex flags verified
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { EventEmitter } from 'node:events';

// Mock child_process -- vi.mock is hoisted
interface FakeChild extends EventEmitter {
  stdout: EventEmitter;
  stderr: EventEmitter;
  stdin: { write: (s: string) => boolean; end: () => void };
  kill: ReturnType<typeof vi.fn>;
}

const fakeChildren: FakeChild[] = [];
let nextChildHandler: ((child: FakeChild) => void) | null = null;
const spawnCalls: Array<{ cmd: string; args: string[]; opts?: { cwd?: string } }> = [];

vi.mock('node:child_process', () => ({
  spawn: vi.fn((cmd: string, args: string[], opts?: { cwd?: string }) => {
    spawnCalls.push({ cmd, args, opts });
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
      setImmediate(() => handler(child));
    }
    return child;
  }),
}));

import { CliProvider } from '../../../src/providers/cli/CliProvider';
import type { StreamEvent } from '../../../src/providers/types';
import type { ToolCallId, Turn } from '../../../src/types';
import { newTurnId, nowIso } from '../../../src/types';

beforeEach(() => {
  fakeChildren.length = 0;
  spawnCalls.length = 0;
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
  if (
    obj.type === 'tool_call_complete' &&
    typeof obj.id === 'string' &&
    typeof obj.tool_id === 'string'
  ) {
    return [
      {
        type: 'tool_call_complete',
        tool_call: {
          id: obj.id as ToolCallId,
          tool_id: obj.tool_id,
          input: obj.input,
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
        Buffer.from('{"type":"text_delta","text":"a"}\n{"type":"text_delta","text":"b"}\n')
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

  it('ignores suspicious stderr text when the CLI exits successfully', async () => {
    nextChildHandler = (child) => {
      child.stderr.emit('data', Buffer.from('WARN plugin warm failed but response continued\n'));
      child.stdout.emit('data', Buffer.from('{"type":"text_delta","text":"ok"}\n'));
      child.emit('close', 0);
    };
    const p = new CliProvider({
      binaryPath: '/fake/codex',
      provider: 'codex',
      translate: passthroughTranslate,
    });
    const events = await consume(p, [userTurn('hi')]);
    expect(events.some((e) => e.type === 'error')).toBe(false);
    expect(events.some((e) => e.type === 'text_delta')).toBe(true);
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
      child.stdout.emit('data', Buffer.from('{"type":"text_delta","text":"x"}\n'));
      setImmediate(() => {
        ctrl.abort();
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

  it('preserves accumulated tool calls in synthesized message_complete', async () => {
    nextChildHandler = (child) => {
      child.stdout.emit('data', Buffer.from('{"type":"text_delta","text":"using tool"}\n'));
      child.stdout.emit(
        'data',
        Buffer.from(
          '{"type":"tool_call_complete","id":"call-1","tool_id":"shell.run","input":{"cmd":"npm test"}}\n'
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
    const complete = events.find((e) => e.type === 'message_complete');
    const turn = (complete as { turn: Turn }).turn;
    expect(turn.tool_calls?.[0]?.tool_id).toBe('shell.run');
    expect(turn.tool_calls?.[0]?.input).toEqual({ cmd: 'npm test' });
  });

  it('does NOT duplicate message_complete when translator already emitted one', async () => {
    nextChildHandler = (child) => {
      child.stdout.emit('data', Buffer.from('{"type":"text_delta","text":"x"}\n'));
      child.stdout.emit('data', Buffer.from('{"type":"message_complete","text":"x"}\n'));
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

  it('passes prompt as positional arg (NOT stdin.write) and closes stdin immediately', async () => {
    nextChildHandler = (child) => {
      child.emit('close', 0);
    };
    const p = new CliProvider({
      binaryPath: '/fake/claude',
      provider: 'claude',
      translate: passthroughTranslate,
    });
    await consume(p, [userTurn('the prompt')]);
    expect(fakeChildren[0]?.stdin.write).not.toHaveBeenCalled();
    expect(fakeChildren[0]?.stdin.end).toHaveBeenCalled();
    const args = spawnCalls[0]?.args ?? [];
    expect(args[args.length - 1]).toBe('the prompt');
  });

  it('passes explicit cwd to spawn', async () => {
    nextChildHandler = (child) => {
      child.emit('close', 0);
    };
    const p = new CliProvider({
      binaryPath: '/fake/claude',
      provider: 'claude',
      translate: passthroughTranslate,
      cwd: '/workspace/project',
    });
    await consume(p, [userTurn('cwd check')]);
    expect(spawnCalls[0]?.opts?.cwd).toBe('/workspace/project');
  });

  it('buildArgs for claude includes correct flags', async () => {
    nextChildHandler = (child) => {
      child.emit('close', 0);
    };
    const p = new CliProvider({
      binaryPath: '/fake/claude',
      provider: 'claude',
      translate: passthroughTranslate,
    });
    await consume(p, [userTurn('my question')]);
    const args = spawnCalls[0]?.args ?? [];
    expect(args).toContain('--print');
    expect(args).toContain('--output-format');
    expect(args).toContain('stream-json');
    expect(args).toContain('--no-session-persistence');
    expect(args).not.toContain('--bare');
    expect(args).toContain('--verbose');
    expect(args).toContain('--model');
    expect(args[args.length - 1]).toBe('my question');
  });

  it('buildArgs for codex includes correct flags', async () => {
    nextChildHandler = (child) => {
      child.emit('close', 0);
    };
    const p = new CliProvider({
      binaryPath: '/fake/codex',
      provider: 'codex',
      translate: passthroughTranslate,
    });
    await consume(p, [userTurn('codex question')]);
    const args = spawnCalls[0]?.args ?? [];
    // '--sandbox <mode>' 는 'exec' 앞에 옴 — Codex top-level 옵션.
    expect(args).toContain('exec');
    expect(args).toContain('--json');
    expect(args).toContain('--skip-git-repo-check');
    expect(args).toContain('--ephemeral');
    expect(args).toContain('--model');
    expect(args[args.length - 1]).toBe('codex question');
  });

  // ────────────────────────────────────────────────────────────
  // Permission level → sandbox / tool-policy 매핑.
  // Spec: docs/permission/provider-mapping.md
  // ────────────────────────────────────────────────────────────

  describe('buildArgs — codex sandbox mapping', () => {
    function spawnAndCapture(
      level: 'read_only' | 'workspace_write' | 'full_access' | 'custom' | undefined
    ): Promise<string[]> {
      nextChildHandler = (child) => {
        child.emit('close', 0);
      };
      const p = new CliProvider({
        binaryPath: '/fake/codex',
        provider: 'codex',
        translate: passthroughTranslate,
        ...(level !== undefined && { permissionLevel: level }),
      });
      return consume(p, [userTurn('q')]).then(() => spawnCalls[0]?.args ?? []);
    }

    it('read_only → --sandbox read-only', async () => {
      const args = await spawnAndCapture('read_only');
      const sandboxIdx = args.indexOf('--sandbox');
      expect(sandboxIdx).toBeGreaterThanOrEqual(0);
      expect(args[sandboxIdx + 1]).toBe('read-only');
      // 'exec' 보다 앞.
      expect(sandboxIdx).toBeLessThan(args.indexOf('exec'));
    });

    it('workspace_write → --sandbox workspace-write', async () => {
      const args = await spawnAndCapture('workspace_write');
      const sandboxIdx = args.indexOf('--sandbox');
      expect(args[sandboxIdx + 1]).toBe('workspace-write');
    });

    it('full_access → --sandbox danger-full-access', async () => {
      const args = await spawnAndCapture('full_access');
      const sandboxIdx = args.indexOf('--sandbox');
      expect(args[sandboxIdx + 1]).toBe('danger-full-access');
    });

    it('custom → --sandbox workspace-write (safest fallback)', async () => {
      const args = await spawnAndCapture('custom');
      const sandboxIdx = args.indexOf('--sandbox');
      expect(args[sandboxIdx + 1]).toBe('workspace-write');
    });

    it('no permissionLevel defaults to workspace-write', async () => {
      const args = await spawnAndCapture(undefined);
      const sandboxIdx = args.indexOf('--sandbox');
      expect(sandboxIdx).toBeGreaterThanOrEqual(0);
      expect(args[sandboxIdx + 1]).toBe('workspace-write');
    });
  });

  describe('buildArgs — claude tool-policy mapping', () => {
    it('claude with cwd appends --add-dir <cwd>', async () => {
      nextChildHandler = (child) => {
        child.emit('close', 0);
      };
      const p = new CliProvider({
        binaryPath: '/fake/claude',
        provider: 'claude',
        translate: passthroughTranslate,
        cwd: '/workspace/project',
      });
      await consume(p, [userTurn('q')]);
      const args = spawnCalls[0]?.args ?? [];
      const idx = args.indexOf('--add-dir');
      expect(idx).toBeGreaterThanOrEqual(0);
      expect(args[idx + 1]).toBe('/workspace/project');
    });

    it('claude includes no-session-persistence instead of bare mode', async () => {
      nextChildHandler = (child) => {
        child.emit('close', 0);
      };
      const p = new CliProvider({
        binaryPath: '/fake/claude',
        provider: 'claude',
        translate: passthroughTranslate,
      });
      await consume(p, [userTurn('q')]);
      const args = spawnCalls[0]?.args ?? [];
      expect(args).toContain('--no-session-persistence');
      expect(args).not.toContain('--bare');
    });

    it('claude with read_only adds --disallowed-tools without consuming the prompt', async () => {
      nextChildHandler = (child) => {
        child.emit('close', 0);
      };
      const p = new CliProvider({
        binaryPath: '/fake/claude',
        provider: 'claude',
        translate: passthroughTranslate,
        permissionLevel: 'read_only',
      });
      await consume(p, [userTurn('q')]);
      const args = spawnCalls[0]?.args ?? [];
      const idx = args.indexOf('--disallowed-tools=Bash,Edit,Write');
      expect(idx).toBeGreaterThanOrEqual(0);
      expect(args[args.length - 1]).toBe('q');
    });

    it('claude with workspace_write does NOT add --disallowed-tools', async () => {
      nextChildHandler = (child) => {
        child.emit('close', 0);
      };
      const p = new CliProvider({
        binaryPath: '/fake/claude',
        provider: 'claude',
        translate: passthroughTranslate,
        permissionLevel: 'workspace_write',
      });
      await consume(p, [userTurn('q')]);
      const args = spawnCalls[0]?.args ?? [];
      expect(args).not.toContain('--disallowed-tools');
    });

    it('claude with full_access does NOT add --disallowed-tools', async () => {
      nextChildHandler = (child) => {
        child.emit('close', 0);
      };
      const p = new CliProvider({
        binaryPath: '/fake/claude',
        provider: 'claude',
        translate: passthroughTranslate,
        permissionLevel: 'full_access',
      });
      await consume(p, [userTurn('q')]);
      const args = spawnCalls[0]?.args ?? [];
      expect(args).not.toContain('--disallowed-tools');
    });

    it('claude prompt remains the LAST arg even with permission/cwd flags', async () => {
      nextChildHandler = (child) => {
        child.emit('close', 0);
      };
      const p = new CliProvider({
        binaryPath: '/fake/claude',
        provider: 'claude',
        translate: passthroughTranslate,
        cwd: '/ws',
        permissionLevel: 'read_only',
      });
      await consume(p, [userTurn('the question')]);
      const args = spawnCalls[0]?.args ?? [];
      expect(args[args.length - 1]).toBe('the question');
    });
  });
});
