/**
 * Providers 모듈 — public API.
 *
 * Spec: docs/session/cross-ai-sync.md
 *
 * 단일 import 경로:
 *   import { getAdapter, inferProvider, MockProvider } from '@/providers';
 *
 * Phase 1 P0 surface — Real API 호출 / SSE parsing 은 P1+.
 *
 * 격리:
 *   이 barrel 은 RENDERER + MAIN 양쪽에서 import 가능하다 — 즉 sandbox-safe
 *   해야 한다. 따라서 `child_process` / `fs` / `os` 를 사용하는 CLI provider 는
 *   여기서 re-export 하지 않는다. CLI/auto 가 필요하면 main 에서 직접
 *   `@/providers/cli` 또는 `@/providers/auto` 를 import 하라.
 */

// Types
export type {
  AdapterFromResponse,
  ProviderAdapter,
  ProviderMessage,
  ProviderRequestConfig,
  ProviderResponse,
  ProviderTool,
  ProviderToolResult,
  StreamEvent,
  StreamingProvider,
  ToolCall,
  ToolDefinition,
  ToolResult,
} from './types';

// Adapters (pure — no Node-only deps)
export { ClaudeAdapter } from './ClaudeAdapter';
export { CodexAdapter } from './CodexAdapter';

// Registry
export { getAdapter } from './registry';

// Routing
export { MODEL_PREFIXES, inferProvider, isClaudeModel, isCodexModel } from './routing';

// Streaming providers (Mock — pure JS, sandbox-safe)
export { MockProvider, type MockProviderOptions } from './MockProvider';

// ── 의도적으로 re-export 하지 않음 (sandbox 안전성) ──
// CLI subprocess: import from '@/providers/cli' (main only)
// Auto-selection: import from '@/providers/auto' (main only)
//
// types-only re-export 은 안전. CliInfo / CliDetectionResult 는 IPC payload
// shape 검증이나 renderer-side 타입 표시에 필요.
export type { CliInfo, CliDetectionResult } from './cli/detect';
