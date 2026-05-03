/**
 * Vitest setup — runs before every test file.
 *
 * Provides:
 *   - @testing-library/jest-dom matchers (toBeInTheDocument, etc.)
 *   - Cleanup after each test
 *   - Mock window.dreampia (IPC bridge) with in-memory SessionStore stand-in
 */

import '@testing-library/jest-dom/vitest';
import { afterEach, beforeEach, vi } from 'vitest';
import { cleanup } from '@testing-library/react';
import type { Session, Turn } from '../src/types';
import type { Result, SessionMetaPatch } from '../src/main/types';

// ────────────────────────────────────────────────────────────
// In-memory mock store (shared across all renderer tests)
// ────────────────────────────────────────────────────────────

interface MockSessionMeta {
  id: string;
  schema_version: number;
  provider: 'claude' | 'codex';
  workspace_id: string;
  title: string;
  pinned: boolean;
  archived: boolean;
  parent_session_id?: string;
  created_at: string;
  updated_at: string;
}

interface MockSessionLock {
  session_id: string;
  leader_window_id: string;
  leader_pid: number;
  acquired_at: string;
  heartbeat_at: string;
  ttl_seconds: number;
}

interface MockBrowserTabState {
  tab_id: string;
  session_id: string;
  url: string;
  title: string;
  favicon_url: string | null;
  status: 'loading' | 'ready' | 'failed';
  can_go_back: boolean;
  can_go_forward: boolean;
}

interface MockBrowserBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface MockWorkspaceInfo {
  path: string;
  name: string;
}

// v0.6.0 (F-019) — @ mention 의 file IPC 가 반환하는 형태.
interface MockFileEntry {
  path: string;
  size_bytes: number;
  mtime: string;
}
interface MockFileContent {
  content: string;
  truncated: boolean;
  line_count: number;
}

// v0.7.0 (F-026) — Sidebar 검색 결과 형태. SessionStore.TurnSearchResult 와 sync.
interface MockTurnSearchResult {
  turn_id: string;
  session_id: string;
  role: string;
  snippet: string;
  rank: number;
  timestamp: string;
}

type BrowserUpdateListener = (state: MockBrowserTabState) => void;

// ── ai/* (P1-4) — mock IPC for IpcStreamingProvider tests ──
interface MockCliInfo {
  path: string;
  version: string | null;
}
interface MockCliDetection {
  claude: MockCliInfo | null;
  codex: MockCliInfo | null;
}
type MockStreamEventPayload = { stream_id: string; event: unknown };
type MockStreamEndPayload = { stream_id: string };
type AiStreamEventListener = (payload: MockStreamEventPayload) => void;
type AiStreamEndListener = (payload: MockStreamEndPayload) => void;

// ── mcp/* (v0.2.0 Issue #5) — mock IPC for useMcp / McpSettings tests ──
interface MockMcpServerConfig {
  id: string;
  name: string;
  command: string;
  args: string[];
  env: Record<string, string>;
  cwd?: string;
  enabled: boolean;
  added_at: string;
}
type MockMcpStatus = 'disconnected' | 'connecting' | 'ready' | 'error' | 'disabled';
interface MockMcpServerState {
  config: MockMcpServerConfig;
  status: MockMcpStatus;
  pid?: number;
  tools: Array<{ name: string; description?: string; input_schema?: Record<string, unknown> }>;
  last_error?: string;
  last_log: string[];
}

