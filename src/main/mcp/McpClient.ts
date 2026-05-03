/**
 * McpClient — single MCP server stdio connection.
 *
 * Spec: docs/tools/mcp-bridge.md, https://modelcontextprotocol.io/
 *
 * Lifecycle:
 *   1. start() — child process spawn + initialize handshake + tools/list
 *   2. callTool(name, args) — JSON-RPC request → 응답 또는 30s timeout
 *   3. stop() — shutdown notification + SIGTERM (1s grace)
 *
 * 안전성 결정:
 *  - non-JSON line skip (Codex MCP parser bug 회피, mcp-bridge.md 161-188)
 *  - 매 요청 30s timeout — pending 누적 방지
 *  - stop() 후 callTool() 호출 시 throw (status 검증)
 *  - exit listener 가 pendingRequests 모두 reject (hang 방지)
 *
 * Test 친화:
 *  - 실제 spawn 의존을 제거하기 위해 spawnFn injection 지원
 *  - createTimeout/clearTimeoutFn 도 테스트가 fake timer 로 대체 가능
 */

import { spawn as nodeSpawn, type ChildProcess } from 'node:child_process';
import { EventEmitter } from 'node:events';
import type {
  JsonRpcNotification,
  JsonRpcRequest,
  JsonRpcResponse,
  McpServerConfig,
  McpServerStatus,
  McpToolInfo,
} from '@/types';

// ────────────────────────────────────────────────────────────
// Types
// ────────────────────────────────────────────────────────────

/**
 * spawn 함수 시그니처. Production 은 node:child_process.spawn,
 * 테스트는 EventEmitter 기반 fake 를 주입.
 */
export type SpawnFn = (
  command: string,
  args: ReadonlyArray<string>,
  options: {
    env?: NodeJS.ProcessEnv;
    cwd?: string;
    stdio: ['pipe', 'pipe', 'pipe'];
  }
) => ChildProcess;

export interface McpClientOptions {
  spawn?: SpawnFn;
  /** 요청별 timeout (ms). default 30_000. */
  request_timeout_ms?: number;
  /** stop() 시 SIGTERM grace period (ms). default 1_000. */
  shutdown_grace_ms?: number;
  /** logTail 최대 길이. default 50. */
  log_tail_size?: number;
}

const MCP_PROTOCOL_VERSION = '2024-11-05';
const MCP_CLIENT_NAME = 'Dreampia-Dev';
const MCP_CLIENT_VERSION = '0.2.0';

// ────────────────────────────────────────────────────────────
// McpClient
// ────────────────────────────────────────────────────────────

export class McpClient extends EventEmitter {
  private child: ChildProcess | null = null;
  private status: McpServerStatus = 'disconnected';
  private tools: McpToolInfo[] = [];
  private lastError: string | undefined;

  private readonly pendingRequests = new Map<
    number,
    {
      resolve: (value: unknown) => void;
      reject: (err: Error) => void;
      timer: NodeJS.Timeout;
    }
  >();
  private nextRequestId = 1;
  private buffer = '';
  private logLines: string[] = [];

  private readonly spawnFn: SpawnFn;
  private readonly requestTimeoutMs: number;
  private readonly shutdownGraceMs: number;
  private readonly logTailSize: number;

  constructor(
    public readonly config: McpServerConfig,
    options: McpClientOptions = {}
  ) {
    super();
    this.spawnFn = options.spawn ?? (nodeSpawn as unknown as SpawnFn);
    this.requestTimeoutMs = options.request_timeout_ms ?? 30_000;
    this.shutdownGraceMs = options.shutdown_grace_ms ?? 1_000;
    this.logTailSize = options.log_tail_size ?? 50;
  }

  // ──────────────────────────────────────────────────────────
  // Public API
  // ──────────────────────────────────────────────────────────

