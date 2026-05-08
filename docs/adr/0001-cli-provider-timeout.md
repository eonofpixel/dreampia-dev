# ADR-0001 — CliProvider 자동 timeout (`timeout_ms`)

> **Status**: Accepted
> **Date**: 2026-05-08
> **Phase**: A3 (v1.9.0 hotfix sweep)
> **Authors**: 사용자 결정 + Claude Code (Opus 4.7)

---

## Context

`CliProvider` 는 Claude / Codex CLI subprocess 를 spawn 해 streaming 응답을
중계한다. 기존에는 mid-stream 취소가 외부 `AbortSignal` 에 한정됐다 — 즉
사용자가 명시적으로 stop 버튼을 눌렀거나 IPC 가 cancel 신호를 보낸 경우만.

**Gap (v1.1.4 postmortem 의 잔존 항목)**: CLI 가 hang / 무한 응답 중일 때
사용자 개입 없이 자동 종료하는 메커니즘이 부재했다. drive16-3 abort
unit cover 는 user-cancel 경로만 검증할 뿐, "CLI 가 응답을 못 받아 영원히
대기" 시나리오는 미보장 — 메인 process / IPC 큐 / UI streaming-cursor 가
영구히 stuck 되는 risk 가 있었다.

## Decision

`CliProviderOptions` 에 `timeout_ms?: number` 필드를 추가한다.

- **default**: `undefined` (timeout 없음, opt-in)
- **set 시**: spawn 직후 `setTimeout(onTimeout, timeout_ms)` 설치. fire 시
  - `errorState.message = 'CLI timeout exceeded (Xms)'` 로 표면화
  - `child.kill('SIGTERM')` 으로 subprocess 종료
  - 기존 drain loop 가 종료되며 `error` StreamEvent emit 후 `return`
  - close handler / error handler / finally 모두 `clearTimeout` defensive 처리

**Production wire**:
- `auto.ts` 가 `parseTimeoutMsEnv()` 헬퍼로 `DREAMPIA_CLI_TIMEOUT_MS` env 읽음
- 미설정 → undefined (기본 무제한)
- 양수 정수 → ms 적용
- `cliOverride` (test/e2e replay) 와 `makeCliProvider` (production CLI) 두
  경로 모두 동일하게 wire — 정책 일관성

## Alternatives Considered

| 대안 | 검토 결과 |
|------|-----------|
| **production default 60s** | 기각 — backward-compat 깨짐, opt-in 으로 callsite 가 의도 명시 |
| **production default 120s** | 기각 — 동일 |
| **AbortSignal 만으로 외부 timeout 처리** | 기각 — 호출자마다 timer 중복 구현, leak risk |
| **별도 `timeoutController` 생성 + `signal` chain** | 기각 — 단순 SIGTERM 으로 충분, AbortSignal.any() 의존 회피 |
| **프로세스 polling** | 기각 — 복잡도 증가, 정확도 낮음 |

## Semantics — `signal` (user-cancel) vs `timeout_ms`

| | `signal.abort()` | `timeout_ms` 경과 |
|---|---|---|
| `aborted` flag | true | false |
| `timedOut` flag | false | true |
| `errorState.message` | null | `"CLI timeout exceeded (Xms)"` |
| `error` StreamEvent emit | 안 함 (silent return) | emit |
| close handler exit-code 합성 | skip (`!aborted`) | skip (`!timedOut`) |
| UI 표면 | `cancelled` | `failed` (error 표시) |

분리된 의미 — user 가 의도적으로 cancel 한 거라면 silent, hang 으로 인한
auto-kill 이라면 명시적 error 표면화.

## Consequences

### Positive
- 개별 hang 이 main process 전체를 stuck 시키지 않음
- 호출자가 `timeout_ms` 만 명시하면 timer 관리 책임 위임 가능
- e2e drive16-3 (timeout) 회귀 lock 가능 — `slow-stream.json` fixture 재사용

### Negative
- 사용자가 정상이지만 느린 응답 (large reasoning) 을 timeout 으로 잘라낼 risk
  → mitigation: opt-in 이라 caller 가 의식적으로 값 설정해야 함
- `DREAMPIA_CLI_TIMEOUT_MS` env 가 모든 CliProvider 인스턴스에 일률 적용 →
  세션별 override 는 미지원. 추후 settings UI / per-call option 으로 확장 가능

### Future Work
- `settings.json` 의 `cli_timeout_ms` 필드 + Settings UI (별도 슬롯 — 본 ADR 범위 밖)
- per-model default (e.g. opus 는 더 길게) — 필요 시 추가

## Test Coverage

| Test | Layer | Fixture |
|------|-------|---------|
| `drive16-4: timeout_ms 경과 시 error event` | vitest (Tier 2) | `claude/slow-stream.json` |
| `drive16-4 regression: 미설정 시 message_complete` | vitest (Tier 2) | `claude/slow-stream.json` |
| `drive16-3: timeout_ms env override` | e2e (Playwright) | `claude/slow-stream.json` + `DREAMPIA_CLI_TIMEOUT_MS=300` |

---

## References

- 코드: `src/providers/cli/CliProvider.ts:39-...` (옵션 정의)
- 코드: `src/providers/cli/CliProvider.ts:onTimeout` (timer 로직)
- 코드: `src/providers/auto.ts:parseTimeoutMsEnv` (env 파싱)
- Roadmap: `docs/v2.x-roadmap.md` (Phase A — A3)
- Prior: `docs/v1.x-completion-audit.md` (drive16-3 abort)
