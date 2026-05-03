/**
 * McpManager — settings 영속 + ToolRegistry 통합 + 멀티 서버 라이프사이클.
 *
 * fake McpClient 를 주입해 spawn 의존을 우회. 실제 stdio 통신은
 * McpClient.test.ts 에서 검증.
 *
 * Spec: docs/tools/mcp-bridge.md
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { EventEmitter } from 'node:events';
import { McpManager } from '../../../src/main/mcp/McpManager';
import { ToolRegistry } from '../../../src/tools';
import type {
  McpServerConfig,
  McpServerStatus,
  McpToolInfo,
} from '../../../src/types';

// ────────────────────────────────────────────────────────────
// Fake McpClient — McpManager 가 EventEmitter 형식 + 같은 method 시그니처만
// 보면 실제 spawn 과 무관하게 통합 동작이 검증된다.
// ────────────────────────────────────────────────────────────

class FakeMcpClient extends EventEmitter {
  public readonly config: McpServerConfig;
  private tools: McpToolInfo[];
  private status: McpServerStatus = 'disconnected';
  private startResult: 'ready' | 'error';
  private logs: string[] = [];

  constructor(
    config: McpServerConfig,
    options: { tools?: McpToolInfo[]; startResult?: 'ready' | 'error' } = {}
  ) {
    super();
    this.config = config;
    this.tools = options.tools ?? [{ name: 'default-tool' }];
    this.startResult = options.startResult ?? 'ready';
  }

  async start(): Promise<void> {
    this.status = 'connecting';
    this.emit('status', this.status);
    if (this.startResult === 'error') {
      this.status = 'error';
      this.emit('status', this.status);
      throw new Error('fake start failure');
    }
    this.status = 'ready';
    this.emit('tools-updated', [...this.tools]);
    this.emit('status', this.status);
  }

  async stop(): Promise<void> {
    this.status = 'disconnected';
    this.emit('status', this.status);
  }

  async callTool(_name: string, args: unknown): Promise<unknown> {
    return { echoed: args };
  }

  getStatus(): McpServerStatus {
    return this.status;
  }

  getTools(): McpToolInfo[] {
    return [...this.tools];
  }

  getLogTail(): string[] {
    return [...this.logs];
  }

  getLastError(): string | undefined {
    return undefined;
  }

  getPid(): number | undefined {
    return this.status === 'ready' ? 99_999 : undefined;
  }

  /** Test only — 외부에서 tools 갱신 후 emit. */
  public __updateTools(tools: McpToolInfo[]): void {
    this.tools = tools;
    this.emit('tools-updated', [...tools]);
  }
}

// ────────────────────────────────────────────────────────────
// In-memory settings adapter
// ────────────────────────────────────────────────────────────

function makeSettings(initial: McpServerConfig[] = []): {
  read: () => McpServerConfig[];
  write: (configs: McpServerConfig[]) => void;
  current: () => McpServerConfig[];
} {
  let store = [...initial];
  return {
    read: () => [...store],
    write: (configs: McpServerConfig[]) => {
      store = [...configs];
    },
    current: () => [...store],
  };
}

function makeConfig(id: string, overrides: Partial<McpServerConfig> = {}): McpServerConfig {
  return {
    id,
    name: `Server ${id}`,
    command: 'fake',
    args: [],
    env: {},
    enabled: true,
    added_at: '2026-05-02T00:00:00Z',
    ...overrides,
  };
}

// ────────────────────────────────────────────────────────────
// Tests
// ────────────────────────────────────────────────────────────

