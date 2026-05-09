# ADR-0005 — Plugin host event stream (host → plugin subscription)

> **Status**: Accepted (spec)
> **Date**: 2026-05-09
> **Phase**: post-v2.2.0 (Plugin IPC bridge 후속)
> **Authors**: Claude Code (Opus 4.7) — score-driven ralph 자율 land
> **Related**: [ADR-0003](0003-plugin-utility-process-isolation.md), [ADR-0004](0004-plugin-ipc-bridge.md), [v2.x-roadmap.md](../v2.x-roadmap.md)

---

## Context

[ADR-0004](0004-plugin-ipc-bridge.md) 의 host IPC bridge 는 **request-response
RPC** pattern 만 정의 — plugin → host 단방향 호출. 그러나 v2.x post-Phase-D
시나리오에서 plugin 이 host 의 비동기 이벤트 (사용자가 새 turn 보냄,
permission grant 변경, file watcher 트리거 등) 를 구독해야 하는 use-case 가
등장한다.

대표 예시:
1. **Audit dashboard plugin** — host 의 모든 audit_log event 를 실시간 스트림
   → plugin UI 에 visualization
2. **Auto-formatter plugin** — file save event 구독 → 자동 format
3. **Workspace notifier plugin** — workspace 변경 (file create/delete/move)
   구독 → notify
4. **Permission monitor plugin** — permission decision 실시간 추적 → 사용자
   audit trail

ADR-0004 의 RPC 만으로는 plugin 이 polling 해야 — 비효율적이고 race-prone.
호스트가 **push 모델로 event 를 stream** 하는 별도 layer 가 필요하다.

## Decision

**Topic-based subscription pattern** 채택. ADR-0004 의 RPC 위에 두 신규
method 추가:

```
host.subscribe(topic, capability) → { subscription_id }
host.unsubscribe(subscription_id) → { ok: true }

[main → child push]
host-event { subscription_id, topic, payload }
```

### 신규 method

| method | capability | args | result |
|--------|-----------|------|--------|
| `host.subscribe` | topic 별 다름 (table 참조) | `{ topic: HostTopic }` | `{ subscription_id: string }` |
| `host.unsubscribe` | (구독 시 grant 된 capability) | `{ subscription_id }` | `{ ok: true }` |

### Topic catalog (initial spec)

| topic | capability | event payload | 사용 예 |
|-------|-----------|---------------|---------|
| `audit.log` | `AUDIT_READ` | `AuditEvent` | audit dashboard |
| `permission.decision` | `AUDIT_READ` | `{ event, capability, target_json, decision_reason }` | permission monitor |
| `workspace.file_change` | `WORKSPACE_READ` | `{ kind: 'create'\|'modify'\|'delete', path }` | auto-format, indexer |
| `session.turn_complete` | `SESSION_READ` | `{ session_id, turn_id, role }` | turn-based 자동화 |
| `tool.use` | `TOOL_USE` (read-only stream) | `{ session_id, tool_id, status }` | tool usage analytics |

### Push event protocol

```typescript
// main → child — 구독자에게 event push
interface PluginHostEvent {
  type: 'host-event';
  subscription_id: string;
  topic: HostTopic;
  payload: unknown;          // topic 별 schema
  emitted_at: ISO8601;
}
```

child 의 worker entry 가 message handler 에서 `host-event` type 을 받아
plugin 의 등록된 listener 콜백 호출.

## Alternatives Considered

| 대안 | 검토 결과 |
|------|-----------|
| **Polling RPC (`host.audit_log_recent({ since })`)** | ✗ 기각 — 비효율 + race + battery 소모 |
| **EventSource / SSE 스타일 stream** | ✗ 기각 — utility_process 의 IPC 는 message-passing 이라 SSE 모델 불필요 |
| **Single global event stream (no topic)** | ✗ 기각 — capability granularity 손실. plugin 이 모든 event 받음 (over-permissive) |
| **Per-event ad-hoc capability check** | ✗ 기각 — subscription 시점 capability check 가 정상 흐름. event push 마다 check 하면 cost ↑ |
| **WebSocket / external broker** | ✗ 기각 — plugin 격리 boundary 는 utility_process IPC 만 — 외부 인프라 의존성 추가 안 함 |

## Consequences

### Positive
- **효율적 push 모델**: polling 제거 → battery / CPU 절약, latency ↓
- **Capability granularity 유지**: topic 별 capability — `audit.log` 구독은
  `AUDIT_READ` 가 manifest 에 선언돼야
