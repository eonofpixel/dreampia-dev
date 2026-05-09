# ADR-0008 — Tool-call schema unification across providers

> **Status**: Accepted (spec)
> **Date**: 2026-05-09
> **Phase**: post-v2.5.0 (cross-provider tool-use 정합)
> **Authors**: Claude Code (Opus 4.7) — score-driven ralph 자율 land
> **Related**: [ADR-0007](0007-cross-ai-sync.md), [v2.x-roadmap.md](../v2.x-roadmap.md)

---

## Context

[ADR-0007](0007-cross-ai-sync.md) 의 Cross-AI session sync 가 Turn shape
neutrality 를 보장하지만, **tool_call** 영역은 여전히 provider 별 차이가 있다:

- **Claude (Anthropic API / Claude Code CLI)**:
  - `tool_use` block: `{ id, name, input: object }`
  - `tool_result` block: `{ tool_use_id, content }`
  - input 은 zod-typed object
- **Codex (OpenAI Responses / Codex CLI)**:
  - `function_call`: `{ id, name, arguments: string (JSON) }`
  - `function_call_output`: `{ call_id, output }`
  - arguments 는 stringified JSON

현재 `ToolCallRef` (src/tools/types.ts) 는 normalized shape 이지만:
1. **input parse 시점 차이**: Claude 는 object 그대로, Codex 는 JSON.parse 필요
2. **streaming 중 partial input**: Claude 의 input_json_delta 와 Codex 의
   `arguments` chunk 가 다른 포맷
3. **tool_call_id correlation**: 같은 logical tool 호출이 두 provider 에서
   다른 ID 형식 (Claude: `toolu_*`, Codex: `call_*`)

본 ADR 은 **단일 canonical tool-call schema** 정의 + provider별 adapter
강제 — cross-AI session 안에서 tool_calls 가 모순 없이 round-trip.

## Decision

### 1. Canonical `ToolCall` schema (이미 부분 존재 — 강화)

```typescript
// src/types/tool.ts (proposed unification)
const ToolCallSchema = z.object({
  id: z.string().min(1),                    // canonical ID — 'tc_<uuid>' 형식
  provider_origin: z.enum(['claude', 'codex', 'mock']),
  provider_native_id: z.string().optional(), // 원본 ID (toolu_* 또는 call_*)
  tool_id: z.string().min(1),
  input: z.unknown(),                        // zod-validated by tool registry per tool_id
  status: z.enum(['pending', 'streaming', 'complete', 'error']),
  created_at: ISO8601Schema,
  completed_at: ISO8601Schema.optional(),
});
```

`input` 은 generic `unknown` 이지만 **ToolRegistry 의 zod schema 가 per-tool
parse** — caller 가 invoke 시점에 narrow.

### 2. Provider-specific adapter contract

각 provider 의 stream translator 가 **반드시** canonical 형식으로 변환:

```typescript
// src/providers/cli/translateClaudeJsonl.ts (이미 존재 — 강화)
function translateClaudeToolUse(raw): ToolCall {
  return {
    id: generateCanonicalId(),
    provider_origin: 'claude',
    provider_native_id: raw.id,           // 'toolu_*'
    tool_id: raw.name,
    input: raw.input,                      // 그대로 (object)
    status: 'streaming',
    created_at: nowIso(),
  };
}

// src/providers/cli/translateCodexJsonl.ts
function translateCodexFunctionCall(raw): ToolCall {
  return {
    id: generateCanonicalId(),
    provider_origin: 'codex',
    provider_native_id: raw.id,           // 'call_*'
    tool_id: raw.name,
    input: parseCodexArguments(raw.arguments), // JSON.parse + recovery
    status: 'streaming',
    created_at: nowIso(),
  };
}
```

### 3. Streaming partial input normalization

각 translator 가 **chunk 단위** 로 들어오는 input 을 누적해 단일 final
object 생성:

- Claude: `input_json_delta` chunk 들 concat → JSON.parse
- Codex: `arguments` chunk 들 concat → JSON.parse with recovery

`ToolCall.status === 'streaming'` 동안 input 은 partial 일 수 있음. UI 가
status 를 보고 spinner 표시.

### 4. Provider switch within active tool_call

`ToolCall.status === 'streaming'` 인 상태에서 provider 변경 (ProviderDropdown)
시:
1. 현재 streaming tool_call 을 `status: 'cancelled'` 로 표시
2. 새 provider 에 send 시 그 tool_call 은 context 에 포함하되 input 은
   final state (partial 그대로)
3. 사용자에게 명시 toast — "tool call cancelled by provider switch"

### 5. Cross-provider tool_call_id reuse (NEW)

같은 logical tool 호출이 compare 모드에서 양 provider 에 보낼 때:
- 본 session 의 canonical `id` 는 동일 유지
- 양 provider 의 native_id 별도 추적 (한 session 의 ToolCallRef 에 두 native_id 등록)

이는 compare merge (ADR-0007 Phase 4) 에 prerequisite.

## Alternatives Considered

