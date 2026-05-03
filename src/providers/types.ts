/**
 * Provider 어댑터 공용 타입.
 *
 * Spec: docs/session/cross-ai-sync.md (ProviderAdapter 인터페이스 + 변환 규칙)
 *
 * 우리 내부 schema (Turn / ContentBlock / ToolCall / ToolResult) 는 provider 중립.
 * 각 provider 별 어댑터가 양방향 변환을 담당.
 *
 * Phase 1 P0:
 *   - text + tool_use 변환
 *   - 모델 → provider 자동 라우팅
 *   - 기본 capability 매핑
 *
 * Phase 1 P1+ (deferred):
 *   - Streaming SSE parsing (real APIs)
 *   - Image / extended thinking / prompt caching
 *   - validateApiKey / API HTTP 호출
 */

import type { Provider, Turn, ToolCallRef, ToolResultRef } from '@/types';

/**
 * Provider 어댑터 도메인에서 사용하는 도메인 타입.
 * 코드베이스 schema 는 `ToolCallRef` / `ToolResultRef` 로 명명되어 있지만
 * cross-ai-sync.md 사양은 `ToolCall` / `ToolResult` 라고 부른다.
 * 두 이름은 동의어 — 여기서 alias 로 노출.
 */
export type ToolCall = ToolCallRef;
export type ToolResult = ToolResultRef;

// ────────────────────────────────────────────────────────────
// Streaming events (provider-agnostic)
// ────────────────────────────────────────────────────────────

/**
 * v0.4.0 — token / cost telemetry payload.
 *
 * Translator 가 CLI JSONL 의 usage 필드를 추출해 emit. main 의 runStreamPump
 * 가 가로채 UsageStore.recordEvent 로 영속한다. session_id 는 main 이 stream
 * context 에서 채워 넣으므로 이 payload 에는 없다 (translator 가 알 수 없음).
 *
 * 일부 필드 (cache_*, reasoning_*) 는 provider 별로 발생 — 미사용 시 0.
 *
 * Spec: ROADMAP.md (v0.4.0 Usage/Cost Tracking MVP)
 */
export interface UsageEventData {
  provider: 'claude' | 'codex' | 'mock';
  model: string;
  turn_id: string;
  input_tokens: number;
  output_tokens: number;
  cache_creation_input_tokens?: number;
  cache_read_input_tokens?: number;
  reasoning_output_tokens?: number;
  /** 0 = 가격 정보 없음 (token 만 기록). 그 외엔 USD, 6자리 round. */
  total_cost_usd: number;
  /** ISO 8601 UTC. translator 가 채워 넣음. */
  recorded_at: string;
}

/**
 * Provider-neutral 스트리밍 이벤트.
 * 어댑터의 parseStreamChunk 와 StreamingProvider.stream 이 이 이벤트를 emit.
 */
export type StreamEvent =
  | { type: 'message_start'; turn_id: string; model: string }
  | { type: 'text_delta'; text: string }
  | {
      type: 'tool_call_start';
      tool_call: { id: string; tool_id: string; input?: unknown };
    }
  | { type: 'tool_call_input_delta'; tool_call_id: string; partial_input: string }
  | { type: 'tool_call_complete'; tool_call: ToolCall }
  | { type: 'tool_result'; result: ToolResult }
  | { type: 'message_complete'; turn: Turn }
  | { type: 'usage'; data: UsageEventData }
  | { type: 'error'; error: string };

// ────────────────────────────────────────────────────────────
// Provider-specific opaque types
// ────────────────────────────────────────────────────────────

/** Provider API 메시지 표현. 형태는 provider 별로 상이. */
export type ProviderMessage = Record<string, unknown>;
/** Provider API tool 정의. */
export type ProviderTool = Record<string, unknown>;
/** Provider API request config (model, temperature, etc.). */
export type ProviderRequestConfig = Record<string, unknown>;
/** Provider API response (raw shape). */
export type ProviderResponse = Record<string, unknown>;
/** Provider API tool result (raw shape). */
export type ProviderToolResult = Record<string, unknown>;

/** Tool registry → provider 변환에 필요한 최소 정보. */
export interface ToolDefinition {
  id: string;
  description?: string;
  input_schema?: unknown;
}

// ────────────────────────────────────────────────────────────
// AdapterFromResponse — 역변환 결과
// ────────────────────────────────────────────────────────────

export interface AdapterFromResponse {
  new_turn: Turn;
  tool_calls: ToolCall[];
}

// ────────────────────────────────────────────────────────────
// ProviderAdapter — 핵심 인터페이스
// ────────────────────────────────────────────────────────────

/**
 * Provider 어댑터 계약.
 *
 * 양방향 변환 + capability 매핑.
 * 실제 HTTP 호출은 별도 layer (StreamingProvider 또는 향후 추가될 ApiClient).
 */
export interface ProviderAdapter {
  readonly provider: Provider;

  // ─── Outgoing: 우리 schema → Provider format ───
  toProviderMessages(turns: Turn[]): ProviderMessage[];
  toProviderTools(tools: ToolDefinition[]): ProviderTool[];
  toProviderConfig(turn: Turn): ProviderRequestConfig;

  // ─── Incoming: Provider format → 우리 schema ───
  fromProviderResponse(response: ProviderResponse): AdapterFromResponse;
  fromProviderToolResult(result: ProviderToolResult): ToolResult;

  // ─── Streaming (Phase 1 P1) ───
  /** 단일 SSE 청크 → StreamEvent 배열. P0 에선 빈 배열 반환 가능. */
  parseStreamChunk(chunk: string): StreamEvent[];

  // ─── Capability 매핑 ───
  supportsExtendedThinking(): boolean;
  supportsPromptCaching(): boolean;
  maxContextTokens(): number;
}

// ────────────────────────────────────────────────────────────
// StreamingProvider — end-to-end 파이프라인용 (UI integration)
// ────────────────────────────────────────────────────────────

/**
 * 실제 스트림을 emit 하는 provider.
 *
 * P0: MockProvider 만 구현 (실제 API 호출은 P1+).
 * UI 가 `for await (const ev of provider.stream(...))` 로 소비.
 */
export interface StreamingProvider {
  readonly provider: Provider;

  /**
   * 입력 turns + 모델 + config 받아 스트림 이벤트를 비동기 iterate.
   * Iterator 는 반드시 종료 (message_complete 또는 error 후).
   */
  stream(input: {
    turns: Turn[];
    model: string;
    config?: Record<string, unknown>;
    signal?: AbortSignal;
  }): AsyncIterable<StreamEvent>;
}