- **Subscription lifecycle 명시**: subscribe → events → unsubscribe →
  child crash / shutdown 시 자동 cleanup (host 가 추적)
- **확장 가능**: 새 topic 은 backward-compat (기존 plugin 영향 0)
- **Plugin SDK 친화**: `sdk.subscribe('audit.log', cb)` 로 추상화 가능

### Negative
- **Event bus 인프라 비용**: host 가 topic publisher 들을 wire 해야 (현재
  audit emit 은 SQLite write 만 — pub/sub layer 필요)
- **Backpressure 문제**: 구독 plugin 이 느리면 message queue 가 쌓임 →
  bounded queue 정책 필요 (drop oldest? throttle?)
- **Memory leak risk**: plugin 이 unsubscribe 안 하고 종료 → host 가
  subscription_id 별 cleanup 책임 (utility_process exit listener 사용)
- **Capability revoke 시 처리**: plugin 의 capability 가 runtime 에 회수되면
  (B3 `revokeOne`) 해당 topic 구독도 자동 unsubscribe 필요

### Future Work
- **Backpressure policy**: per-topic 별 queue cap 정의
- **Filter API**: `host.subscribe(topic, { filter })` — 서버 측 filter (예:
  특정 session_id 만)
- **Replay support**: `host.subscribe(topic, { from_ts: ISO8601 })` — 누락
  event 복구 (단 audit_log 같은 영속 topic 만)
- **Plugin SDK** — `@dreampia/plugin-sdk` 에서 subscription helper 제공

## Implementation Sketch

### Phase 1 — event bus core (1-2d)

`src/main/plugins/hostBridge/eventBus.ts` 신규:
- `HostEventBus.publish(topic, payload)` — host code 가 emit
- `HostEventBus.subscribe(plugin_name, topic, cb) → { subscription_id }` — bridge 가 호출
- `HostEventBus.unsubscribeAll(plugin_name)` — child exit 시 cleanup

기존 `auditLogStore.recordEvent()` callsite 가 동시에 `eventBus.publish('audit.log', event)` 하도록 wire.

### Phase 2 — bridge integration (1d)

`PluginUtilityProcessRunner` 의 dispatcher 확장:
- `host.subscribe` request → eventBus.subscribe + return id
- emit 시 `child.postMessage({ type: 'host-event', subscription_id, payload })`
- child entry 의 message handler 가 type='host-event' 분기 → plugin listener

### Phase 3 — topic 별 publisher wire (2-3d)

각 host code path 에 publish 추가:
- `audit.log`: `auditLogStore.recordEvent` 후
- `workspace.file_change`: chokidar 또는 fs.watch
- `session.turn_complete`: turn 영속 후 (App.tsx ↔ ipc 경유)

### Phase 4 — backpressure + cleanup (1d)

- bounded queue per subscription (예: 100 event)
- queue overflow 시 drop oldest + audit warn
- child exit/crash 시 eventBus.unsubscribeAll

## Test Coverage (planned)

| Test | Layer | 목적 |
|------|-------|------|
| `tests/main/plugins/hostBridge/eventBus.test.ts` | vitest | publish/subscribe/unsubscribe + cleanup |
| `tests/main/plugins/hostBridge/topicPublishers.test.ts` | vitest | each topic publish from host code path |
| `tests/main/plugins/PluginUtilityProcessRunner.test.ts` 확장 | vitest | host-event message delivery |
| e2e (별 슬롯) | Playwright | actual subscription + event delivery roundtrip |

## Migration Path

| 시점 | 상태 |
|------|------|
| v2.2.0 (현재) | spec only |
| v2.3.0 | event bus core + 처음 topic (`audit.log`) — read-only |
| v2.4.0 | workspace + session topic + plugin SDK 1차 |
| v2.5.0+ | backpressure + filter API + replay |

---

## References

- ADR: [ADR-0003 Plugin utility_process 격리](0003-plugin-utility-process-isolation.md)
- ADR: [ADR-0004 Plugin IPC bridge API spec](0004-plugin-ipc-bridge.md)
- 코드: `src/main/plugins/PluginUtilityProcessRunner.ts` (B2 — 현재 IPC protocol)
- 코드: `src/storage/AuditLogStore.ts` (audit emit source — `audit.log` topic publisher 후보)
- 컨텍스트: `docs/v2.x-roadmap.md` post-Phase-D defer 항목
