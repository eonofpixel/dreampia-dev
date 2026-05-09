# ADR-0004 — Plugin IPC bridge API spec

> **Status**: Accepted (spec)
> **Date**: 2026-05-09
> **Phase**: post-v2.0.0 (utility_process Plugin 격리 후속)
> **Authors**: Claude Code (Opus 4.7) — score-driven ralph 자율 land
> **Related**: [ADR-0003](0003-plugin-utility-process-isolation.md), [v2.x-roadmap.md](../v2.x-roadmap.md)

---

## Context

[ADR-0003](0003-plugin-utility-process-isolation.md) 이 Plugin 의 격리
mechanism 으로 Electron `utility_process` 를 채택했다. utility_process 는
별도 V8 isolate — plugin 코드가 main process global (BrowserWindow, app,
dialog, fs, child_process 등) 에 직접 접근 불가하다. 이는 보안 측면에서
이상적이지만, plugin 이 host application 의 정당한 기능 (예: 사용자에게
notification, workspace path 조회, audit log 추가) 을 사용하려면 IPC
bridge 가 필요하다.

현재 v2.0.0/v2.1.0 의 PluginUtilityProcessRunner (B2) 는 최소한의 IPC 만
정의:
- main → child: `run-hook` (hook 실행 요청), `shutdown`
- child → main: `hook-result`, `notify`

`notify` 외 plugin 이 사용 가능한 host API 가 부재 — 본 ADR 은 그
gap 을 정식 spec 으로 채운다.

## Decision

**capability-based JSON-RPC 스타일** IPC bridge 채택.

### 기본 원칙
1. **Capability gate 우선**: 모든 host API 호출은 manifest 의 `capabilities`
   목록에서 선언돼야 하고, `PluginCapabilityGate.ensureGranted()` 가 이미
   승인했어야 한다.
2. **Request-response correlation**: 각 호출은 `request_id` + Promise 패턴.
3. **Schema validation at bridge**: child → main 의 모든 args 는 zod
   schema parse — fail-closed.
4. **Fail-closed timeouts**: bridge call 도 hook timeout 영향 받음.

### IPC 메시지 protocol 확장

```typescript
// child → main — host API 호출 요청
interface PluginHostRequest {
  type: 'host-call';
  request_id: string;          // child 가 생성, response correlation
  method: PluginHostMethod;    // 등록된 host method enum
  args: unknown;               // method 별 schema 로 parse
}

// main → child — host API 응답
interface PluginHostResponse {
  type: 'host-response';
  request_id: string;
  ok: boolean;
  result?: unknown;
  error?: { code: string; message: string };
}
```

### v2.x 등록 method 목록 (proposed)

| method | capability | args | result | 사용 예 |
|--------|-----------|------|--------|---------|
| `host.notify` | `NOTIFY` | `{ message: string, kind?: ... }` | `{ ok: true }` | 사용자 toast (이미 v2.0 land) |
| `host.audit_log` | `AUDIT_WRITE` | `{ event: string, target_json: string, ... }` | `{ ok: true }` | plugin 이 자체 audit emit |
| `host.workspace.root` | `WORKSPACE_READ` | `{}` | `{ root: AbsolutePath }` | plugin 이 사용자 workspace 경로 조회 |
| `host.workspace.list_files` | `WORKSPACE_READ` | `{ pattern?: string }` | `{ files: FileRef[] }` | gitignore-aware 파일 nav |
| `host.fs.read_text` | `LOCAL_READ` | `{ path: AbsolutePath }` | `{ text: string }` | gate 통과 path 한정 |
| `host.fs.write_text` | `LOCAL_WRITE` | `{ path, text }` | `{ bytes_written: number }` | gate 통과 path 한정 |
| `host.tool.invoke` | `TOOL_USE` | `{ tool_id, input }` | `{ output: ToolResultRef }` | plugin 이 dreampia-dev 의 tool 시스템 사용 |
| `host.session.read` | `SESSION_READ` | `{ session_id?: string }` | `{ session: Session }` | 현재/지정 세션 read |

각 method 별 schema 는 `src/main/plugins/hostBridge/schemas.ts` 에 zod 정의.

### Capability mapping

`PluginCapabilityGate` 는 host method → capability 의 lookup table 을
참조 (이미 manifest 에 capability 선언됐는지). 본 ADR 은 그 table 의
초기 spec.

```typescript
const HOST_METHOD_CAPABILITY: Record<PluginHostMethod, Capability> = {
  'host.notify': 'NOTIFY',
  'host.audit_log': 'AUDIT_WRITE',
  'host.workspace.root': 'WORKSPACE_READ',
  // ... etc
};
```

이미 등록된 capability ↔ host method 매핑 외엔 reject (fail-closed).

## Alternatives Considered

