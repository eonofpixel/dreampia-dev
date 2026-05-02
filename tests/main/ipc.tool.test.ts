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
const evt = {} as unknown;
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

describe('IPC tool handlers', () => {
  let session: Session;

  beforeEach(() => {
    handlers.clear();
    session = loadSession();
    const registry = new ToolRegistry();
    registry.register(makeTool());
    const queue = new ToolQueue(registry, () => session);
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
});
