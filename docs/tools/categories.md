---
title: Tool Orchestration — Tool Categories
parent: ./_index.md
related:
  - ./interface.md
  - ./registry.md
status: draft
last_updated: 2026-05-02
---

# Tool Categories

> **한 줄 요약**: 5가지 source. Built-in / MCP / Plugin / Skill / Agent.

---

## 5가지 source

```typescript
type ToolSource = 'builtin' | 'mcp' | 'plugin' | 'skill' | 'agent';
```

| Source | 출처 | 등록 시점 | 예시 |
|--------|------|----------|------|
| `builtin` | 코드에 hardcoded | 앱 시작 시 | `shell.run`, `fs.read` |
| `mcp` | MCP 서버 | 서버 connect 시 | `mcp.filesystem.list` |
| `plugin` | plugin.json | 플러그인 로드 시 | `browser-use.navigate` |
| `skill` | SKILL.md | 스킬 로드 시 | `skill.code-review` |
| `agent` | @멘션 에이전트 | 사용자 정의 | `agent.Analyst` |

---

## Built-in Tools (10가지 핵심)

```
1. shell.run            shell 명령 실행
2. shell.spawn          백그라운드 프로세스
3. fs.read              파일 읽기
4. fs.write             파일 쓰기
5. fs.list              디렉토리 나열
6. fs.search            grep / ripgrep
7. browser.navigate     URL 이동
8. browser.interact     클릭 / 타이핑
9. browser.screenshot   스크린샷
10. browser.dom_dump    DOM 추출
```

### 매트릭스

| Tool ID | Capabilities | Idempotent | Default timeout |
|---------|-------------|------------|----------------|
| `shell.run` | LOCAL_EXECUTE | ✗ | 30s |
| `shell.spawn` | LOCAL_EXECUTE.background | ✗ | none (long) |
| `fs.read` | LOCAL_READ | ✓ | 5s |
| `fs.write` | LOCAL_WRITE | ✗ | 5s |
| `fs.list` | LOCAL_READ | ✓ | 5s |
| `fs.search` | LOCAL_READ | ✓ | 30s |
| `browser.navigate` | BROWSER_NAVIGATE | ✓ | 30s |
| `browser.interact` | BROWSER_INTERACT | ✗ | 10s |
| `browser.screenshot` | BROWSER_SCREENSHOT | ✓ | 10s |
| `browser.dom_dump` | BROWSER_DOM_READ | ✓ | 10s |

### 더 많은 built-in (Phase 2+)

```
shell.kill              프로세스 종료
fs.delete               파일 삭제 (★ 모달)
fs.move                 파일 이동
git.status              git 상태
git.diff                diff 보기
git.commit              커밋 (★ 모달)
http.get                HTTP GET
http.post               HTTP POST (★ 모달)
clipboard.read
clipboard.write
notification.show
```

---

## MCP Tools

MCP 서버의 tools/list 응답 → 자동 등록.

### Naming
```
"filesystem-mcp" 서버의 "list_files" tool
  → ToolId: "mcp.filesystem-mcp.list_files"

Provider 별 표시 (Claude API 호환):
  → "mcp_filesystem-mcp_list_files" (underscore 변환)
```

### Capability 매핑

```typescript
class McpServerConfig {
  // 서버 등록 시 사용자가 명시
  declared_capabilities: Capability[];
  
  // 모든 MCP tool 은 NETWORK_MCP 자동 추가
  toToolCapabilities(): Capability[] {
    return ['NETWORK_MCP', ...this.declared_capabilities];
  }
}
```

### MCP tools 출처 신뢰도

```
신뢰도 기준:
  ✓ 사용자 직접 등록한 MCP 서버 → 신뢰
  △ Codex omx_* 같은 사전 설치 → 검증 후 신뢰
  ✗ 알 수 없는 출처 → 추가 confirm 모달
```

---

## Plugin Tools

`plugin.json` 의 capabilities + skills 폴더 → tool 등록.

### Codex plugin.json 예시

```json
{
  "name": "browser-use",
  "interface": {
    "displayName": "Browser Use",
    "capabilities": ["Interactive", "Read", "Write"],
    "defaultPrompt": ["Test my checkout flow on localhost"]
  },
  "skills": "./skills/"
}
```

### 변환

```typescript
function pluginCapabilityToOurs(plugin: 'Read' | 'Write' | 'Interactive'): Capability[] {
  switch (plugin) {
    case 'Read':        return ['LOCAL_READ', 'BROWSER_DOM_READ'];
    case 'Write':       return ['LOCAL_WRITE'];
    case 'Interactive': return ['BROWSER_INTERACT', 'BROWSER_NAVIGATE'];
  }
}
```

### Tool 등록

```typescript
class PluginTool implements Tool {
  source = 'plugin' as const;
  plugin_id: string;
  skill_path?: string;
  
  declared_capabilities: ('Read' | 'Write' | 'Interactive')[];
}
```

---

## Skill Tools

