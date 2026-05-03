/**
 * McpManager — multi-MCP-server lifecycle + ToolRegistry 통합.
 *
 * 책임:
 *  1. settings.json 의 mcp_servers 배열을 read/write
 *  2. McpClient 인스턴스 spawn / stop / restart
 *  3. tools-updated 이벤트마다 ToolRegistry 에 wrapper Tool 등록
 *  4. listServers() 로 UI 가 전체 상태 조회
 *
 * 통합 결정:
 *  - Tool.id 형식: 'mcp.{server_id}.{tool_name}' (mcp-bridge.md 53)
 *  - input_schema 는 P0 에서 z.unknown() — Zod 변환은 P2 (JSON Schema → Zod 변환은
 *    ajv/zod 호환 라이브러리 필요). 모든 input 을 Queue 가 그대로 callTool 에 전달.
 *  - required_capabilities 는 항상 ['NETWORK_MCP'] 반환 — Resolver 가 사용자
 *    confirmation 또는 grant 매치를 결정한다.
 *  - permission_target.kind='global', value=server_id — 사용자가 'github-mcp'
 *    같은 단위로 grant 부여 가능.
 *  - 같은 server.id 로 재시작 시 unregister → register (INV-2 mcp-bridge.md 363).
 */

import { z } from 'zod';
import type { McpServerConfig, McpServerState, McpToolInfo } from '@/types';
import type { Tool, ToolRegistry, PermissionTarget } from '@/tools';
import type { Capability } from '@/permission';
import { McpClient, type McpClientOptions } from './McpClient';

// ────────────────────────────────────────────────────────────
// 의존성 주입 — settings 읽기/쓰기 함수를 외부에서 받는다.
// 이렇게 하면 테스트가 in-memory 객체로 대체 가능 + main/settings.ts 와의
// 양방향 import cycle 도 피한다.
// ────────────────────────────────────────────────────────────

export interface McpManagerSettingsAdapter {
  /** 현재 저장된 MCP 서버 목록 반환. 없으면 빈 배열. */
  read: () => McpServerConfig[];
  /** 새 목록을 디스크에 저장. */
  write: (configs: McpServerConfig[]) => void;
}

export interface McpManagerOptions {
  settings: McpManagerSettingsAdapter;
  /** Test override — McpClient 생성 시 옵션 (spawnFn 주입 등). */
  clientOptions?: McpClientOptions;
  /** Test override — McpClient factory. */
  createClient?: (config: McpServerConfig, options?: McpClientOptions) => McpClient;
}

// ────────────────────────────────────────────────────────────
// McpManager
// ────────────────────────────────────────────────────────────

export class McpManager {
  private readonly clients = new Map<string, McpClient>();
  private readonly settings: McpManagerSettingsAdapter;
  private readonly clientOptions: McpClientOptions | undefined;
  private readonly createClient: (
    config: McpServerConfig,
    options?: McpClientOptions
  ) => McpClient;

  constructor(
    private readonly registry: ToolRegistry,
    options: McpManagerOptions
  ) {
    this.settings = options.settings;
    this.clientOptions = options.clientOptions;
    this.createClient =
      options.createClient ?? ((config, opts) => new McpClient(config, opts));
  }

  // ──────────────────────────────────────────────────────────
  // 부팅 / 종료
  // ──────────────────────────────────────────────────────────

  /**
   * settings 의 mcp_servers 를 읽어 enabled=true 인 것만 spawn.
   * 부팅 실패는 console.error 로 남기고 다음 서버로 넘어간다 (graceful).
   */
  async loadFromSettings(): Promise<void> {
    const configs = this.settings.read();
    for (const config of configs) {
      if (!config.enabled) continue;
      try {
        await this.startServer(config);
      } catch (err) {
        // 1개 서버 실패가 다른 서버 부팅을 막지 않도록 swallow.
        const msg = err instanceof Error ? err.message : String(err);
        console.error(`[McpManager] Failed to start ${config.id}: ${msg}`);
      }
    }
  }

  async shutdown(): Promise<void> {
    const stops = Array.from(this.clients.values()).map((c) =>
      c.stop().catch((err: unknown) => {
        console.error('[McpManager] shutdown error:', err);
      })
    );
    await Promise.all(stops);
    for (const id of Array.from(this.clients.keys())) {
      this.unregisterServerTools(id);
    }
    this.clients.clear();
  }

  // ──────────────────────────────────────────────────────────
  // CRUD
  // ──────────────────────────────────────────────────────────

  /**
   * 서버 추가 + (enabled 면) 즉시 spawn.
   * 같은 id 가 이미 있으면 덮어쓴다 (INV-2: stop → restart).
   */
  async addServer(config: McpServerConfig): Promise<void> {
    const existing = this.settings.read();
    const remaining = existing.filter((c) => c.id !== config.id);
    this.settings.write([...remaining, config]);

    if (this.clients.has(config.id)) {
      await this.stopServer(config.id);
    }
    if (config.enabled) {
      await this.startServer(config);
    }
  }

