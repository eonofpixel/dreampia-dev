/**
 * McpClient — stdio JSON-RPC handshake / tool calls.
 *
 * 실제 spawn 의존을 제거하기 위해 EventEmitter 기반 fake child process 를
 * 주입한다. 각 테스트마다 fresh mock 을 만들어 race / 부작용 제거.
 *
 * Spec: docs/tools/mcp-bridge.md
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { EventEmitter } from 'node:events';
import type { ChildProcess } from 'node:child_process';
import { McpClient, type SpawnFn } from '../../../src/main/mcp/McpClient';
import type { McpServerConfig, JsonRpcRequest, JsonRpcResponse } from '../../../src/types';

// ────────────────────────────────────────────────────────────
// Test helper: EventEmitter 를 ChildProcess 처럼 흉내내는 fake.
// ────────────────────────────────────────────────────────────

class FakeChild extends EventEmitter {
  public stdin: { write: (data: string) => void };
  public stdout: EventEmitter;
  public stderr: EventEmitter;
  public pid = 42_000;
  public killed = false;
  /** McpClient 가 stdin 으로 보낸 line 들 (newline-delimited 분리 후). */
  public received: string[] = [];
  /** kill 호출 추적. */
  public killSignals: string[] = [];

  constructor(public onWriteLine: (line: string) => void) {
    super();
    this.stdout = new EventEmitter();
    this.stderr = new EventEmitter();
    this.stdin = {
      write: (data: string): void => {
        // McpClient 는 항상 newline-delimited 로 write
        for (const line of data.split('\n')) {
          if (line.length === 0) continue;
          this.received.push(line);
          this.onWriteLine(line);
        }
      },
    };
  }

  kill(signal?: string): boolean {
    this.killed = true;
    this.killSignals.push(signal ?? 'SIGTERM');
    // exit 이벤트 (정상 종료 0)
    setImmediate(() => {
      this.emit('exit', 0, null);
    });
    return true;
  }
}

function makeConfig(overrides: Partial<McpServerConfig> = {}): McpServerConfig {
  return {
    id: 'test-server',
    name: 'Test',
    command: 'node',
    args: ['server.js'],
    env: {},
    enabled: true,
    added_at: '2026-05-02T00:00:00Z',
    ...overrides,
  };
}

/**
 * McpClient + auto-handshake 가 가능한 fake 를 만든다.
 *
 * onRequest 가 정의되어 있으면 모든 요청에 대해 그 함수가 응답을 결정.
 * 미정의 시 default: initialize → {}, tools/list → {tools: []}
 */
function setup(options: {
  config?: Partial<McpServerConfig>;
  onRequest?: (req: JsonRpcRequest) => JsonRpcResponse | undefined;
} = {}): { client: McpClient; child: FakeChild; spawnFn: SpawnFn } {
  let child: FakeChild;
  const onRequest =
    options.onRequest ??
    ((req): JsonRpcResponse | undefined => {
      if (req.method === 'initialize') {
        return { jsonrpc: '2.0', id: req.id, result: {} };
      }
      if (req.method === 'tools/list') {
        return { jsonrpc: '2.0', id: req.id, result: { tools: [] } };
      }
      // 그 외는 default: 빈 result
      return { jsonrpc: '2.0', id: req.id, result: { content: 'default' } };
    });

  const spawnFn: SpawnFn = ((_command, _args, _opts) => {
    child = new FakeChild((line: string) => {
      try {
        const parsed = JSON.parse(line) as JsonRpcRequest;
        if (parsed.id === undefined) return; // notification — drop
        const resp = onRequest(parsed);
        if (resp !== undefined) {
          // 비동기로 응답 (실제 spawn 처럼)
          setImmediate(() => {
            child.stdout.emit('data', `${JSON.stringify(resp)}\n`);
          });
        }
      } catch {
        // ignore parse fail
      }
    });
    return child as unknown as ChildProcess;
  }) as SpawnFn;

  const client = new McpClient(makeConfig(options.config), {
    spawn: spawnFn,
    request_timeout_ms: 1_000,
    shutdown_grace_ms: 50,
  });

  // child 는 spawn 호출 후에 만들어지므로 lazy access. 호출자가 start() 하기 전엔 undefined.
  return {
    client,
    get child() {
      return child;
    },
    spawnFn,
  } as unknown as { client: McpClient; child: FakeChild; spawnFn: SpawnFn };
}

// ────────────────────────────────────────────────────────────
// Tests
// ────────────────────────────────────────────────────────────

