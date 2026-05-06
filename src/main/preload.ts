/**
 * Electron Preload Script
 *
 * IPC bridge between main and renderer.
 *
 * Spec: docs/findings/round5-ipc-telemetry.md (AppServerConnection 패턴)
 *
 * IMPORTANT — sandbox safety:
 *   This file runs in a sandboxed renderer-side context. Node-only modules
 *   (better-sqlite3, fs, path) are unavailable. Only `electron` and pure
 *   type-only imports are safe. Specifically: do NOT `import { SessionStore }
 *   from '@/storage'` here — that pulls in better-sqlite3 and crashes preload.
 */

import { contextBridge, ipcRenderer } from 'electron';
import type { Session, SessionId, Turn } from '@/types';
import type {
  ConversationPatch,
  PermissionPatch,
  Result,
  SessionMetaPatch,
  WorkspaceInfo,
} from './types';

// SessionMeta is a struct from `@/storage`. Re-declare inline so this file
// stays free of the storage module. Keep this in sync with `SessionStore`.
interface SessionMetaShape {
  id: SessionId;
  schema_version: number;
  provider: 'claude' | 'codex';
  workspace_id: string;
  title: string;
  pinned: boolean;
  archived: boolean;
  parent_session_id?: SessionId;
  created_at: string;
  updated_at: string;
}

// SessionLock shape mirrored from `@/storage/LeaderElection.ts`. Inlined here
// so this preload script stays free of the better-sqlite3 import chain.
// Keep in sync with `LeaderElection.SessionLock`.
interface SessionLockShape {
  session_id: SessionId;
  leader_window_id: string;
  leader_pid: number;
  acquired_at: string;
  heartbeat_at: string;
  ttl_seconds: number;
}

// BrowserTabState mirrored from `@/main/BrowserManager.ts`. Inlined here so
// preload doesn't transitively import Electron-only modules. Keep in sync.
interface BrowserTabStateShape {
  tab_id: string;
  session_id: SessionId;
  url: string;
  title: string;
  favicon_url: string | null;
  status: 'loading' | 'ready' | 'failed';
  can_go_back: boolean;
  can_go_forward: boolean;
}

interface BrowserBoundsShape {
  x: number;
  y: number;
  width: number;
  height: number;
}

// AI shapes (P1-4). Inlined here so preload doesn't import @/providers
// (which transitively pulls in Node-only modules — child_process, fs).
// Keep these in sync with @/providers/cli/detect.ts and @/providers/types.ts.
interface CliInfoShape {
  path: string;
  version: string | null;
}
interface CliDetectionShape {
  claude: CliInfoShape | null;
  codex: CliInfoShape | null;
}

// StreamEvent shape — discriminated union mirrored from @/providers/types.
// Renderer-side IpcStreamingProvider casts this back to the strict type.
// v0.4.0 — `usage` variant 추가 (token / cost telemetry).
interface UsageEventDataShape {
  provider: 'claude' | 'codex' | 'mock';
  model: string;
  turn_id: string;
  input_tokens: number;
  output_tokens: number;
  cache_creation_input_tokens?: number;
  cache_read_input_tokens?: number;
  reasoning_output_tokens?: number;
  total_cost_usd: number;
  recorded_at: string;
}

type StreamEventShape =
  | { type: 'message_start'; turn_id: string; model: string }
  | { type: 'text_delta'; text: string }
  | {
      type: 'tool_call_start';
      tool_call: { id: string; tool_id: string; input?: unknown };
    }
  | { type: 'tool_call_input_delta'; tool_call_id: string; partial_input: string }
  | { type: 'tool_call_complete'; tool_call: { id: string; tool_id: string; input?: unknown } }
  | { type: 'tool_result'; result: ToolResultRefShape }
  | { type: 'message_complete'; turn: Turn }
  | { type: 'usage'; data: UsageEventDataShape }
  | { type: 'error'; error: string };

interface AiStreamEventPayload {
  stream_id: string;
  event: StreamEventShape;
}
interface AiStreamEndPayload {
  stream_id: string;
}

/**
 * v1.1.15 (Plugin Loader UI) — preload boundary 가 노출하는 plugin manifest
 * shape. main 의 src/main/plugins/PluginManager.ts 의 PluginManifest 와 동일
 * 구조 (preload 는 별도 정의 — main types 직접 import 하면 boundary 깨짐).
 */
interface PluginManifestShape {
  name: string;
  version: string;
  description?: string;
  hooks?: { pre_turn?: string; post_turn?: string };
  capabilities?: string[];
}

interface ToolCallShape {
  id: string;
  tool_id: string;
  session_id: string;
  turn_id: string;
  parent_call_id?: string;
  input: unknown;
  timeout_ms?: number;
  priority?: 'high' | 'normal' | 'low';
  origin: 'ai' | 'user' | 'automation';
  created_at: string;
}

interface ToolResultRefShape {
  call_id: string;
  status: 'success' | 'failed' | 'cancelled' | 'timeout';
  output?: unknown;
  error?: {
    code: string;
    message: string;
  };
  duration_ms: number;
}

/**
 * v1.0.11 SEC-4 — SideEffect 정식 discriminated union. Tool 이
 * ctx.record_side_effect() 로 보고한 부작용. Renderer 는 ToolResult.side_effects
 * 로 받음 — 사용자가 "이 tool 이 무엇을 했는가" 확인 가능 + audit_log 의
 * target_json 직렬화 source.
 */
type FileSideEffectShape = {
  kind: 'file';
  op: 'read' | 'write' | 'create' | 'delete' | 'rename' | 'chmod';
  path: string;
  to_path?: string;
  bytes?: number;
};
type ProcessSideEffectShape = {
  kind: 'process';
  op: 'spawn' | 'kill' | 'exit';
  cmd?: string;
  pid?: number;
  exit_code?: number;
  signal?: string;
};
type NetworkSideEffectShape = {
  kind: 'network';
  op: 'request' | 'connect' | 'disconnect';
  url?: string;
  method?: string;
  status?: number;
  host?: string;
};
type SideEffectShape =
  | FileSideEffectShape
  | ProcessSideEffectShape
  | NetworkSideEffectShape;

interface ToolResultShape {
  call_id: string;
  tool_id: string;
  status: 'success' | 'failed' | 'cancelled' | 'timeout';
  output?: unknown;
  error?: {
    code: string;
    message: string;
    details?: Record<string, unknown>;
    retryable: boolean;
    user_visible_hint?: string;
  };
  started_at: string;
  completed_at: string;
  duration_ms: number;
  attempt_count: number;
  /** v1.0.11 SEC-4: 정식 discriminated union — 이전엔 `never[]` placeholder. */
  side_effects: SideEffectShape[];
  log_tail: Array<{
    level: 'debug' | 'info' | 'warn' | 'error';
    timestamp: string;
    message: string;
    data?: Record<string, unknown>;
  }>;
}

/**
 * v1.0.11 SEC-3 — Audit log entry shape (renderer 노출용).
 * @see src/storage/AuditLogStore.ts AuditEvent
 */
export interface AuditEventShape {
  id: number;
  timestamp: string;
  session_id: string;
  turn_id?: string;
  event: string;
  capability: string;
  /** JSON string. side_effects[] 또는 ResolvedTarget 직렬화. */
  target_json: string;
  decision_reason: string;
  ai_model?: string;
  ai_reason?: string;
  outcome?: string;
  error?: string;
}

interface AuditRecentArgsShape {
  limit?: number;
  session_id?: string;
  capability?: string;
  event_prefix?: string;
  from?: string;
  to?: string;
}

