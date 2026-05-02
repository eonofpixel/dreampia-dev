---
title: Tool Orchestration — Provider Adapters
parent: ./_index.md
related:
  - ./registry.md
  - ../session/cross-ai-sync.md
status: draft
last_updated: 2026-05-02
---

# Provider Adapters (Tool Calling 변환)

> **한 줄 요약**: Claude / OpenAI tool calling 형식 ↔ 우리 Tool 인터페이스 변환.

---

## Claude Tool Calling

```typescript
// Claude API 의 tool_use 블록 → 우리 ToolCall
function fromClaudeToolUse(block: ClaudeToolUseBlock, ctx: TurnContext): ToolCall {
  return {
    id: block.id,                                    // Claude 가 부여
    tool_id: unsanitizeToolName(block.name),         // shell_run → shell.run
    input: block.input,
    session_id: ctx.session_id,
    turn_id: ctx.turn_id,
    origin: 'ai',
    created_at: new Date().toISOString(),
  };
}

// 우리 ToolResult → Claude tool_result 블록
function toClaudeToolResult(result: ToolResult): ClaudeToolResultBlock {
  return {
    type: 'tool_result',
    tool_use_id: result.call_id,
    content: result.status === 'success' 
      ? formatToolOutputForAI(result.output)
      : `Error: ${result.error?.message}`,
    is_error: result.status !== 'success',
  };
}

function formatToolOutputForAI(output: unknown): string {
  // AI 가 읽기 좋은 형식
  if (typeof output === 'string') return output;
  if (typeof output === 'object' && output !== null) {
    return JSON.stringify(output, null, 2);
  }
  return String(output);
}
```

### Tool list 생성 (Claude)

```typescript
function buildClaudeTools(): ClaudeTool[] {
  return registry.list()
    .filter(t => isVisibleToProvider(t, 'claude'))
    .map(toClaudeTool);
}

function toClaudeTool(tool: Tool): ClaudeTool {
  return {
    name: sanitizeToolName(tool.id),
    description: buildDescription(tool),
    input_schema: tool.input_schema,
  };
}

function buildDescription(tool: Tool): string {
  // display.name + 사용 안내
  let desc = tool.display.name;
  
  if (tool.idempotent) {
    desc += '\n(Idempotent: 같은 입력 = 같은 결과. 안전하게 재시도 가능.)';
  }
  
  if (tool.required_capabilities({}).includes('LOCAL_OUTSIDE_CWD')) {
    desc += '\n(Note: 작업 디렉토리 외부 접근. 사용자 확인 필요.)';
  }
  
  return desc;
}
```

---

## OpenAI Function Calling

```typescript
// OpenAI 의 function_call → 우리 ToolCall
function fromOpenAIFunctionCall(call: OpenAIFunctionCall, ctx: TurnContext): ToolCall {
  return {
    id: call.id,
    tool_id: unsanitizeToolName(call.function.name),
    input: JSON.parse(call.function.arguments),
    session_id: ctx.session_id,
    turn_id: ctx.turn_id,
    origin: 'ai',
    created_at: new Date().toISOString(),
  };
}

// 우리 ToolResult → OpenAI tool message
function toOpenAIToolMessage(result: ToolResult): OpenAIMessage {
  return {
    role: 'tool',
    tool_call_id: result.call_id,
    content: result.status === 'success' 
      ? formatToolOutputForAI(result.output)
      : JSON.stringify({ error: result.error }),
  };
}
```

### Tool list 생성 (OpenAI)

```typescript
function buildOpenAITools(): OpenAITool[] {
  return registry.list()
    .filter(t => isVisibleToProvider(t, 'codex'))
    .map(toOpenAIFunction);
}

function toOpenAIFunction(tool: Tool): OpenAITool {
  return {
    type: 'function',
    function: {
      name: sanitizeToolName(tool.id),
      description: buildDescription(tool),
      parameters: tool.input_schema,
    },
  };
}
```

---

## Tool name sanitization (★ 매우 중요)

```typescript
// Codex / OpenAI: 영숫자 + _ 만 허용 (점 X)
// Claude: 영숫자 + _ + - 허용

function sanitizeToolName(id: ToolId): string {
  // 우리: "shell.run", "mcp.foo.bar"
  // Provider: "shell_run", "mcp_foo_bar"
  return id.replace(/\./g, '_');
}

function unsanitizeToolName(name: string): ToolId {
  // 정확한 역변환 필요 (registry 에서 lookup)
  // 1) 그대로 시도
  if (registry.get(name)) return name;
  
  // 2) underscore → dot 변환 시도
  const dotted = name.replace(/_/g, '.');
  if (registry.get(dotted)) return dotted;
  
  // 3) Hybrid (mcp_foo_bar → mcp.foo_bar)
  // ... 더 복잡한 매칭 로직
  
  throw new Error(`Cannot resolve tool name: ${name}`);
}
```

