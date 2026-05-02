---
title: Tool Orchestration — Conflict Resolution
parent: ./_index.md
related:
  - ./registry.md
  - ./categories.md
status: draft
last_updated: 2026-05-02
---

# Conflict Resolution

> **한 줄 요약**: 같은 ToolId 가 여러 source 에서 등록 시 우선순위 결정.

---

## 충돌 발생 시나리오

```
1. Plugin A 와 B 가 모두 "shell.run" 등록
2. Built-in shell.run 과 MCP 서버의 shell tool
3. Built-in fs.read 와 사용자 자체 plugin 의 fs.read
```

---

## 우선순위 (Priority Order)

```
1. 사용자 명시 선호 (settings.tool_preferences[id])
2. Source 우선순위:
     builtin > mcp > plugin > skill > agent
3. 더 높은 버전 (semver)
4. 최근 설치된 것 (installed_at)
```

---

## ConflictResolver

```typescript
class ConflictResolver {
  resolve(existing: Tool, incoming: Tool): Tool {
    // 1. 사용자 명시 선호
    const userPref = settings.tool_preferences[existing.id];
    if (userPref) {
      if (userPref.source === existing.source) return existing;
      if (userPref.source === incoming.source) return incoming;
    }
    
    // 2. Source 우선순위
    const sourceOrder: Record<ToolSource, number> = {
      builtin: 1,
      mcp: 2,
      plugin: 3,
      skill: 4,
      agent: 5,
    };
    
    const existingOrder = sourceOrder[existing.source];
    const incomingOrder = sourceOrder[incoming.source];
    
    if (existingOrder !== incomingOrder) {
      return existingOrder < incomingOrder ? existing : incoming;
    }
    
    // 3. 같은 source 면 더 높은 버전
    if (semver.gt(incoming.version, existing.version)) {
      return incoming;
    }
    
    // 4. 같은 버전이면 최근 설치
    return getInstalledAt(incoming) > getInstalledAt(existing) ? incoming : existing;
  }
}
```

---

## 등록 시 처리

```typescript
class ToolRegistry {
  register(tool: Tool): void {
    const existing = this.tools.get(tool.id);
    
    if (!existing) {
      this.tools.set(tool.id, tool);
      this.indexBySource(tool);
      eventBus.emit('tool:registered', { tool });
      return;
    }
    
    // 충돌
    const winner = ConflictResolver.resolve(existing, tool);
    
    if (winner === tool) {
      // 새 tool 이김
      this.unregister(existing.id);
      this.tools.set(tool.id, tool);
      this.indexBySource(tool);
      
      eventBus.emit('tool:replaced', { 
        oldTool: existing, 
        newTool: tool,
        reason: explainResolution(existing, tool),
      });
    } else {
      // 기존 tool 유지
      eventBus.emit('tool:duplicate', { 
        existing, 
        rejected: tool,
        reason: explainResolution(existing, tool),
      });
    }
  }
}

function explainResolution(a: Tool, b: Tool): string {
  // 사용자에게 보여줄 사유
  if (a.source !== b.source) {
    return `${a.source} 가 ${b.source} 보다 우선`;
  }
  if (semver.gt(a.version, b.version)) {
    return `버전 ${a.version} > ${b.version}`;
  }
  return `먼저 등록됨`;
}
```

---

## UI: 충돌 발생 시

```
┌──────────────────────────────────────────────┐
│ ⚠ 도구 ID 충돌                               │
├──────────────────────────────────────────────┤
│ "shell.run" 이 두 곳에서 등록됨:             │
│                                              │
│ ✓ Built-in (활성)                            │
│   v1.0.0, "Shell 명령 실행"                   │
│                                              │
│ ✗ Plugin: my-shell-plugin (비활성)           │
│   v0.5.2, "Custom shell wrapper"             │
│                                              │
│ 어떤 것을 사용할까요?                         │
│   ◉ Built-in (권장)                          │
│   ○ Plugin                                   │
│   ○ 둘 다 활성 (다른 ID 부여)                 │
│                                              │
│ ☐ 같은 충돌 다시 묻지 말기                    │
│                                              │
│ [취소] [저장]                                 │
└──────────────────────────────────────────────┘
```

---

## "둘 다 활성" 옵션

같은 기능이지만 다른 source 의 tool 모두 사용:

```typescript
// 사용자가 "둘 다 활성" 선택 시:
// → namespace 자동 부여
//   "shell.run" (built-in 유지)
//   "shell.run.plugin-id" (plugin)

function disambiguate(existing: Tool, incoming: Tool): { existing: ToolId; incoming: ToolId } {
  return {
    existing: existing.id,                       // 변경 X
    incoming: `${incoming.id}.${incoming.source_id ?? 'plugin'}`,
  };
}
```

---

## 사용자 preference 저장

```typescript
// settings.json
{
  "tool_preferences": {
    "shell.run": {
      "source": "builtin",            // 우선
      "version": "1.0.0",
      "set_at": "2026-05-02T...",
      "set_by": "user_choice"          // user_choice / auto / migration
    }
  }
}
```

UI:
```
설정 → 도구 → 충돌 해결:

┌────────────────────────────────────────────┐
│ Tool ID         선호 출처     변경         │
├────────────────────────────────────────────┤
│ shell.run       Built-in      [재설정]     │
│ fs.read         Built-in      [재설정]     │
│ browser.run     Plugin        [재설정]     │
└────────────────────────────────────────────┘
```

---

## 마이그레이션 시 충돌

새 버전 앱이 built-in tool 을 새로 추가했는데 사용자가 같은 ID plugin 을 쓰고 있는 경우:

```typescript
async function handleMigrationConflict() {
  const newBuiltins = getNewBuiltinsInThisVersion();
  
  for (const builtin of newBuiltins) {
    const userPlugin = registry.get(builtin.id);
    
    if (userPlugin && userPlugin.source !== 'builtin') {
      // 사용자에게 알림
      await showNotification({
        title: '새 built-in tool 추가',
        body: `${builtin.id} 가 built-in 으로 추가됐습니다. 현재 사용 중인 ${userPlugin.source} 와 충돌. 어떻게 처리?`,
        actions: ['Built-in 사용', '기존 유지'],
      });
    }
  }
}
```

---

## 검증 (Invariants)

```
INV-1: 충돌 해결 후 같은 ID 의 tool 은 정확히 1개 활성
INV-2: 사용자 preference 가 source 우선순위 override
INV-3: replaced/duplicate 이벤트는 항상 explain 사유 포함
INV-4: "둘 다 활성" 옵션 시 ID 자동 disambiguation
INV-5: 마이그레이션 충돌은 사용자 알림 후 처리 (silent X)
```

---

## 관련

- [registry.md](./registry.md) — register() 안의 호출
- [categories.md](./categories.md) — source 종류
- [plugin-loader.md](./plugin-loader.md) — plugin 충돌 케이스