  async start(): Promise<void> {
    if (this.child !== null) return;
    this.setStatus('connecting');
    this.lastError = undefined;

    let child: ChildProcess;
    try {
      const spawnOptions: {
        env?: NodeJS.ProcessEnv;
        cwd?: string;
        stdio: ['pipe', 'pipe', 'pipe'];
      } = {
        env: { ...process.env, ...this.config.env },
        stdio: ['pipe', 'pipe', 'pipe'],
      };
      if (this.config.cwd !== undefined) {
        spawnOptions.cwd = this.config.cwd;
      }
      child = this.spawnFn(this.config.command, this.config.args, spawnOptions);
    } catch (err) {
      this.lastError = err instanceof Error ? err.message : String(err);
      this.setStatus('error');
      this.emit('error', err instanceof Error ? err : new Error(this.lastError));
      throw err instanceof Error ? err : new Error(this.lastError);
    }

    this.child = child;

    // ── stdout: JSON-RPC line stream ──
    child.stdout?.on('data', (chunk: Buffer | string) => {
      this.handleStdout(chunk.toString());
    });

    // ── stderr: log only (do NOT parse) ──
    child.stderr?.on('data', (chunk: Buffer | string) => {
      const text = chunk.toString();
      // 여러 줄이 한 chunk 에 올 수 있어 라인 단위로 trim
      for (const raw of text.split('\n')) {
        const line = raw.trim();
        if (line.length === 0) continue;
        this.appendLog(`[stderr] ${line}`);
      }
    });

    child.on('error', (err) => {
      // 'error' 이벤트는 spawn 자체 실패 (ENOENT 등) — 이미 spawnFn throw 가
      // 잡았겠지만 비동기 에러도 케어. 모든 pending 을 reject 해 hang 방지.
      this.lastError = err.message;
      this.setStatus('error');
      this.rejectAllPending(err);
      this.emit('error', err);
    });

    child.on('exit', (code) => {
      const wasReady = this.status === 'ready';
      // 정상 종료: code === 0 OR (이미 stop() 호출 후 → status='disconnected')
      const cleanExit = code === 0;
      this.rejectAllPending(new Error(`MCP process exited (code=${code})`));
      this.child = null;
      if (cleanExit) {
        this.setStatus('disconnected');
      } else if (this.status !== 'disconnected') {
        // 비정상 종료 — error 로 표시
        this.lastError = `Process exited with code ${code}`;
        this.setStatus('error');
        if (wasReady) {
          this.emit('error', new Error(this.lastError));
        }
      }
    });

    // ── handshake: initialize → notifications/initialized → tools/list ──
    try {
      await this.request('initialize', {
        protocolVersion: MCP_PROTOCOL_VERSION,
        capabilities: {},
        clientInfo: { name: MCP_CLIENT_NAME, version: MCP_CLIENT_VERSION },
      });
      this.notify('notifications/initialized', {});
      const toolsResult = (await this.request('tools/list', {})) as {
        tools?: McpToolInfo[];
      };
      this.tools = Array.isArray(toolsResult.tools) ? toolsResult.tools : [];
      this.emit('tools-updated', [...this.tools]);
      this.setStatus('ready');
    } catch (err) {
      this.lastError = err instanceof Error ? err.message : String(err);
      this.setStatus('error');
      // 자식 정리
      try {
        this.child?.kill('SIGTERM');
      } catch {
        // ignore
      }
      this.child = null;
      this.emit('error', err instanceof Error ? err : new Error(this.lastError));
      throw err instanceof Error ? err : new Error(this.lastError);
    }
  }

  async stop(): Promise<void> {
    const child = this.child;
    if (child === null) {
      this.setStatus('disconnected');
      return;
    }
    // status 를 먼저 disconnected 로 — exit handler 가 error 로 판정 안 하도록
    this.setStatus('disconnected');
    // graceful shutdown: shutdown notification 후 SIGTERM (grace 후 SIGKILL)
    try {
      this.notify('shutdown', {});
    } catch {
      // ignore — 이미 stdin 가 닫혔을 수 있음
    }
    return new Promise<void>((resolve) => {
      let resolved = false;
      const finish = (): void => {
        if (resolved) return;
        resolved = true;
        clearTimeout(killTimer);
        clearTimeout(forceKillTimer);
        resolve();
      };
      child.once('exit', finish);
      const killTimer = setTimeout(() => {
        try {
          child.kill('SIGTERM');
        } catch {
          // ignore
        }
      }, this.shutdownGraceMs);
      // SIGKILL 은 SIGTERM 이후에도 안 죽는 경우 보호용 (추가 grace).
      const forceKillTimer = setTimeout(() => {
        try {
          child.kill('SIGKILL');
        } catch {
          // ignore
        }
        finish();
      }, this.shutdownGraceMs * 2);
    }).finally(() => {
      this.rejectAllPending(new Error('MCP client stopped'));
      this.child = null;
    });
  }

  async callTool(name: string, args: unknown): Promise<unknown> {
    if (this.status !== 'ready') {
      throw new Error(`MCP server '${this.config.id}' not ready (status=${this.status})`);
    }
    const result = (await this.request('tools/call', {
      name,
      arguments: args ?? {},
    })) as {
      content?: unknown;
      isError?: boolean;
    };
    if (result.isError === true) {
      throw new Error(`MCP tool '${name}' returned error: ${JSON.stringify(result.content)}`);
    }
    return result.content;
  }

  getTools(): McpToolInfo[] {
    return [...this.tools];
  }

  getStatus(): McpServerStatus {
    return this.status;
  }

  getLogTail(): string[] {
    return [...this.logLines];
  }

  getLastError(): string | undefined {
    return this.lastError;
  }