// ── usage/* (v0.4.0) — mock IPC for useUsage / UsageSettings tests ──
type MockUsageProvider = 'claude' | 'codex' | 'mock';
interface MockUsageEvent {
  id: string;
  session_id: string;
  turn_id: string;
  provider: MockUsageProvider;
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
interface MockUsageSummary {
  provider: MockUsageProvider;
  model: string;
  total_input: number;
  total_output: number;
  total_cache_creation: number;
  total_cache_read: number;
  total_reasoning: number;
  total_cost_usd: number;
  event_count: number;
}
interface MockDailyUsageRow {
  date: string;
  provider: MockUsageProvider;
  total_cost_usd: number;
  total_tokens: number;
}

const mockStore = {
  sessions: new Map<string, Session>(),
  locks: new Map<string, MockSessionLock>(),
  /** This window's id (mocked). Tests can override to simulate other windows. */
  windowId: 'test-window-1',

  // ── browser/* (P1-5) ───────────────────────────────────────
  // Reproduces the BrowserManager surface in-memory:
  //   browserTabs:    tab_id -> state
  //   browserActive:  session_id -> tab_id (the visible tab per session)
  //   browserBounds:  tab_id -> last reported bounds
  //   browserListeners: subscribers to onTabUpdated
  browserTabs: new Map<string, MockBrowserTabState>(),
  browserActive: new Map<string, string>(),
  browserBounds: new Map<string, MockBrowserBounds>(),
  browserListeners: new Set<BrowserUpdateListener>(),

  // ── ai/* (P1-4) ───────────────────────────────────────
  // Tests can inject events via __emitAiStreamEvent / __emitAiStreamEnd.
  // detect default: claude detected, codex null. Override per-test by
  // mutating __mockStore.aiDetection.
  aiDetection: {
    claude: { path: '/usr/local/bin/claude', version: '1.2.3' },
    codex: null,
  } as MockCliDetection,

  // ── workspace (Phase 2) ────────────────────────────────
  // 사용자가 picker 로 선택한 폴더. null = 미선택 (= settings.json 미존재).
  // Tests can pre-set or simulate pick by reassigning.
  workspace: null as MockWorkspaceInfo | null,
  // pickFolder 호출 시 반환할 다음 값. null = 사용자 취소. undefined = default
  // (path: '/picked/dir', name: 'dir'). Tests can inject via __mockStore.
  workspacePickNext: undefined as MockWorkspaceInfo | null | undefined,
  // v0.6.0 (F-019) — file IPC mock state. Tests 가 미리 채워두면 ChatInput @
  // popover 가 실제 파일 검색 흐름을 검증할 수 있다.
  workspaceFiles: [] as MockFileEntry[],
  workspaceFileContents: new Map<string, MockFileContent>(),

  // ── onboarding (Phase 3 B2) ────────────────────────────
  // 첫 실행 wizard 표시 여부. 기본 true — App.tsx 회귀 테스트가 wizard 와
  // 충돌하지 않도록. Wizard 자체 검증 테스트는 false 로 override.
  onboardingCompleted: true,
  // v0.3.0 — wizard / 설정에서 사용자가 선택할 수 있는 기본 provider 와
  // permission level. 기본값은 main 측 fallback 과 일치 ('auto' / 'workspace_write').
  defaultProvider: 'auto' as 'auto' | 'claude' | 'codex' | 'mock',
  defaultPermissionLevel: 'workspace_write' as
    | 'read_only'
    | 'workspace_write'
    | 'full_access'
    | 'custom',
  // v0.8.0 — Settings 모달 [테마] 탭 + [권한] 탭 capability 표시용 mock state.
  // theme 기본값은 'system' (main side 와 동일). capabilities 는 LEVEL_CAPABILITIES
  // 의 단순 mirror — 테스트가 customize 가능.
  theme: 'system' as 'light' | 'dark' | 'system',
  // v0.10.0 — 사용자 지정 단축키 매핑. 비어 있으면 default 사용.
  keyboardShortcuts: {} as Record<string, string>,
  permissionCapabilities: {
    read_only: ['LOCAL_READ', 'NETWORK_LOCAL', 'NETWORK_AI', 'SYSTEM_NOTIFICATION'],
    workspace_write: [
      'LOCAL_READ',
      'NETWORK_LOCAL',
      'NETWORK_AI',
      'SYSTEM_NOTIFICATION',
      'LOCAL_WRITE',
      'LOCAL_WRITE.create',
      'LOCAL_WRITE.modify',
      'LOCAL_WRITE.rename',
      'LOCAL_EXECUTE',
      'NETWORK_REMOTE',
      'SYSTEM_CLIPBOARD.read',
    ],
    full_access: [
      'LOCAL_READ',
      'NETWORK_LOCAL',
      'NETWORK_AI',
      'SYSTEM_NOTIFICATION',
      'LOCAL_WRITE',
      'LOCAL_WRITE.create',
      'LOCAL_WRITE.modify',
      'LOCAL_WRITE.rename',
      'LOCAL_EXECUTE',
      'NETWORK_REMOTE',
      'SYSTEM_CLIPBOARD.read',
      'LOCAL_OUTSIDE_CWD',
      'LOCAL_OUTSIDE_CWD.read',
      'LOCAL_OUTSIDE_CWD.write',
      'LOCAL_EXECUTE.elevated',
      'NETWORK_REMOTE.upload',
      'SYSTEM_AUTOMATION',
      'SYSTEM_AUTOMATION.cron',
      'SYSTEM_AUTOMATION.event',
      'SYSTEM_CLIPBOARD.write',
      'SYSTEM_HOTKEY',
    ],
    custom: [] as string[],
  },
  aiStartedStreams: new Map<
    string,
    {
      model: string;
      turns: unknown[];
      session_id?: string;
      workspace_root?: string;
      permission_level?: 'read_only' | 'workspace_write' | 'full_access' | 'custom';
    }
  >(),
  aiStoppedStreams: new Set<string>(),
  aiEventListeners: new Set<AiStreamEventListener>(),
  aiEndListeners: new Set<AiStreamEndListener>(),

  // ── mcp/* (v0.2.0 Issue #5) ───────────────────────────
  // 등록된 MCP 서버 목록 (in-memory). Tests 가 mcpServers 를 미리 채우거나
  // mcpAddBehavior 로 add 시 reject 시뮬레이션 가능.
  mcpServers: new Map<string, MockMcpServerState>(),
  mcpAddBehavior: 'success' as 'success' | 'fail',

  // ── usage/* (v0.4.0) ───────────────────────────────────
  // Tests 가 미리 채워두면 useUsage / UsageSettings 가 그대로 받아 표시.
  // bySession 은 sessionId 키로 분리 — 같은 session 의 여러 event 도 가능.
  usageSummary: [] as MockUsageSummary[],
  usageDaily: [] as MockDailyUsageRow[],
  usageBySession: new Map<string, MockUsageEvent[]>(),
  usageError: null as string | null,
  // v0.9.0 — CSV export 가 반환할 mock string. 비어 있으면 header 만.
  usageExportCsv: '' as string,
  // v0.9.0 — 비용 한도 / 임계값. limits 가 null 이면 설정 없음.
  usageLimits: { alert_threshold: 0.8 } as { cost_limit_usd?: number; alert_threshold: number },
  // v0.9.0 — MCP discovery mock state.
  mcpDiscovery: {
    suggested: [] as Array<{
      id: string;
      name: string;
      description: string;
      command: string;
      args: string[];
      install_hint: string;
    }>,
    from_claude: [] as MockMcpServerConfig[],
    from_codex: [] as MockMcpServerConfig[],
  },

  // ── session/search (v0.7.0 F-026) ──────────────────────
  // Tests 가 query 별 결과를 미리 inject. 키는 query 문자열, 값은 결과 배열.
  // 미설정 query 는 빈 배열 반환. error 가 set 돼 있으면 모든 search 실패.
  searchResults: new Map<string, MockTurnSearchResult[]>(),
  searchError: null as string | null,
};

function emitBrowserUpdate(state: MockBrowserTabState): void {
  for (const fn of mockStore.browserListeners) {
    try {
      fn(state);
    } catch {
      // ignore listener errors in tests
    }
  }
}

function emitAiStreamEvent(payload: MockStreamEventPayload): void {
  for (const fn of mockStore.aiEventListeners) {
    try {
      fn(payload);
    } catch {
      // ignore listener errors in tests
    }
  }
}

function emitAiStreamEnd(payload: MockStreamEndPayload): void {
  for (const fn of mockStore.aiEndListeners) {
    try {
      fn(payload);
    } catch {
      // ignore listener errors in tests
    }
  }
}

/**
 * Test helper: seed mockStore from a test file.
 *
 * Usage:
 *   import { __mockStore } from '../setup';
 *   __mockStore.sessions.set(s.id, s);
 *   __mockStore.locks.set(id, { ... });
 *   __mockStore.windowId = 'window-A';
 *   __mockStore.browserTabs.set(tabId, { ... });
 *   __emitBrowserUpdate(state);  // simulate main → renderer event
 *   __emitAiStreamEvent({stream_id, event});  // P1-4
 *   __emitAiStreamEnd({stream_id});           // P1-4
 */
export const __mockStore = mockStore;
export const __emitBrowserUpdate = emitBrowserUpdate;
export const __emitAiStreamEvent = emitAiStreamEvent;
export const __emitAiStreamEnd = emitAiStreamEnd;

function toMeta(s: Session): MockSessionMeta {
  const meta: MockSessionMeta = {
    id: s.id,
    schema_version: s.schema_version,
    provider: s.provider,
    workspace_id: s.workspace_id,
    title: s.title,
    pinned: s.pinned,
    archived: s.archived,
    created_at: s.created_at,
    updated_at: s.updated_at,
  };
  if (s.parent_session_id !== undefined) {
    meta.parent_session_id = s.parent_session_id;
  }
  return meta;
}

beforeEach(() => {
  mockStore.sessions.clear();
  mockStore.locks.clear();
  mockStore.windowId = 'test-window-1';
  mockStore.browserTabs.clear();
  mockStore.browserActive.clear();
  mockStore.browserBounds.clear();
  mockStore.browserListeners.clear();
  mockStore.aiDetection = {
    claude: { path: '/usr/local/bin/claude', version: '1.2.3' },
    codex: null,
  };
  mockStore.aiStartedStreams.clear();
  mockStore.aiStoppedStreams.clear();
  mockStore.aiEventListeners.clear();
  mockStore.aiEndListeners.clear();
  mockStore.mcpServers.clear();
  mockStore.mcpAddBehavior = 'success';
  mockStore.usageSummary = [];
  mockStore.usageDaily = [];
  mockStore.usageBySession.clear();
  mockStore.usageError = null;
  // v0.9.0 — usage / mcp discovery mock state reset.
  mockStore.usageExportCsv = '';
  mockStore.usageLimits = { alert_threshold: 0.8 };
  mockStore.mcpDiscovery = {
    suggested: [],
    from_claude: [],
    from_codex: [],
  };
  mockStore.workspace = null;
  mockStore.workspacePickNext = undefined;
  mockStore.workspaceFiles = [];
  mockStore.workspaceFileContents.clear();
  mockStore.searchResults.clear();
  mockStore.searchError = null;
  mockStore.onboardingCompleted = true;
  mockStore.defaultProvider = 'auto';
  mockStore.defaultPermissionLevel = 'workspace_write';
  // v0.8.0 — theme 도 매 테스트마다 default 로 reset.
  mockStore.theme = 'system';
  // v0.10.0 — keyboard shortcuts overrides 도 reset.
  mockStore.keyboardShortcuts = {};
  // Phase 3 B2: vi.fn 의 call history 도 매 테스트마다 초기화. 그렇지 않으면
  // `expect(mock).toHaveBeenCalled()` 가 이전 테스트의 잔여 호출 때문에
  // 즉시 true 가 되어 waitFor 가 실제 호출을 기다리지 않는다.
  if (typeof window !== 'undefined' && window.dreampia !== undefined) {
    const ws = window.dreampia.workspace;
    if (ws !== undefined) {
      (ws.pickFolder as unknown as { mockClear?: () => void }).mockClear?.();
      (ws.get as unknown as { mockClear?: () => void }).mockClear?.();
      // v0.6.0 (F-019) — file IPC mock clear (정의돼 있을 때만).
      (ws.listFiles as unknown as { mockClear?: () => void } | undefined)?.mockClear?.();
      (ws.readFile as unknown as { mockClear?: () => void } | undefined)?.mockClear?.();
    }
    const sess = window.dreampia.session;
    if (sess !== undefined) {
      (sess.create as unknown as { mockClear?: () => void }).mockClear?.();
      (sess.list as unknown as { mockClear?: () => void }).mockClear?.();
      (sess.get as unknown as { mockClear?: () => void }).mockClear?.();
      (sess.appendTurn as unknown as { mockClear?: () => void }).mockClear?.();
      (sess.updateMeta as unknown as { mockClear?: () => void }).mockClear?.();
      (sess.delete as unknown as { mockClear?: () => void }).mockClear?.();
      // v0.5.0 (F-018) — 새 mutation IPC mock clear (정의돼 있을 때만).
      (
        sess.clearTurns as unknown as { mockClear?: () => void } | undefined
      )?.mockClear?.();
      (
        sess.updateConversation as unknown as { mockClear?: () => void } | undefined
      )?.mockClear?.();
      // v0.7.0 (F-026) — 검색 IPC mock clear.
      (
        sess.search as unknown as { mockClear?: () => void } | undefined
      )?.mockClear?.();
      // v0.8.0 — H Permission Dropdown mock clear.
      (
        sess.updatePermission as unknown as { mockClear?: () => void } | undefined
      )?.mockClear?.();
    }
    const appApi = window.dreampia.app;
    if (appApi !== undefined) {
      (appApi.getDefaultWorkspace as unknown as { mockClear?: () => void }).mockClear?.();
      (appApi.getOnboardingStatus as unknown as { mockClear?: () => void }).mockClear?.();
      (appApi.completeOnboarding as unknown as { mockClear?: () => void }).mockClear?.();
      // v0.3.0 — 새 settings IPC mock clear (정의돼 있을 때만).
      (appApi.resetOnboarding as unknown as { mockClear?: () => void } | undefined)?.mockClear?.();
      (
        appApi.getDefaultProvider as unknown as { mockClear?: () => void } | undefined
      )?.mockClear?.();
      (
        appApi.setDefaultProvider as unknown as { mockClear?: () => void } | undefined
      )?.mockClear?.();
      (
        appApi.getDefaultPermissionLevel as unknown as { mockClear?: () => void } | undefined
      )?.mockClear?.();
      (
        appApi.setDefaultPermissionLevel as unknown as { mockClear?: () => void } | undefined
      )?.mockClear?.();
      // v0.8.0 — theme + capability IPC mock clear (정의돼 있을 때만).
      (
        appApi.getTheme as unknown as { mockClear?: () => void } | undefined
      )?.mockClear?.();
      (
        appApi.setTheme as unknown as { mockClear?: () => void } | undefined
      )?.mockClear?.();
      (
        appApi.getPermissionCapabilities as unknown as { mockClear?: () => void } | undefined
      )?.mockClear?.();
      // v0.10.0 — keyboard shortcuts mock clear.
      (
        appApi.getKeyboardShortcuts as unknown as { mockClear?: () => void } | undefined
      )?.mockClear?.();
      (
        appApi.setKeyboardShortcuts as unknown as { mockClear?: () => void } | undefined
      )?.mockClear?.();
    }
    const ai = window.dreampia.ai;
    if (ai !== undefined) {
      (ai.detectCli as unknown as { mockClear?: () => void }).mockClear?.();
      (ai.startStream as unknown as { mockClear?: () => void }).mockClear?.();
      (ai.stopStream as unknown as { mockClear?: () => void }).mockClear?.();
    }
    const mcp = (window.dreampia as unknown as { mcp?: Record<string, unknown> }).mcp;
    if (mcp !== undefined) {
      (mcp['list'] as unknown as { mockClear?: () => void }).mockClear?.();
      (mcp['add'] as unknown as { mockClear?: () => void }).mockClear?.();
      (mcp['remove'] as unknown as { mockClear?: () => void }).mockClear?.();
      (mcp['restart'] as unknown as { mockClear?: () => void }).mockClear?.();
      (mcp['getLogs'] as unknown as { mockClear?: () => void }).mockClear?.();
      // v0.9.0 — discover mock 도 reset.
      (
        mcp['discover'] as unknown as { mockClear?: () => void } | undefined
      )?.mockClear?.();
    }
    const usageNs = (window.dreampia as unknown as { usage?: Record<string, unknown> }).usage;
    if (usageNs !== undefined) {
      (usageNs['summary'] as unknown as { mockClear?: () => void }).mockClear?.();
      (usageNs['daily'] as unknown as { mockClear?: () => void }).mockClear?.();
      (usageNs['bySession'] as unknown as { mockClear?: () => void }).mockClear?.();
      // v0.9.0 — exportCsv / getLimits / setLimits 는 새 IPC.
      (
        usageNs['exportCsv'] as unknown as { mockClear?: () => void } | undefined
      )?.mockClear?.();
      (
        usageNs['getLimits'] as unknown as { mockClear?: () => void } | undefined
      )?.mockClear?.();
      (
        usageNs['setLimits'] as unknown as { mockClear?: () => void } | undefined
      )?.mockClear?.();
    }
  }
});

afterEach(() => {
  cleanup();
});

// ────────────────────────────────────────────────────────────
// Mock IPC bridge in renderer tests
// ────────────────────────────────────────────────────────────

if (typeof window !== 'undefined') {
  Object.defineProperty(window, 'dreampia', {
    writable: true,
    configurable: true,
    value: {
      invoke: vi.fn(),
      on: vi.fn(),

      app: {
        getDefaultWorkspace: vi.fn(async () => ({
          ok: true,
          value: { root: process.cwd(), name: 'dreampia-dev' },
        })),

        // Phase 3 B2: onboarding wizard 상태 IPC mock.
        getOnboardingStatus: vi.fn(
          async (): Promise<Result<{ completed: boolean }>> => ({
            ok: true,
            value: { completed: mockStore.onboardingCompleted },
          })
        ),

        completeOnboarding: vi.fn(
          async (): Promise<Result<void>> => {
            mockStore.onboardingCompleted = true;
            return { ok: true, value: undefined };
          }
        ),

        // v0.3.0 — Sidebar 의 [온보딩 다시 보기] 버튼 + 새 settings 항목들.
        resetOnboarding: vi.fn(
          async (): Promise<Result<void>> => {
            mockStore.onboardingCompleted = false;
            return { ok: true, value: undefined };
          }
        ),

        getDefaultProvider: vi.fn(
          async (): Promise<Result<'auto' | 'claude' | 'codex' | 'mock'>> => ({
            ok: true,
            value: mockStore.defaultProvider,
          })
        ),

        setDefaultProvider: vi.fn(
          async (
            provider: 'auto' | 'claude' | 'codex' | 'mock'
          ): Promise<Result<void>> => {
            mockStore.defaultProvider = provider;
            return { ok: true, value: undefined };
          }
        ),

        getDefaultPermissionLevel: vi.fn(
          async (): Promise<
            Result<'read_only' | 'workspace_write' | 'full_access' | 'custom'>
          > => ({
            ok: true,
            value: mockStore.defaultPermissionLevel,
          })
        ),

        setDefaultPermissionLevel: vi.fn(
          async (
            level: 'read_only' | 'workspace_write' | 'full_access' | 'custom'
          ): Promise<Result<void>> => {
            mockStore.defaultPermissionLevel = level;
            return { ok: true, value: undefined };
          }
        ),

        // v0.8.0 — Settings 모달 [테마] 탭 + [권한] 탭 capability 표시.
        getTheme: vi.fn(
          async (): Promise<Result<'light' | 'dark' | 'system'>> => ({
            ok: true,
            value: mockStore.theme,
          })
        ),

        setTheme: vi.fn(
          async (theme: 'light' | 'dark' | 'system'): Promise<Result<void>> => {
            mockStore.theme = theme;
            return { ok: true, value: undefined };
          }
        ),

        getPermissionCapabilities: vi.fn(
          async (): Promise<
            Result<
              Record<'read_only' | 'workspace_write' | 'full_access' | 'custom', string[]>
            >
          > => ({
            ok: true,
            value: {
              read_only: [...mockStore.permissionCapabilities.read_only],
              workspace_write: [...mockStore.permissionCapabilities.workspace_write],
              full_access: [...mockStore.permissionCapabilities.full_access],
              custom: [...mockStore.permissionCapabilities.custom],
            },
          })
        ),

        // v0.10.0 — Settings 모달 [단축키] 탭. mockStore.keyboardShortcuts 가
        // 사용자 지정 매핑 — 비어 있으면 default 사용 (renderer side merge).
        getKeyboardShortcuts: vi.fn(
          async (): Promise<Result<Record<string, string>>> => ({
            ok: true,
            value: { ...mockStore.keyboardShortcuts },
          })
        ),

        setKeyboardShortcuts: vi.fn(
          async (overrides: Record<string, string>): Promise<Result<void>> => {
            mockStore.keyboardShortcuts = { ...overrides };
            return { ok: true, value: undefined };
          }
        ),
      },

      // Phase 2: workspace picker — main 의 dialog.showOpenDialog 를 mock.
      // Tests 가 __mockStore.workspacePickNext 로 다음 pick 결과를 inject.
      workspace: {
        get: vi.fn(async (): Promise<Result<MockWorkspaceInfo | null>> => ({
          ok: true,
          value: mockStore.workspace,
        })),

        pickFolder: vi.fn(async (): Promise<Result<MockWorkspaceInfo | null>> => {
          const next =
            mockStore.workspacePickNext === undefined
              ? { path: '/picked/dir', name: 'dir' }
              : mockStore.workspacePickNext;
          if (next !== null) {
            mockStore.workspace = next;
          }
          // Reset injection so next pick uses default unless re-set.
          mockStore.workspacePickNext = undefined;
          return { ok: true, value: next };
        }),

        // v0.6.0 (F-019) — @ mention 의 file enumeration / read.
        // mockStore.workspaceFiles 가 비어 있으면 빈 배열 반환. 테스트가
        // 실제 파일 검색 흐름을 검증하려면 미리 채워넣음.
        listFiles: vi.fn(
          async (_args: {
            workspace_root: string;
            ignore_patterns?: string[];
            max_files?: number;
          }): Promise<Result<MockFileEntry[]>> => ({
            ok: true,
            value: [...mockStore.workspaceFiles],
          })
        ),

        readFile: vi.fn(
          async (args: {
            workspace_root: string;
            rel_path: string;
            max_bytes?: number;
          }): Promise<Result<MockFileContent>> => {
            const content = mockStore.workspaceFileContents.get(args.rel_path);
            if (content === undefined) {
              return { ok: false, error: `file not found: ${args.rel_path}` };
            }
            return { ok: true, value: content };
          }
        ),
      },

      session: {
        list: vi.fn(
          async (): Promise<Result<MockSessionMeta[]>> => ({
            ok: true,
            value: [...mockStore.sessions.values()]
              .map(toMeta)
              // Mirror SessionStore: ORDER BY updated_at DESC.
              .sort((a, b) => (a.updated_at < b.updated_at ? 1 : -1)),
          })
        ),

        get: vi.fn(
          async (id: string): Promise<Result<Session | null>> => ({
            ok: true,
            value: mockStore.sessions.get(id) ?? null,
          })
        ),

        create: vi.fn(async (session: Session): Promise<Result<Session>> => {
          mockStore.sessions.set(session.id, session);
          return { ok: true, value: session };
        }),

        appendTurn: vi.fn(async (id: string, turn: Turn): Promise<Result<void>> => {
          const s = mockStore.sessions.get(id);
          if (s === undefined) {
            return { ok: false, error: `session ${id} not found` };
          }
          const next: Session = {
            ...s,
            updated_at: new Date().toISOString(),
            conversation: {
              ...s.conversation,
              turns: [...s.conversation.turns, turn],
            },
          };
          mockStore.sessions.set(id, next);
          return { ok: true, value: undefined };
        }),

        updateMeta: vi.fn(async (id: string, patch: SessionMetaPatch): Promise<Result<void>> => {
          const s = mockStore.sessions.get(id);
          if (s === undefined) {
            return { ok: false, error: `session ${id} not found` };
          }
          const next: Session = {
            ...s,
            ...(patch.title !== undefined && { title: patch.title }),
            ...(patch.pinned !== undefined && { pinned: patch.pinned }),
            ...(patch.archived !== undefined && { archived: patch.archived }),
            updated_at: new Date().toISOString(),
          };
          mockStore.sessions.set(id, next);
          return { ok: true, value: undefined };
        }),

        delete: vi.fn(async (id: string): Promise<Result<void>> => {
          mockStore.sessions.delete(id);
          return { ok: true, value: undefined };
        }),

        // v0.5.0 (F-018) — `/clear` 슬래시 명령. session 은 유지하고 turns 만
        // 비운다. updated_at 도 새 시각으로 갱신.
        clearTurns: vi.fn(async (id: string): Promise<Result<void>> => {
          const s = mockStore.sessions.get(id);
          if (s === undefined) {
            return { ok: false, error: `session ${id} not found` };
          }
          const next: Session = {
            ...s,
            updated_at: new Date().toISOString(),
            conversation: {
              ...s.conversation,
              turns: [],
            },
          };
          mockStore.sessions.set(id, next);
          return { ok: true, value: undefined };
        }),

        // v0.5.0 (F-018) — `/model <name>` 슬래시 명령. conversation patch
        // 적용 후 갱신된 Session 반환.
        updateConversation: vi.fn(
          async (
            id: string,
            patch: {
              current_model?: string;
              current_effort?: 'minimum' | 'low' | 'medium' | 'high' | 'maximum';
              current_mode?: 'standard' | 'plan' | 'speed' | 'custom';
            }
          ): Promise<Result<Session>> => {
            const s = mockStore.sessions.get(id);
            if (s === undefined) {
              return { ok: false, error: `session ${id} not found` };
            }
            const next: Session = {
              ...s,
              updated_at: new Date().toISOString(),
              conversation: {
                ...s.conversation,
                ...(patch.current_model !== undefined && {
                  current_model: patch.current_model,
                }),
                ...(patch.current_effort !== undefined && {
                  current_effort: patch.current_effort,
                }),
                ...(patch.current_mode !== undefined && { current_mode: patch.current_mode }),
              },
            };
            mockStore.sessions.set(id, next);
            return { ok: true, value: next };
          }
        ),

        // v0.7.0 (F-026) — Sidebar 검색. searchResults 가 미리 채워져 있으면
        // 그 값을 반환, 아니면 빈 배열. searchError 가 set 돼 있으면 실패.
        search: vi.fn(
          async (args: {
            q: string;
            limit?: number;
          }): Promise<Result<MockTurnSearchResult[]>> => {
            if (mockStore.searchError !== null) {
              return { ok: false, error: mockStore.searchError };
            }
            const all = mockStore.searchResults.get(args.q) ?? [];
            const limit = args.limit ?? 50;
            return { ok: true, value: all.slice(0, limit) };
          }
        ),

        // v0.8.0 — H Permission Dropdown. session.permission.default_level 갱신
        // 후 갱신된 Session 반환. session 미존재 시 실패.
        updatePermission: vi.fn(
          async (
            id: string,
            patch: {
              default_level?: 'read_only' | 'workspace_write' | 'full_access' | 'custom';
            }
          ): Promise<Result<Session>> => {
            const s = mockStore.sessions.get(id);
            if (s === undefined) {
              return { ok: false, error: `session ${id} not found` };
            }
            const next: Session = {
              ...s,
              updated_at: new Date().toISOString(),
              permission: {
                ...s.permission,
                ...(patch.default_level !== undefined && {
                  default_level: patch.default_level,
                }),
              },
            };
            mockStore.sessions.set(id, next);
            return { ok: true, value: next };
          }
        ),
      },

      // Mock for SS-5 multi-window leader election. Mirrors the production
      // LeaderElection semantics in-memory: PRIMARY KEY on session_id,
      // takeover when heartbeat_at is older than (now - ttl_seconds), etc.
      lock: {
        acquire: vi.fn(
          async (
            sessionId: string
          ): Promise<Result<{ acquired: boolean; leader: MockSessionLock | null }>> => {
            const now = new Date().toISOString();
            const existing = mockStore.locks.get(sessionId);
            const ttl = existing?.ttl_seconds ?? 30;
            const expiry = new Date(Date.now() - ttl * 1000).toISOString();

            if (existing) {
              if (existing.leader_window_id === mockStore.windowId) {
                existing.heartbeat_at = now;
                return {
                  ok: true,
                  value: { acquired: true, leader: existing },
                };
              }
              if (existing.heartbeat_at < expiry) {
                const taken: MockSessionLock = {
                  session_id: sessionId,
                  leader_window_id: mockStore.windowId,
                  leader_pid: 12345,
                  acquired_at: now,
                  heartbeat_at: now,
                  ttl_seconds: ttl,
                };
                mockStore.locks.set(sessionId, taken);
                return {
                  ok: true,
                  value: { acquired: true, leader: taken },
                };
              }
              return {
                ok: true,
                value: { acquired: false, leader: existing },
              };
            }
            const created: MockSessionLock = {
              session_id: sessionId,
              leader_window_id: mockStore.windowId,
              leader_pid: 12345,
              acquired_at: now,
              heartbeat_at: now,
              ttl_seconds: 30,
            };
            mockStore.locks.set(sessionId, created);
            return {
              ok: true,
              value: { acquired: true, leader: created },
            };
          }
        ),

        release: vi.fn(async (sessionId: string): Promise<Result<void>> => {
          const existing = mockStore.locks.get(sessionId);
          if (existing && existing.leader_window_id === mockStore.windowId) {
            mockStore.locks.delete(sessionId);
          }
          return { ok: true, value: undefined };
        }),

        get: vi.fn(
          async (sessionId: string): Promise<Result<MockSessionLock | null>> => ({
            ok: true,
            value: mockStore.locks.get(sessionId) ?? null,
          })
        ),

        heartbeat: vi.fn(async (sessionId: string): Promise<Result<boolean>> => {
          const existing = mockStore.locks.get(sessionId);
          if (!existing || existing.leader_window_id !== mockStore.windowId) {
            return { ok: true, value: false };
          }
          existing.heartbeat_at = new Date().toISOString();
          return { ok: true, value: true };
        }),

        isLeader: vi.fn(async (sessionId: string): Promise<Result<boolean>> => {
          const existing = mockStore.locks.get(sessionId);
          return {
            ok: true,
            value: existing !== undefined && existing.leader_window_id === mockStore.windowId,
          };
        }),
      },

      // P1-5: in-app browser. Mirrors BrowserManager semantics in-memory.
      // No real WebContentsView; tabs are pure state objects.
      browser: {
        openTab: vi.fn(
          async (args: {
            session_id: string;
            tab_id: string;
            url: string;
          }): Promise<Result<MockBrowserTabState>> => {
            const existing = mockStore.browserTabs.get(args.tab_id);
            if (existing) {
              return { ok: true, value: existing };
            }
            const state: MockBrowserTabState = {
              tab_id: args.tab_id,
              session_id: args.session_id,
              url: args.url,
              title: 'Loading...',
              favicon_url: null,
              status: 'loading',
              can_go_back: false,
              can_go_forward: false,
            };
            mockStore.browserTabs.set(args.tab_id, state);
            return { ok: true, value: state };
          }
        ),

        closeTab: vi.fn(async (tabId: string): Promise<Result<void>> => {
          const tab = mockStore.browserTabs.get(tabId);
          mockStore.browserTabs.delete(tabId);
          mockStore.browserBounds.delete(tabId);
          if (tab && mockStore.browserActive.get(tab.session_id) === tabId) {
            mockStore.browserActive.delete(tab.session_id);
          }
          return { ok: true, value: undefined };
        }),

        switchTab: vi.fn(async (sessionId: string, tabId: string): Promise<Result<void>> => {
          const tab = mockStore.browserTabs.get(tabId);
          if (!tab || tab.session_id !== sessionId) {
            return { ok: true, value: undefined };
          }
          mockStore.browserActive.set(sessionId, tabId);
          return { ok: true, value: undefined };
        }),

        navigate: vi.fn(async (tabId: string, url: string): Promise<Result<void>> => {
          const tab = mockStore.browserTabs.get(tabId);
          if (!tab) return { ok: true, value: undefined };
          const next: MockBrowserTabState = { ...tab, url, status: 'loading' };
          mockStore.browserTabs.set(tabId, next);
          emitBrowserUpdate(next);
          return { ok: true, value: undefined };
        }),

        back: vi.fn(async (_tabId: string): Promise<Result<void>> => {
          return { ok: true, value: undefined };
        }),

        forward: vi.fn(async (_tabId: string): Promise<Result<void>> => {
          return { ok: true, value: undefined };
        }),

        reload: vi.fn(async (tabId: string): Promise<Result<void>> => {
          const tab = mockStore.browserTabs.get(tabId);
          if (!tab) return { ok: true, value: undefined };
          const next: MockBrowserTabState = { ...tab, status: 'loading' };
          mockStore.browserTabs.set(tabId, next);
          emitBrowserUpdate(next);
          return { ok: true, value: undefined };
        }),

        setBounds: vi.fn(
          async (tabId: string, bounds: MockBrowserBounds): Promise<Result<void>> => {
            mockStore.browserBounds.set(tabId, bounds);
            return { ok: true, value: undefined };
          }
        ),

        listTabs: vi.fn(
          async (sessionId: string): Promise<Result<MockBrowserTabState[]>> => ({
            ok: true,
            value: Array.from(mockStore.browserTabs.values()).filter(
              (t) => t.session_id === sessionId
            ),
          })
        ),

        onTabUpdated: vi.fn((listener: BrowserUpdateListener): (() => void) => {
          mockStore.browserListeners.add(listener);
          return () => {
            mockStore.browserListeners.delete(listener);
          };
        }),
      },

      // P1-4: AI streaming via real CLI subprocess. Renderer-side IPC is
      // mocked in-memory — tests inject events with __emitAiStreamEvent /
      // __emitAiStreamEnd. detectCli returns __mockStore.aiDetection.
      ai: {
        detectCli: vi.fn(
          async (): Promise<Result<MockCliDetection>> => ({
            ok: true,
            value: mockStore.aiDetection,
          })
        ),

        startStream: vi.fn(
          async (args: {
            stream_id: string;
            model: string;
            turns: unknown[];
            session_id?: string;
            workspace_root?: string;
            permission_level?: 'read_only' | 'workspace_write' | 'full_access' | 'custom';
          }): Promise<Result<{ stream_id: string; source: string }>> => {
            mockStore.aiStartedStreams.set(args.stream_id, {
              model: args.model,
              turns: args.turns,
              ...(args.session_id !== undefined && { session_id: args.session_id }),
              ...(args.workspace_root !== undefined && { workspace_root: args.workspace_root }),
              ...(args.permission_level !== undefined && {
                permission_level: args.permission_level,
              }),
            });
            // Source 추론 (테스트에서 검증할 수 있도록).
            const lower = args.model.toLowerCase();
            const isClaude = ['claude-', 'sonnet-', 'opus-', 'haiku-'].some((p) =>
              lower.startsWith(p)
            );
            const isCodex = ['gpt-', 'o1-', 'o3-', 'codex-'].some((p) => lower.startsWith(p));
            let source: 'claude-cli' | 'codex-cli' | 'mock' = 'mock';
            if (isClaude && mockStore.aiDetection.claude !== null) {
              source = 'claude-cli';
            } else if (isCodex && mockStore.aiDetection.codex !== null) {
              source = 'codex-cli';
            }
            return { ok: true, value: { stream_id: args.stream_id, source } };
          }
        ),

        stopStream: vi.fn(async (streamId: string): Promise<Result<void>> => {
          mockStore.aiStoppedStreams.add(streamId);
          return { ok: true, value: undefined };
        }),

        onStreamEvent: vi.fn((listener: AiStreamEventListener): (() => void) => {
          mockStore.aiEventListeners.add(listener);
          return () => {
            mockStore.aiEventListeners.delete(listener);
          };
        }),

        onStreamEnd: vi.fn((listener: AiStreamEndListener): (() => void) => {
          mockStore.aiEndListeners.add(listener);
          return () => {
            mockStore.aiEndListeners.delete(listener);
          };
        }),
      },

      // v0.2.0 — MCP Bridge (Issue #5). In-memory mock of McpManager.
      mcp: {
        list: vi.fn(
          async (): Promise<Result<MockMcpServerState[]>> => ({
            ok: true,
            value: Array.from(mockStore.mcpServers.values()),
          })
        ),

        add: vi.fn(async (config: MockMcpServerConfig): Promise<Result<void>> => {
          if (mockStore.mcpAddBehavior === 'fail') {
            return { ok: false, error: 'mock add failure' };
          }
          mockStore.mcpServers.set(config.id, {
            config,
            status: config.enabled ? 'ready' : 'disabled',
            tools: [],
            last_log: [],
          });
          return { ok: true, value: undefined };
        }),

        remove: vi.fn(async (id: string): Promise<Result<void>> => {
          mockStore.mcpServers.delete(id);
          return { ok: true, value: undefined };
        }),

        restart: vi.fn(async (id: string): Promise<Result<void>> => {
          const server = mockStore.mcpServers.get(id);
          if (server === undefined) {
            return { ok: false, error: `not found: ${id}` };
          }
          server.status = 'ready';
          mockStore.mcpServers.set(id, server);
          return { ok: true, value: undefined };
        }),

        getLogs: vi.fn(async (id: string): Promise<Result<string[]>> => {
          const server = mockStore.mcpServers.get(id);
          return {
            ok: true,
            value: server !== undefined ? [...server.last_log] : [],
          };
        }),

        // v0.9.0 — discovery mock. mockStore.mcpDiscovery 를 그대로 반환.
        discover: vi.fn(
          async (): Promise<
            Result<{
              suggested: Array<{
                id: string;
                name: string;
                description: string;
                command: string;
                args: string[];
                install_hint: string;
              }>;
              from_claude: MockMcpServerConfig[];
              from_codex: MockMcpServerConfig[];
            }>
          > => ({
            ok: true,
            value: {
              suggested: [...mockStore.mcpDiscovery.suggested],
              from_claude: [...mockStore.mcpDiscovery.from_claude],
              from_codex: [...mockStore.mcpDiscovery.from_codex],
            },
          })
        ),
      },

      // v0.4.0 — Usage / cost telemetry (read-only).
      // mockStore.usageSummary / usageDaily / usageBySession 가 비어 있으면
      // 빈 배열 반환. usageError 가 set 돼 있으면 모든 query 가 실패.
      usage: {
        summary: vi.fn(
          async (
            _args?: {
              from?: string;
              to?: string;
              provider?: MockUsageProvider;
              model?: string;
              session_id?: string;
            }
          ): Promise<Result<MockUsageSummary[]>> => {
            if (mockStore.usageError !== null) {
              return { ok: false, error: mockStore.usageError };
            }
            return { ok: true, value: [...mockStore.usageSummary] };
          }
        ),

        daily: vi.fn(
          async (_args: {
            days: number;
            provider?: MockUsageProvider;
          }): Promise<Result<MockDailyUsageRow[]>> => {
            if (mockStore.usageError !== null) {
              return { ok: false, error: mockStore.usageError };
            }
            return { ok: true, value: [...mockStore.usageDaily] };
          }
        ),

        bySession: vi.fn(
          async (sessionId: string): Promise<Result<MockUsageEvent[]>> => {
            if (mockStore.usageError !== null) {
              return { ok: false, error: mockStore.usageError };
            }
            return {
              ok: true,
              value: [...(mockStore.usageBySession.get(sessionId) ?? [])],
            };
          }
        ),

        // v0.9.0 — CSV export. mockStore.usageExportCsv 가 비어있으면 header 만 반환.
        exportCsv: vi.fn(
          async (
            _args?: {
              from?: string;
              to?: string;
              provider?: MockUsageProvider;
              model?: string;
              session_id?: string;
            }
          ): Promise<Result<string>> => {
            if (mockStore.usageError !== null) {
              return { ok: false, error: mockStore.usageError };
            }
            const csv =
              mockStore.usageExportCsv === ''
                ? 'timestamp,session_id,turn_id,provider,model,input_tokens,output_tokens,cache_creation,cache_read,reasoning,total_cost_usd\n'
                : mockStore.usageExportCsv;
            return { ok: true, value: csv };
          }
        ),

        getLimits: vi.fn(
          async (): Promise<
            Result<{ cost_limit_usd?: number; alert_threshold: number }>
          > => ({ ok: true, value: { ...mockStore.usageLimits } })
        ),

        setLimits: vi.fn(
          async (patch: {
            cost_limit_usd?: number | null;
            alert_threshold?: number | null;
          }): Promise<Result<void>> => {
            if (Object.prototype.hasOwnProperty.call(patch, 'cost_limit_usd')) {
              if (patch.cost_limit_usd === null || patch.cost_limit_usd === undefined) {
                delete mockStore.usageLimits.cost_limit_usd;
              } else {
                mockStore.usageLimits.cost_limit_usd = patch.cost_limit_usd;
              }
            }
            if (Object.prototype.hasOwnProperty.call(patch, 'alert_threshold')) {
              if (patch.alert_threshold === null || patch.alert_threshold === undefined) {
                mockStore.usageLimits.alert_threshold = 0.8;
              } else {
                mockStore.usageLimits.alert_threshold = patch.alert_threshold;
              }
            }
            return { ok: true, value: undefined };
          }
        ),
      },
    },
  });
}

// Mock scrollIntoView for jsdom (not implemented in jsdom by default)
if (typeof window !== 'undefined') {
  window.HTMLElement.prototype.scrollIntoView = function () {};
}
