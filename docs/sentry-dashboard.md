# Sentry Dashboard — Operational Metrics (Phase C C3)

> **Status**: Active reference. v2.1.0 Phase C C3 deliverable.
> **Date**: 2026-05-09
> **Telemetry source**: `src/main/telemetry/` (bootstrap + sinks)

본 문서는 production 배포 후 Sentry custom dashboard 의 spec — 수집할
metrics, panel 구성, alert threshold. 사용자 보고 spike 감지 + 운영 health
모니터링.

---

## 0. Telemetry 활성 조건

- **Sentry DSN**: `SENTRY_DSN` env 또는 `settings.telemetry_enabled === true`
  설정 시 `bootstrapTelemetry()` 가 SentrySink 활성. 미설정 시 ConsoleSink
  fallback (dashboard 데이터 없음).
- **사용자 opt-in**: settings UI 의 telemetry toggle. default OFF.
- **PII 정책**: 사용자 입력 텍스트 (turn content) / file path / API key 는
  **절대 emit X**. 메트릭은 모두 anonymized counter + duration.

---

## 1. Core metrics (필수 panel)

### 1.1 Audit log emission rate

| Metric | Type | Source | Description |
|---|---|---|---|
| `audit.tool_use.success` | counter | `Queue.ts` | Tool 실행 성공 |
| `audit.tool_use.failed` | counter | `Queue.ts` | Tool 실행 실패 |
| `audit.tool_use.cancelled` | counter | `Queue.ts` | 사용자/system cancel |
| `audit.tool_use.timeout` | counter | `Queue.ts` | tool timeout |
| `audit.permission.granted` | counter | `ipc.ts:permission/respond` | grant 결정 |
| `audit.permission.denied` | counter | `ipc.ts:permission/respond` | deny 결정 |
| `audit.plugin.hook_ok` | counter | `PluginHookRunner` | plugin hook 정상 |
| `audit.plugin.hook_error` | counter | plugin runner | plugin throw |
| `audit.plugin.hook_timeout` | counter | plugin runner | plugin timeout |
| `audit.plugin.hook_blocked` | counter | plugin runner | capability 미승인 |

**Panel: Audit Event Distribution (last 24h)**
- Stacked bar chart, X = event type, Y = count
- Filter: `app.version`, `os.platform`

**Alert: failed/timeout spike**
- `audit.tool_use.failed` rate > 10% of `audit.tool_use.success` over 1h
  → notify (warning)
- `audit.tool_use.timeout` > 5/h sustained → notify (warning)

---

### 1.2 Permission decision rate

| Metric | Type | Description |
|---|---|---|
| `permission.decision.granted` | counter | grant 'once'/'session'/'always' 합산 |
| `permission.decision.denied` | counter | deny |
| `permission.decision.timeout` | counter | confirmer timeout (60s default) |
| `permission.respond.duration_ms` | histogram | 사용자 응답까지 걸린 시간 |

**Panel: Permission decision ratio**
- Pie chart: granted / denied / timeout
- Line chart: response time p50/p95/p99

**Alert: timeout spike**
- `permission.decision.timeout` > 20% over 1h → user UX issue (modal 안
  보이거나 사용자 부재 추정) → warning

---

### 1.3 Tool use timeout (CLI provider)

| Metric | Type | Source | Description |
|---|---|---|---|
| `cli.timeout.fired` | counter | `CliProvider.ts` (A3) | timeout_ms 경과로 SIGTERM |
| `cli.exit.success` | counter | `CliProvider.ts` | 정상 종료 |
| `cli.exit.error` | counter | `CliProvider.ts` | exit code != 0 |
| `cli.spawn.duration_ms` | histogram | spawn → 첫 chunk |
| `cli.stream.duration_ms` | histogram | spawn → message_complete |

**Panel: CLI provider health**
- Line chart: timeout rate (per 10min)
- Histogram: spawn → first-chunk latency

**Alert: timeout rate climb**
- `cli.timeout.fired` rate > baseline + 3σ over 1h → warning. 일반적으로
  CLI 가 hang 인 시나리오 — timeout_ms 설정 또는 CLI binary 이슈.

---

## 2. Plugin metrics (v2.0.0+)

### 2.1 Plugin isolation mode usage

| Metric | Type | Description |
|---|---|---|
| `plugin.isolation.in_process` | counter | DREAMPIA_PLUGIN_ISOLATION 미설정 (default) |
| `plugin.isolation.utility_process` | counter | utility_process opt-in |

**Panel: Plugin isolation adoption**
- Stacked area: in_process vs utility_process over weeks
- v2.1.0 default 전환 후 추세 확인 — 사용자가 explicit 으로 opt-out 했는지

### 2.2 Plugin worker performance (utility_process only)

| Metric | Type | Description |
|---|---|---|
| `plugin.worker.spawn.duration_ms` | histogram | utilityProcess.fork → ready |
| `plugin.worker.hook.duration_ms` | histogram | hook execution 시간 |
| `plugin.worker.exit.unexpected` | counter | child crash (exit code != 0) |

