---
title: Tool Orchestration — MCP Bridge
parent: ./_index.md
related:
  - ./categories.md
  - ./registry.md
status: draft
last_updated: 2026-05-02
---

# MCP Bridge

> **한 줄 요약**: MCP 서버를 Tool 으로 wrapping. Codex 의 MCP parser 버그 회피.

---

## MCP 서버 lifecycle

```
[Connect]
  - mcp.json 에서 서버 정보 읽기
  - 프로세스 spawn 또는 HTTP 연결
  - initialize handshake (capabilities 협상)
  - tools/list 호출 → 도구 목록 받기
  - 각 도구를 ToolRegistry 에 등록

[Active]
  - 사용자/AI 의 tool call → MCP 서버로 forward
  - 응답 받아서 ToolResult 로 변환
  - 5초마다 health check

[Disconnect]
  - 서버 stop or process kill
  - 등록된 tools 제거 (registry.unregister)
  - 진행 중 call 들 cancelled 로 마감
```

---

## McpToolBridge

```typescript
class McpToolBridge implements Tool<unknown, unknown> {
  source = 'mcp' as const;
  
  constructor(
    private server: McpServer,
    private toolName: string,
    private mcpSchema: McpToolSchema
  ) {
    this.id = `mcp.${server.name}.${toolName}`;
    this.version = server.version;
    this.input_schema = mcpSchema.inputSchema;
    this.output_schema = mcpSchema.outputSchema || { type: 'object' };
    this.source_id = server.name;
  }
  
  required_capabilities(input: unknown): Capability[] {
    return [
      'NETWORK_MCP',
      ...this.server.declared_capabilities
    ];
  }
  
  async execute(input: unknown, ctx: ExecutionContext) {
    return await this.server.callTool(this.toolName, input, {
      signal: ctx.signal,
      timeout_ms: ctx.timeout_ms ?? 30_000,
    });
  }
  
  display = {
    name: this.mcpSchema.description ?? this.toolName,
    summary: (input) => JSON.stringify(input).slice(0, 80),
    summary_result: (output) => '결과 받음',
  };
}
```

---

## McpServer 클래스

```typescript
class McpServer {
  constructor(public config: McpServerConfig) {}
  
  async connect(): Promise<void> {
    if (this.config.type === 'stdio') {
      await this.connectStdio();
    } else if (this.config.type === 'http') {
      await this.connectHttp();
    }
    
    await this.handshake();
    
    const tools = await this.listTools();
    for (const t of tools) {
      const bridge = new McpToolBridge(this, t.name, t.schema);
      registry.register(bridge);
    }
    
    // Health check 시작
    this.startHealthCheck();
  }
  
  async disconnect(): Promise<void> {
    this.stopHealthCheck();
    
    // 등록된 tools 제거
    const myTools = registry.list({ source: 'mcp' })
      .filter(t => t.source_id === this.config.name);
    for (const tool of myTools) {
      registry.unregister(tool.id);
    }
    
    // 프로세스 종료
    if (this.process) {
      this.process.kill();
    }
  }
  
  async callTool(name: string, args: unknown, options: CallOptions): Promise<unknown> {
    return await this.send({
      jsonrpc: '2.0',
      id: generateId(),
      method: 'tools/call',
      params: { name, arguments: args },
    }, options);
  }
}
```

---

## STDIO 모드 (newline-delimited JSON-RPC)

```typescript
class StdioMcpServer extends McpServer {
  private process: ChildProcess;
  private buffer = '';
  
  async connectStdio() {
    this.process = spawn(this.config.command!, this.config.args ?? [], {
      env: { ...process.env, ...this.config.env },
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    
    this.process.stdout!.on('data', (chunk) => {
      this.buffer += chunk.toString();
      this.processBuffer();
    });
    
    this.process.stderr!.on('data', (chunk) => {
      // stderr 는 로깅만 (parsing X)
      Logger.log('debug', 'mcp.stderr', chunk.toString(), { server: this.config.name });
    });
  }
  
  // ★ Codex 버그 회피: 강건한 line parser
  private processBuffer() {
    while (true) {
      const newlineIdx = this.buffer.indexOf('\n');
      if (newlineIdx === -1) break;
      
      const line = this.buffer.slice(0, newlineIdx).trim();
      this.buffer = this.buffer.slice(newlineIdx + 1);
      
      if (!line) continue;
      
      // JSON 시작 마커 검증 (Codex 의 "SUCCESS:" 같은 garbage 제거)
      if (!line.startsWith('{') && !line.startsWith('[')) {
        Logger.log('debug', 'mcp.skip_non_json', line.slice(0, 100));
        continue;  // skip
      }
      
      try {
        const message = JSON.parse(line);
        this.handleMessage(message);
      } catch (err) {
        // Codex 버그: silent log (사용자 알림 X)
        Logger.log('debug', 'mcp.parse_failed', `Failed to parse: ${err.message}`, {
          server: this.config.name,
          line: line.slice(0, 200),
        });
      }
    }
  }
}
```

---

## HTTP 모드

