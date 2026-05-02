---
title: Tool Orchestration — Registry
parent: ./_index.md
related:
  - ./categories.md
  - ./conflict-resolution.md
status: draft
last_updated: 2026-05-02
---

# Tool Registry

> **한 줄 요약**: 모든 tool 의 단일 등록소. AI 에게 description 제공.

---

## ToolRegistry

```typescript
class ToolRegistry {
  private tools = new Map<ToolId, Tool>();
  private bySource = new Map<string, Tool[]>();   // built-in/mcp/plugin/skill/agent
  
  register(tool: Tool): void {
    if (this.tools.has(tool.id)) {
      throw new Error(`Tool ${tool.id} already registered`);
    }
    this.tools.set(tool.id, tool);
    this.indexBySource(tool);
    
    // 이벤트 발행 (UI 갱신용)
    eventBus.emit('tool:registered', { tool });
  }
  
  unregister(toolId: ToolId): void {
    const tool = this.tools.get(toolId);
    if (!tool) return;
    
    this.tools.delete(toolId);
    this.removeFromSource(tool);
    
    eventBus.emit('tool:unregistered', { toolId });
  }
  
  get(toolId: ToolId): Tool | undefined {
    return this.tools.get(toolId);
  }
  
  list(filter?: ListFilter): Tool[] {
    let result = Array.from(this.tools.values());
    
    if (filter?.source) {
      result = result.filter(t => t.source === filter.source);
    }
    
    if (filter?.capability) {
      result = result.filter(t => 
        t.required_capabilities({}).includes(filter.capability!)
      );
    }
    
    return result;
  }
  
  // Tool discovery for AI
  describeForAI(): ToolDescription[] {
    return Array.from(this.tools.values())
      .filter(t => !t.optional)
      .map(t => ({
        id: t.id,
        description: t.display.name,
        input_schema: t.input_schema,
      }));
  }
  
  private indexBySource(tool: Tool) {
    const list = this.bySource.get(tool.source) ?? [];
    list.push(tool);
    this.bySource.set(tool.source, list);
  }
  
  private removeFromSource(tool: Tool) {
    const list = this.bySource.get(tool.source) ?? [];
    this.bySource.set(tool.source, list.filter(t => t.id !== tool.id));
  }
}
```

---

## 등록 시점

```
앱 시작 →
  1. Built-in tools 등록 (코드에서 직접)
  2. MCP servers connect → MCP tools 등록
  3. Plugin manifests 로드 → Plugin tools 등록
  4. Skills discover → Skill tools 등록
  5. User-defined agents → Agent tools 등록

새 tool 등록 시:
  - input/output schema 검증
  - id 충돌 체크 (conflict-resolution.md)
  - capabilities 검증
```

---

## describeForAI - AI 용 변환

각 provider 별로 다른 형식:

```typescript
// Claude API 형식
function toClaudeTool(tool: Tool): ClaudeTool {
  return {
    name: tool.id.replace(/\./g, '_'),
    description: tool.display.name,
    input_schema: tool.input_schema,
  };
}

// OpenAI 형식
function toOpenAIFunction(tool: Tool): OpenAIFunction {
  return {
    type: 'function',
    function: {
      name: tool.id.replace(/\./g, '_'),
      description: tool.display.name,
      parameters: tool.input_schema,
    },
  };
}
```

### Tool 이름 sanitization

```typescript
// Codex/OpenAI 는 dot 허용 X → underscore 로
function sanitizeToolName(id: ToolId): string {
  return id.replace(/\./g, '_');
}

// 역변환 (AI 응답 파싱)
function unsanitizeToolName(name: string): ToolId {
  return name.replace(/_/g, '.');
}

// 예시:
//   "shell.run" → "shell_run" → AI 호출 → "shell.run"
```

---

## Tool list 필터링 (AI 컨텍스트 최적화)