/**
 * v1.1.0 SEC-2 full — permission request shape (mirrors src/tools/types.ts
 * PermissionRequest). Inlined to keep preload sandbox-safe.
 */
interface PermissionRequestShape {
  request_id: string;
  session_id: string;
  turn_id: string;
  call_id: string;
  tool_id: string;
  capability: string;
  target: { kind: 'path' | 'url' | 'domain' | 'global'; value: string };
  hint?: string;
  is_dangerous: boolean;
  tool_display_name: string;
  requested_at: string;
}

interface PermissionGrantSummaryShape {
  id: string;
  capability: string;
  /** JSON string — `{ id, target }` 형식 (v1.0.x 그대로). */
  target_json: string;
  granted_at: string;
  granted_by: string;
  scope: string;
  expires_at: string | null;
  reason: string | null;
}

// v0.2.0 — MCP Bridge shapes (Issue #5). Inlined here so preload doesn't
// transitively pull in @/types runtime (zod) — sandbox 안전. main 의
// McpServerConfigSchema 가 IPC 경계에서 검증을 담당하므로 preload 는
// shape 만 표현해도 충분.
interface McpServerConfigShape {
  id: string;
  name: string;
  command: string;
  args: string[];
  env: Record<string, string>;
  cwd?: string;
  enabled: boolean;
  added_at: string;
}

type McpServerStatusShape =
  | 'disconnected'
  | 'connecting'
  | 'ready'
  | 'error'
  | 'disabled';

interface McpToolInfoShape {
  name: string;
  description?: string;
  input_schema?: Record<string, unknown>;
}

interface McpServerStateShape {
  config: McpServerConfigShape;
  status: McpServerStatusShape;
  pid?: number;
  tools: McpToolInfoShape[];
  last_error?: string;
  last_log: string[];
}

// v0.4.0 — Usage / cost shapes mirrored from @/storage/UsageStore.
// Inlined to keep preload free of better-sqlite3 imports.
type UsageProviderShape = 'claude' | 'codex' | 'mock';

interface UsageEventShape {
  id: string;
  session_id: string;
  turn_id: string;
  provider: UsageProviderShape;
  model: string;
  input_tokens: number;
  output_tokens: number;
  cache_creation_input_tokens: number;
  cache_read_input_tokens: number;
  reasoning_output_tokens: number;
  total_cost_usd: number;
  recorded_at: string;
  source?: string;
}

interface UsageSummaryShape {
  provider: UsageProviderShape;
  model: string;
  total_input: number;
  total_output: number;
  total_cache_creation: number;
  total_cache_read: number;
  total_reasoning: number;
  total_cost_usd: number;
  event_count: number;
}

interface DailyUsageRowShape {
  date: string;
  provider: UsageProviderShape;
  total_cost_usd: number;
  total_tokens: number;
}

interface UsageSummaryArgsShape {
  from?: string;
  to?: string;
  provider?: UsageProviderShape;
  model?: string;
  session_id?: string;
}

interface UsageDailyArgsShape {
  days: number;
  provider?: UsageProviderShape;
}

// v0.9.0 — Usage limits + MCP discovery shapes.
interface UsageLimitsShape {
  cost_limit_usd?: number;
  alert_threshold: number;
}

interface UsageLimitsPatchShape {
  cost_limit_usd?: number | null;
  alert_threshold?: number | null;
}

interface SuggestedMcpServerShape {
  id: string;
  name: string;
  description: string;
  command: string;
  args: string[];
  install_hint: string;
}

interface McpDiscoveryShape {
  suggested: SuggestedMcpServerShape[];
  from_claude: McpServerConfigShape[];
  from_codex: McpServerConfigShape[];
}

// v0.7.0 (F-026) — Sidebar 검색 결과. SessionStore 의 TurnSearchResult 와 sync.
// snippet 은 `<mark>...</mark>` markup 을 포함할 수 있어 renderer 가 split-and-
// render 패턴으로 안전하게 렌더링해야 한다 (dangerouslySetInnerHTML 금지).
interface TurnSearchResultShape {
  turn_id: string;
  session_id: string;
  role: string;
  snippet: string;
  rank: number;
  timestamp: string;
}
interface SearchTurnsArgsShape {
  q: string;
  limit?: number;
}

// v0.12.0 (I) — Cross-AI Verify/Compare shapes. CompareStore 의 export 와
// sync. preload 는 better-sqlite3 의 transitive import 를 피하기 위해 inline
// 한다. main 의 zod CompareRunArgsSchema 가 IPC 경계에서 검증한다.
type CompareSideStatusShape =
  | 'pending'
  | 'streaming'
  | 'done'
  | 'error'
  | 'skipped';
type CompareRunStatusShape = 'running' | 'completed' | 'failed';
type CompareSideShape = 'claude' | 'codex';

interface CompareSideResultShape {
  status: CompareSideStatusShape;
  model: string | null;
  text: string;
  error: string | null;
  started_at: string | null;
  finished_at: string | null;
}

interface CompareRunShape {
  id: string;
  session_id: string;
  prompt: string;
  workspace_root: string;
  permission_level: 'read_only' | 'workspace_write' | 'full_access' | 'custom';
  created_at: string;
  status: CompareRunStatusShape;
  claude: CompareSideResultShape;
  codex: CompareSideResultShape;
}

interface CompareRunArgsShape {
  session_id: string;
  prompt: string;
  workspace_root: string;
  permission_level?: 'read_only' | 'workspace_write' | 'full_access' | 'custom';
  claude_model: string;
  codex_model: string;
}

type CompareEventShape =
  | { type: 'compare_start'; run_id: string }
  | {
      type: 'compare_side_delta';
      run_id: string;
      side: CompareSideShape;
      text_delta: string;
    }
  | { type: 'compare_side_done'; run_id: string; side: CompareSideShape }
  | {
      type: 'compare_side_error';
      run_id: string;
      side: CompareSideShape;
      error: string;
    }
  | { type: 'compare_complete'; run_id: string; run: CompareRunShape };

// v0.14.0 (A ABI Hardening) — Settings → 진단 탭 + npm run diagnose 가 사용.
// SessionStore 가 없는 환경에서도 platform / process 정보는 채워진다.
interface AppDiagnoseShape {
  platform: NodeJS.Platform;
  arch: string;
  node_version: string;
  electron_version: string;
  app_version: string;
  db_loaded: boolean;
  db_ok?: boolean;
  schema_version?: number | null;
  table_count?: number | null;
  integrity_ok?: boolean | null;
  wal_mode?: boolean | null;
  integrity_message?: string;
  db_error?: string;
}

// v0.6.0 (F-019) — @ mention 의 file IPC. main 의 workspace/list-files 와
// workspace/read-file 이 반환하는 형태와 sync. 본 preload 가 사용하는 다른
// 인라인 shape 와 동일하게 zod runtime 을 import 하지 않는다.
interface FileEntryShape {
  path: string;
  size_bytes: number;
  mtime: string;
}
interface FileContentShape {
  content: string;
  truncated: boolean;
  line_count: number;
}
interface ListFilesArgsShape {
  workspace_root: string;
  ignore_patterns?: string[];
  max_files?: number;
}
interface ReadFileArgsShape {
  workspace_root: string;
  rel_path: string;
  max_bytes?: number;
}

