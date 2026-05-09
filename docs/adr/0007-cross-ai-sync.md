# ADR-0007 — Cross-AI session sync (Claude ↔ Codex)

> **Status**: Accepted (spec)
> **Date**: 2026-05-09
> **Phase**: post-v2.2.0 (cross-provider session 공유)
> **Authors**: Claude Code (Opus 4.7) — score-driven ralph 자율 land
> **Related**: [ADR-0001](0001-cli-provider-timeout.md), `docs/session/cross-ai-sync.md`, `docs/v2.x-roadmap.md`

---

## Context

Dreampia-Dev 의 핵심 가치 명제 중 하나는 **Claude Code + OpenAI Codex 통합
GUI** (package.json description). 즉 사용자가 한 session 안에서 두 provider
를 자유롭게 전환하며 같은 conversation context 를 유지할 수 있어야 한다.

현재 v2.2.0 까지의 구현:
- **Provider 선택**: ChatHeader 의 ProviderDropdown 으로 매 turn 마다 변경 가능
- **CLI authentication 위임**: `getDefaultProvider()` (auto.ts) 가 model
  prefix 기반 routing — claude → CliProvider(claude), codex → CliProvider(codex)
- **세션 metadata**: 세션의 `current_model` 만 영속, provider 별 state 분리 X

**Gap (RE 분석에서도 식별된 P0)**:
1. **Provider 별 conversation context** — Claude / Codex 가 같은 turn 들을
   본질적으로 같게 받는가? Tool-call schema, system prompt, message format 이
   다른 경우 turn 변환 layer 필요
2. **Cross-provider compare 모드** 강화 — 현재 v0.12.0 의 compare_runs 가
   존재하지만, 두 provider 의 응답을 같은 turn 으로 merge 하는 path 모호
3. **CLI authentication 동기화** — Claude CLI 의 login state 와 Codex CLI 의
   login state 가 분리. 사용자가 양쪽 모두 인증해야 — 한쪽만 인증된 경우
   fallback 정책 부재
4. **Streaming 일관성** — Claude 의 stream-json 과 Codex 의 exec --json 의
   message 단위 차이 (translateClaudeJsonl vs translateCodexJsonl) — 이미
   normalization 있지만 tool-call schema 일관성은 v2.x 에서 강화 필요

본 ADR 은 **cross-AI session sync** 의 v2.x post-Phase-D 기준 spec.

## Decision

### 1. Turn shape neutrality (이미 부분 구현)

`Turn` 타입은 provider-agnostic — `role`, `content` (ContentBlock[]),
`tool_calls`, `model`. 두 provider 의 응답이 같은 Turn shape 으로 normalize.

본 ADR 의 신규 강제:
- **schema_version 필드** — 각 Turn 에 `schema_version: number` (이미 Session
  에 존재, Turn 에도 추가). v2.x.x 에서 schema 변경 시 마이그레이션 lever.
- **provider_origin** — Turn 에 `provider_origin?: Provider` (어느 provider
  가 emit 했는지 추적, optional). compare 모드 시 두 provider 응답 구분.

### 2. CLI authentication state sync (NEW)

`src/main/cliAuthState.ts` 신규:
- Claude CLI login state 조회 (`claude --version` + auth file 존재)
- Codex CLI login state 조회 (`codex --version` + ~/.codex/auth.json)
- 결과를 settings UI 의 [Provider] 패널에 표시 (✓/✗ per provider)
- 미인증 provider 로 turn 보내려 하면 명시적 alert + auth 가이드

### 3. Provider switch within session (강화)

현재: user 가 ChatHeader dropdown 으로 변경 → 다음 turn 부터 새 provider
v2.x 강화:
- 변경 시 immediate audit emit (`provider.switch` event)
- 새 provider 에 보낼 conversation context 가 호환되는지 self-check
  - tool_calls 의 schema 가 새 provider 에서 invoke 가능한지
  - system message 가 호환되는지
- 호환 안 되는 경우 사용자에게 명시 warning + "fresh session 권장" toast

### 4. Compare mode 강화 (이미 v0.12.0 존재)

기존 `compare_runs` 테이블 + `CompareStore` + `orchestrator` 가 cover.
ADR-0007 의 추가:
- Compare 결과를 Turn 으로 merge 하는 explicit API — `mergeCompareIntoTurn()`
- 사용자가 한 응답 picking 후 본 session timeline 에 흡수

### 5. Cross-provider workspace sync

같은 workspace 안의 file_change event (ADR-0005 의 topic) 가 양 provider 의
context 에 동일 reflect — single source of truth = filesystem.

## Alternatives Considered

| 대안 | 검토 결과 |
|------|-----------|
| **Provider lock per session** | ✗ 기각 — 핵심 가치 명제 위반. 사용자가 mid-session 전환할 자유 보존 |
| **Always parallel both providers** | ✗ 기각 — cost 2x + UX 혼란. compare 모드는 explicit opt-in 유지 |
| **Custom adapter per tool_call** | ✗ 기각 — 너무 invasive. tool_use 표준화는 ADR-0009 (TBD) 후속 |
| **External sync server** | ✗ 기각 — local-first 정책 위반, dreampia-dev 는 P2P 또는 local 만 |
| **Codex-only fallback** | ✗ 기각 — Claude-first user 거부감 |