```typescript
class HttpMcpServer extends McpServer {
  async connectHttp() {
    const response = await fetch(this.config.url!, {
      method: 'POST',
      body: JSON.stringify({ jsonrpc: '2.0', method: 'initialize', params: {} }),
    });
    
    // ... handshake
  }
  
  async sendHttp(message: object): Promise<unknown> {
    const response = await fetch(this.config.url!, {
      method: 'POST',
      body: JSON.stringify(message),
      headers: { 'Content-Type': 'application/json' },
    });
    
    if (!response.ok) {
      throw new HttpError(response.status, await response.text());
    }
    
    return await response.json();
  }
}
```

---

## Health check

```typescript
class McpServer {
  private healthCheckInterval?: NodeJS.Timer;
  
  startHealthCheck() {
    this.healthCheckInterval = setInterval(async () => {
      try {
        await this.send({ method: 'ping' }, { timeout_ms: 5000 });
        // OK
      } catch (err) {
        Logger.log('warn', 'mcp.health_check_failed', err.message, {
          server: this.config.name,
        });
        
        // 3회 연속 실패 → reconnect
        if (++this.failCount >= 3) {
          await this.reconnect();
        }
      }
    }, 5000);
  }
}
```

---

## MCP Server 등록 (사용자 UI)

```typescript
interface McpServerConfig {
  id: string;
  name: string;
  type: 'stdio' | 'http';
  
  // STDIO
  command?: string;
  args?: string[];
  env?: Record<string, string>;
  env_passthrough?: string[];          // 시스템 env 통과 (★ Codex 패턴)
  cwd?: string;                        // 작업 디렉토리
  
  // HTTP
  url?: string;
  headers?: Record<string, string>;
  
  // 공통
  enabled: boolean;
  declared_capabilities: Capability[];
  
  // Cross-provider
  enabled_in: ('claude' | 'codex' | 'dreampia')[];  // ★ "양쪽 동기화" 핵심
  
  source: 'user' | 'plugin' | 'builtin';
  created_at: ISO8601;
}
```

### 등록 폼 (UI)

```
설정 → MCP 서버 → 새 서버:

┌──────────────────────────────────────────────────┐
│ 새 MCP 서버                                      │
├──────────────────────────────────────────────────┤
│ 이름:        [my-filesystem-mcp        ]        │
│ 유형:        ◉ STDIO   ○ HTTP                   │
│                                                  │
│ 실행 명령:   [node                     ]        │
│ 인자:        [/path/to/server.mjs] [+ 추가]     │
│                                                  │
│ 환경 변수:                                       │
│   [DEBUG] = [*]                       [×]       │
│   [+ 환경 변수 추가]                             │
│                                                  │
│ 환경 변수 패스스루:                               │
│   [PATH                              ]  [×]     │
│   [HOME                              ]  [×]     │
│   [+ 변수 추가]                                  │
│                                                  │
│ 작업 디렉토리:  [~/code              ]          │
│                                                  │
│ 양쪽 AI 에 등록:                                  │
│   ☑ Claude    ☑ Codex    ☑ Dreampia 본체        │
│                                                  │
│ [취소] [저장]                                    │
└──────────────────────────────────────────────────┘
```

---

## Cross-provider 동기화

```typescript
async function saveMcpConfig(config: McpServerConfig) {
  // 1. Dreampia DB
  await db.insertMcpServer(config);
  
  // 2. Claude 측
  if (config.enabled_in.includes('claude')) {
    await syncToClaudeMcp(config);
  }
  
  // 3. Codex 측
  if (config.enabled_in.includes('codex')) {
    await syncToCodexMcp(config);
  }
}

async function syncToClaudeMcp(config: McpServerConfig) {
  const claudeMcpPath = path.join(os.homedir(), '.claude', 'mcp.json');
  const existing = JSON.parse(await fs.readFile(claudeMcpPath, 'utf-8') ?? '{}');
  
  existing.mcpServers = existing.mcpServers ?? {};
  existing.mcpServers[config.name] = {
    command: config.command,
    args: config.args,
    env: config.env,
  };
  
  await fs.writeFile(claudeMcpPath, JSON.stringify(existing, null, 2));
}

async function syncToCodexMcp(config: McpServerConfig) {
  // Codex 도 비슷한 구조
  const codexMcpPath = path.join(os.homedir(), '.codex', 'mcp.json');
  // ...
}
```

---

## 검증 (Invariants)

```
INV-1: 등록된 MCP 서버 disconnect 시 모든 tools 제거
INV-2: 같은 서버 이름으로 두 번 connect X (덮어쓰기 X)
INV-3: STDIO parser 는 invalid JSON 만나도 crash X (silent skip)
INV-4: HTTP 모드 에서 401/403 받으면 즉시 disconnect (재시도 X)
INV-5: 양쪽 provider 동기화는 atomic (한 쪽만 저장 X)
```

---

## 관련

- [categories.md](./categories.md) — MCP 카테고리
- [registry.md](./registry.md) — 등록/해제
- [docs/permission/provider-mapping.md](../permission/provider-mapping.md) — Cross-provider sync
- [DEEP_EXPLORATION_FINDINGS.md](../../DEEP_EXPLORATION_FINDINGS.md) — Codex MCP parser 버그 발견
