---
title: Permission Model — Provider 통합 (Codex / Claude)
parent: ./_index.md
related:
  - ./levels.md
  - ./capabilities.md
status: draft
last_updated: 2026-05-02
---

# Provider Permission Mapping

> **한 줄 요약**: Codex 3-tier sandbox + Claude Code hooks → 우리 4단계 level 매핑.

---

## Codex sandbox 와 매핑

```
Codex 3-tier              ↔  Dreampia-Dev Level
─────────────────────────────────────────────
read-only                  →  Level 1 (read_only)
workspace-write            →  Level 2 (workspace_write)
full-access                →  Level 3 (full_access)
                           +  Level 4 (custom — Codex 미지원)
```

### Codex sandbox 호출 시

```typescript
class CodexSandbox {
  // codex CLI 호출 시 sandbox 모드 매핑
  toCodexSandboxMode(level: PermissionLevel): CodexSandboxMode {
    switch (level) {
      case 'read_only':       return 'read-only';
      case 'workspace_write': return 'workspace-write';
      case 'full_access':     return 'full-access';
      case 'custom':          return 'workspace-write';  // 가장 가까운 옵션
    }
  }
  
  buildCommand(session: Session, prompt: string): string[] {
    const sandboxMode = this.toCodexSandboxMode(session.permission.default_level);
    
    return [
      'codex',
      '--sandbox', sandboxMode,
      '--config', JSON.stringify(this.toCodexConfig(session)),
      'exec', prompt,
    ];
  }
}
```

### Codex config.toml 변환 (Level 4)

```typescript
function toCodexConfigToml(grants: PermissionGrant[]): string {
  const config = {
    sandbox_mode: 'custom',
    permissions: {
      file_read: extractFileReadPaths(grants),
      file_write: extractFileWritePaths(grants),
      shell_exec: extractShellPolicies(grants),
      network: extractNetworkPolicies(grants),
    },
  };
  
  return tomlStringify(config);
}

function extractFileReadPaths(grants: PermissionGrant[]): string[] {
  return grants
    .filter(g => g.capability.startsWith('LOCAL_READ'))
    .filter(g => !isExpired(g))
    .map(g => g.target.path!);
}
```

---

## Claude Code hooks 와 매핑

Claude Code 의 hooks 시스템 활용:

```
Claude Code hooks         ↔  Dreampia-Dev integration
────────────────────────────────────────────────────
PreToolUse                 →  isAllowed() 체크 + grant 자동 생성
PostToolUse                →  audit.log('use', {...})
Notification               →  사용자 UI toast/modal
SubagentStop               →  세션 lifecycle 이벤트
```

### PreToolUse hook (자동 권한 체크)

```typescript
// .claude/settings.json (Dreampia-Dev 자동 생성)
{
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "*",
        "hooks": [
          {
            "type": "command",
            "command": "dreampia-dev hooks pre-tool-use --session-id $DREAMPIA_SESSION_ID"
          }
        ]
      }
    ],
    "PostToolUse": [
      {
        "matcher": "*",
        "hooks": [
          {
            "type": "command",
            "command": "dreampia-dev hooks post-tool-use --session-id $DREAMPIA_SESSION_ID"
          }
        ]
      }
    ]
  }
}
```

### Hook handler (Dreampia-Dev CLI)

```typescript
// dreampia-dev hooks pre-tool-use
async function handlePreToolUseHook() {
  const stdin = await readStdin();
  const event = JSON.parse(stdin);
  
  const { tool_name, tool_input, session_id } = event;
  
  // Tool name → capability 추론
  const capability = mapClaudeToolToCapability(tool_name);
  const target = extractTargetFromInput(tool_input);
  
  const decision = await isAllowed(capability, target, session_id);
  
  if (!decision.allowed) {
    // Hook 의 deny 응답
    return process.stdout.write(JSON.stringify({
      decision: 'deny',
      reason: decision.reason,
      message: decision.hint,
    }));
  }
  
  // Hook 의 allow 응답
  process.stdout.write(JSON.stringify({
    decision: 'allow',
  }));
}

function mapClaudeToolToCapability(toolName: string): Capability {
  const mapping: Record<string, Capability> = {
    'Read': 'LOCAL_READ',
    'Write': 'LOCAL_WRITE.create',
    'Edit': 'LOCAL_WRITE.modify',
    'Bash': 'LOCAL_EXECUTE',
    'WebFetch': 'NETWORK_REMOTE.read',
    // ...
  };
  return mapping[toolName] ?? 'PLUGIN_EXECUTE';
}
```