### 충돌 회피

```
문제: "mcp.foo_bar" 와 "mcp.foo.bar" 가 같은 sanitized name 가짐?

mcp.foo_bar  → mcp_foo_bar
mcp.foo.bar  → mcp_foo_bar  ★ 충돌!

해결: ID 안에 underscore 사용 시 escape
  mcp.foo_bar  → mcp__foo__bar  (single → double)
  mcp.foo.bar  → mcp_foo_bar
```

```typescript
function sanitizeToolName(id: ToolId): string {
  return id
    .replace(/_/g, '__')                  // escape underscore first
    .replace(/\./g, '_');                 // dot → underscore
}

function unsanitizeToolName(name: string): ToolId {
  return name
    .replace(/__/g, '')             // temp marker for double underscore
    .replace(/_/g, '.')                   // single underscore → dot
    .replace(//g, '_');             // restore single underscores
}
```

---

## isVisibleToProvider

특정 provider 에 노출할지 결정:

```typescript
function isVisibleToProvider(tool: Tool, provider: 'claude' | 'codex'): boolean {
  // Provider-specific tool 은 해당 provider 에만
  if (tool.source_provider && tool.source_provider !== provider) {
    return false;
  }
  
  // 사용자 비활성화
  if (settings.disabled_tools.includes(tool.id)) {
    return false;
  }
  
  // Provider 별 capability 차이
  if (provider === 'claude' && tool.id.startsWith('browser.')) {
    // Claude 는 in-app browser 직접 제어 X (hooks 통해)
    return false;
  }
  
  return true;
}
```

---

## Streaming 응답 처리

### Claude SSE

```typescript
async function* parseClaudeStream(stream: ReadableStream): AsyncIterable<StreamEvent> {
  const reader = stream.getReader();
  let buffer = '';
  
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    
    buffer += new TextDecoder().decode(value);
    const lines = buffer.split('\n');
    buffer = lines.pop() ?? '';
    
    for (const line of lines) {
      if (line.startsWith('event: ')) {
        const eventType = line.slice(7).trim();
        // ...
      } else if (line.startsWith('data: ')) {
        const data = JSON.parse(line.slice(6));
        
        switch (data.type) {
          case 'content_block_delta':
            yield { type: 'text_delta', text: data.delta.text };
            break;
          case 'content_block_start':
            if (data.content_block.type === 'tool_use') {
              yield { type: 'tool_use_start', id: data.content_block.id };
            }
            break;
          // ...
        }
      }
    }
  }
}
```

### OpenAI SSE

```typescript
async function* parseOpenAIStream(stream: ReadableStream): AsyncIterable<StreamEvent> {
  // 비슷하지만 형식 다름
  for await (const line of readLines(stream)) {
    if (line.startsWith('data: ')) {
      const data = JSON.parse(line.slice(6));
      
      const delta = data.choices[0].delta;
      
      if (delta.content) {
        yield { type: 'text_delta', text: delta.content };
      }
      
      if (delta.tool_calls) {
        for (const tc of delta.tool_calls) {
          yield { type: 'tool_call_delta', call: tc };
        }
      }
    }
  }
}
```

---

## Provider-specific 처리 차이

```
                            Claude            OpenAI/Codex
                            ──────            ─────────────
Tool ID 변환                _ + escape         _ + escape
Tool result 형식            content block      message
Multi-tool parallel         지원              지원
Streaming                  SSE (event types)  SSE (delta object)
Reasoning blocks            extended thinking  o1 reasoning (별도)
Prompt caching             ephemeral marker   자동 (제어 X)
Image input                base64             base64 또는 URL
File input                 base64             별도 file API
```

---

## 검증 (Invariants)

```
INV-1: 모든 sanitize/unsanitize 는 round-trip
INV-2: Tool name 충돌 시 conflict-resolution.md 거침
INV-3: Streaming 중 cancellation 즉시 stream close
INV-4: Tool result 의 is_error 플래그는 status 와 일치
INV-5: 같은 tool_id 가 양 provider 에서 다르게 sanitize 되면 안 됨
```

---

## 관련

- [registry.md](./registry.md) — Tool list 빌드
- [docs/session/cross-ai-sync.md](../session/cross-ai-sync.md) — 메시지 형식 변환
- [interface.md](./interface.md) — Tool 인터페이스
