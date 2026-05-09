# ADR-0003 — Plugin 격리 mechanism: utility_process

> **Status**: Accepted
> **Date**: 2026-05-09
> **Phase**: B1 (v2.0.0 Plugin sandbox) — Open Questions Q3 land
> **Authors**: 사용자 결정 (2026-05-08) + Claude Code (Opus 4.7)
> **Related**: [ADR-0001](0001-cli-provider-timeout.md), [ADR-0002](0002-metadata-extra-legacy-optional.md), [v2.x-roadmap.md](../v2.x-roadmap.md), `project_sec_audit_2026_05_08.md` (H1, H2)

---

## Context

v1.1.6 의 Plugin Loader D1 (trust-on-install) 모델은 install 시점에만 사용자
컨펌 받고 이후엔 main process 안에서 직접 실행된다. SEC-2 audit (Codex Q11)
의 `H1` finding:

> "vm.createContext 는 sandbox 아님. utility_process / Worker 재설계 vs
> trust-on-install 모델 — Plugin Loader 본 작업의 architectural decision."

즉 D1 만으로는 untrusted plugin 의 RCE 를 차단 못 한다. Trust 가 깨지면
plugin 코드가 main process global (BrowserWindow, shell, fs 전체) 에 임의
접근 가능하다.

`PluginHookRunner` (현재 `src/main/plugins/PluginHookRunner.ts`) 는 hook
script 를 main process 컨텍스트에서 require 후 동기/비동기 호출한다 — V8
isolate 분리 zero, GC 분리 zero, network/fs API gate zero.

추가로 SEC audit `H2`: `PluginCapabilityGate` 가 hardcoded
`session_id='plugin-loader'` + 단일창 의존. 다중창 시 capability decision
이 wrong window 에 routing 가능. 본 ADR 의 격리 모델은 H2 fix 의 토대도
제공해야 한다.

## Decision

**Electron `utility_process` 를 채택**한다.

근거 (사용자 결정 Q3 2026-05-08, [v2.x-roadmap.md](../v2.x-roadmap.md) line 109):

> [x] **F4 격리 mechanism**: **utility_process** (Electron-native, V8 isolate, 22+ 안정 API)

핵심 속성:
- **분리 isolate**: 별도 V8 instance — main process global 직접 참조 불가.
- **분리 GC**: plugin 의 메모리 누수가 main 영향 없음.
- **IPC 강제**: parent/child 간 `port.postMessage(...)` 만 가능 — 모든 cap
  요청이 IPC boundary 통과 → `PluginCapabilityGate` 가 enforce 가능.
- **Electron-native**: Electron 22+ stable API, 별도 npm dep 없음.

### v2.0.0 Plugin path (목표)

```
[main process]                          [utility_process child]
PluginUtilityProcessRunner (NEW)        plugin worker entry
  ├─ utilityProcess.fork(workerPath)     ├─ require('../plugin-host')
  │     args: { plugin_name, manifest } ├─ host.run(hookContext)
  ├─ port.postMessage(hookContext)      ├─ plugin.preTurn(ctx)
  ├─ ◄─ port.on('message', auditEvent)  ├─ port.postMessage(auditEvent)
  ├─ timeout SIGTERM (re-use A3 pattern)
  └─ exit cleanup → PluginHookAuditEvent  
```

### Backward compat — opt-in flag

R-A1 risk register: "utility_process 격리가 plugin API breaking change
가능성." 완화: **isolation_mode 옵션** 으로 in_process / utility_process
선택 가능. v2.0.0 default 는 점진 전환 — 본 ADR 은 옵션 양쪽 다 land
권고:

| 시점 | default `isolation_mode` | 의미 |
|------|--------------------------|------|
| v2.0.0 | `in_process` (legacy 호환) | utility_process 는 explicit opt-in |
| v2.1.0 | `in_process` (default) | utility_process 는 explicit opt-in (timeline 연기) |
| v2.2.0 | `utility_process` (default) | in_process 는 explicit opt-out (`DREAMPIA_PLUGIN_ISOLATION=in_process`) |
| v2.3.0+ | `utility_process` only | in_process path 제거 |

env override: `DREAMPIA_PLUGIN_ISOLATION=utility_process|in_process`.

## Alternatives Considered

| 대안 | 검토 결과 |
|------|-----------|
| **`worker_threads`** (Node 표준) | ✗ 기각 — shared memory 사용 가능하지만 Electron main process context (app, dialog 등) 와 호환 안 됨. utility_process 가 동등 격리 + Electron 통합 더 좋음. |
| **`vm.createContext`** | ✗ 기각 — V8 escape 사례 다수 (`vm` 의 scope leak). SEC audit 도 명시적 reject. |
| **trust-on-install only (D1 유지)** | ✗ 기각 — install 후엔 격리 zero. `H1` finding 미해결. |
| **OS-level sandbox** (chroot/AppArmor) | ✗ 기각 — cross-platform 비현실. macOS/Windows 동등 sandbox 부재. |
| **Lavamoat / SES** (런타임 capability JS) | ✗ 기각 — 의존성 무거움. utility_process 가 boundary 일관 제공. |

