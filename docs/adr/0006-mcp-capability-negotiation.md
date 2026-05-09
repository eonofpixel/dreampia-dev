# ADR-0006 — MCP capability negotiation + marketplace foundations

> **Status**: Accepted (spec)
> **Date**: 2026-05-09
> **Phase**: post-v2.2.0 (MCP ecosystem 확장)
> **Authors**: Claude Code (Opus 4.7) — score-driven ralph 자율 land
> **Related**: [ADR-0003](0003-plugin-utility-process-isolation.md), [ADR-0004](0004-plugin-ipc-bridge.md), [v2.x-roadmap.md](../v2.x-roadmap.md)

---

## Context

Dreampia-Dev 의 MCP (Model Context Protocol) 통합은 현재 **server discovery
+ tool invocation** 만 cover (`src/main/mcp/`). v2.x post-Phase-D 에서 사용자
요구가 늘어나면서:

1. **사용자가 임의의 MCP server URL 추가** → 서버가 어떤 capability 를 제공
   하는지 사용자가 모름 → 무분별한 cap grant + audit trail 부재
2. **여러 MCP server 가 같은 tool_id 등록** 충돌 시 어느 것이 활성?
3. **MCP server marketplace** — 사용자가 검증된 server 를 발견할 path 부재
4. **Server-side update**: 사용자가 install 한 MCP server 가 새 capability
   요구하면 사용자 재컨펌 path 부재

본 ADR 은 MCP ecosystem 의 **capability negotiation contract** + **marketplace
foundation** spec — Plugin (ADR-0003/0004) 과 동일한 보안 패턴 적용.

## Decision

### 1. Capability declaration (server-side)

각 MCP server 는 자신의 manifest 에 capabilities 선언:

```json
{
  "name": "github-tools",
  "version": "1.2.3",
  "url": "stdio:// or https://...",
  "tools": [
    { "id": "github.list_repos", "capabilities": ["NETWORK_REMOTE", "GITHUB_API_READ"] },
    { "id": "github.create_pr", "capabilities": ["NETWORK_REMOTE", "GITHUB_API_WRITE"] }
  ],
  "host_requirements": ["NETWORK_REMOTE"],
  "publisher": "vendor-name",
  "signature": "..."  // 옵션 (Phase 2)
}
```

### 2. Capability negotiation (client-side)

McpManager 가 server install 시:
1. manifest fetch + parse + zod schema 검증 (fail-closed)
2. capability 목록 사용자에게 표시 (PluginCapabilityGate 와 동일 UI 패턴)
3. 사용자 결정 — once / session / always / deny per capability
4. 결정 결과를 `~/.dreampia/mcp/<server-id>/.granted.json` 영속 (PluginCapabilityGate
   pattern 재사용)

### 3. Tool conflict resolution

같은 `tool_id` 를 두 server 가 등록하면:
1. **First-wins** → 먼저 install 된 server 가 우선
2. **사용자 알림** → 충돌 시 toast + Settings UI 의 [MCP] 패널에 alert
3. **명시 disambiguation** → 사용자가 server 별 prefix (예: `github.list_repos@org`) 선택 가능

### 4. Server-side capability change

McpManager 가 server 의 capability 가 manifest version 변경 시 감지:
1. 현재 grant 된 capability 와 비교
2. 추가 capability 면 사용자 재컨펌 (toast + modal)
3. 제거된 capability 는 grant 자동 회수 (B3 `revokeOne`)

### 5. Marketplace foundation

**Phase 1 (v2.3.0)**: registry URL 정책만 정의
- official registry: `https://registry.dreampia.dev/mcp/` (proposed)
- community registry: 사용자가 임의 URL 등록 가능
- registry 응답 schema = list of MCP manifests + signature (옵션)

**Phase 2 (v2.4.0+)**: signed manifest verification
- ADR-0003 의 utility_process 격리 + ADR-0004 의 IPC bridge 와 동일 보안
  layer 적용
- Signed manifest = trusted publisher 별 verifiable
- 미검증 server 도 install 가능 (warning + extra cap-confirm step)

### 6. McpManager API additions

```typescript
class McpManager {
  // Phase 1
  fetchManifest(url: string): Promise<McpManifest>;
  validateCapabilities(manifest, granted): { granted: cap[], denied: cap[], requested: cap[] };
  registerWithCapabilities(manifest, decision: CapabilityDecisions): Promise<void>;
  resolveToolConflict(tool_id): { winner: server_id, conflicts: server_id[] };

  // Phase 2 (registry)
  searchRegistry(query: string, registry?: string): Promise<McpManifest[]>;
  verifySignature(manifest, publisher_key): boolean;
}
```

## Alternatives Considered

