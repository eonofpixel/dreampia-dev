---
title: Session State — Cross-AI Sync (Claude ↔ Codex)
parent: ./_index.md
related:
  - ./schema.md
  - ./conversation.md
status: draft
last_updated: 2026-05-02
---

# Cross-AI Sync (Claude ↔ Codex 어댑터)

> **한 줄 요약**: 메시지마다 모델 변경되어도 동일 세션 schema 유지. Provider-specific 변환은 adapter 가 담당.

---

## 핵심 challenge

각 provider 마다 메시지·tool call 포맷이 다름:

```
Claude API           Codex/OpenAI API
─────────────         ───────────────
messages[]            messages[]
content blocks        content (string or array)
tool_use blocks       function_calls / tools
tool_result blocks    role='tool' messages
system prompt         system message
prompt caching        — (다른 메커니즘)
extended thinking     — (없음)
```

→ 우리 내부 schema 는 **provider 중립**. Adapter 가 양방향 변환.

---

## ProviderAdapter 인터페이스

```typescript
interface ProviderAdapter {
  // 식별
  provider: 'claude' | 'codex';
  
  // 보낼 때: 우리 schema → Provider API
  toProviderMessages(turns: Turn[]): ProviderMessage[];
  toProviderTools(tools: Tool[]): ProviderTool[];
  toProviderConfig(turn: Turn): ProviderRequestConfig;
  
  // 받을 때: Provider API → 우리 schema
  fromProviderResponse(response: ProviderResponse): {
    new_turn: Turn;
    tool_calls: ToolCall[];
  };
  fromProviderToolResult(result: ProviderToolResult): ToolResult;
  
  // 스트리밍
  parseStreamChunk(chunk: string): StreamEvent[];
  
  // 검증
  validateApiKey(apiKey: string): Promise<boolean>;
  
  // Capability 매핑
  supportsExtendedThinking(): boolean;
  supportsPromptCaching(): boolean;
  maxContextTokens(): number;
}
```

---

## ClaudeAdapter

### Message 변환

```typescript
class ClaudeAdapter implements ProviderAdapter {
  provider = 'claude' as const;
  
  toProviderMessages(turns: Turn[]): ClaudeMessage[] {
    return turns.map(turn => {
      switch (turn.role) {
        case 'user':
          return {
            role: 'user',
            content: turn.content.map(this.toClaudeContent),
          };
        case 'assistant':
          return {
            role: 'assistant',
            content: [
              ...turn.content.map(this.toClaudeContent),
              ...(turn.tool_calls ?? []).map(this.toClaudeToolUse),
            ],
          };
        case 'tool':
          return {
            role: 'user',  // Claude convention: tool result as user message
            content: (turn.tool_results ?? []).map(this.toClaudeToolResult),
          };
        case 'system':
          // System messages 별도 처리 (system prompt)
          return null;  // filter out
      }
    }).filter(Boolean);
  }
  
  private toClaudeContent(block: ContentBlock): ClaudeContentBlock {
    switch (block.type) {
      case 'text':
        return { type: 'text', text: block.text };
      case 'image':
        return { 
          type: 'image', 
          source: { 
            type: 'base64', 
            media_type: block.mime, 
            data: block.data 
          } 
        };
      case 'mention':
        // Claude 는 @멘션 별도 처리 X → 텍스트로 변환
        return { type: 'text', text: `@${block.ref.display}` };
      case 'embedded_card':
        // Card 는 텍스트로 표시
        return { type: 'text', text: `[${block.card.title}](${block.card.url})` };
    }
  }
  
  private toClaudeToolUse(call: ToolCall): ClaudeToolUseBlock {
    return {
      type: 'tool_use',
      id: call.id,
      name: call.tool_id.replace(/\./g, '_'),  // shell.run → shell_run
      input: call.input,
    };
  }
}
```

### 응답 파싱

