/**
 * IPC handler tests — tool/* namespace.
 *
 * Verifies that the main-process Tool Queue is reachable through the preload
 * IPC boundary without exposing tool execution to the renderer process.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';

type Handler = (evt: unknown, ...args: unknown[]) => unknown | Promise<unknown>;

const handlers = new Map<string, Handler>();

vi.mock('electron', () => {
  return {
    app: { getVersion: () => '0.0.1-test' },
    ipcMain: {
      handle: (channel: string, handler: Handler): void => {
        handlers.set(channel, handler);
      },
      removeHandler: (channel: string): void => {
        handlers.delete(channel);
      },
    },
  };
});

import { registerIpcHandlers } from '../../src/main/ipc';
import type { Result } from '../../src/main/types';
import { ToolQueue, ToolRegistry, type Tool, type ToolResult } from '../../src/tools';
import { SessionSchema, type Session, type ToolCallId, type TurnId } from '../../src/types';

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURES_DIR = join(__dirname, '..', 'fixtures', 'sessions');
// v1.1.2 hotfix (Codex Q8): tool/execute 핸들러가 event.sender.id 를
// webContentsId 로 ToolQueue 에 전달.
const evt = { sender: { id: 1 } } as unknown;
const stubApp = { getVersion: () => '0.0.1-test' } as unknown as Parameters<
  typeof registerIpcHandlers
>[0];

function loadSession(): Session {
  const raw = JSON.parse(readFileSync(join(FIXTURES_DIR, '02-single-turn.json'), 'utf-8'));
  return SessionSchema.parse(raw);
}

function makeTool(): Tool<{ value: string }, { echoed: string }> {
  return {
    id: 'mock.echo',
    version: '1.0.0',
    source: 'builtin',
    input_schema: z.object({ value: z.string() }),
    output_schema: z.object({ echoed: z.string() }),
    required_capabilities: () => ['LOCAL_READ'],
    execute: async (input) => ({ echoed: input.value }),
    display: {
      name: 'Mock Echo',
      summary: (input) => input.value,
      summary_result: (output) => output.echoed,
    },
  };
}

async function call<T>(channel: string, ...args: unknown[]): Promise<T> {
  const handler = handlers.get(channel);
  if (handler === undefined) {
    throw new Error(`no handler registered for ${channel}`);
  }
  return (await handler(evt, ...args)) as T;
}

// v1.1.4 — cross-origin 시나리오. event.sender.id 를 명시적으로 다른 값으로
// 지정해 cancel IPC 가 owner 와 다른 webContents 에서 호출되는 상황 재현.
async function callAs<T>(senderId: number, channel: string, ...args: unknown[]): Promise<T> {
  const handler = handlers.get(channel);
  if (handler === undefined) {
    throw new Error(`no handler registered for ${channel}`);
  }
  const altEvt = { sender: { id: senderId } } as unknown;
  return (await handler(altEvt, ...args)) as T;
}

describe('IPC tool handlers', () => {
  let session: Session;
  let queue: ToolQueue;

  beforeEach(() => {
    handlers.clear();
    session = loadSession();
    const registry = new ToolRegistry();
    registry.register(makeTool());
    queue = new ToolQueue(registry, () => session);
    registerIpcHandlers(stubApp, undefined, undefined, undefined, undefined, {
      registry,
      queue,
    });
  });

  it('registers tool channels', () => {
    expect(handlers.has('tool/list')).toBe(true);
    expect(handlers.has('tool/execute')).toBe(true);
    expect(handlers.has('tool/cancel-call')).toBe(true);
    expect(handlers.has('tool/cancel-turn')).toBe(true);
    expect(handlers.has('tool/stats')).toBe(true);
  });

  it('tool/list returns registry metadata', async () => {
    const result = await call<Result<Array<{ id: string; name: string }>>>('tool/list');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value[0]).toMatchObject({ id: 'mock.echo', name: 'Mock Echo' });
  });

  it('tool/execute enqueues a valid call and returns ToolResult', async () => {
    const result = await call<Result<ToolResult>>('tool/execute', {
      id: '019d0003-0000-7000-8000-000000000001' as ToolCallId,
      tool_id: 'mock.echo',
      session_id: session.id,
      turn_id: '019d0003-0000-7000-8000-000000000002' as TurnId,
      input: { value: 'hello' },
      origin: 'user',
      created_at: new Date().toISOString(),
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.status).toBe('success');
    expect(result.value.output).toEqual({ echoed: 'hello' });
  });

  it('tool/execute rejects malformed payload as Result.error', async () => {
    const result = await call<Result<ToolResult>>('tool/execute', {
      id: 'missing-required-fields',
    });
    expect(result.ok).toBe(false);
  });

  // v1.1.4 — Codex Q9 deferred. tool/cancel-* IPC 가 event.sender.id 를
  // queue.cancelCall/cancelTurn 의 requesterWebContentsId 인자로 forward 하는지
  // IPC layer 에서 검증. queue 자체의 owner check 는 Queue.cancel-origin.test.ts
  // 가 cover — 본 케이스는 IPC plumbing.
  describe('tool/cancel-* IPC origin forwarding (Codex Q9)', () => {
    it('tool/cancel-call: event.sender.id 가 queue.cancelCall 3rd arg 로 전달', async () => {
      const spy = vi.spyOn(queue, 'cancelCall').mockReturnValue(true);
      await callAs<Result<boolean>>(
        42,
        'tool/cancel-call',
        '019d0003-0000-7000-8000-0000000000aa',
        'user_cancelled'
      );
      expect(spy).toHaveBeenCalledWith(
        '019d0003-0000-7000-8000-0000000000aa',
        'user_cancelled',
        42
      );
    });

    it('tool/cancel-turn: event.sender.id 가 queue.cancelTurn 3rd arg 로 전달', async () => {
      const spy = vi.spyOn(queue, 'cancelTurn').mockReturnValue(0);
      await callAs<Result<number>>(
        99,
        'tool/cancel-turn',
        '019d0003-0000-7000-8000-0000000000bb',
        'user_cancelled'
      );
      expect(spy).toHaveBeenCalledWith(
        '019d0003-0000-7000-8000-0000000000bb',
        'user_cancelled',
        99
      );
    });

    it('tool/cancel-call: cross-origin 거절은 queue 가 false 반환 → IPC 도 ok(false)', async () => {
      // queue.cancelCall 이 owner mismatch 시 false 반환하는 것을 그대로
      // surface — 핸들러가 false 를 throw 로 바꾸지 않음 (renderer 가 정책
      // 결과로 인지).
      vi.spyOn(queue, 'cancelCall').mockReturnValue(false);
      const result = await callAs<Result<boolean>>(
        22,
        'tool/cancel-call',
        '019d0003-0000-7000-8000-0000000000cc',
        'attack'
      );
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.value).toBe(false);
    });
  });
});