// Whitelist of IPC channels (security)
const ALLOWED_INVOKE_CHANNELS = [
  'app:get-version',
  'app:get-platform',
  'app:get-default-workspace',
  'app:get-onboarding-status',
  'app:complete-onboarding',
  'app:reset-onboarding',
  'app:get-default-provider',
  'app:set-default-provider',
  'app:get-default-permission-level',
  'app:set-default-permission-level',
  // v0.8.0 — Settings 모달 [테마] 탭 + [권한] 탭 capability 표시.
  'app:get-theme',
  'app:set-theme',
  'app:get-permission-capabilities',
  // v0.10.0 — Settings 모달 [단축키] 탭. action → combo 영속.
  'app:get-keyboard-shortcuts',
  'app:set-keyboard-shortcuts',
  // v0.11.0 (B2) — Settings 모달 [언어] 탭. ko / en.
  'app:get-language',
  'app:set-language',
  // v0.14.0 (A ABI Hardening) — Settings 모달 [진단] 탭이 호출.
  'app:diagnose',
  'workspace/pick-folder',
  'workspace/get',
  // v0.6.0 (F-019) — @ mention 가 사용하는 file enumeration / read.
  'workspace/list-files',
  'workspace/read-file',
  'session/list',
  'session/get',
  'session/create',
  'session/append-turn',
  'session/update-meta',
  'session/delete',
  // v0.5.0 (F-018) — slash command 들이 호출하는 추가 mutation IPC.
  'session/clear-turns',
  'session/update-conversation',
  // v0.7.0 (F-026) — Sidebar 검색.
  'session/search',
  // v0.8.0 — H Permission Dropdown (세션 단위 권한 변경).
  'session/update-permission',
  // v1.1.11 (Workspace UX) — sticky workspace lock toggle.
  'session/set-workspace-locked',
  'session/get-workspace-locked',
  // v1.1.15 (Plugin Loader UI) — Sidebar 의 [플러그인] 가 fetch.
  'plugin/list',
  'plugin/rescan',
  'lock/acquire',
  'lock/release',
  'lock/get',
  'lock/heartbeat',
  'lock/is-leader',
  'browser/open-tab',
  'browser/close-tab',
  'browser/switch-tab',
  'browser/navigate',
  'browser/back',
  'browser/forward',
  'browser/reload',
  'browser/set-bounds',
  'browser/list-tabs',
  'ai/detect-cli',
  'ai/start-stream',
  'ai/stop-stream',
  'tool/list',
  'tool/execute',
  'tool/cancel-call',
  'tool/cancel-turn',
  'tool/stats',
  'mcp/list',
  'mcp/add',
  'mcp/remove',
  'mcp/restart',
  'mcp/get-logs',
  // v0.4.0 — usage / cost telemetry
  'usage/summary',
  'usage/daily',
  'usage/by-session',
  // v0.9.0 — Usage CSV export + cost limits + MCP discovery
  'usage/export-csv',
  'usage/get-limits',
  'usage/set-limits',
  'mcp/discover',
  // v0.12.0 (I) — Cross-AI Verify/Compare
  'compare/run',
  'compare/get',
  'compare/list',
  'compare/cancel',
  // v1.0.11 (SEC-3) — Audit log read API
  'audit/recent',
  'audit/by-session',
  // v1.1.0 (SEC-2 full) — permission confirm + grant management
  'permission/respond',
  'permission/list-pending',
  'permission/grants/list',
  'permission/grants/revoke',
] as const;

const ALLOWED_RECEIVE_CHANNELS = [
  'browser/tab-updated',
  'ai/stream-event',
  'ai/stream-end',
  // v0.12.0 (I) — Cross-AI Verify/Compare stream events.
  'compare/stream-event',
  // v1.1.0 (SEC-2 full) — permission request from main → renderer
  'permission/request',
  // v1.6.5 — Plugin hook ctx.notify → renderer toast.
  'plugin/notify',
] as const;

type AllowedInvokeChannel = (typeof ALLOWED_INVOKE_CHANNELS)[number];
type AllowedReceiveChannel = (typeof ALLOWED_RECEIVE_CHANNELS)[number];