```typescript
// AI 에게 모든 tool 을 매번 줄 필요 X
// 컨텍스트에 맞는 tool 만 선별

function pickToolsForContext(session: Session): Tool[] {
  const all = registry.list();
  
  // 1. 권한 가능한 것만
  const allowed = all.filter(tool => {
    const caps = tool.required_capabilities({});
    return caps.every(cap => 
      isAllowedByLevel(cap, session.permission.default_level)
    );
  });
  
  // 2. 컨텍스트 관련 (예: 브라우저 안 열렸으면 browser.* 제외)
  const contextual = allowed.filter(tool => {
    if (tool.id.startsWith('browser.') && session.browser.tabs.length === 0) {
      return false;  // 브라우저 안 쓰면 표시 X
    }
    return true;
  });
  
  // 3. Top-K (너무 많으면 AI 가 헷갈림)
  return contextual.slice(0, 50);  // 50개 cap
}
```

---

## Lazy registration

```typescript
// 자주 안 쓰이는 tool 은 lazy 등록
class LazyToolRegistry extends ToolRegistry {
  private factories = new Map<ToolId, () => Promise<Tool>>();
  
  registerFactory(toolId: ToolId, factory: () => Promise<Tool>) {
    this.factories.set(toolId, factory);
  }
  
  async get(toolId: ToolId): Promise<Tool | undefined> {
    const existing = super.get(toolId);
    if (existing) return existing;
    
    // 아직 인스턴스 X
    const factory = this.factories.get(toolId);
    if (factory) {
      const tool = await factory();
      this.register(tool);
      return tool;
    }
    
    return undefined;
  }
}
```

---

## Tool metadata 보강

```typescript
// 사용 통계
interface ToolUsageStats {
  tool_id: ToolId;
  call_count: number;
  success_count: number;
  fail_count: number;
  avg_duration_ms: number;
  last_used_at: ISO8601;
}

function getStats(toolId: ToolId): ToolUsageStats {
  return db.prepare(`
    SELECT 
      ? AS tool_id,
      COUNT(*) AS call_count,
      SUM(CASE WHEN status = 'success' THEN 1 ELSE 0 END) AS success_count,
      SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) AS fail_count,
      AVG(duration_ms) AS avg_duration_ms,
      MAX(completed_at) AS last_used_at
    FROM tool_results
    WHERE tool_id = ?
  `).get(toolId, toolId);
}
```

---

## UI: Tool 목록 표시

```
설정 → 도구:

┌─────────────────────────────────────────────────────┐
│ 사용 가능한 도구 (40개)              [필터▼]        │
├─────────────────────────────────────────────────────┤
│ Built-in (10)                                       │
│   ⚙ shell.run            Shell 명령 실행            │
│      87 calls (3 failed)  평균 1.2초                │
│   📄 fs.read              파일 읽기                  │
│   ✏ fs.write              파일 쓰기                  │
│   ...                                               │
│                                                     │
│ MCP Servers (4)                                     │
│   📦 mcp.omx_code_intel.* 8 tools                   │
│   📦 mcp.omx_memory.*     5 tools                   │
│   ...                                               │
│                                                     │
│ Plugins (2)                                         │
│   🌐 browser-use.*        12 tools                  │
│   📐 latex-tectonic.*     3 tools                   │
└─────────────────────────────────────────────────────┘
```

---

## 검증 (Invariants)

```
INV-1: 같은 ToolId 두 번 등록 X (conflict-resolution.md 거쳐야)
INV-2: unregister 후 즉시 list() 에서 제외
INV-3: source 별 인덱스 일관성
INV-4: describeForAI 는 사용자 비활성화 tool 제외
INV-5: 사용자가 비활성화한 tool 은 AI 에게 노출 X
```

---

## 관련

- [categories.md](./categories.md) — Tool 종류
- [conflict-resolution.md](./conflict-resolution.md) — id 충돌
- [provider-adapters.md](./provider-adapters.md) — describeForAI 활용
