/**
 * IPC handler tests — mcp/* namespace (Issue #5, v0.2.0).
 *
 * McpManager 자체의 단위 테스트는 McpManager.test.ts. 여기선 ipcMain.handle
 * 로 등록되는 channel 들이 Result<T> wrapping / Zod 검증 / 에러 직렬화를
 * 올바르게 수행하는지 검증.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import type {
  McpServerConfig,
  McpServerState,
  McpToolInfo,
} from '../../src/types';

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
import type { McpManager } from '../../src/main/mcp';

const evt = {} as unknown;
const stubApp = { getVersion: () => '0.0.1-test' } as unknown as Parameters<
  typeof registerIpcHandlers
>[0];

async function call<T>(channel: string, ...args: unknown[]): Promise<T> {
  const handler = handlers.get(channel);
  if (handler === undefined) {
    throw new Error(`no handler registered for ${channel}`);
  }
  return (await handler(evt, ...args)) as T;
}

// ────────────────────────────────────────────────────────────
// Stub McpManager — 메서드 호출 추적 + 미리 정의된 응답.
// ────────────────────────────────────────────────────────────

function makeStubManager(): {
  manager: McpManager;
  calls: {
    listServers: number;
    addServer: McpServerConfig[];
    removeServer: string[];
    restartServer: string[];
    getServerLogs: string[];
  };
  setListResult: (result: McpServerState[]) => void;
  setAddBehavior: (behavior: 'success' | 'reject') => void;
} {
  const calls = {
    listServers: 0,
    addServer: [] as McpServerConfig[],
    removeServer: [] as string[],
    restartServer: [] as string[],
    getServerLogs: [] as string[],
  };
  let listResult: McpServerState[] = [];
  let addBehavior: 'success' | 'reject' = 'success';

  const stub = {
    listServers: (): McpServerState[] => {
      calls.listServers += 1;
      return listResult;
    },
    addServer: async (config: McpServerConfig): Promise<void> => {
      calls.addServer.push(config);
      if (addBehavior === 'reject') {
        throw new Error('mock addServer rejection');
      }
    },
    removeServer: async (id: string): Promise<void> => {
      calls.removeServer.push(id);
    },
    restartServer: async (id: string): Promise<void> => {
      calls.restartServer.push(id);
    },
    getServerLogs: (id: string): string[] => {
      calls.getServerLogs.push(id);
      return [`log line for ${id}`];
    },
  } as unknown as McpManager;

  return {
    manager: stub,
    calls,
    setListResult: (r) => {
      listResult = r;
    },
    setAddBehavior: (b) => {
      addBehavior = b;
    },
  };
}

function sampleConfig(overrides: Partial<McpServerConfig> = {}): McpServerConfig {
  return {
    id: 'sample',
    name: 'Sample',
    command: 'node',
    args: ['s.js'],
    env: { FOO: 'bar' },
    enabled: true,
    added_at: '2026-05-02T00:00:00Z',
    ...overrides,
  };
}

function sampleState(config: McpServerConfig): McpServerState {
  const tools: McpToolInfo[] = [{ name: 'tool1' }];
  return {
    config,
    status: 'ready',
    tools,
    last_log: ['line 1'],
    pid: 1234,
  };
}

// ────────────────────────────────────────────────────────────
// Tests
// ────────────────────────────────────────────────────────────

describe('IPC mcp handlers', () => {
  let stub: ReturnType<typeof makeStubManager>;

  beforeEach(() => {
    handlers.clear();
    stub = makeStubManager();
    registerIpcHandlers(stubApp, undefined, undefined, undefined, undefined, undefined, stub.manager);
  });

  it('registers all 5 mcp channels', () => {
    expect(handlers.has('mcp/list')).toBe(true);
    expect(handlers.has('mcp/add')).toBe(true);
    expect(handlers.has('mcp/remove')).toBe(true);
    expect(handlers.has('mcp/restart')).toBe(true);
    expect(handlers.has('mcp/get-logs')).toBe(true);
  });

  describe('mcp/list', () => {
    it('returns server states', async () => {
      const cfg = sampleConfig();
      stub.setListResult([sampleState(cfg)]);
      const result = await call<Result<McpServerState[]>>('mcp/list');
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.value).toHaveLength(1);
      expect(result.value[0]?.config.id).toBe('sample');
      expect(stub.calls.listServers).toBe(1);
    });

    it('returns empty array when nothing registered', async () => {
      stub.setListResult([]);
      const result = await call<Result<McpServerState[]>>('mcp/list');
      expect(result).toEqual({ ok: true, value: [] });
    });
  });

  describe('mcp/add', () => {
    it('validates Zod schema, calls addServer, returns ok', async () => {
      const result = await call<Result<void>>('mcp/add', sampleConfig());
      expect(result.ok).toBe(true);
      expect(stub.calls.addServer).toHaveLength(1);
      expect(stub.calls.addServer[0]?.id).toBe('sample');
    });

    it('rejects invalid id (non-allowed chars)', async () => {
      const result = await call<Result<void>>('mcp/add', sampleConfig({ id: 'invalid id with spaces' }));
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.error).toMatch(/id/i);
      expect(stub.calls.addServer).toHaveLength(0);
    });

    it('rejects empty command', async () => {
      const result = await call<Result<void>>('mcp/add', sampleConfig({ command: '' }));
      expect(result.ok).toBe(false);
      expect(stub.calls.addServer).toHaveLength(0);
    });

    it('surfaces addServer rejection as Result.error', async () => {
      stub.setAddBehavior('reject');
      const result = await call<Result<void>>('mcp/add', sampleConfig());
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.error).toMatch(/mock addServer rejection/);
    });

    it('rejects extra unknown fields (strict schema)', async () => {
      const result = await call<Result<void>>('mcp/add', {
        ...sampleConfig(),
        unknown_field: 'x',
      });
      expect(result.ok).toBe(false);
    });
  });

  describe('mcp/remove', () => {
    it('calls removeServer with id', async () => {
      const result = await call<Result<void>>('mcp/remove', 'gh');
      expect(result.ok).toBe(true);
      expect(stub.calls.removeServer).toEqual(['gh']);
    });

    it('rejects non-string id', async () => {
      const result = await call<Result<void>>('mcp/remove', 123);
      expect(result.ok).toBe(false);
      expect(stub.calls.removeServer).toHaveLength(0);
    });

    it('rejects empty string id', async () => {
      const result = await call<Result<void>>('mcp/remove', '');
      expect(result.ok).toBe(false);
    });
  });

  describe('mcp/restart', () => {
    it('calls restartServer with id', async () => {
      const result = await call<Result<void>>('mcp/restart', 'beta');
      expect(result.ok).toBe(true);
      expect(stub.calls.restartServer).toEqual(['beta']);
    });

    it('rejects non-string id', async () => {
      const result = await call<Result<void>>('mcp/restart', null);
      expect(result.ok).toBe(false);
    });
  });

  describe('mcp/get-logs', () => {
    it('returns server logs', async () => {
      const result = await call<Result<string[]>>('mcp/get-logs', 'srv');
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.value).toEqual(['log line for srv']);
      expect(stub.calls.getServerLogs).toEqual(['srv']);
    });

    it('rejects non-string id', async () => {
      const result = await call<Result<string[]>>('mcp/get-logs', { invalid: true });
      expect(result.ok).toBe(false);
    });
  });
});