describe('McpManager', () => {
  let registry: ToolRegistry;

  beforeEach(() => {
    registry = new ToolRegistry();
  });

  it('addServer persists to settings + registers Tool wrappers', async () => {
    const settings = makeSettings();
    const manager = new McpManager(registry, {
      settings,
      createClient: (cfg) =>
        new FakeMcpClient(cfg, {
          tools: [{ name: 'list_repos' }, { name: 'get_repo' }],
        }) as unknown as import('../../../src/main/mcp/McpClient').McpClient,
    });
    await manager.addServer(makeConfig('github'));

    // Settings 영속
    expect(settings.current()).toHaveLength(1);
    expect(settings.current()[0]?.id).toBe('github');

    // ToolRegistry 등록
    const tools = registry.list();
    expect(tools).toHaveLength(2);
    expect(tools.map((t) => t.id).sort()).toEqual([
      'mcp.github.get_repo',
      'mcp.github.list_repos',
    ]);
    expect(tools[0]?.source).toBe('mcp');
    expect(tools[0]?.source_id).toBe('github');
    expect(tools[0]?.required_capabilities({})).toEqual(['NETWORK_MCP']);
  });

  it('removeServer deletes from settings + unregisters tools', async () => {
    const settings = makeSettings();
    const manager = new McpManager(registry, {
      settings,
      createClient: (cfg) =>
        new FakeMcpClient(cfg, {
          tools: [{ name: 't1' }],
        }) as unknown as import('../../../src/main/mcp/McpClient').McpClient,
    });
    await manager.addServer(makeConfig('alpha'));
    expect(registry.size).toBe(1);

    await manager.removeServer('alpha');
    expect(settings.current()).toHaveLength(0);
    expect(registry.size).toBe(0);
  });

  it('restartServer keeps settings, re-spawns + re-registers tools', async () => {
    const settings = makeSettings();
    let createCount = 0;
    const manager = new McpManager(registry, {
      settings,
      createClient: (cfg) => {
        createCount += 1;
        return new FakeMcpClient(cfg, {
          tools: [{ name: 'r1' }],
        }) as unknown as import('../../../src/main/mcp/McpClient').McpClient;
      },
    });
    await manager.addServer(makeConfig('beta'));
    expect(createCount).toBe(1);
    await manager.restartServer('beta');
    expect(createCount).toBe(2);
    expect(settings.current()).toHaveLength(1);
    expect(registry.has('mcp.beta.r1')).toBe(true);
  });

  it('restartServer throws if server id is unknown', async () => {
    const settings = makeSettings();
    const manager = new McpManager(registry, { settings });
    await expect(manager.restartServer('nope')).rejects.toThrow(/not found/);
  });

  it('addServer overwrites existing server with same id (INV-2)', async () => {
    const settings = makeSettings();
    const manager = new McpManager(registry, {
      settings,
      createClient: (cfg) =>
        new FakeMcpClient(cfg, {
          tools: [{ name: cfg.id === 'x' ? 'oldtool' : 'newtool' }],
        }) as unknown as import('../../../src/main/mcp/McpClient').McpClient,
    });
    await manager.addServer(makeConfig('x'));
    expect(registry.has('mcp.x.oldtool')).toBe(true);

    // 같은 id 로 다시 추가 → 새 client (newtool)
    await manager.addServer(makeConfig('x', { name: 'X v2' }));
    expect(registry.size).toBe(1);
    expect(settings.current()).toHaveLength(1);
    expect(settings.current()[0]?.name).toBe('X v2');
  });

  it('loadFromSettings spawns enabled servers + skips disabled', async () => {
    const initial = [
      makeConfig('on', { enabled: true }),
      makeConfig('off', { enabled: false }),
    ];
    const settings = makeSettings(initial);
    const startedIds: string[] = [];
    const manager = new McpManager(registry, {
      settings,
      createClient: (cfg) => {
        startedIds.push(cfg.id);
        return new FakeMcpClient(cfg, {
          tools: [{ name: 'auto' }],
        }) as unknown as import('../../../src/main/mcp/McpClient').McpClient;
      },
    });
    await manager.loadFromSettings();
    expect(startedIds).toEqual(['on']);
    expect(registry.has('mcp.on.auto')).toBe(true);
    expect(registry.has('mcp.off.auto')).toBe(false);
  });

  it('listServers returns config + runtime status for each entry', async () => {
    const settings = makeSettings([
      makeConfig('alpha'),
      makeConfig('beta', { enabled: false }),
    ]);
    const manager = new McpManager(registry, {
      settings,
      createClient: (cfg) =>
        new FakeMcpClient(cfg, {
          tools: [{ name: 't' }],
        }) as unknown as import('../../../src/main/mcp/McpClient').McpClient,
    });
    await manager.loadFromSettings();
    const list = manager.listServers();
    expect(list).toHaveLength(2);
    const alpha = list.find((s) => s.config.id === 'alpha');
    const beta = list.find((s) => s.config.id === 'beta');
    expect(alpha?.status).toBe('ready');
    expect(alpha?.tools).toHaveLength(1);
    expect(alpha?.pid).toBe(99_999);
    expect(beta?.status).toBe('disabled');
    expect(beta?.tools).toHaveLength(0);
  });

  it('failed startServer cleans up registry + clients map', async () => {
    const settings = makeSettings();
    const manager = new McpManager(registry, {
      settings,
      createClient: (cfg) =>
        new FakeMcpClient(cfg, {
          startResult: 'error',
          tools: [{ name: 'x' }],
        }) as unknown as import('../../../src/main/mcp/McpClient').McpClient,
    });
    settings.write([makeConfig('failing')]);
    await expect(manager.startServer(makeConfig('failing'))).rejects.toThrow(/fake start failure/);
    // listServers 는 settings 에 남은 entry 를 보여주지만 client 는 없어야 함
    const list = manager.listServers();
    expect(list).toHaveLength(1);
    expect(list[0]?.status).toBe('disconnected');
    // 어떤 tool 도 등록 안 됨
    expect(registry.size).toBe(0);
  });

  it('shutdown stops all clients + clears registry', async () => {
    const settings = makeSettings();
    const manager = new McpManager(registry, {
      settings,
      createClient: (cfg) =>
        new FakeMcpClient(cfg, {
          tools: [{ name: 't' }],
        }) as unknown as import('../../../src/main/mcp/McpClient').McpClient,
    });
    await manager.addServer(makeConfig('s1'));
    await manager.addServer(makeConfig('s2'));
    expect(registry.size).toBe(2);
    await manager.shutdown();
    expect(registry.size).toBe(0);
  });

  it('Tool wrapper required_capabilities always returns NETWORK_MCP', async () => {
    const settings = makeSettings();
    const manager = new McpManager(registry, {
      settings,
      createClient: (cfg) =>
        new FakeMcpClient(cfg, {
          tools: [{ name: 'cap_check' }],
        }) as unknown as import('../../../src/main/mcp/McpClient').McpClient,
    });
    await manager.addServer(makeConfig('cap'));
    const tool = registry.get('mcp.cap.cap_check');
    expect(tool).toBeDefined();
    expect(tool?.required_capabilities({ anything: true })).toEqual(['NETWORK_MCP']);
  });

  it('Tool wrapper permission_target.value is server id', async () => {
    const settings = makeSettings();
    const manager = new McpManager(registry, {
      settings,
      createClient: (cfg) =>
        new FakeMcpClient(cfg, {
          tools: [{ name: 'pt' }],
        }) as unknown as import('../../../src/main/mcp/McpClient').McpClient,
    });
    await manager.addServer(makeConfig('targets'));
    const tool = registry.get('mcp.targets.pt');
    expect(tool).toBeDefined();
    const target = tool?.permission_target?.({}, 'NETWORK_MCP', { session: {} as never });
    expect(target).toEqual({ kind: 'global', value: 'targets' });
  });

  it('updates registry when tools-updated fires post-start', async () => {
    const settings = makeSettings();
    const captured: { ref: FakeMcpClient | null } = { ref: null };
    const manager = new McpManager(registry, {
      settings,
      createClient: (cfg) => {
        const fake = new FakeMcpClient(cfg, {
          tools: [{ name: 'first' }],
        });
        captured.ref = fake;
        return fake as unknown as import('../../../src/main/mcp/McpClient').McpClient;
      },
    });
    await manager.addServer(makeConfig('updater'));
    expect(registry.has('mcp.updater.first')).toBe(true);
    expect(registry.has('mcp.updater.second')).toBe(false);

    // 새 tools 도착 시뮬레이션
    captured.ref?.__updateTools([{ name: 'second' }, { name: 'third' }]);
    expect(registry.has('mcp.updater.first')).toBe(false);
    expect(registry.has('mcp.updater.second')).toBe(true);
    expect(registry.has('mcp.updater.third')).toBe(true);
  });
});
