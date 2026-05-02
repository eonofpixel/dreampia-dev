---
title: Tool Orchestration — Wiki Index
parent: ../../README.md
status: draft
last_updated: 2026-05-02
---

# Tool Orchestration (도구 실행) — Wiki Home

> **한 줄 요약**: shell·browser·agents·connectors·filesystem·MCP 도구를 **하나의 큐**로 실행·중단·재시도·로그화.
>
> **Codex 자체 조언**: *"단순 채팅앱과 에이전트 IDE의 차이가 여기서 납니다"* — [출처](../../CODEX_SELF_ADVICE.md)

---

## 페이지 목록

### Foundation
- [principles.md](./principles.md) — 7가지 불변 원칙
- [interface.md](./interface.md) — `Tool<TInput, TOutput>` + `ExecutionContext` + `ToolCall` / `ToolResult`

### Tool Categories
- [categories.md](./categories.md) — built-in / MCP / plugin / skill / agent
- [registry.md](./registry.md) — `ToolRegistry` + tool discovery
- [conflict-resolution.md](./conflict-resolution.md) — 같은 ID 충돌 해결

### Execution
- [queue.md](./queue.md) — `ExecutionQueue` + cancellation
- [retry.md](./retry.md) — `RetryPolicy`
- [logging.md](./logging.md) — 로그 분류 + 저장
- [background-jobs.md](./background-jobs.md) — 30초 이상 작업

### Integration
- [mcp-bridge.md](./mcp-bridge.md) — MCP 서버 wrapping
- [plugin-loader.md](./plugin-loader.md) — Codex plugin.json 로드
- [provider-adapters.md](./provider-adapters.md) — Claude / OpenAI tool calling 변환

### UI
- [rendering.md](./rendering.md) — `ToolResultRenderer` + UI 표시
- [observability.md](./observability.md) — Trace timeline + failure card

### Reference
- [examples.md](./examples.md) — 실제 시나리오 + 테스트

---

## 빠른 답변

| 질문 | 페이지 |
|------|--------|
| Tool 인터페이스가 뭐야? | [interface.md](./interface.md) |
| 어떤 종류의 도구가 있어? | [categories.md](./categories.md) |
| Tool 호출 큐 어떻게 작동해? | [queue.md](./queue.md) |
| MCP 서버 어떻게 통합? | [mcp-bridge.md](./mcp-bridge.md) |
| 실행 결과 UI 어떻게 보여? | [rendering.md](./rendering.md) |
| 사용자가 trace 어떻게 봐? | [observability.md](./observability.md) |
| Plugin 어떻게 로드? | [plugin-loader.md](./plugin-loader.md) |

---

## Phase 1 작업 항목

| ID | 작업 | 산출물 | 참고 |
|----|------|--------|------|
| TO-1 | Tool interface | `src/tools/Tool.ts` | [interface.md](./interface.md) |
| TO-2 | ExecutionContext | `src/tools/Context.ts` | [interface.md](./interface.md) |
| TO-3 | ToolRegistry | `src/tools/Registry.ts` | [registry.md](./registry.md) |
| TO-4 | ExecutionQueue | `src/tools/Queue.ts` | [queue.md](./queue.md) |
| TO-5 | Built-in tools (10개) | `src/tools/builtin/*.ts` | [categories.md](./categories.md) |
| TO-6 | RetryPolicy | `src/tools/Retry.ts` | [retry.md](./retry.md) |
| TO-7 | Logging | `src/tools/Log.ts` | [logging.md](./logging.md) |
| TO-8 | MCP Bridge | `src/tools/McpBridge.ts` | [mcp-bridge.md](./mcp-bridge.md) |
| TO-9 | Plugin Loader | `src/tools/PluginLoader.ts` | [plugin-loader.md](./plugin-loader.md) |
| TO-10 | Skill Loader | `src/tools/SkillLoader.ts` | [plugin-loader.md](./plugin-loader.md) |
| TO-11 | Result renderers | `src/components/ToolResult/*.tsx` | [rendering.md](./rendering.md) |
| TO-12 | Trace UI | `src/components/Trace/*.tsx` | [observability.md](./observability.md) |
| TO-13 | Background Jobs | `src/jobs/*.ts` | [background-jobs.md](./background-jobs.md) |
| TO-14 | Provider adapters | `src/providers/*Tool.ts` | [provider-adapters.md](./provider-adapters.md) |
| TO-15 | Conflict resolution | `src/tools/Conflict.ts` | [conflict-resolution.md](./conflict-resolution.md) |

**총 예상 시간**: 3주 (1인 fulltime)

---

## 관련 (외부)

- [docs/session/_index.md](../session/_index.md) — Tool calls 가 turn 에 통합되는 방식
- [docs/permission/_index.md](../permission/_index.md) — Tool 실행 시 권한 체크
- [CODEX_SELF_ADVICE.md](../../CODEX_SELF_ADVICE.md) — 우선순위 3번 근거