| 대안 | 검토 결과 |
|------|-----------|
| **자유 install (no capability check)** | ✗ 기각 — Plugin 격리 패턴 (ADR-0003/0004) 의 보안 model 과 inconsistent |
| **All capabilities granted by default** | ✗ 기각 — over-permissive, 사용자가 understand 안 한 capability grant |
| **Capability per-tool-call (runtime)** | ✗ 기각 — 매 invocation 마다 prompt → UX 망침. install 시점 grant 가 정상 |
| **MCP server 도 utility_process 격리** | ⚠ 부분 검토 — 이미 server 가 별도 process (stdio) 라서 격리 OK, capability gate 만 추가하면 됨 |
| **Mandatory signed marketplace** | ✗ 기각 — community registry 차단 = 생태계 위축. signed 는 trust 가산점만 |

## Consequences

### Positive
- **Plugin 과 일관된 보안 model**: ADR-0003 (utility_process) + ADR-0004 (IPC
  bridge) 의 capability gate 패턴이 MCP 에도 적용 — 사용자가 한 번 학습한
  mental model 재사용
- **Audit trail 강화**: MCP capability decision 도 audit_log 에 기록 (B3 패턴)
- **Tool conflict 명시 처리**: silent overwrite 대신 사용자 인지
- **Marketplace foundation**: v2.3.0+ registry / signed manifest 의 토대

### Negative
- **McpManager 복잡도 증가**: 현재 simple discovery → capability 매핑 + 충돌
  처리 + version change 감지 추가 → 코드 라인 ~2-3x
- **사용자 friction**: install 시 capability 확인 step 추가 (현재는 즉시
  install)
- **Manifest schema 정착 비용**: 기존 MCP server 들이 본 schema 따라야 →
  마이그레이션 가이드 작성 필요

### Future Work
- **ADR-0007** — MCP marketplace registry protocol (fetch / search / publish)
- **B5 옵션 land**: signed manifest verification (Phase 2)
- **Plugin SDK 통합**: `@dreampia/mcp-sdk` — server 작성자가 본 schema 쉽게
  생성

## Implementation Sketch

### Phase 1 — capability gate at install (1-2d)

`src/main/mcp/McpCapabilityGate.ts` 신규 — `PluginCapabilityGate` 와 같은 shape
- `ensureGranted(server_id, capabilities)` — 사용자 confirmer 통해 grant
- `~/.dreampia/mcp/<server-id>/.granted.json` 영속

### Phase 2 — manifest schema + zod validation (1d)

`src/types/mcp.ts` 에 zod schema:
- `McpManifestSchema` — name / version / tools / capabilities / signature 옵션
- `parseManifest(raw)` fail-closed helper

### Phase 3 — conflict resolution (1d)

`McpManager.resolveToolConflict()` + Settings UI 의 [MCP] 패널 alert

### Phase 4 — version change detection (1-2d)

McpManager 가 boot 시 / settings 변경 시 manifest re-fetch + diff 검사

### Phase 5 — registry foundation (Phase 2 = v2.3.0+)

별 ADR-0007 에서 정식화

## Test Coverage (planned)

| Test | Layer | 목적 |
|------|-------|------|
| `tests/main/mcp/McpCapabilityGate.test.ts` | vitest | grant/revoke + 영속 + version change |
| `tests/main/mcp/manifestSchema.test.ts` | vitest | parseManifest fail-closed + schema 강제 |
| `tests/main/mcp/conflictResolution.test.ts` | vitest | 같은 tool_id 두 server first-wins |
| e2e | Playwright | 실제 install flow + capability prompt |

## Migration Path

| 시점 | 상태 |
|------|------|
| v2.2.0 (현재) | spec only |
| v2.3.0 | capability gate at install + manifest schema 강제 |
| v2.4.0 | conflict resolution UI + version change detection |
| v2.5.0 | registry protocol (ADR-0007) + signed manifest |
| v2.6.0+ | 전체 MCP marketplace UX |

기존 MCP server 호환성:
- 기존 manifest 가 `tools[].capabilities` 없으면 default = `[]` (capability check skip, deprecation warn)
- v2.5.0 부터 `tools[].capabilities` 필수 (breaking — release notes 명시)

---

## References

- 코드: `src/main/mcp/McpManager.ts` (현재 server discovery)
- 코드: `src/main/mcp/McpClient.ts` (tool invocation)
- ADR: [ADR-0003 Plugin utility_process 격리](0003-plugin-utility-process-isolation.md) — capability gate 패턴 source
- ADR: [ADR-0004 Plugin IPC bridge](0004-plugin-ipc-bridge.md) — schema validation 패턴 source
- 컨텍스트: `docs/v2.x-roadmap.md` post-Phase-D defer 항목 — MCP ecosystem
