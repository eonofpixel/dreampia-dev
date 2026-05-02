---
title: Tool Orchestration — Tool / Context / Call / Result Interface
parent: ./_index.md
related:
  - ./principles.md
  - ./queue.md
status: draft
last_updated: 2026-05-02
---

# Tool Interface

> **한 줄 요약**: `Tool<TInput, TOutput>` + `ExecutionContext` + `ToolCall` / `ToolResult` 4개 핵심 타입.

---

## Tool 인터페이스

```typescript
interface Tool<TInput = unknown, TOutput = unknown> {
  // ─── Identity ───
  id: ToolId;                          // "shell.run", "browser.navigate", "fs.read"
  version: string;                     // semver
  
  // ─── Schema ───
  input_schema: JSONSchema;            // 입력 검증
  output_schema: JSONSchema;           // 출력 검증
  
  // ─── Execution ───
  execute(input: TInput, ctx: ExecutionContext): Promise<TOutput>;
  cancel?(ctx: ExecutionContext): Promise<void>;
  
  // ─── Permission ───
  required_capabilities(input: TInput): Capability[];
  
  // ─── Display ───
  display: {
    name: string;                      // "Shell 실행"
    icon?: string;                     // emoji 또는 path
    summary(input: TInput): string;    // "npm install"
    summary_result(output: TOutput): string;  // "12 packages added"
  };
  
  // ─── Lifecycle ───
  retry?: RetryPolicy;
  timeout_ms?: number;                 // default 30s
  idempotent?: boolean;                // 재시도 가능 여부
  
  // ─── Provider 출처 ───
  source: 'builtin' | 'mcp' | 'plugin' | 'skill';
  source_id?: string;                  // MCP 서버명 등
}

type ToolId = string;
```

---

## ExecutionContext

Tool 실행 시 받는 환경:

```typescript
interface ExecutionContext {
  // ─── Identity ───
  session_id: SessionId;
  turn_id: TurnId;
  call_id: ToolCallId;                 // 이 호출 고유 ID
  
  // ─── Cancellation ───
  signal: AbortSignal;                 // 취소 시 abort
  
  // ─── Permission ───
  permissions: PermissionResolver;     // 권한 체크 인터페이스
  
  // ─── Workspace ───
  workspace: Workspace;
  cwd: AbsolutePath;
  
  // ─── Logging ───
  log: (level: LogLevel, message: string, data?: object) => void;
  progress: (percent: number, message?: string) => void;
  
  // ─── Sub-resources ───
  fs: FsAdapter;                       // 파일 시스템 (권한 체크 자동)
  net: NetAdapter;                     // 네트워크
  shell: ShellAdapter;                 // shell 실행
  
  // ─── 부모 컨텍스트 ───
  parent_call_id?: ToolCallId;         // 다른 tool 의 sub-call
}

type LogLevel = 'debug' | 'info' | 'warn' | 'error';
```

### Sub-resources 역할

```
fs / net / shell:
  - Tool 작성자가 직접 fs.readFile() 사용 X
  - 대신 ctx.fs.read() 사용 → 자동 권한 체크 + 로그
  
이유:
  - Tool 코드 단순화
  - 권한 누락 방지
  - 모든 I/O 자동 추적
```

---

## ToolCall (요청)

```typescript
interface ToolCall {
  id: ToolCallId;                      // UUID
  tool_id: ToolId;
  
  // Origin
  session_id: SessionId;
  turn_id: TurnId;
  parent_call_id?: ToolCallId;         // sub-call
  
  // Input
  input: unknown;                      // input_schema 검증됨
  
  // Settings
  timeout_ms?: number;
  retry_override?: RetryPolicy;
  priority?: 'high' | 'normal' | 'low';
  
  // 출처
  origin: 'ai' | 'user' | 'automation';
  
  created_at: ISO8601;
}
```

---

## ToolResult (응답)

```typescript
interface ToolResult {
  call_id: ToolCallId;
  tool_id: ToolId;
  
  status: 'success' | 'failed' | 'cancelled' | 'timeout';
  
  // Success
  output?: unknown;                    // output_schema 검증됨
  
  // Failure
  error?: ToolError;
  
  // Metadata
  started_at: ISO8601;
  completed_at: ISO8601;
  duration_ms: number;
  attempt_count: number;               // retry 결과
  
  // 부수 효과
  side_effects?: SideEffect[];         // 실행 중 일어난 일
  
  // 로그 (최근 N개)
  log_tail: LogEntry[];
}
```