**Alert: spawn cost spike**
- `plugin.worker.spawn.duration_ms` p95 > 500ms → notify. utility_process
  의 spawn overhead 가 사용 가능 수준을 넘었는지.

---

## 3. Storage / migration metrics

| Metric | Type | Description |
|---|---|---|
| `db.migration.applied` | counter (with version label) | 각 migration up 적용 |
| `db.migration.failed` | counter (with version label) | 적용 실패 |
| `db.session_count` | gauge | 사용자별 session 수 (anonymized) |
| `db.integrity_check.failed` | counter | quick_check fail at boot |

**Alert: integrity_check failure**
- 사용자 데이터 손상 risk — backup 안내 needed. Sentry 이벤트로 즉시 user
  facing dialog (이미 v1.x 부터 `dialog.showErrorBox`).

---

## 4. Boot / runtime errors

| Metric | Type | Description |
|---|---|---|
| `boot.vcr_gate.blocked` | counter | A4 gate 가 prod 에서 fire (사용자 leak 시도) |
| `boot.session_store.init_failed` | counter | SessionStore native load 실패 |
| `runtime.unhandled_error` | event | error / promise rejection |
| `runtime.renderer.crash` | event | render-process-gone reason !== 'clean-exit' |

**Alert: VCR gate trigger**
- `boot.vcr_gate.blocked` > 0 → 즉시 investigate. 누군가 production binary
  에 test fixture env 를 붙인 시나리오 — 의도적 leak 검증 또는 misuse.

**Alert: renderer crash**
- 1h 동안 같은 user 의 renderer crash > 3 → severe. fingerprint 로 grouping.

---

## 5. Cost / API usage (v0.4.0+, COST-1)

| Metric | Type | Description |
|---|---|---|
| `usage.cost.total_usd` | gauge (per session) | session 의 누적 비용 (전체 anonymized) |
| `usage.cost_gate.exceeded` | counter | cost limit 초과 차단 |
| `usage.unknown_pricing` | counter (with model label) | 가격 unknown 인 model use |

**Panel: Cost limit breach trends**
- Bar chart: 일별 cost_gate.exceeded 횟수
- Top providers/models with unknown_pricing

---

## 6. Implementation guide

### 6.1 SentrySink emit point 정의

`src/main/telemetry/SentrySink.ts` 에서 metric emit:

```typescript
// counter
sentry.metrics.increment('audit.tool_use.success', 1, {
  tags: { tool_id: ev.tool_id, app_version },
});

// histogram (duration_ms)
sentry.metrics.distribution('cli.stream.duration_ms', durationMs, {
  unit: 'millisecond',
  tags: { provider: 'claude' },
});

// gauge
sentry.metrics.gauge('db.session_count', count);
```

### 6.2 Audit sink wiring

기존 `auditLogStore.recordEvent()` callsite 에서 telemetry 도 동시 emit:

```typescript
// src/main/index.ts (예시)
auditLogStore.recordEvent(event);
sentryMetrics.incrementAudit(event); // NEW — counter mapping
```

### 6.3 Privacy filter

PII 가능 필드 (capability target value, plugin name 등) 는 hash 또는
category bucket 으로:

```typescript
function safeTag(value: string): string {
  // path → bucket: '/Users/...' → 'home', '/etc/...' → 'system', etc.
  if (value.startsWith('/Users/') || value.startsWith('C:\\Users\\')) return 'home';
  if (value.startsWith('/etc/') || value.startsWith('C:\\Program Files\\')) return 'system';
  return 'other';
}
```

---

## 7. Dashboard panels (Sentry UI 구성)

순서별 권장 layout:

1. **Top: Audit Event Distribution** (24h, stacked bar)
2. **Permission decision ratio** + response time (line + pie)
3. **CLI timeout rate** + spawn latency histogram
4. **Plugin isolation adoption** (v2.0.0+ 적용 후 8주 trend)
5. **Storage integrity** (boot fail count + last_failed version)
6. **Boot gates** (VCR gate trigger count — 0 should be normal)
7. **Cost overruns** (cost_gate.exceeded daily)

각 panel 에 alert rule + Slack/email destination (조직 정책에 맞춰).

---

## 8. Future work (v2.x.x slot)

- **Per-user session distribution** — anonymized 사용자 id + session count
  + median session duration. 초기 사용자/heavy 사용자 segmentation 용.
- **Provider switching frequency** — Claude / Codex / direct API 간 전환
  비율. v0.3.0 default_provider override 정책 평가 데이터.
- **Workspace size correlation** — workspace_id (hash) 별 turn count.
  large workspace 의 chat virtualization (Phase D) 활성률 검증.

---

## References

- 코드: `src/main/telemetry/bootstrap.ts` (Sentry init)
- 코드: `src/main/telemetry/SentrySink.ts` (metric emit)
- 컨텍스트: `docs/v2.x-roadmap.md` Phase C C3
- ADR: `docs/adr/0001-cli-provider-timeout.md` (A3 — `cli.timeout.fired` source)
- ADR: `docs/adr/0003-plugin-utility-process-isolation.md` (B1 — plugin metrics)