SKILL.md 기반 도구 (Anthropic Skills + Codex Atlas).

### SKILL.md 형식

```yaml
---
name: browser
description: "Browser automation for the Codex in-app browser..."
---

# Browser

[AI 행동 지침]
- "MUST read this entire SKILL.md file in one read"
- Bootstrap 코드 (setupAtlasRuntime)
- node_repl 통합 패턴
```

### Tool 변환

```typescript
class SkillTool implements Tool {
  source = 'skill' as const;
  
  // SKILL.md 메타
  skill_md_path: AbsolutePath;
  bootstrap_code?: string;             // Atlas runtime setup
  
  // 사용 시 SKILL.md 전체 로드 후 실행
  load_skill_first: true;              // 항상 true
  
  // 실행 시 흐름:
  //   1. SKILL.md 전체 AI 에 전달
  //   2. AI 가 지침 따라 실행
  //   3. 결과 캡처
}
```

### vs Plugin

```
Plugin:
  - 코드 + 매니페스트 (.codex-plugin/plugin.json)
  - 자체 binary (예: tectonic.exe) 가능
  - 여러 skill 묶음

Skill:
  - 단일 .md 파일 + 보조 스크립트
  - AI 가 읽고 행동
  - 더 가벼움
```

---

## Agent Tools

@멘션 으로 부르는 에이전트 = Tool 의 한 종류.

```typescript
interface AgentTool extends Tool {
  source = 'agent' as const;
  
  // Agent 메타
  agent_id: string;                    // "Analyst", "Architect"
  agent_model: string;                 // 어떤 모델 쓸지
  agent_system_prompt: string;         // 에이전트 system prompt
  
  // Sub-tools
  available_tools: ToolId[];           // agent 가 쓸 수 있는 도구
}
```

### Agent 호출 흐름

```
사용자: "@Analyst 이 코드 검토해줘"
   ↓
@멘션 파싱 → AgentTool 식별
   ↓
AgentTool.execute({ task: "이 코드 검토" }):
  1. agent_system_prompt 로 새 sub-conversation 시작
  2. agent_model 로 AI 호출
  3. available_tools 만 사용 가능
  4. 결과 = sub-conversation 의 마지막 응답
   ↓
ToolResult 로 메인 대화에 결과 반환
```

### Agent vs 일반 tool

```
일반 tool (예: shell.run):
  - 결정론적 (같은 입력 = 같은 출력)
  - 빠름
  - 권한 명확

Agent tool (예: @Analyst):
  - 비결정론적 (AI 가 매번 다른 응답)
  - 느림 (AI 호출 시간)
  - 권한 = sub-tools 의 합집합
```

---

## Source 별 lifecycle

```
[builtin]
  앱 시작 → 등록
  앱 종료 → 해제

[mcp]
  서버 spawn → handshake → tools/list → 등록
  서버 disconnect → 해제

[plugin]
  플러그인 활성화 → manifest 로드 → skills 로드 → 등록
  플러그인 비활성화 → 해제

[skill]
  스킬 활성화 → SKILL.md 검증 → 등록 (lazy)
  스킬 사용 시 → SKILL.md 전체 로드
  스킬 비활성화 → 해제

[agent]
  사용자 정의 → 등록 (앱 시작 시 또는 즉시)
  사용자 삭제 → 해제
```

---

## 모든 source 의 Tool 등록은 Registry 통해

```typescript
// Built-in
registry.register(FsReadTool);

// MCP
const mcpServer = await McpClient.connect(serverConfig);
const mcpTools = await mcpServer.listTools();
for (const t of mcpTools) {
  registry.register(new McpToolBridge(mcpServer, t.name, t.schema));
}

// Plugin
const plugin = await PluginLoader.load(pluginPath);
for (const skill of plugin.skills) {
  registry.register(new SkillTool(plugin, skill));
}

// Agent
registry.register(new AgentTool({
  id: 'agent.Analyst',
  agent_model: 'claude-opus-4-7',
  agent_system_prompt: '...',
  available_tools: ['fs.read', 'fs.search'],
}));
```

상세: [registry.md](./registry.md).

---

## 검증 (Invariants)

```
INV-1: Tool.source 가 'mcp' 면 source_id 존재 (서버 이름)
INV-2: Tool.source 가 'plugin' 면 plugin_id 매핑 (PluginTool)
INV-3: Tool.source 가 'skill' 면 skill_md_path 존재
INV-4: Tool.source 가 'agent' 면 agent_model 명시
INV-5: 같은 ToolId 가 여러 source 에서 등록 시 conflict-resolution 적용
```

---

## 관련

- [interface.md](./interface.md) — Tool 인터페이스
- [registry.md](./registry.md) — 등록 메커니즘
- [conflict-resolution.md](./conflict-resolution.md) — 같은 id 충돌
- [mcp-bridge.md](./mcp-bridge.md) — MCP 통합 상세
- [plugin-loader.md](./plugin-loader.md) — Plugin/Skill 로드