| 대안 | 검토 결과 |
|------|-----------|
| **Provider-native shape 보존** | ✗ 기각 — cross-provider sync (ADR-0007) 와 충돌. 불일치 turn shape 유발 |
| **Anthropic Messages API 표준 채택** | ✗ 기각 — Codex 가 그쪽으로 변환되지 않음. 우리만의 canonical 필요 |
| **OpenAI function calling 표준 채택** | ✗ 기각 — Claude 의 typed input 풍부함 손실 |
| **Per-tool schema 만 (no canonical)** | ✗ 기각 — Turn 안 tool_calls 검색 / merge / display 가 일관 안 됨 |
| **Streaming partial 그대로 노출** | ✗ 기각 — UI 의 ToolCallCard 가 partial JSON 처리 복잡 → 항상 final state 만 |

## Consequences

### Positive
- **Turn → DB → load round-trip 일관성**: 어느 provider 가 emit 했든 같은
  shape 로 저장 + load
- **Compare merge 가능**: 같은 canonical id 로 양 provider 응답 비교
- **UI 단순**: ToolCallCard 가 single shape 만 render — 분기 없음
- **Provider switch 안전**: streaming tool_call 의 cancellation 을 명시 표시

### Negative
- **Adapter 코드 양방향**: translateClaudeJsonl + translateCodexJsonl + 향후
  AnthropicProvider/OpenAIProvider 도 같은 contract — 4+ adapter 유지
- **JSON.parse 실패 recovery 비용**: Codex 의 partial arguments 는 invalid
  JSON 이라 recovery 필요 (예: `'{"x":1, "y":2'` → close bracket auto-add)
- **provider_native_id 추가 column / field**: storage 변경 — 마이그레이션 필요

### Future Work
- **ADR-0009 (proposed)** — Streaming partial JSON recovery 알고리즘 spec
- **Tool registry per-tool zod schema 강제** — 현재는 tool_id 만 string,
  invoke 시 input 검증 X 경우 있음
- **MCP tool 통합** — MCP server tool 도 같은 canonical schema 따라야

## Implementation Sketch

### Phase 1 — schema 강화 (1-2d)

`src/types/tool.ts` 의 ToolCallSchema 확장:
- `provider_origin` 필수 (enum)
- `provider_native_id` 옵션
- `status` enum 명시화

마이그레이션 018 — `tool_calls` 테이블 column 추가 (NULL 허용).

### Phase 2 — translator contract 강화 (2d)

각 translator (translateClaudeJsonl, translateCodexJsonl, AnthropicProvider,
OpenAIProvider) 가 canonical shape 반환 강제. unit test per translator.

### Phase 3 — partial JSON recovery (1-2d)

`src/utils/partialJsonRecovery.ts` 신규 — Codex partial arguments parsing.
fallback: parse 실패 시 raw 그대로 (string) + UI 가 spinner 유지.

### Phase 4 — UI 통합 (1d)

`ToolCallCard.tsx` 에 `provider_origin` icon (Claude / Codex / Mock).

### Phase 5 — Provider switch cancellation flow (1d)

ChatHeader 의 ProviderDropdown 변경 시 streaming tool_calls cancel — toast +
audit emit.

## Test Coverage (planned)

| Test | Layer | 목적 |
|------|-------|------|
| `tests/types/toolCallSchema.test.ts` | vitest | canonical schema + provider_origin enum + zod validation |
| `tests/providers/cli/translateClaudeJsonl.toolUse.test.ts` | vitest | claude → canonical 변환 |
| `tests/providers/cli/translateCodexJsonl.functionCall.test.ts` | vitest | codex → canonical 변환 |
| `tests/utils/partialJsonRecovery.test.ts` | vitest | partial arguments recovery |
| `tests/renderer/ToolCallCard.providerOrigin.test.tsx` | vitest | UI 의 provider icon 표시 |
| e2e | Playwright | cross-provider tool_call 시나리오 |

## Migration Path

| 시점 | 상태 |
|------|------|
| v2.x.x 현재 | ToolCallRef 는 부분 normalized — provider_origin 부재 |
| v2.5.0 | schema 강화 + 마이그레이션 018 + translator contract 강제 |
| v2.6.0 | partial JSON recovery + UI provider icon |
| v2.7.0+ | Provider switch cancellation + MCP tool 통합 |

기존 ToolCallRef row 호환성:
- `provider_origin` NULL → 'claude' default (기존 turn 의 majority)
- `provider_native_id` NULL → 'unknown'

---

## References

- 코드: `src/tools/types.ts` (현재 ToolCallRef)
- 코드: `src/providers/cli/translateClaudeJsonl.ts`, `translateCodexJsonl.ts`
- 코드: `src/renderer/components/chat/ToolCallCard.tsx`
- ADR: [ADR-0007 Cross-AI session sync](0007-cross-ai-sync.md) — 본 ADR 의 prerequisite
- 컨텍스트: `docs/v2.x-roadmap.md` post-Phase-D defer 항목