### ToolError

```typescript
interface ToolError {
  code: string;                        // "PERMISSION_DENIED", "TIMEOUT", ...
  message: string;
  details?: object;
  retryable: boolean;
  user_visible_hint?: string;          // 사용자에게 보여줄 단순 설명
}
```

### SideEffect

Tool 이 실행 중 일으킨 변경 추적:

```typescript
interface SideEffect {
  kind: 'file_modified' | 'file_created' | 'file_deleted' 
      | 'process_spawned' | 'browser_tab_opened'
      | 'network_request_sent';
  details: object;
  timestamp: ISO8601;
}
```

**예시**:
```json
{
  "kind": "file_modified",
  "details": { "path": "src/foo.ts", "size_before": 234, "size_after": 256 },
  "timestamp": "2026-05-02T01:54:00.000Z"
}
```

→ UI 가 "이 도구가 무슨 변경 했는지" 보여줄 때 사용.

---

## Tool 구현 예시

### Built-in: fs.read

```typescript
const FsReadTool: Tool<{ path: string; encoding?: string }, { content: string; size: number }> = {
  id: 'fs.read',
  version: '1.0.0',
  source: 'builtin',
  
  input_schema: {
    type: 'object',
    properties: {
      path: { type: 'string' },
      encoding: { type: 'string', default: 'utf-8' },
    },
    required: ['path'],
  },
  
  output_schema: {
    type: 'object',
    properties: {
      content: { type: 'string' },
      size: { type: 'number' },
    },
  },
  
  required_capabilities: ({ path }) => {
    return isOutsideWorkspace(path) 
      ? ['LOCAL_OUTSIDE_CWD.read'] 
      : ['LOCAL_READ'];
  },
  
  async execute({ path, encoding = 'utf-8' }, ctx) {
    ctx.log('info', `Reading ${path}`);
    
    const content = await ctx.fs.read(path, encoding);
    
    return {
      content,
      size: content.length,
    };
  },
  
  display: {
    name: '파일 읽기',
    icon: '📄',
    summary: ({ path }) => path,
    summary_result: (output) => `${formatBytes(output.size)}`,
  },
  
  idempotent: true,
  timeout_ms: 5000,
};
```

### MCP Bridge

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

## Type 검증 (런타임)

```typescript
import Ajv from 'ajv';

const ajv = new Ajv();

function validateToolInput<T>(tool: Tool<T, any>, input: unknown): T {
  const validate = ajv.compile(tool.input_schema);
  
  if (!validate(input)) {
    throw new Error(`Invalid tool input for ${tool.id}: ${ajv.errorsText(validate.errors)}`);
  }
  
  return input as T;
}

function validateToolOutput<T>(tool: Tool<any, T>, output: unknown): T {
  const validate = ajv.compile(tool.output_schema);
  
  if (!validate(output)) {
    throw new Error(`Invalid tool output for ${tool.id}: ${ajv.errorsText(validate.errors)}`);
  }
  
  return output as T;
}
```

---

## ToolCallId 생성

```typescript
import { uuidv7 } from 'uuidv7';

function newCallId(): ToolCallId {
  return uuidv7();  // 시간 정렬 + unique
}

// 또는 turn 기반
function callIdFor(turnId: TurnId, seq: number): ToolCallId {
  return `${turnId}-call-${seq.toString().padStart(3, '0')}`;
}
```

---

## 검증 (Invariants)

```
INV-1: Tool.id 는 'category.action' 형식 (예: 'shell.run')
INV-2: Tool.input_schema / output_schema 는 valid JSONSchema
INV-3: required_capabilities() 는 non-empty (모든 tool 에 권한 필요)
INV-4: ToolCall.id 는 UUIDv7 (시간 정렬)
INV-5: ToolResult.duration_ms = completed_at - started_at
INV-6: ToolResult.status='cancelled' 이면 ctx.signal.aborted 였음
INV-7: ToolResult.attempt_count >= 1
```

---

## 관련

- [principles.md](./principles.md) — 인터페이스 설계 원칙
- [queue.md](./queue.md) — Tool 실행 흐름
- [registry.md](./registry.md) — Tool 등록
- [retry.md](./retry.md) — RetryPolicy 상세
- [logging.md](./logging.md) — log_tail 형식