```typescript
fromProviderResponse(response: ClaudeResponse): { new_turn: Turn; tool_calls: ToolCall[] } {
  const tool_calls: ToolCall[] = [];
  const content: ContentBlock[] = [];
  
  for (const block of response.content) {
    if (block.type === 'text') {
      content.push({ type: 'text', text: block.text });
    } else if (block.type === 'tool_use') {
      tool_calls.push({
        id: block.id,
        tool_id: block.name.replace(/_/g, '.'),
        input: block.input,
        // ...
      });
    }
  }
  
  return {
    new_turn: {
      id: uuidv7(),
      role: 'assistant',
      timestamp: new Date().toISOString(),
      status: 'completed',
      content,
      tool_calls,
      model: response.model,
    },
    tool_calls,
  };
}
```

### Capability

```typescript
supportsExtendedThinking() { return true; }   // Claude 4 thinking blocks
supportsPromptCaching() { return true; }      // ephemeral cache control
maxContextTokens() { return 200_000; }        // 또는 1M
```

---

## CodexAdapter (OpenAI 호환)

### Message 변환

```typescript
class CodexAdapter implements ProviderAdapter {
  provider = 'codex' as const;
  
  toProviderMessages(turns: Turn[]): OpenAIMessage[] {
    return turns.flatMap(turn => {
      switch (turn.role) {
        case 'user':
          return [{
            role: 'user',
            content: turn.content.map(this.toOpenAIContent),
          }];
        case 'assistant':
          // OpenAI 는 tool_calls 가 message 의 별도 필드
          return [{
            role: 'assistant',
            content: turn.content
              .filter(b => b.type === 'text')
              .map(b => (b as TextBlock).text)
              .join('\n'),
            tool_calls: turn.tool_calls?.map(this.toOpenAIFunctionCall),
          }];
        case 'tool':
          // 각 tool_result 가 별도 message
          return (turn.tool_results ?? []).map(result => ({
            role: 'tool',
            tool_call_id: result.call_id,
            content: this.serializeToolResult(result),
          }));
      }
    });
  }
  
  private toOpenAIFunctionCall(call: ToolCall): OpenAIToolCall {
    return {
      id: call.id,
      type: 'function',
      function: {
        name: call.tool_id.replace(/\./g, '_'),
        arguments: JSON.stringify(call.input),
      },
    };
  }
  
  private serializeToolResult(result: ToolResult): string {
    if (result.status === 'success') {
      return JSON.stringify(result.output);
    }
    return JSON.stringify({ error: result.error });
  }
}
```

### Capability

```typescript
supportsExtendedThinking() { return false; }   // o1 reasoning 은 별개 (나중에 구분)
supportsPromptCaching() { return false; }      // OpenAI 의 cache 는 자동 (제어 X)
maxContextTokens() { return 256_000; }         // GPT-5.5 / 4.1 등
```

---

## Provider 변경 (메시지마다)

```
Codex UI 패턴:
  Turn 1 → 모델: GPT-5.5
  Turn 2 → 모델: Claude Sonnet 4.6 (드롭다운에서 변경)
  Turn 3 → 모델: GPT-5.5 mini

→ Session schema 자체는 변경 X
→ turn.model 필드만 다름
→ AI 호출 시 turn.model 따라 적절한 adapter 선택
```

### 호출 라우팅

```typescript
async function callAI(session: Session, newTurn: Turn): Promise<Turn> {
  const model = newTurn.model ?? session.conversation.current_model;
  const provider = inferProvider(model);  // "gpt-*" → 'codex', "claude-*" → 'claude'
  
  const adapter = ADAPTERS[provider];
  
  // 변환
  const messages = adapter.toProviderMessages(session.conversation.turns);
  const tools = adapter.toProviderTools(toolRegistry.list());
  const config = adapter.toProviderConfig(newTurn);
  
  // API 호출
  const response = await provider.api.chat({ messages, tools, ...config });
  
  // 역변환
  const { new_turn } = adapter.fromProviderResponse(response);
  
  return new_turn;
}
```

---

## Tool 호환성 매트릭스

