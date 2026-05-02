/**
 * Providers 모듈 — public API.
 *
 * Spec: docs/session/cross-ai-sync.md
 *
 * 단일 import 경로:
 *   import { getAdapter, inferProvider, MockProvider } from '@/providers';
 *
 * Phase 1 P0 surface — Real API 호출 / SSE parsing 은 P1+.
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

// Adapters
export { ClaudeAdapter } from './ClaudeAdapter';
export { CodexAdapter } from './CodexAdapter';

// Registry
export { getAdapter } from './registry';

// Routing
export { MODEL_PREFIXES, inferProvider, isClaudeModel, isCodexModel } from './routing';

// Streaming providers
export { MockProvider, type MockProviderOptions } from './MockProvider';