---

## CLI 위임 vs API 직접 호출

```
선택 1: CLI 위임 (권한 더블체크)
  Dreampia-Dev → claude/codex CLI → AI API
  
  ✓ CLI 자체 sandbox 활용
  ✓ 사용자 인증 위임 (API key 노출 X)
  ✓ Hooks 통합 자연스러움
  ✗ Stream parsing 복잡
  ✗ subprocess 오버헤드

선택 2: API 직접 호출
  Dreampia-Dev → AI API
  
  ✓ Streaming 효율
  ✓ 더 정밀한 제어
  ✗ 권한 모두 우리가 책임
  ✗ API key 관리 직접
```

### 결정 (Phase 1)

```
Phase 1: CLI 위임 (안전)
  - codex CLI: --sandbox 매핑
  - claude CLI: hooks 활용
  
Phase 2+: 옵션화
  - 사용자가 선택 (CLI / API)
  - API 모드는 더 빠른 응답 + 더 많은 책임
```

---

## Provider 별 capability 차이

```
                            Claude    Codex
                            ──────    ─────
File read                    ✓        ✓
File write                   ✓        ✓
Shell execute                ✓        ✓
Browser navigation           hooks     iab
Browser interaction           ✗        iab
Browser screenshot           hooks     iab
DOM read                      ✗        iab
External HTTP                ✓        ✓
MCP servers                  ✓        ✓
Skills                       ✓        ✓ (.codex-plugin)
Plugins                       ✗        ✓
Sub-agents                   ✓        ✓
Sandbox 3-tier                ✗        ✓
Hooks                        ✓        ✗
URL scheme                    ✗        codex://
```

→ 통합 GUI 에서는 **공통 부분 우선** + **각 provider 의 unique feature 는 metadata 로 보존**.

---

## Cross-provider sync (MCP 한 번 설정)

```
사용자: 새 MCP 서버 추가 ("filesystem-mcp")
   ↓
Dreampia-Dev: 양쪽 provider 에 동기화
   ↓
   ├─ Claude: ~/.claude/mcp.json 갱신
   ├─ Codex: ~/.codex/mcp.json 갱신
   └─ Dreampia-Dev DB: 등록
   ↓
양쪽 provider 가 같은 MCP 서버 사용
```

### Dreampia-Dev 의 MCP 통합 형식

```typescript
interface UnifiedMcpServer {
  id: string;
  name: string;
  type: 'stdio' | 'http';
  
  // 공통
  command?: string;
  args?: string[];
  env?: Record<string, string>;
  url?: string;
  
  // Provider 별 활성화
  enabled_in: ('claude' | 'codex' | 'dreampia')[];
  
  // Permission 매핑
  declared_capabilities: Capability[];
  
  // 메타
  source: 'user' | 'plugin' | 'builtin';
  created_at: ISO8601;
}
```

---

## Codex `runFullTrust` capability 와 우리 모델

```
Codex MSIX manifest:
  <rescap:Capability Name="runFullTrust" />
  → MS Store 승인 필요

Dreampia-Dev MSIX 도 runFullTrust 필요? 
  Yes (Win32 API + native modules + child process spawn 필요)
  → MSIX Trusted Signing 으로 서명
  → Microsoft Partner Center 승인 받기
```

**중요**: `runFullTrust` 가 OS 에 부여되어도, 우리 앱 **내부**의 권한 모델은 별개.
- OS 가 허용 = 앱이 시스템 API 호출 가능
- 우리 모델 = 앱이 AI 에게 그 API 사용 허용 여부

→ OS-level full trust ≠ AI-level full access.

---

## 검증 (Invariants)

```
INV-1: Codex sandbox mode 매핑은 deterministic (level → mode 1:1)
INV-2: Claude hook handler 는 isAllowed() 결과 그대로 응답
INV-3: MCP 서버 등록 시 양쪽 provider 동기화 (atomic)
INV-4: API key 는 plain text 디스크 저장 X (provider mapping 시도 OS keychain)
INV-5: CLI 위임 모드에서도 audit.log 호출 (subprocess 의 권한 사용도 추적)
```

---

## 관련

- [levels.md](./levels.md) — 4단계 level
- [capabilities.md](./capabilities.md) — capability 정의
- [CLI_INTEGRATION.md](../../CLI_INTEGRATION.md) — CLI 매핑 상세
- [docs/session/cross-ai-sync.md](../session/cross-ai-sync.md) — 메시지 변환
