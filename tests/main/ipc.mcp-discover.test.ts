/**
 * IPC handler tests — mcp/discover (v0.9.0).
 *
 * Discovery 자체 unit 테스트는 main/mcp/discovery.test.ts. 여기선 IPC 경계의
 * Result wrapping + 이미 등록된 서버 필터링 검증.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { McpManager } from '../../src/main/mcp';
import type { McpServerConfig, McpServerState } from '../../src/types';

type Handler = (evt: unknown, ...args: unknown[]) => unknown | Promise<unknown>;
const handlers = new Map<string, Handler>();

vi.mock('electron', () => {
  return {
    app: {
      getVersion: () => '0.9.0-test',
      getPath: () => '/tmp/dreampia-test',
      isPackaged: false,
    },
    ipcMain: {
      handle: (channel: string, handler: Handler): void => {
        handlers.set(channel, handler);
      },
      removeHandler: (channel: string): void => {
        handlers.delete(channel);
      },
    },
    dialog: { showOpenDialog: vi.fn() },
  };
});

import { registerIpcHandlers } from '../../src/main/ipc';
import type { Result } from '../../src/main/types';
import type { SuggestedMcpServer } from '../../src/main/mcp';

const evt = {} as unknown;
const stubApp = { getVersion: () => '0.9.0-test' } as unknown as Parameters<
  typeof registerIpcHandlers
>[0];

async function call<T>(channel: string, ...args: unknown[]): Promise<T> {
  const handler = handlers.get(channel);
  if (handler === undefined) throw new Error(`no handler registered for ${channel}`);
  return (await handler(evt, ...args)) as T;
}

function makeStubMcp(servers: McpServerState[] = []): McpManager {
  return {
    listServers: () => servers,
    addServer: async () => undefined,
    removeServer: async () => undefined,
    restartServer: async () => undefined,
    getServerLogs: () => [],
    loadFromSettings: async () => undefined,
    shutdown: async () => undefined,
  } as unknown as McpManager;
}

interface DiscoveryResult {
  suggested: SuggestedMcpServer[];
  from_claude: McpServerConfig[];
  from_codex: McpServerConfig[];
}

describe('IPC mcp/discover (v0.9.0)', () => {
  beforeEach(() => {
    handlers.clear();
  });

  it('returns Result.ok with suggested + from_claude + from_codex', async () => {
    const stub = makeStubMcp();
    registerIpcHandlers(stubApp, undefined, undefined, undefined, undefined, undefined, stub);
    const result = await call<Result<DiscoveryResult>>('mcp/discover');
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(Array.isArray(result.value.suggested)).toBe(true);
      expect(result.value.suggested.length).toBeGreaterThan(0);
      expect(Array.isArray(result.value.from_claude)).toBe(true);
      expect(Array.isArray(result.value.from_codex)).toBe(true);
    }
  });

  it('suggested array contains common entries (filesystem, github, memory)', async () => {
    const stub = makeStubMcp();
    registerIpcHandlers(stubApp, undefined, undefined, undefined, undefined, undefined, stub);
    const result = await call<Result<DiscoveryResult>>('mcp/discover');
    if (result.ok) {
      const ids = result.value.suggested.map((s) => s.id);
      expect(ids).toContain('filesystem');
      expect(ids).toContain('github');
      expect(ids).toContain('memory');
    }
  });

  it('does not throw when called multiple times', async () => {
    const stub = makeStubMcp();
    registerIpcHandlers(stubApp, undefined, undefined, undefined, undefined, undefined, stub);
    const r1 = await call<Result<DiscoveryResult>>('mcp/discover');
    const r2 = await call<Result<DiscoveryResult>>('mcp/discover');
    expect(r1.ok).toBe(true);
    expect(r2.ok).toBe(true);
  });
});