## Consequences

### Positive
- **Mental model 일관**: Claude / Codex 어느 쪽이든 같은 session 안 같은 turn
  들을 봐 — 사용자 cognitive load ↓
- **Compare 모드 자연스러움**: 두 응답을 같은 turn 의 alternatives 로 표시
  가능 (UI 후속)
- **Audit trail 강화**: provider_origin 으로 분석 가능 — "claude 가 한
  decision vs codex 가 한 것"
- **CLI auth state 가시화**: 사용자가 "왜 응답 안 와요" 같은 issue 의 root
  cause (auth missing) 즉시 인지

### Negative
- **Schema 추가 = migration cost**: Turn 에 `schema_version` + `provider_origin`
  add 시 SQLite 마이그레이션 필요 (turns 테이블 column 추가)
- **CLI state polling cost**: settings UI mount 시 두 CLI 모두 spawn —
  ~100-200ms latency (cache 필요)
- **호환성 self-check 가 false-positive 유발 가능**: 사용자가 의식적으로
  새 provider 시도하는 경우 warning 이 noise 가 될 수 있음 → "Don't show
  again" 옵션 제공
- **Compare merge UI 복잡도**: 현재 separate display, merge UX 는 별 디자인
  필요

### Future Work
- **ADR-0008 (proposed)** — Tool-call schema unification across providers
- **Streaming normalization tests** — Claude vs Codex 응답 정합성 회귀 lock
- **Provider-aware prompt rewriting** — system prompt 가 provider 별 강점에
  따라 자동 조정
- **Multi-provider context window 관리** — token limit 다른 provider 간
  truncation 정책

## Implementation Sketch

### Phase 1 — Turn schema 확장 (1d)

`src/types/conversation.ts`:
- `TurnSchema` 에 `schema_version: z.number().default(1)` + `provider_origin: z.enum([...]).optional()`

마이그레이션 017 — `turns` 테이블에 column 추가 (NULL 허용, default).

### Phase 2 — CLI auth state probe (1-2d)

`src/main/cliAuthState.ts` 신규 + IPC handler `provider/auth-state`. Settings UI 가 표시.

### Phase 3 — Provider switch self-check (1d)

`ChatHeader` 의 ProviderDropdown 변경 시:
1. audit emit `provider.switch`
2. 호환성 self-check (tool_calls / system msg)
3. 호환 안 되면 toast + "Don't show again"

### Phase 4 — Compare merge API (2d)

`CompareStore.mergeIntoTurn(compare_run_id, turn_id, picked_side)` —
선택된 응답을 본 session timeline 에 흡수. UI 의 [채택] 버튼 wiring.

### Phase 5 — workspace sync 강화 (post-ADR-0005)

ADR-0005 의 `workspace.file_change` topic publisher wire 후 양 provider 의
context 갱신 verify (단일 source = filesystem).

## Test Coverage (planned)

| Test | Layer | 목적 |
|------|-------|------|
| `tests/types/turnSchema.test.ts` | vitest | Turn schema 확장 (schema_version + provider_origin) |
| `tests/main/cliAuthState.test.ts` | vitest | Claude / Codex auth state probe |
| `tests/renderer/ProviderDropdown.test.tsx` | vitest | switch 시 audit emit + self-check |
| `tests/main/compare/mergeCompare.test.ts` | vitest | compare → turn merge round-trip |
| e2e | Playwright | 실제 cross-provider session flow (Claude turn → switch → Codex turn) |

## Migration Path

| 시점 | 상태 |
|------|------|
| v2.2.0 (현재) | spec only, Turn 은 schema_version 없음 |
| v2.3.0 | Turn schema 확장 + 마이그레이션 017. CLI auth state probe. |
| v2.4.0 | Provider switch self-check + Compare merge API. |
| v2.5.0+ | workspace sync 강화 + ADR-0008 (tool-call unification). |

기존 Turn row 호환성:
- `schema_version` 누락 → default 1
- `provider_origin` 누락 → undefined (legacy turn — provider 추론 X)

---

## References

- 코드: `src/providers/auto.ts` (provider routing)
- 코드: `src/providers/cli/translateClaudeJsonl.ts` + `translateCodexJsonl.ts` (현재 normalization)
- 코드: `src/main/compare/orchestrator.ts` (compare_runs)
- 코드: `src/types/conversation.ts` (Turn schema)
- 컨텍스트: `docs/session/cross-ai-sync.md` (P0 spec, 본 ADR 의 정식 update)
- 컨텍스트: `docs/v2.x-roadmap.md` post-Phase-D defer 항목
- ADR: [ADR-0001 CLI provider timeout](0001-cli-provider-timeout.md)