describe('McpClient', () => {
  beforeEach(() => {
    vi.useRealTimers();
  });

  it('starts, performs initialize handshake, then tools/list', async () => {
    const { client } = setup({
      onRequest: (req) => {
        if (req.method === 'initialize') {
          return { jsonrpc: '2.0', id: req.id, result: { capabilities: {} } };
        }
        if (req.method === 'tools/list') {
          return {
            jsonrpc: '2.0',
            id: req.id,
            result: {
              tools: [
                { name: 'echo', description: 'echo back input' },
              ],
            },
          };
        }
        return undefined;
      },
    });
    await client.start();
    expect(client.getStatus()).toBe('ready');
    expect(client.getTools()).toHaveLength(1);
    expect(client.getTools()[0]?.name).toBe('echo');
    await client.stop();
  });

  it('callTool sends tools/call and returns content', async () => {
    const { client } = setup({
      onRequest: (req) => {
        if (req.method === 'initialize') {
          return { jsonrpc: '2.0', id: req.id, result: {} };
        }
        if (req.method === 'tools/list') {
          return { jsonrpc: '2.0', id: req.id, result: { tools: [{ name: 'echo' }] } };
        }
        if (req.method === 'tools/call') {
          const params = req.params as { name: string; arguments: unknown };
          return {
            jsonrpc: '2.0',
            id: req.id,
            result: { content: { echo: params.arguments } },
          };
        }
        return undefined;
      },
    });
    await client.start();
    const result = await client.callTool('echo', { hello: 'world' });
    expect(result).toEqual({ echo: { hello: 'world' } });
    await client.stop();
  });

  it('callTool throws when isError=true in response content', async () => {
    const { client } = setup({
      onRequest: (req) => {
        if (req.method === 'initialize') {
          return { jsonrpc: '2.0', id: req.id, result: {} };
        }
        if (req.method === 'tools/list') {
          return { jsonrpc: '2.0', id: req.id, result: { tools: [{ name: 'broken' }] } };
        }
        if (req.method === 'tools/call') {
          return {
            jsonrpc: '2.0',
            id: req.id,
            result: { content: 'something went wrong', isError: true },
          };
        }
        return undefined;
      },
    });
    await client.start();
    await expect(client.callTool('broken', {})).rejects.toThrow(/MCP tool 'broken' returned error/);
    await client.stop();
  });

  it('callTool throws when status is not ready', async () => {
    const { client } = setup();
    await expect(client.callTool('foo', {})).rejects.toThrow(/not ready/);
  });

  it('throws when initialize times out', async () => {
    const { client } = setup({
      onRequest: () => undefined, // 응답 안 함 → timeout
    });
    await expect(client.start()).rejects.toThrow(/timeout/);
    expect(client.getStatus()).toBe('error');
  });

  it('throws when initialize returns JSON-RPC error', async () => {
    const { client } = setup({
      onRequest: (req) => {
        if (req.method === 'initialize') {
          return {
            jsonrpc: '2.0',
            id: req.id,
            error: { code: -32600, message: 'Invalid Request' },
          };
        }
        return undefined;
      },
    });
    await expect(client.start()).rejects.toThrow(/Invalid Request/);
  });

  it('skips non-JSON stdout lines (Codex parser bug protection)', async () => {
    const ref: { child: FakeChild | null } = { child: null };
    const spawnFn: SpawnFn = ((_command, _args, _opts) => {
      const fake = new FakeChild((line: string) => {
        const parsed = JSON.parse(line) as JsonRpcRequest;
        if (parsed.id === undefined) return;
        if (parsed.method === 'initialize') {
          // 비-JSON 노이즈 line + 정상 응답
          setImmediate(() => {
            ref.child?.stdout.emit('data', 'INFO: server ready\n');
            ref.child?.stdout.emit('data', `${JSON.stringify({ jsonrpc: '2.0', id: parsed.id, result: {} })}\n`);
          });
        } else if (parsed.method === 'tools/list') {
          setImmediate(() => {
            ref.child?.stdout.emit('data', `${JSON.stringify({ jsonrpc: '2.0', id: parsed.id, result: { tools: [] } })}\n`);
          });
        }
      });
      ref.child = fake;
      return fake as unknown as ChildProcess;
    }) as SpawnFn;

    const client = new McpClient(makeConfig(), {
      spawn: spawnFn,
      request_timeout_ms: 1_000,
      shutdown_grace_ms: 50,
    });
    await client.start();
    expect(client.getStatus()).toBe('ready');
    // 비-JSON line 이 logTail 에 기록되어야 함
    const log = client.getLogTail();
    expect(log.some((l) => l.includes('stdout-non-json'))).toBe(true);
    expect(log.some((l) => l.includes('INFO: server ready'))).toBe(true);
    await client.stop();
  });

  it('captures stderr lines into logTail', async () => {
    const ref: { child: FakeChild | null } = { child: null };
    const spawnFn: SpawnFn = ((_command, _args, _opts) => {
      const fake = new FakeChild((line: string) => {
        const parsed = JSON.parse(line) as JsonRpcRequest;
        if (parsed.id === undefined) return;
        if (parsed.method === 'initialize') {
          setImmediate(() => {
            // stderr 도 emit (handshake 와 동시에 도착할 수 있음)
            ref.child?.stderr.emit('data', 'error noise\nanother line\n');
            ref.child?.stdout.emit('data', `${JSON.stringify({ jsonrpc: '2.0', id: parsed.id, result: {} })}\n`);
          });
        } else if (parsed.method === 'tools/list') {
          setImmediate(() => {
            ref.child?.stdout.emit('data', `${JSON.stringify({ jsonrpc: '2.0', id: parsed.id, result: { tools: [] } })}\n`);
          });
        }
      });
      ref.child = fake;
      return fake as unknown as ChildProcess;
    }) as SpawnFn;

    const client = new McpClient(makeConfig(), {
      spawn: spawnFn,
      request_timeout_ms: 1_000,
      shutdown_grace_ms: 50,
    });
    await client.start();
    const log = client.getLogTail();
    expect(log.some((l) => l.includes('error noise'))).toBe(true);
    expect(log.some((l) => l.includes('another line'))).toBe(true);
    await client.stop();
  });

  it('emits status events on lifecycle changes', async () => {
    const { client } = setup();
    const statusEvents: string[] = [];
    client.on('status', (s: string) => {
      statusEvents.push(s);
    });
    await client.start();
    expect(statusEvents).toContain('connecting');
    expect(statusEvents).toContain('ready');
    await client.stop();
    expect(statusEvents).toContain('disconnected');
  });

  it('emits tools-updated after tools/list', async () => {
    const { client } = setup({
      onRequest: (req) => {
        if (req.method === 'initialize') {
          return { jsonrpc: '2.0', id: req.id, result: {} };
        }
        if (req.method === 'tools/list') {
          return {
            jsonrpc: '2.0',
            id: req.id,
            result: { tools: [{ name: 'a' }, { name: 'b' }] },
          };
        }
        return undefined;
      },
    });
    let updated: { name: string }[] = [];
    client.on('tools-updated', (tools: { name: string }[]) => {
      updated = tools;
    });
    await client.start();
    expect(updated).toHaveLength(2);
    expect(updated.map((t) => t.name)).toEqual(['a', 'b']);
    await client.stop();
  });

  it('rejects pending requests on child exit (no hang)', async () => {
    const ref: { child: FakeChild | null } = { child: null };
    const spawnFn: SpawnFn = ((_command, _args, _opts) => {
      const fake = new FakeChild((line: string) => {
        const parsed = JSON.parse(line) as JsonRpcRequest;
        if (parsed.id === undefined) return;
        if (parsed.method === 'initialize') {
          setImmediate(() => {
            ref.child?.stdout.emit('data', `${JSON.stringify({ jsonrpc: '2.0', id: parsed.id, result: {} })}\n`);
          });
        } else if (parsed.method === 'tools/list') {
          setImmediate(() => {
            ref.child?.stdout.emit('data', `${JSON.stringify({ jsonrpc: '2.0', id: parsed.id, result: { tools: [{ name: 'slow' }] } })}\n`);
          });
        }
        // tools/call 은 응답 안 함 (intentional hang)
      });
      ref.child = fake;
      return fake as unknown as ChildProcess;
    }) as SpawnFn;

    const client = new McpClient(makeConfig(), {
      spawn: spawnFn,
      request_timeout_ms: 5_000,
      shutdown_grace_ms: 50,
    });
    // 'error' 리스너 등록 — McpClient 가 비정상 exit 시 emit 하므로 EventEmitter
    // 의 unhandled 'error' throw 를 방지.
    client.on('error', () => {
      // intentionally empty
    });
    await client.start();
    const callPromise = client.callTool('slow', {});
    // 자식 비정상 종료 시뮬레이션
    setImmediate(() => {
      ref.child?.emit('exit', 1, null);
    });
    await expect(callPromise).rejects.toThrow(/exited/);
  });

  it('add/remove logs respects logTail size', async () => {
    const ref: { child: FakeChild | null } = { child: null };
    const spawnFn: SpawnFn = ((_command, _args, _opts) => {
      const fake = new FakeChild((line: string) => {
        const parsed = JSON.parse(line) as JsonRpcRequest;
        if (parsed.id === undefined) return;
        if (parsed.method === 'initialize') {
          setImmediate(() => {
            ref.child?.stdout.emit('data', `${JSON.stringify({ jsonrpc: '2.0', id: parsed.id, result: {} })}\n`);
          });
        } else if (parsed.method === 'tools/list') {
          setImmediate(() => {
            ref.child?.stdout.emit('data', `${JSON.stringify({ jsonrpc: '2.0', id: parsed.id, result: { tools: [] } })}\n`);
          });
        }
      });
      ref.child = fake;
      return fake as unknown as ChildProcess;
    }) as SpawnFn;

    const client = new McpClient(makeConfig(), {
      spawn: spawnFn,
      request_timeout_ms: 1_000,
      shutdown_grace_ms: 50,
      log_tail_size: 5,
    });
    await client.start();
    // stderr 100줄 push — 5줄로 잘려야 함
    for (let i = 0; i < 100; i++) {
      ref.child?.stderr.emit('data', `noise ${i}\n`);
    }
    expect(client.getLogTail().length).toBeLessThanOrEqual(5);
    await client.stop();
  });
});