const api = {
  /**
   * Invoke main process method (request/response).
   */
  invoke: (channel: AllowedInvokeChannel, ...args: unknown[]): Promise<unknown> => {
    if (!ALLOWED_INVOKE_CHANNELS.includes(channel)) {
      throw new Error(`IPC channel not allowed: ${channel}`);
    }
    return ipcRenderer.invoke(channel, ...args);
  },

  /**
   * Listen for main process events.
   */
  on: (channel: AllowedReceiveChannel, listener: (...args: unknown[]) => void): (() => void) => {
    if (!ALLOWED_RECEIVE_CHANNELS.includes(channel)) {
      throw new Error(`IPC channel not allowed: ${channel}`);
    }
    const handler = (_event: Electron.IpcRendererEvent, ...args: unknown[]): void => {
      listener(...args);
    };
    ipcRenderer.on(channel, handler);
    return () => ipcRenderer.removeListener(channel, handler);
  },

  /**
   * App/runtime information that is safe to expose to the renderer.
   */
  app: {
    /**
     * Phase 3 audit: packaged build 에서 settings 가 없으면 null 반환.
     * Renderer 는 null 시 picker / onboarding 으로 안내.
     */
    getDefaultWorkspace: (): Promise<Result<WorkspaceInfo | null>> =>
      ipcRenderer.invoke('app:get-default-workspace') as Promise<Result<WorkspaceInfo | null>>,

    /**
     * Phase 3 B2: 첫 실행 wizard 표시 여부 결정용.
     * settings.onboarding_completed === true 인 경우만 completed:true.
     * Spec: docs/ia/onboarding.md
     */
    getOnboardingStatus: (): Promise<Result<{ completed: boolean }>> =>
      ipcRenderer.invoke('app:get-onboarding-status') as Promise<Result<{ completed: boolean }>>,

    /**
     * Phase 3 B2: 사용자가 wizard 끝냈을 때 또는 건너뛰기 클릭 시 호출.
     * settings.onboarding_completed=true 로 영속.
     */
    completeOnboarding: (): Promise<Result<void>> =>
      ipcRenderer.invoke('app:complete-onboarding') as Promise<Result<void>>,

    /**
     * v0.3.0 — Sidebar 의 [온보딩 다시 보기] 버튼이 호출. workspace 등 다른
     * settings 는 보존하고 onboarding_completed=false 만 reset.
     */
    resetOnboarding: (): Promise<Result<void>> =>
      ipcRenderer.invoke('app:reset-onboarding') as Promise<Result<void>>,

    /**
     * v0.3.0 — wizard / 설정에서 사용자가 선택한 기본 provider 조회.
     * 'auto' | 'claude' | 'codex' | 'mock'. 미설정 시 'auto'.
     */
    getDefaultProvider: (): Promise<Result<'auto' | 'claude' | 'codex' | 'mock'>> =>
      ipcRenderer.invoke('app:get-default-provider') as Promise<
        Result<'auto' | 'claude' | 'codex' | 'mock'>
      >,

    /**
     * v0.3.0 — wizard / 설정에서 호출. main 측 Zod 가 enum 검증.
     */
    setDefaultProvider: (
      provider: 'auto' | 'claude' | 'codex' | 'mock'
    ): Promise<Result<void>> =>
      ipcRenderer.invoke('app:set-default-provider', provider) as Promise<Result<void>>,

    /**
     * v0.3.0 — 새 세션의 default_level 결정. 미설정 시 'workspace_write'.
     */
    getDefaultPermissionLevel: (): Promise<
      Result<'read_only' | 'workspace_write' | 'full_access' | 'custom'>
    > =>
      ipcRenderer.invoke('app:get-default-permission-level') as Promise<
        Result<'read_only' | 'workspace_write' | 'full_access' | 'custom'>
      >,

    /**
     * v0.3.0 — wizard / 설정에서 호출. main 측 Zod 가 enum 검증.
     */
    setDefaultPermissionLevel: (
      level: 'read_only' | 'workspace_write' | 'full_access' | 'custom'
    ): Promise<Result<void>> =>
      ipcRenderer.invoke('app:set-default-permission-level', level) as Promise<Result<void>>,

    /**
     * v0.8.0 — Settings 모달 [테마] 탭. 'system' 은 OS 의 prefers-color-scheme
     * 을 따라가며, renderer 가 document.documentElement.data-theme 을 설정.
     */
    getTheme: (): Promise<Result<'light' | 'dark' | 'system'>> =>
      ipcRenderer.invoke('app:get-theme') as Promise<Result<'light' | 'dark' | 'system'>>,

    setTheme: (theme: 'light' | 'dark' | 'system'): Promise<Result<void>> =>
      ipcRenderer.invoke('app:set-theme', theme) as Promise<Result<void>>,

    /**
     * v0.8.0 — Settings 모달 [권한] 탭이 표시할 capability set (read-only).
     * PermissionLevel 별로 plain string[] 를 반환 — IPC 직렬화 안전.
     */
    getPermissionCapabilities: (): Promise<
      Result<
        Record<'read_only' | 'workspace_write' | 'full_access' | 'custom', string[]>
      >
    > =>
      ipcRenderer.invoke('app:get-permission-capabilities') as Promise<
        Result<
          Record<'read_only' | 'workspace_write' | 'full_access' | 'custom', string[]>
        >
      >,

    /**
     * v0.10.0 — Settings 모달 [단축키] 탭. 사용자 지정 매핑 조회.
     * 키: ShortcutAction, 값: combo 문자열 ("Mod+K"). 미설정 시 빈 object.
     */
    getKeyboardShortcuts: (): Promise<Result<Record<string, string>>> =>
      ipcRenderer.invoke('app:get-keyboard-shortcuts') as Promise<
        Result<Record<string, string>>
      >,

    /**
     * v0.10.0 — 사용자 지정 매핑 영속. 빈 object 를 보내면 모든 override 제거.
     * action / combo 형식은 renderer 가 검증하고 main 은 plain string-string
     * 매핑만 보존.
     */
    setKeyboardShortcuts: (
      overrides: Record<string, string>
    ): Promise<Result<void>> =>
      ipcRenderer.invoke('app:set-keyboard-shortcuts', overrides) as Promise<
        Result<void>
      >,

    /**
     * v0.11.0 (B2) — Settings 모달 [언어] 탭. 'ko' default.
     * 미설정 시 'ko' 가 반환된다. main 의 LANGUAGE_VALUES enum 검증.
     */
    getLanguage: (): Promise<Result<'ko' | 'en'>> =>
      ipcRenderer.invoke('app:get-language') as Promise<Result<'ko' | 'en'>>,

    setLanguage: (language: 'ko' | 'en'): Promise<Result<void>> =>
      ipcRenderer.invoke('app:set-language', language) as Promise<Result<void>>,

    /**
     * v1.5.0 — Settings 모달 [Direct API] 탭. raw key 노출 X — presence +
     * 마지막 4글자 preview 만 반환. 미설정 시 preview=null.
     */
    getDirectApiKeys: (): Promise<
      Result<{
        anthropic: { present: boolean; preview: string | null };
        openai: { present: boolean; preview: string | null };
      }>
    > =>
      ipcRenderer.invoke('app:get-direct-api-keys') as Promise<
        Result<{
          anthropic: { present: boolean; preview: string | null };
          openai: { present: boolean; preview: string | null };
        }>
      >,

    /**
     * v1.5.0 — Direct API key 설정. 빈 문자열을 보내면 해당 provider key 삭제.
     * provider 는 'anthropic' | 'openai' enum. main 측에서 zod-less 수동 검증.
     */
    setDirectApiKey: (
      provider: 'anthropic' | 'openai',
      key: string
    ): Promise<Result<void>> =>
      ipcRenderer.invoke('app:set-direct-api-key', provider, key) as Promise<Result<void>>,

    /**
     * v0.14.0 (A ABI Hardening) — Settings → 진단 탭이 호출.
     * 항상 `Result<AppDiagnoseShape>` 반환 (DB 로드 실패해도 platform/version
     * 정보는 채워짐 → renderer 가 분기 가능).
     */
    diagnose: (): Promise<Result<AppDiagnoseShape>> =>
      ipcRenderer.invoke('app:diagnose') as Promise<Result<AppDiagnoseShape>>,

    /**
     * v1.7.15 — Telemetry opt-in 상태. default false. true 면 Telemetry
     * (SentrySink/ConsoleSink) 가 emit.
     */
    getTelemetryEnabled: (): Promise<Result<boolean>> =>
      ipcRenderer.invoke('app:get-telemetry-enabled') as Promise<Result<boolean>>,
    setTelemetryEnabled: (enabled: boolean): Promise<Result<void>> =>
      ipcRenderer.invoke('app:set-telemetry-enabled', enabled) as Promise<Result<void>>,

    /**
     * v1.4.0 follow-up — workspace_id FNV → sha256 backfill 을 사용자가 명시
     * trigger. 결과 통계 반환. transaction 안 — 원자적.
     */
    runWorkspaceBackfill: (): Promise<
      Result<{
        scanned: number;
        updated: number;
        skipped: number;
        cascade_sessions: number;
        conflicts: number;
      }>
    > =>
      ipcRenderer.invoke('app:run-workspace-backfill') as Promise<
        Result<{
          scanned: number;
          updated: number;
          skipped: number;
          cascade_sessions: number;
          conflicts: number;
        }>
      >,
    /**
     * v1.4.8 — Boot 시 backfill 필요 여부 확인. read-only.
     * legacy_fnv > 0 + flag_done=false → modal 표시 권장.
     */
    checkWorkspaceBackfill: (): Promise<
      Result<{
        total: number;
        legacy_fnv: number;
        target_conflicts: number;
        flag_done: boolean;
      }>
    > =>
      ipcRenderer.invoke('app:check-workspace-backfill') as Promise<
        Result<{
          total: number;
          legacy_fnv: number;
          target_conflicts: number;
          flag_done: boolean;
        }>
      >,
    /**
     * v1.4.8 — Modal 의 [다시 묻지 않기]. backfill 미실행 + flag 만 set.
     */
    dismissWorkspaceBackfill: (): Promise<Result<void>> =>
      ipcRenderer.invoke('app:dismiss-workspace-backfill') as Promise<Result<void>>,
  },

  /**
   * Workspace picker — main 이 OS-native 폴더 다이얼로그 표시 +
   * 선택된 경로를 settings.json 에 저장.
   *
   * Spec: docs/permission/levels.md (workspace_write 는 사용자 의도된 폴더 한정)
   */
  workspace: {
    pickFolder: (): Promise<Result<{ path: string; name: string } | null>> =>
      ipcRenderer.invoke('workspace/pick-folder') as Promise<
        Result<{ path: string; name: string } | null>
      >,

    get: (): Promise<Result<{ path: string; name: string } | null>> =>
      ipcRenderer.invoke('workspace/get') as Promise<Result<{ path: string; name: string } | null>>,

    /**
     * v0.6.0 (F-019) — workspace 내 파일 enumerate. ignore_patterns 는
     * minimatch-lite (small, no-deps) 로 매칭. 결과의 `path` 는 forward-slash
     * relative POSIX 경로 (Windows backslash 변환됨). max_files 도달 시 부분
     * 결과만 반환되고 truncated 표시는 따로 없으니 (caller 가 length 로 판단)
     * 큰 monorepo 에선 ignore_patterns 를 신중히 지정하는 게 권장.
     */
    listFiles: (args: ListFilesArgsShape): Promise<Result<FileEntryShape[]>> =>
      ipcRenderer.invoke('workspace/list-files', args) as Promise<
        Result<FileEntryShape[]>
      >,

    /**
     * v0.6.0 (F-019) — workspace 내 단일 파일 read. 다음 케이스는 거절:
     *   - rel_path 가 traversal 로 root 바깥
     *   - 디렉토리
     *   - 1MB 초과
     *   - binary (NUL byte 검출)
     * 정상 read 라도 max_bytes 초과면 truncated=true + content 는 prefix.
     */
    readFile: (args: ReadFileArgsShape): Promise<Result<FileContentShape>> =>
      ipcRenderer.invoke('workspace/read-file', args) as Promise<
        Result<FileContentShape>
      >,
  },

  /**
   * Typed SessionStore API.
   *
   * Each method returns `Result<T>` so callers can branch on `.ok`
   * without try/catch around IPC. `Result.error` is always a string —
   * stack traces never cross the boundary.
   */
  session: {
    list: (): Promise<Result<SessionMetaShape[]>> =>
      ipcRenderer.invoke('session/list') as Promise<Result<SessionMetaShape[]>>,

    get: (id: SessionId): Promise<Result<Session | null>> =>
      ipcRenderer.invoke('session/get', id) as Promise<Result<Session | null>>,

    create: (session: Session): Promise<Result<Session>> =>
      ipcRenderer.invoke('session/create', session) as Promise<Result<Session>>,

    /**
     * v1.6.3 — Session fork. parent 의 conversation 을 새 session 으로 복사
     * (parent_session_id 설정). options.truncateAt 가 turn id 면 그 turn 까지만.
     * 반환: 새 session id.
     */
    fork: (
      parentId: SessionId,
      options?: { title?: string; truncateAt?: string }
    ): Promise<Result<{ id: string }>> =>
      ipcRenderer.invoke('session/fork', parentId, options ?? {}) as Promise<
        Result<{ id: string }>
      >,

    appendTurn: (id: SessionId, turn: Turn): Promise<Result<void>> =>
      ipcRenderer.invoke('session/append-turn', id, turn) as Promise<Result<void>>,

    updateMeta: (id: SessionId, patch: SessionMetaPatch): Promise<Result<void>> =>
      ipcRenderer.invoke('session/update-meta', id, patch) as Promise<Result<void>>,

    delete: (id: SessionId): Promise<Result<void>> =>
      ipcRenderer.invoke('session/delete', id) as Promise<Result<void>>,

    /**
     * v0.5.0 (F-018) — `/clear` 슬래시 명령. 현재 세션의 모든 turn 삭제.
     * destructive — 사용자가 명시적으로 trigger 했을 때만 호출되어야 한다.
     */
    clearTurns: (id: SessionId): Promise<Result<void>> =>
      ipcRenderer.invoke('session/clear-turns', id) as Promise<Result<void>>,

    /**
     * v0.5.0 (F-018) — `/model <name>` 슬래시 명령. conversation 의
     * current_model / current_effort / current_mode 변경. main 측 Zod 가
     * enum 검증.
     */
    updateConversation: (id: SessionId, patch: ConversationPatch): Promise<Result<Session>> =>
      ipcRenderer.invoke('session/update-conversation', id, patch) as Promise<Result<Session>>,

    /**
     * v0.7.0 (F-026) — full-text search across all sessions' turns.
     * `q` 는 1~200자, `limit` 미지정 시 50, 100 이하.
     * 결과의 `snippet` 은 `<mark>` markup 을 포함할 수 있어 renderer 가 split
     * 패턴으로 안전 렌더링해야 한다 (XSS 방어).
     */
    search: (args: SearchTurnsArgsShape): Promise<Result<TurnSearchResultShape[]>> =>
      ipcRenderer.invoke('session/search', args) as Promise<
        Result<TurnSearchResultShape[]>
      >,

    /**
     * v0.8.0 — H Permission Dropdown 가 호출. 세션의 default_level 변경 후
     * 갱신된 Session 반환. main 측 Zod 가 enum 검증 + strict mode 로 unknown
     * field 거절.
     */
    updatePermission: (
      id: SessionId,
      patch: PermissionPatch
    ): Promise<Result<Session>> =>
      ipcRenderer.invoke('session/update-permission', id, patch) as Promise<
        Result<Session>
      >,

    /**
     * v1.1.11 (Workspace UX): per-session sticky workspace lock toggle.
     * ChatHeader 의 🔒 toggle 이 호출. main 측이 sessions.workspace_locked
     * 컬럼 갱신 후 ok 반환.
     */
    setWorkspaceLocked: (
      sessionId: SessionId,
      locked: boolean
    ): Promise<Result<{ ok: boolean }>> =>
      ipcRenderer.invoke('session/set-workspace-locked', {
        sessionId,
        locked,
      }) as Promise<Result<{ ok: boolean }>>,

    /**
     * v1.1.11: 특정 세션의 lock 상태 read — UI mount / 새 세션 전환 시 동기화.
     */
    getWorkspaceLocked: (
      sessionId: SessionId
    ): Promise<Result<{ locked: boolean }>> =>
      ipcRenderer.invoke('session/get-workspace-locked', sessionId) as Promise<
        Result<{ locked: boolean }>
      >,
  },

  /**
   * v1.1.15 (Plugin Loader UI) — Sidebar 의 [플러그인] panel 이 사용.
   * main 의 PluginManager 가 boot 시 scan 한 결과 + rescan 트리거.
   */
  plugin: {
    list: (): Promise<
      Result<{
        loaded: Array<{ dir: string; manifest: PluginManifestShape }>;
        issues: Array<{ path: string; reason: string }>;
        rootDir: string;
      }>
    > =>
      ipcRenderer.invoke('plugin/list') as Promise<
        Result<{
          loaded: Array<{ dir: string; manifest: PluginManifestShape }>;
          issues: Array<{ path: string; reason: string }>;
          rootDir: string;
        }>
      >,
    rescan: (): Promise<
      Result<{
        loaded: Array<{ dir: string; manifest: PluginManifestShape }>;
        issues: Array<{ path: string; reason: string }>;
        rootDir: string;
      }>
    > =>
      ipcRenderer.invoke('plugin/rescan') as Promise<
        Result<{
          loaded: Array<{ dir: string; manifest: PluginManifestShape }>;
          issues: Array<{ path: string; reason: string }>;
          rootDir: string;
        }>
      >,
    /**
     * v1.6.5 — plugin hook 의 ctx.notify() 가 main 에서 emit 하면 본 listener
     * 가 renderer 에서 수신. App.tsx 가 toast 로 forward.
     */
    onNotify: (
      handler: (payload: { message: string; kind: 'info' | 'warning' | 'error' }) => void
    ): (() => void) => {
      const listener = (
        _event: unknown,
        payload: { message: string; kind: 'info' | 'warning' | 'error' }
      ): void => {
        handler(payload);
      };
      ipcRenderer.on('plugin/notify', listener);
      return () => ipcRenderer.removeListener('plugin/notify', listener);
    },
  },

  /**
   * Multi-window leader election (SS-5).
   *
   * Spec: docs/session/multi-window.md
   *
   * `acquire` returns whether THIS window is now leader plus the current
   * leader info. `isLeader` is computed in main (which knows the window_id);
   * the renderer never sees its own window_id directly.
   */
  lock: {
    acquire: (
      sessionId: SessionId
    ): Promise<Result<{ acquired: boolean; leader: SessionLockShape | null }>> =>
      ipcRenderer.invoke('lock/acquire', sessionId) as Promise<
        Result<{ acquired: boolean; leader: SessionLockShape | null }>
      >,

    release: (sessionId: SessionId): Promise<Result<void>> =>
      ipcRenderer.invoke('lock/release', sessionId) as Promise<Result<void>>,

    get: (sessionId: SessionId): Promise<Result<SessionLockShape | null>> =>
      ipcRenderer.invoke('lock/get', sessionId) as Promise<Result<SessionLockShape | null>>,

    heartbeat: (sessionId: SessionId): Promise<Result<boolean>> =>
      ipcRenderer.invoke('lock/heartbeat', sessionId) as Promise<Result<boolean>>,

    isLeader: (sessionId: SessionId): Promise<Result<boolean>> =>
      ipcRenderer.invoke('lock/is-leader', sessionId) as Promise<Result<boolean>>,
  },

  /**
   * In-app browser (P1-5).
   *
   * Spec: docs/session/browser.md
   *
   * Renderer drives tab CRUD; main owns the WebContentsView lifecycle.
   * Per-session partition isolation matches the Codex codex-browser-app
   * pattern (see `partitionIdFor` in @/types/helpers).
   *
   * `onTabUpdated` returns an unsubscribe function — callers MUST invoke
   * it on unmount to avoid leaking listeners.
   */
  browser: {
    openTab: (args: {
      session_id: SessionId;
      tab_id: string;
      url: string;
    }): Promise<Result<BrowserTabStateShape>> =>
      ipcRenderer.invoke('browser/open-tab', args) as Promise<Result<BrowserTabStateShape>>,

    closeTab: (tabId: string): Promise<Result<void>> =>
      ipcRenderer.invoke('browser/close-tab', tabId) as Promise<Result<void>>,

    switchTab: (sessionId: SessionId, tabId: string): Promise<Result<void>> =>
      ipcRenderer.invoke('browser/switch-tab', sessionId, tabId) as Promise<Result<void>>,

    navigate: (tabId: string, url: string): Promise<Result<void>> =>
      ipcRenderer.invoke('browser/navigate', tabId, url) as Promise<Result<void>>,

    back: (tabId: string): Promise<Result<void>> =>
      ipcRenderer.invoke('browser/back', tabId) as Promise<Result<void>>,

    forward: (tabId: string): Promise<Result<void>> =>
      ipcRenderer.invoke('browser/forward', tabId) as Promise<Result<void>>,

    reload: (tabId: string): Promise<Result<void>> =>
      ipcRenderer.invoke('browser/reload', tabId) as Promise<Result<void>>,

    /**
     * v1.6.1 — Tab 의 visible page 를 PNG 로 capture. base64 string 반환
     * (no `data:` prefix) + 실제 이미지 크기. tab 미존재 / 파괴 시 value=null.
     */
    captureTab: (
      tabId: string
    ): Promise<Result<{ png_base64: string; width: number; height: number } | null>> =>
      ipcRenderer.invoke('browser/capture-tab', tabId) as Promise<
        Result<{ png_base64: string; width: number; height: number } | null>
      >,

    /**
     * v1.6.14 — Tab 의 DOM 구조를 JSON-stringified DomDumpNode 로 추출.
     * webview 가 별도 process 라 renderer 직접 접근 X — main 이
     * `webContents.executeJavaScript` 로 호출 후 결과 반환.
     * options.selector default 'body'. tab 미존재/파괴/script 실패 시 null.
     */
    dumpDom: (
      tabId: string,
      options?: { selector?: string; maxDepth?: number; maxText?: number }
    ): Promise<Result<{ url: string; selector: string; dump_json: string } | null>> =>
      ipcRenderer.invoke('browser/dump-dom', tabId, options ?? {}) as Promise<
        Result<{ url: string; selector: string; dump_json: string } | null>
      >,

    setBounds: (tabId: string, bounds: BrowserBoundsShape): Promise<Result<void>> =>
      ipcRenderer.invoke('browser/set-bounds', tabId, bounds) as Promise<Result<void>>,

    listTabs: (sessionId: SessionId): Promise<Result<BrowserTabStateShape[]>> =>
      ipcRenderer.invoke('browser/list-tabs', sessionId) as Promise<Result<BrowserTabStateShape[]>>,

    onTabUpdated: (listener: (state: BrowserTabStateShape) => void): (() => void) => {
      const handler = (_event: Electron.IpcRendererEvent, state: BrowserTabStateShape): void => {
        listener(state);
      };
      ipcRenderer.on('browser/tab-updated', handler);
      return () => ipcRenderer.removeListener('browser/tab-updated', handler);
    },
  },

  /**
   * AI streaming via real CLI subprocesses (P1-4).
   *
   * Spec: docs/session/cross-ai-sync.md
   *
   * Flow:
   *   1) detectCli() — onboarding 에서 호출, 설치된 CLI 위치+버전 표시
   *   2) startStream({stream_id, model, turns}) — main 이 적합한 provider 선택,
   *      stream_id 단위로 격리된 stream 시작. main 은 즉시 응답, 후속
   *      이벤트는 onStreamEvent / onStreamEnd 로 흘러옴.
   *   3) stopStream(stream_id) — mid-stream cancel.
   *
   * onStreamEvent / onStreamEnd 는 unsubscribe 함수를 반환 — 반드시 호출!
   */
  ai: {
    detectCli: (): Promise<Result<CliDetectionShape>> =>
      ipcRenderer.invoke('ai/detect-cli') as Promise<Result<CliDetectionShape>>,

    startStream: (args: {
      stream_id: string;
      model: string;
      turns: Turn[];
      session_id?: string;
      workspace_root?: string;
      // PermissionLevel mirrored as string-literal union so preload doesn't
      // depend on @/types runtime import (preload sandbox-safety). Keep
      // in sync with `PermissionLevelSchema` in @/types/permission.
      permission_level?: 'read_only' | 'workspace_write' | 'full_access' | 'custom';
    }): Promise<Result<{ stream_id: string; source: string }>> =>
      ipcRenderer.invoke('ai/start-stream', args) as Promise<
        Result<{ stream_id: string; source: string }>
      >,

    stopStream: (streamId: string): Promise<Result<void>> =>
      ipcRenderer.invoke('ai/stop-stream', streamId) as Promise<Result<void>>,

    onStreamEvent: (listener: (payload: AiStreamEventPayload) => void): (() => void) => {
      const handler = (_event: Electron.IpcRendererEvent, payload: AiStreamEventPayload): void => {
        listener(payload);
      };
      ipcRenderer.on('ai/stream-event', handler);
      return () => ipcRenderer.removeListener('ai/stream-event', handler);
    },

    onStreamEnd: (listener: (payload: AiStreamEndPayload) => void): (() => void) => {
      const handler = (_event: Electron.IpcRendererEvent, payload: AiStreamEndPayload): void => {
        listener(payload);
      };
      ipcRenderer.on('ai/stream-end', handler);
      return () => ipcRenderer.removeListener('ai/stream-end', handler);
    },
  },

  /**
   * Tool Queue bridge. Main owns the registry and execution queue; renderer
   * receives only serializable call/result objects.
   */
  tool: {
    list: (): Promise<
      Result<Array<{ id: string; version: string; source: string; name: string }>>
    > =>
      ipcRenderer.invoke('tool/list') as Promise<
        Result<Array<{ id: string; version: string; source: string; name: string }>>
      >,

    execute: (call: ToolCallShape): Promise<Result<ToolResultShape>> =>
      ipcRenderer.invoke('tool/execute', call) as Promise<Result<ToolResultShape>>,

    cancelCall: (callId: string, reason?: string): Promise<Result<boolean>> =>
      ipcRenderer.invoke('tool/cancel-call', callId, reason) as Promise<Result<boolean>>,

    cancelTurn: (turnId: string, reason?: string): Promise<Result<number>> =>
      ipcRenderer.invoke('tool/cancel-turn', turnId, reason) as Promise<Result<number>>,

    stats: (): Promise<
      Result<{ active: number; pending: number; by_session: Record<string, number> }>
    > =>
      ipcRenderer.invoke('tool/stats') as Promise<
        Result<{ active: number; pending: number; by_session: Record<string, number> }>
      >,
  },

  /**
   * v0.2.0 — MCP Bridge (Issue #5).
   *
   * Spec: docs/tools/mcp-bridge.md
   *
   * Renderer 에서 MCP 서버를 등록 / 해제 / 재시작 + 상태 조회.
   * 각 MCP 서버의 tools/list 결과는 ToolRegistry 에 자동 등록되어
   * `tool/*` API 로도 호출 가능 (id: 'mcp.{server_id}.{tool_name}').
   */
  mcp: {
    list: (): Promise<Result<McpServerStateShape[]>> =>
      ipcRenderer.invoke('mcp/list') as Promise<Result<McpServerStateShape[]>>,

    add: (config: McpServerConfigShape): Promise<Result<void>> =>
      ipcRenderer.invoke('mcp/add', config) as Promise<Result<void>>,

    remove: (id: string): Promise<Result<void>> =>
      ipcRenderer.invoke('mcp/remove', id) as Promise<Result<void>>,

    restart: (id: string): Promise<Result<void>> =>
      ipcRenderer.invoke('mcp/restart', id) as Promise<Result<void>>,

    getLogs: (id: string): Promise<Result<string[]>> =>
      ipcRenderer.invoke('mcp/get-logs', id) as Promise<Result<string[]>>,

    /**
     * v0.9.0 — 추천 MCP 서버 + Claude/Codex CLI config 에서 발견된 서버.
     * best-effort: 권한 / 파일 부재 시 빈 배열 반환 (silent).
     */
    discover: (): Promise<Result<McpDiscoveryShape>> =>
      ipcRenderer.invoke('mcp/discover') as Promise<Result<McpDiscoveryShape>>,
  },

  /**
   * v0.4.0 — Usage / cost telemetry (read-only).
   *
   * Spec: ROADMAP.md (v0.4.0 Usage/Cost Tracking MVP)
   *
   * 3개 read-only handler. Mutation 은 의도적으로 노출 X — usage 는
   * stream pump 에서만 영속되는 append-only 기록이다.
   *   - summary    {from?, to?, provider?, model?, session_id?}
   *   - daily      {days, provider?}
   *   - bySession  sessionId
   */
  usage: {
    summary: (args?: UsageSummaryArgsShape): Promise<Result<UsageSummaryShape[]>> =>
      ipcRenderer.invoke('usage/summary', args ?? {}) as Promise<Result<UsageSummaryShape[]>>,

    daily: (args: UsageDailyArgsShape): Promise<Result<DailyUsageRowShape[]>> =>
      ipcRenderer.invoke('usage/daily', args) as Promise<Result<DailyUsageRowShape[]>>,

    bySession: (sessionId: string): Promise<Result<UsageEventShape[]>> =>
      ipcRenderer.invoke('usage/by-session', sessionId) as Promise<Result<UsageEventShape[]>>,

    /**
     * v0.9.0 — Range filter 안의 usage 를 CSV (RFC 4180) 문자열로 export.
     * Renderer 가 Blob + <a download> 로 다운로드 트리거.
     */
    exportCsv: (args?: UsageSummaryArgsShape): Promise<Result<string>> =>
      ipcRenderer.invoke('usage/export-csv', args ?? {}) as Promise<Result<string>>,

    /**
     * v0.9.0 — 비용 한도 / 알림 임계값 조회. cost_limit_usd 가 undefined 면
     * "한도 미설정". alert_threshold 는 0~1 default 0.8.
     */
    getLimits: (): Promise<Result<UsageLimitsShape>> =>
      ipcRenderer.invoke('usage/get-limits') as Promise<Result<UsageLimitsShape>>,

    /**
     * v0.9.0 — 비용 한도 / 알림 임계값 영속. null 을 보내면 해당 필드 제거.
     */
    setLimits: (patch: UsageLimitsPatchShape): Promise<Result<void>> =>
      ipcRenderer.invoke('usage/set-limits', patch) as Promise<Result<void>>,
  },

  /**
   * v0.12.0 (I) — Cross-AI Verify/Compare.
   *
   * Spec: ROADMAP.md (v0.12.0 I — Codex 권고)
   *
   * Flow:
   *   1) run({prompt, models, ...}) — main 이 양쪽 provider 병렬 실행 시작.
   *      즉시 run_id 반환, 후속 이벤트는 onStreamEvent 로 도착.
   *   2) onStreamEvent — compare_start / compare_side_delta /
   *      compare_side_done / compare_side_error / compare_complete.
   *   3) cancel(run_id) — mid-stream cancel. 양쪽 모두 abort.
   *   4) get(run_id) / list(session_id) — 영속된 run 조회.
   *
   * onStreamEvent 는 unsubscribe 함수 반환 — 반드시 호출.
   */
  compare: {
    run: (args: CompareRunArgsShape): Promise<Result<{ run_id: string }>> =>
      ipcRenderer.invoke('compare/run', args) as Promise<Result<{ run_id: string }>>,

    get: (runId: string): Promise<Result<CompareRunShape | null>> =>
      ipcRenderer.invoke('compare/get', { run_id: runId }) as Promise<
        Result<CompareRunShape | null>
      >,

    list: (
      sessionId: string,
      limit?: number
    ): Promise<Result<CompareRunShape[]>> =>
      ipcRenderer.invoke(
        'compare/list',
        limit !== undefined ? { session_id: sessionId, limit } : { session_id: sessionId }
      ) as Promise<Result<CompareRunShape[]>>,

    cancel: (runId: string): Promise<Result<void>> =>
      ipcRenderer.invoke('compare/cancel', { run_id: runId }) as Promise<Result<void>>,

    onStreamEvent: (listener: (event: CompareEventShape) => void): (() => void) => {
      const handler = (
        _event: Electron.IpcRendererEvent,
        payload: CompareEventShape
      ): void => {
        listener(payload);
      };
      ipcRenderer.on('compare/stream-event', handler);
      return () => ipcRenderer.removeListener('compare/stream-event', handler);
    },
  },

  /**
   * v1.0.11 SEC-3 — Audit log read API.
   *
   * Spec: docs/v1.x-roadmap.md (SEC-3)
   *
   * Renderer 의 진단 탭이 audit_log 조회. 모든 method 는 read-only —
   * 영속 (recordEvent) 는 main 의 sink closure 에서만 호출.
   */
  audit: {
    /** 최근 audit event 조회 — 시간 DESC. limit default 100, max 1000. */
    recent: (args?: AuditRecentArgsShape): Promise<Result<AuditEventShape[]>> =>
      ipcRenderer.invoke('audit/recent', args ?? {}) as Promise<Result<AuditEventShape[]>>,

    /** 단일 세션의 audit event — 시간 ASC. limit default 500, max 5000. */
    bySession: (
      sessionId: string,
      limit?: number
    ): Promise<Result<AuditEventShape[]>> =>
      ipcRenderer.invoke(
        'audit/by-session',
        limit !== undefined ? { session_id: sessionId, limit } : { session_id: sessionId }
      ) as Promise<Result<AuditEventShape[]>>,
  },

  /**
   * v1.1.0 SEC-2 full — Permission confirm + grant management.
   *
   * Spec: docs/v1.x-roadmap.md (SEC-2), Codex 외부 검토 Q6.
   *
   * 흐름:
   *  1. main 의 ToolQueue 가 사용자 confirmation 필요 시
   *     'permission/request' (receive) 발화 → 본 모듈의 onRequest listener.
   *  2. 사용자가 응답 (allow once / session / always / deny) 후
   *     respond() 로 main 에 통지.
   *  3. main 이 'session' / 'always' 면 grant 영속, 'once' 는 영속 X.
   */
  permission: {
    /** main → renderer 의 permission/request 구독. unsubscribe 함수 반환. */
    onRequest: (
      listener: (request: PermissionRequestShape) => void
    ): (() => void) => {
      const handler = (
        _event: Electron.IpcRendererEvent,
        payload: PermissionRequestShape
      ): void => {
        listener(payload);
      };
      ipcRenderer.on('permission/request', handler);
      return () => ipcRenderer.removeListener('permission/request', handler);
    },

    /** 사용자 응답을 main 으로. 매칭되는 pending 없으면 ok=true 지만 silently drop. */
    respond: (
      request_id: string,
      decision: 'once' | 'session' | 'always' | 'deny',
      reason?: string
    ): Promise<Result<{ matched: boolean }>> =>
      ipcRenderer.invoke(
        'permission/respond',
        reason !== undefined ? { request_id, decision, reason } : { request_id, decision }
      ) as Promise<Result<{ matched: boolean }>>,

    /** UI mount/reload 시 — 진행 중 요청 다시 받아 inline card 복원. */
    listPending: (): Promise<Result<PermissionRequestShape[]>> =>
      ipcRenderer.invoke('permission/list-pending') as Promise<
        Result<PermissionRequestShape[]>
      >,

    /** Settings > 권한 — active grant 목록 (revoked 제외). */
    listGrants: (
      sessionId: string
    ): Promise<Result<PermissionGrantSummaryShape[]>> =>
      ipcRenderer.invoke('permission/grants/list', { session_id: sessionId }) as Promise<
        Result<PermissionGrantSummaryShape[]>
      >,

    /** Grant revoke. */
    revokeGrant: (grantId: string): Promise<Result<{ revoked: boolean }>> =>
      ipcRenderer.invoke('permission/grants/revoke', { grant_id: grantId }) as Promise<
        Result<{ revoked: boolean }>
      >,
  },

  /**
   * v1.7.4 — Bot Automation rules. Sidebar [자동화] panel + IPC.
   *
   * Rule kinds: 'interval' (ms) / 'cron' (croner expr) / 'webhook' (HTTP path).
   * handler 는 main 이 default 'no-op log' — 실 handler 등록은 후속.
   */
  automation: {
    list: (): Promise<Result<AutomationRuleSummaryShape[]>> =>
      ipcRenderer.invoke('automation/list') as Promise<
        Result<AutomationRuleSummaryShape[]>
      >,
    register: (
      rule: AutomationRuleRegisterShape
    ): Promise<Result<AutomationRuleSummaryShape>> =>
      ipcRenderer.invoke('automation/register', rule) as Promise<
        Result<AutomationRuleSummaryShape>
      >,
    unregister: (name: string): Promise<Result<{ removed: boolean }>> =>
      ipcRenderer.invoke('automation/unregister', name) as Promise<
        Result<{ removed: boolean }>
      >,
    fire: (name: string): Promise<Result<void>> =>
      ipcRenderer.invoke('automation/fire', name) as Promise<Result<void>>,
    getNextRun: (
      cronExpr: string,
      tz?: string
    ): Promise<Result<{ next_run: string | null }>> =>
      ipcRenderer.invoke('automation/get-next-run', cronExpr, tz) as Promise<
        Result<{ next_run: string | null }>
      >,
    /** v1.7.25 — Registered handler 이름 목록. */
    listHandlers: (): Promise<Result<string[]>> =>
      ipcRenderer.invoke('automation/list-handlers') as Promise<Result<string[]>>,
    /** v1.7.26 — Automation audit log 최근 N개 조회. rule_name 필터 지원. */
    auditLog: (opts?: {
      rule_name?: string;
      limit?: number;
    }): Promise<Result<AuditEventShape[]>> =>
      ipcRenderer.invoke('automation/audit-log', opts) as Promise<
        Result<AuditEventShape[]>
      >,
    /** v1.7.27 — rule 활성화/비활성화 토글. */
    setEnabled: (name: string, enabled: boolean): Promise<Result<boolean>> =>
      ipcRenderer.invoke('automation/set-enabled', { name, enabled }) as Promise<
        Result<boolean>
      >,
    /** v1.7.28 — Rules JSON export. handler closure 제외, settings 영속 shape 만 직렬화. */
    exportRules: (): Promise<Result<string>> =>
      ipcRenderer.invoke('automation/export') as Promise<Result<string>>,
    /**
     * v1.7.28 — Rules JSON import. mode='skip' (default) 면 이름 충돌 시 건너뜀.
     * 보안: caller 가 user confirm 후 호출. 부분 실패는 errors[] 에 누적 보고.
     */
    importRules: (
      json: string,
      mode?: 'skip' | 'overwrite'
    ): Promise<Result<{ added: number; skipped: number; errors: string[] }>> =>
      ipcRenderer.invoke('automation/import', { json, mode: mode ?? 'skip' }) as Promise<
        Result<{ added: number; skipped: number; errors: string[] }>
      >,
  },
};