  getPid(): number | undefined {
    return this.child?.pid;
  }

  // ──────────────────────────────────────────────────────────
  // Internal helpers
  // ──────────────────────────────────────────────────────────

  private setStatus(s: McpServerStatus): void {
    if (this.status === s) return;
    this.status = s;
    this.emit('status', s);
  }

  private appendLog(line: string): void {
    this.logLines.push(line);
    if (this.logLines.length > this.logTailSize) {
      this.logLines.splice(0, this.logLines.length - this.logTailSize);
    }
    this.emit('log', line);
  }

  private rejectAllPending(err: Error): void {
    for (const [, entry] of this.pendingRequests) {
      clearTimeout(entry.timer);
      entry.reject(err);
    }
    this.pendingRequests.clear();
  }

  private async request(method: string, params: unknown): Promise<unknown> {
    const child = this.child;
    if (child === null || child.stdin === null) {
      throw new Error('MCP child process not started');
    }
    const id = this.nextRequestId++;
    const message: JsonRpcRequest = {
      jsonrpc: '2.0',
      id,
      method,
      params,
    };
    return new Promise<unknown>((resolve, reject) => {
      const timer = setTimeout(() => {
        if (this.pendingRequests.has(id)) {
          this.pendingRequests.delete(id);
          reject(new Error(`MCP request timeout: ${method}`));
        }
      }, this.requestTimeoutMs);
      this.pendingRequests.set(id, { resolve, reject, timer });
      try {
        child.stdin?.write(`${JSON.stringify(message)}\n`);
      } catch (err) {
        this.pendingRequests.delete(id);
        clearTimeout(timer);
        reject(err instanceof Error ? err : new Error(String(err)));
      }
    });
  }

  private notify(method: string, params: unknown): void {
    const stdin = this.child?.stdin;
    if (stdin === undefined || stdin === null) return;
    const message: JsonRpcNotification = {
      jsonrpc: '2.0',
      method,
      params,
    };
    try {
      stdin.write(`${JSON.stringify(message)}\n`);
    } catch {
      // ignore — best-effort notification
    }
  }

  private handleStdout(chunk: string): void {
    this.buffer += chunk;
    while (true) {
      const newlineIdx = this.buffer.indexOf('\n');
      if (newlineIdx < 0) break;
      const line = this.buffer.slice(0, newlineIdx).trim();
      this.buffer = this.buffer.slice(newlineIdx + 1);
      if (line.length === 0) continue;

      // Codex bug 회피 (mcp-bridge.md 161-188): JSON 시작이 아니면 skip + log.
      // MCP server 가 가끔 prefix line ("INFO: ready" 등) 을 stdout 으로 흘리는데
      // 이걸 silently drop 해야 parsing crash 가 없다.
      if (!line.startsWith('{') && !line.startsWith('[')) {
        this.appendLog(`[stdout-non-json] ${line.slice(0, 200)}`);
        continue;
      }

      let parsed: unknown;
      try {
        parsed = JSON.parse(line);
      } catch {
        this.appendLog(`[stdout-parse-error] ${line.slice(0, 200)}`);
        continue;
      }

      if (typeof parsed !== 'object' || parsed === null) {
        this.appendLog(`[stdout-not-object] ${line.slice(0, 200)}`);
        continue;
      }
      const obj = parsed as Record<string, unknown>;
      const id = obj['id'];

      // response (id 존재 + result OR error 필드)
      if (id !== undefined && (typeof id === 'number' || typeof id === 'string')) {
        const numericId = typeof id === 'number' ? id : Number.parseInt(String(id), 10);
        if (Number.isNaN(numericId)) {
          this.appendLog(`[stdout-bad-id] ${line.slice(0, 200)}`);
          continue;
        }
        const pending = this.pendingRequests.get(numericId);
        if (pending === undefined) {
          // 모르는 id — 중복 응답 또는 timeout 후 도착. drop.
          this.appendLog(`[stdout-unknown-id] id=${numericId}`);
          continue;
        }
        this.pendingRequests.delete(numericId);
        clearTimeout(pending.timer);
        const response = obj as unknown as JsonRpcResponse;
        if ('error' in response && response.error !== undefined) {
          const errMsg =
            typeof response.error.message === 'string'
              ? response.error.message
              : 'unknown MCP error';
          pending.reject(new Error(errMsg));
        } else if ('result' in response) {
          pending.resolve(response.result);
        } else {
          pending.reject(new Error('JSON-RPC response missing result/error'));
        }
        continue;
      }

      // notification (id 없음). 현재 P0 에선 무시 + 로그.
      const method = obj['method'];
      if (typeof method === 'string') {
        this.appendLog(`[notification] ${method}`);
      }
    }
  }
}