```
Codex Plugin     → 우리 Tool        → Claude MCP equivalent
─────────────────────────────────────────────────────
browser-use      → BROWSER tools    → playwright-mcp
shell (built-in) → SHELL tools      → bash MCP
filesystem (built)→ FS tools        → filesystem-mcp
custom-skill     → SKILL tools      → claude-skill (anthropic)
mcp-* server     → MCP bridge       → MCP server (직접)

Claude only:
  thinking         → 우리 schema 에선 Turn.metadata.thinking 으로 저장
  prompt_cache     → 자동 (사용자 보임 X)

Codex only:
  /플랜 모드       → PlanState (일반 추상화)
  /속도형          → Turn.effort
  사이드 채팅     → 부모-자식 Session 관계
```

---

## 메시지마다 다른 모델 = 컨텍스트 호환

```
문제:
  Turn 1: Claude 응답 (extended thinking 블록 포함)
  Turn 2: GPT-5.5 호출 시 thinking 블록 어떻게 보내야?
```

### 해결책: Adapter 가 dropping

```typescript
class CodexAdapter {
  toOpenAIMessage(turn: Turn): OpenAIMessage {
    // Claude 의 thinking 블록은 OpenAI 에 보낼 때 drop
    const filteredContent = turn.content.filter(b => 
      b.type !== 'thinking'  // OpenAI 모름
    );
    
    return {
      role: turn.role,
      content: filteredContent.map(...)
    };
  }
}
```

```typescript
class ClaudeAdapter {
  toClaudeMessage(turn: Turn): ClaudeMessage {
    // OpenAI 의 reasoning 도 Claude 에선 metadata.openai_reasoning 에 보존
    // 메시지 본문엔 포함 X
    return {
      role: turn.role,
      content: turn.content.map(this.toClaudeContent),  // metadata 제외
    };
  }
}
```

→ **정보 손실은 필연** (provider 별 unique feature 는 전송 불가). 하지만 **저장은 모두**.

---

## API Key / 인증

```typescript
interface ProviderAuth {
  provider: 'claude' | 'codex';
  
  // 1순위: CLI 인증 위임 (claude / codex CLI 가 이미 로그인됨)
  use_cli_auth?: boolean;
  cli_path?: AbsolutePath;
  
  // 2순위: 사용자 API key (settings 에서)
  api_key?: string;       // ⚠ 메모리만 저장. 디스크 저장 X
  api_key_env?: string;   // 환경 변수 이름 (e.g., "ANTHROPIC_API_KEY")
  
  // 3순위: OAuth (Phase 2+)
  oauth_token?: string;
}
```

### 키 저장 정책

```
✓ OS keychain 활용 (macOS Keychain / Windows Credential Manager)
✓ 환경 변수 참조
✗ 평문 disk 저장 (절대)
✗ DB 저장 (DPAPI 도 X — 사용자 키 노출 위험)
```

---

## 검증 (Invariants)

```
INV-1: ADAPTERS['claude'] 와 ADAPTERS['codex'] 모두 ProviderAdapter 구현
INV-2: 같은 Turn 을 toProviderMessages → fromProviderResponse 왕복해도 정보 보존 (best effort)
INV-3: model 추론 정확 (model name → provider mapping)
INV-4: 양 provider 모두 maxContextTokens() 안에 메시지 fit (자동 truncation)
INV-5: API key 는 메모리만 (process exit 시 소실)
```

---

## Phase 1 우선순위

```
P0 (MVP):
  ✓ ClaudeAdapter 기본 (text + tool_use)
  ✓ CodexAdapter 기본 (text + function_call)
  ✓ 모델 → provider 자동 라우팅
  ✓ CLI 인증 위임

P1:
  - Streaming (SSE 파싱)
  - Image 입력 (양쪽 모두 지원)
  - Extended thinking (Claude 만)
  - Prompt caching (Claude 만)

P2+:
  - Provider 별 cost tracking
  - 모델 자동 추천 ("이 작업엔 Claude 가 나아요")
  - Cross-provider A/B 비교
```

---

## 관련

- [conversation.md](./conversation.md) — Turn / ContentBlock 정의
- [schema.md](./schema.md) — Session.provider 필드
- [TOOL_ORCHESTRATION.md](../../TOOL_ORCHESTRATION.md) — Provider adapter 가 tools 도 변환
- [CLI_INTEGRATION.md](../../CLI_INTEGRATION.md) — claude/codex CLI 위임 상세