// v1.7.4 — Automation IPC types (preload-exposed shape).
// v1.7.25 — handler_name + handler_config 추가 (registry 통합).
// v1.7.27 — enabled 추가.
export type AutomationKindShape = 'interval' | 'cron' | 'webhook';
export interface AutomationRuleSummaryShape {
  name: string;
  kind: AutomationKindShape;
  interval_ms?: number;
  cron_expr?: string;
  cron_tz?: string;
  webhook_path?: string;
  next_run: string | null;
  handler_name?: string;
  handler_config?: Record<string, unknown>;
  /** v1.7.27 — false 면 비활성. undefined/true 는 활성. */
  enabled?: boolean;
}
export interface AutomationRuleRegisterShape {
  name: string;
  kind: AutomationKindShape;
  interval_ms?: number;
  cron_expr?: string;
  cron_tz?: string;
  webhook_path?: string;
  handler_name?: string;
  handler_config?: Record<string, unknown>;
  /** v1.7.27 — 초기 활성 상태. 미지정 시 활성. */
  enabled?: boolean;
}

/** v1.7.26 — automation/audit-log 조회 결과 row shape. */
export interface AutomationAuditLogShape {
  id: number;
  timestamp: string;
  session_id: string;
  event: string;
  capability: string;
  target_json: string;
  decision_reason: string;
  outcome?: string;
  error?: string;
}

contextBridge.exposeInMainWorld('dreampia', api);

// TypeScript: window.dreampia type
declare global {
  interface Window {
    dreampia: typeof api;
  }
}