  async removeServer(id: string): Promise<void> {
    const existing = this.settings.read();
    this.settings.write(existing.filter((c) => c.id !== id));
    await this.stopServer(id);
  }

  async restartServer(id: string): Promise<void> {
    const configs = this.settings.read();
    const config = configs.find((c) => c.id === id);
    if (config === undefined) {
      throw new Error(`MCP server not found: ${id}`);
    }
    await this.stopServer(id);
    if (config.enabled) {
      await this.startServer(config);
    }
  }

  // ──────────────────────────────────────────────────────────
  // start / stop (low-level)
  // ──────────────────────────────────────────────────────────

  /**
   * 1개 서버 spawn + tools/list 동기화 + ToolRegistry 등록.
   * 호출자가 race 가능하므로 같은 id 재호출 시 기존 client 를 stop 한 뒤 진행.
   */
  async startServer(config: McpServerConfig): Promise<void> {
    if (this.clients.has(config.id)) {
      await this.stopServer(config.id);
    }
    const client = this.createClient(config, this.clientOptions);
    this.clients.set(config.id, client);

    // tools-updated 가 도착할 때마다 registry sync.
    client.on('tools-updated', (tools: McpToolInfo[]) => {
      this.unregisterServerTools(config.id);
      for (const tool of tools) {
        this.registry.register(this.buildToolWrapper(client, config, tool));
      }
    });

    try {
      await client.start();
    } catch (err) {
      // start 실패 → registry 정리 + clients 제거. 이미 client 자체가 status=error.
      this.unregisterServerTools(config.id);
      this.clients.delete(config.id);
      throw err;
    }
  }

  async stopServer(id: string): Promise<void> {
    const client = this.clients.get(id);
    if (client === undefined) {
      // 이미 없는 id — 등록된 tools 만 제거 (idempotent)
      this.unregisterServerTools(id);
      return;
    }
    this.unregisterServerTools(id);
    await client.stop();
    this.clients.delete(id);
  }

  // ──────────────────────────────────────────────────────────
  // 조회
  // ──────────────────────────────────────────────────────────

  /**
   * 모든 서버의 현재 상태 — settings 에 있는 모든 config + 살아있는 client 의
   * 런타임 상태를 결합. UI 가 직접 사용하는 형식.
   */
  listServers(): McpServerState[] {
    const configs = this.settings.read();
    return configs.map((config) => {
      const client = this.clients.get(config.id);
      const state: McpServerState = {
        config,
        status: client !== undefined ? client.getStatus() : config.enabled ? 'disconnected' : 'disabled',
        tools: client !== undefined ? client.getTools() : [],
        last_log: client !== undefined ? client.getLogTail() : [],
      };
      const pid = client?.getPid();
      if (pid !== undefined) state.pid = pid;
      const lastError = client?.getLastError();
      if (lastError !== undefined) state.last_error = lastError;
      return state;
    });
  }

  getServerLogs(id: string): string[] {
    return this.clients.get(id)?.getLogTail() ?? [];
  }

  // ──────────────────────────────────────────────────────────
  // 내부 — Tool wrapper / registry sync
  // ──────────────────────────────────────────────────────────

  private buildToolWrapper(
    client: McpClient,
    config: McpServerConfig,
    info: McpToolInfo
  ): Tool {
    const toolId = `mcp.${config.id}.${info.name}`;
    return {
      id: toolId,
      version: '1.0.0',
      source: 'mcp',
      source_id: config.id,
      // P0: JSON Schema → Zod 변환 미구현. unknown 으로 통과시키고 MCP server 가
      // 실제 스키마 검증을 하도록 함. P2 에서 변환 라이브러리 도입 예정.
      input_schema: z.unknown(),
      output_schema: z.unknown(),
      required_capabilities: (): Capability[] => ['NETWORK_MCP'],
      permission_target: (): PermissionTarget => ({
        kind: 'global',
        value: config.id,
      }),
      execute: async (input: unknown): Promise<unknown> => {
        return client.callTool(info.name, input);
      },
      display: {
        name: `${config.name} / ${info.name}`,
        summary: (input: unknown): string => {
          try {
            const json = JSON.stringify(input ?? {});
            return json.slice(0, 80);
          } catch {
            return '[complex input]';
          }
        },
        summary_result: (): string => 'MCP 결과',
      },
      timeout_ms: 60_000,
      idempotent: false,
    } satisfies Tool;
  }

  private unregisterServerTools(serverId: string): void {
    const prefix = `mcp.${serverId}.`;
    for (const tool of this.registry.list()) {
      if (tool.id.startsWith(prefix)) {
        this.registry.unregister(tool.id);
      }
    }
  }
}