| 대안 | 검토 결과 |
|------|-----------|
| **electron-ipc-style direct (`ipcMain.handle`)** | ✗ 기각 — utility_process 는 webContents 가 없어 ipcMain 미적용. parentPort 기반이 native 답 |
| **Synchronous bridge** | ✗ 기각 — child block 시 main 도 block 되는 구조. async Promise pattern 필수 |
| **RPC framework (Comlink, SimpleProto)** | ✗ 기각 — 의존성 무거움. JSON-RPC 패턴이면 ~50 LOC 자체 구현 충분 |
| **Capability per-call, ignoring manifest** | ✗ 기각 — install 시점 trust + manifest declared capability 두 layer 가 더 안전 |
| **Streaming (eventsource-style)** | ✗ 기각 — v2.x 범위 외. host emit → child subscribe 는 별 ADR (0005 후보) |

## Consequences

### Positive
- **격리 + 기능 양립**: plugin 이 격리된 채 host 의 정당한 기능 사용 가능
- **Capability gate 의 의미 강화**: manifest 선언이 runtime 에 강제됨 (B3 의 `ensureGranted` 흐름 직접 활용)
- **Schema validation 으로 fail-closed**: child 가 보낸 args 가 schema 외면 거부, plugin 의 misuse 차단
- **Audit trail**: 모든 host call 이 audit_log emit 가능 (B3 `emitPermissionDecisionAudit` pattern 확장)
- **Backward compat**: v2.0 의 `notify` event 가 본 spec 의 첫 method (`host.notify`) — 기존 plugin 영향 0

### Negative
- **API surface 확장 비용**: 새 method 추가 시 schema + capability + plugin docs 모두 갱신
- **이중 schema**: TypeScript interface 와 zod schema 둘 다 유지 (보통 `z.infer` 로 도출 가능하지만 일부 brand type 은 별도)
- **bridge 호출 cost**: 모든 host call 은 IPC + JSON 직렬화. hot path plugin 은 batching 필요 (Future Work)

### Future Work
- **B5 후속 ADR-0005** — host event subscription (host → plugin streaming)
- **batched call API** — 같은 method 여러 번 호출 시 하나의 IPC round-trip
- **rate-limit per capability** — abuse 방지 (예: notify 10/min 제한)
- **plugin SDK** — `@dreampia/plugin-sdk` npm 패키지로 호스트 API 타입 + helper 제공

## Implementation Sketch

### v2.x.x roadmap (post-v2.1.0)

1. **Phase 1 — schema + bridge core** (1d): `src/main/plugins/hostBridge/` 신규
   - `schemas.ts` — zod schemas for all method args / results
   - `dispatcher.ts` — main 측 dispatch (method → handler)
   - `pluginWorkerEntry.ts` 확장 — `callHost(method, args)` helper
2. **Phase 2 — first methods** (1d):
   - `host.audit_log`, `host.workspace.root` — read-only, 안전
3. **Phase 3 — write methods** (1-2d):
   - `host.fs.read_text`, `host.fs.write_text` — capability gate 검증 강화
4. **Phase 4 — tool/session API** (2d):
   - `host.tool.invoke`, `host.session.read` — host 의 tool 시스템 통합

각 Phase 마다 별 PR + vitest cases (mock dispatcher 로 단위 검증).

## Test Coverage (planned)

| Test | Layer | 목적 |
|------|-------|------|
| `tests/main/plugins/hostBridge/dispatcher.test.ts` | vitest | method dispatch + capability check + schema validation |
| `tests/main/plugins/hostBridge/<method>.test.ts` | vitest per-method | 각 method 의 happy / error / capability-denied path |
| `tests/main/plugins/PluginUtilityProcessRunner.test.ts` 확장 | vitest | bridge call 의 child→main IPC round-trip |
| e2e (별 슬롯) | Playwright | 실제 utility_process spawn + bridge call 검증 |

## Migration Path

| 시점 | 상태 |
|------|------|
| v2.1.0 (현재) | spec 만, 구현 없음. 기존 `notify` event 만 active. |
| v2.2.0 | dispatcher core + 처음 read-only methods (`host.notify`, `host.audit_log`, `host.workspace.root`) |
| v2.3.0 | write methods (`host.fs.write_text`) + capability gate 강화 |
| v2.4.0 | tool/session methods + plugin SDK 1차 release |

---

## References

- ADR: [ADR-0003 Plugin utility_process 격리](0003-plugin-utility-process-isolation.md)
- 코드: `src/main/plugins/PluginUtilityProcessRunner.ts` (B2 — 현재 IPC protocol)
- 코드: `src/main/plugins/PluginCapabilityGate.ts` (B3 — capability check + revokeOne)
- 컨텍스트: `docs/v2.x-roadmap.md` Phase B 종결 + post-Phase-D defer 항목
- 사용자 결정: 본 ADR 은 ralph 자율 score-driven land — v2.0.0 Phase B 의 자연스러운 후속.