## Consequences

### Positive
- **RCE 차단**: trust 깨진 plugin 도 main global 직접 접근 불가.
- **Capability gate 강제 위치 명확화**: 모든 cap 요청이 IPC boundary
  통과 → `PluginCapabilityGate` 가 runtime 시점에 검증 (B3 deliverable).
- **H2 partial fix 토대**: `PluginCapabilityGate.session_id` hardcoded
  문제는 utility_process 가 spawn 시 명시적 session_id 주입 받게 하면
  자연스럽게 broadcast pattern 으로 확장.
- **Crash 격리**: plugin crash → child process 만 종료. main 영향 없음.
- **Timeout 재활용**: A3 (CliProvider.timeout_ms, ADR-0001) 의 SIGTERM
  pattern 을 그대로 utility_process 에 적용 가능.

### Negative
- **IPC overhead**: 모든 hook call 이 message-passing → 마이크로초 단위
  latency. 일반 plugin 사용엔 무시 가능 수준이지만, hot-path plugin
  (e.g. 모든 turn 마다 fire 되는 audit hook) 은 측정 필요.
- **Plugin API breaking**: in_process 에서 직접 require 한 main module
  들은 plugin 안에서 바로 못 씀 → IPC bridge API 필요. v2.0.0 default
  in_process 유지 + v2.1.0 default 전환 으로 migration window 확보.
- **Debug 복잡도**: child process stack trace 가 main 과 분리 → debugger
  attach + sourcemap 통합 작업 필요.
- **추가 OS process**: plugin 갯수 N 만큼 child process N 개. 메모리
  overhead 측정 필요.

### Future Work
- **B2 PoC**: `PluginUtilityProcessRunner` 신규 + `PluginHookRunner` 의
  isolation_mode 옵션. opt-in 모드.
- **B3 runtime cap 강제**: `PluginCapabilityGate` 가 IPC boundary 에서
  검증 (현재는 manifest 검토만).
- **B4 e2e**: untrusted plugin 의 main global 접근 시도 → utility_process
  boundary 차단 검증.
- **debug DX**: VSCode launch.json 에 attach to utility_process worker.
- **bridge API spec**: plugin 이 사용 가능한 main API 의 IPC bridge 정의
  (별 ADR — `docs/adr/0004-plugin-ipc-bridge.md` 후보).

## Migration Path (v1.x → v2.0.0)

1. **v1.9.x (현재)**: `PluginHookRunner` 만 존재. in_process 직접 실행.
2. **v2.0.0 Phase B PoC (B2)**: `PluginUtilityProcessRunner` 추가.
   `isolation_mode` 옵션. **default 는 in_process** (모든 기존 plugin
   호환). DREAMPIA_PLUGIN_ISOLATION=utility_process 로 opt-in.
3. **v2.0.0 release notes**: utility_process 옵션 + future default 전환
   timeline 안내.
4. **v2.1.0**: default 가 utility_process 로 전환. in_process 는 explicit
   opt-out.
5. **v2.2.0+**: in_process path 제거. PluginHookRunner 클래스 삭제 또는
   utility_process wrapper 로 alias.

## Test Coverage

| Test | Layer | 목적 |
|------|-------|------|
| `tests/main/plugins/PluginUtilityProcessRunner.test.ts` (B2) | vitest | spawn / hook event / kill on timeout |
| `tests/main/plugins/PluginCapabilityGate.runtime.test.ts` (B3) | vitest | runtime cap 검증 |
| `e2e/_drive_plugin_sandbox.spec.ts` (B4) | Playwright | RCE 차단 e2e |

기존 `tests/main/plugins/PluginHookRunner.test.ts` 는 v2.0.0 PoC 동안
in_process default 로 회귀 lock 유지.

---

## References

- 코드: `src/main/plugins/PluginHookRunner.ts:62` (현재 in_process runner)
- 코드: `src/main/plugins/PluginCapabilityGate.ts` (manifest 검토 + runtime gap)
- SEC audit: `~/.claude/projects/C--Dev---/memory/project_sec_audit_2026_05_08.md` (H1, H2)
- 이전 ADR: [ADR-0001 CLI provider timeout](0001-cli-provider-timeout.md), [ADR-0002 MetadataExtra legacy](0002-metadata-extra-legacy-optional.md)
- 사용자 결정: `docs/v2.x-roadmap.md:108-110` (Open Questions Q3)
- Risk register: `docs/v2.x-roadmap.md` R-A1
