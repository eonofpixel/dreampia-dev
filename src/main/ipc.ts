/**
 * IPC handlers for the main process.
 *
 * Pattern follows Codex's AppServerConnection: {namespace}/{action}.
 * Spec: docs/findings/round5-ipc-telemetry.md
 *
 * All handlers are registered via `registerIpcHandlers(app, store?)`.
 *
 * Iron rule: handlers NEVER throw across the IPC boundary. Every
 * SessionStore call is wrapped in a try/catch that maps to `Result<T>`.
 * This prevents Electron from serializing Node stack traces (which
 * include absolute paths) into the renderer.
 */

import {
  app,
  BrowserWindow,
  dialog,
  ipcMain,
  type App,
  type IpcMainInvokeEvent,
} from 'electron';
import { promises as fsp } from 'node:fs';
import path from 'node:path';
import { z } from 'zod';
import {
  readSettings,
  writeSettings,
  LANGUAGE_VALUES,
  THEME_VALUES,
  type DefaultProviderChoice,
  type LanguageChoice,
  type ThemeChoice,
} from './settings';
import { LEVEL_CAPABILITIES } from '@/permission';
import {
  ChatModeSchema,
  EffortLevelSchema,
  McpServerConfigSchema,
  PermissionLevelSchema,
  SessionSchema,
  TurnSchema,
  newTurnId,
  type McpServerState,
  type PermissionLevel,
  type Session,
  type SessionId,
  type ToolCallId,
  type ToolResultRef,
  type Turn,
  type TurnId,
} from '@/types';
import type {
  AuditEvent,
  AuditLogStore,
  CompareRun,
  CompareStore,
  DailyUsageRow,
  LeaderElection,
  SessionLock,
  SessionMeta,
  SessionStore,
  TurnSearchResult,
  UsageEvent,
  UsageProvider,
  UsageRangeFilter,
  UsageStore,
  UsageSummary,
} from '@/storage';
import type { StreamEvent, StreamingProvider } from '@/providers';
import type { ToolCall, ToolQueue, ToolRegistry, ToolResult } from '@/tools';
import type { McpManager } from './mcp';
import {
  SUGGESTED_MCP_SERVERS,
  detectMcpFromClaudeConfig,
  detectMcpFromCodexConfig,
  type SuggestedMcpServer,
} from './mcp/discovery';
// v1.7.4 — Automation IPC.
import {
  AutomationManager,
  getAutomationManager,
  summarizeRule,
  type AutomationRuleSummary,
} from './automation/AutomationManager';
// CLI / auto 는 Node-only — main 에서만 import. providers barrel 은
// renderer 와 공유되므로 여기서 직접 명시적 경로로 가져온다.
import {
  getDefaultProvider as defaultGetDefaultProvider,
  type AutoProviderResult,
} from '@/providers/auto';
import { detectCli as defaultDetectCli, type CliDetectionResult } from '@/providers/cli/detect';
import {
  runCompare as defaultRunCompare,
  type CompareEvent,
  type CompareOrchestratorArgs,
  type ProviderFactory,
} from './compare/orchestrator';
import type { BrowserManager, BrowserTabState } from './BrowserManager';
import type { FileContent, FileEntry } from '@/types/workspace';
import type {
  ConversationPatch,
  PermissionPatch,
  Result,
  SessionMetaPatch,
  WorkspaceInfo,
} from './types';

export type { ConversationPatch, PermissionPatch, Result, SessionMetaPatch } from './types';

// Types shared with renderer (preload only exposes whitelisted channels)
export type AppInfo = {
  version: string;
  platform: NodeJS.Platform;
  electronVersion: string;
  nodeVersion: string;
};

/**
 * v0.14.0 (A ABI Hardening) — `app:diagnose` 가 반환하는 자가 진단 결과.
 *
 * Settings → 진단 탭이 표시. DB 가 로드되지 않았으면 db_loaded=false 만 채워지
 * 고 나머지 DB 필드는 undefined — renderer 가 "DB 로드 실패" 안내를 띄우는
 * 분기점.
 */
export type AppDiagnoseResult = {
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
};

// ────────────────────────────────────────────────────────────
// Validation schemas (renderer 입력은 신뢰 불가)
// ────────────────────────────────────────────────────────────

const SessionMetaPatchSchema = z
  .object({
    title: z.string().min(1).optional(),
    pinned: z.boolean().optional(),
    archived: z.boolean().optional(),
  })
  .strict();

// v0.5.0 (F-018) — `/model <name>` 같은 슬래시 명령이 보내는 conversation
// patch. main 측 store 가 신뢰할 수 있도록 enum 도 schema 로 검증.
const ConversationPatchSchema = z
  .object({
    current_model: z.string().min(1).optional(),
    current_effort: EffortLevelSchema.optional(),
    current_mode: ChatModeSchema.optional(),
  })
  .strict();

// v0.8.0 — Session permission 변경 IPC. 현재는 default_level 만 노출 — grants
// 는 별도 IPC 로 추가 예정 (v0.13.0 custom 권한 management).
const PermissionPatchSchema = z
  .object({
    default_level: PermissionLevelSchema.optional(),
  })
  .strict();

// v0.7.0 (F-026) — Sidebar 검색 입력. 사용자 input 이라 length / max 모두
// 강제. 200 자 이상은 의미 없는 query (paste accident) 로 판단해 거절.
// limit 은 renderer 가 일관된 paging 정책 (max 100) 을 갖도록 강제.
const SearchTurnsArgsSchema = z
  .object({
    q: z.string().min(1).max(200),
    limit: z.number().int().positive().max(100).optional(),
  })
  .strict();

// browser/* — Codex-style namespace. Renderer payloads are validated here so
// the BrowserManager can keep working with already-typed values.
const OpenTabArgsSchema = z
  .object({
    session_id: z.string().min(1),
    tab_id: z.string().min(1),
    url: z.string().min(1),
  })
  .strict();

const BoundsSchema = z
  .object({
    x: z.number().finite(),
    y: z.number().finite(),
    width: z.number().finite().nonnegative(),
    height: z.number().finite().nonnegative(),
  })
  .strict();

// ai/* — Real CLI subprocess streaming (P1-4).
// Renderer 가 stream_id 를 발급하고 turns / model 을 보내면 main 이 자동 적합한
// CliProvider 또는 MockProvider 를 선택해 stream 을 시작한다.
// Spec: docs/session/cross-ai-sync.md, docs/permission/provider-mapping.md
const StartStreamArgsSchema = z
  .object({
    stream_id: z.string().min(1),
    model: z.string().min(1),
    turns: z.array(TurnSchema),
    session_id: z.string().min(1).optional(),
    workspace_root: z.string().min(1).optional(),
    /**
     * Session 의 default_level 을 그대로 main 까지 전달. 미지정 시 main 에서
     * 'workspace_write' 로 default 를 적용 (Codex 안전 default).
     */
    permission_level: PermissionLevelSchema.optional(),
  })
  .strict();

const ToolCallArgsSchema = z
  .object({
    id: z.string().min(1),
    tool_id: z.string().min(1),
    session_id: z.string().min(1),
    turn_id: z.string().min(1),
    parent_call_id: z.string().min(1).optional(),
    input: z.unknown(),
    timeout_ms: z.number().int().positive().optional(),
    priority: z.enum(['high', 'normal', 'low']).optional(),
    origin: z.enum(['ai', 'user', 'automation']),
    created_at: z.string().min(1),
  })
  .strict();

// usage/* — v0.4.0 cost tracking. Renderer 가 보내는 query 는 모두
// optional + strict 로 검증. provider enum 은 UsageProvider 와 동일.
const UsageProviderSchema = z.enum(['claude', 'codex', 'mock']);

const UsageSummaryArgsSchema = z
  .object({
    from: z.string().min(1).optional(),
    to: z.string().min(1).optional(),
    provider: UsageProviderSchema.optional(),
    model: z.string().min(1).optional(),
    session_id: z.string().min(1).optional(),
  })
  .strict();

const UsageDailyArgsSchema = z
  .object({
    days: z.number().int().positive().max(365),
    provider: UsageProviderSchema.optional(),
  })
  .strict();

// audit/* — v1.0.11 SEC-3. 진단 탭이 audit_log 조회. 인자는 모두 optional +
// strict — limit 은 UI 페이지네이션 용 (max 1000, default 100).
const AuditRecentArgsSchema = z
  .object({
    limit: z.number().int().positive().max(1000).optional(),
    session_id: z.string().min(1).optional(),
    capability: z.string().min(1).optional(),
    event_prefix: z.string().min(1).max(100).optional(),
    from: z.string().min(1).optional(),
    to: z.string().min(1).optional(),
  })
  .strict();

// permission/* — v1.1.0 SEC-2 full. respond / list / revoke 입력 검증.
const PermissionRespondArgsSchema = z
  .object({
    request_id: z.string().min(1),
    decision: z.enum(['once', 'session', 'always', 'deny']),
    reason: z.string().max(500).optional(),
  })
  .strict();

const PermissionGrantsListArgsSchema = z
  .object({
    session_id: z.string().min(1),
  })
  .strict();

const PermissionGrantsRevokeArgsSchema = z
  .object({
    grant_id: z.string().min(1),
  })
  .strict();

// ────────────────────────────────────────────────────────────
// compare/* — v0.12.0 I (Cross-AI Verify/Compare MVP)
// ────────────────────────────────────────────────────────────

/**
 * Renderer 가 `/compare <prompt>` 슬래시 명령으로 호출. 양쪽 model 은 caller
 * 가 명시 — 향후 settings 의 default 모델 자동 fill 추가 검토. prompt 는
 * 1~4000자 (4KB 초과 paste 차단). models 는 1~120자.
 */
const CompareRunArgsSchema = z
  .object({
    session_id: z.string().min(1),
    prompt: z.string().min(1).max(4000),
    workspace_root: z.string().min(1),
    permission_level: PermissionLevelSchema.optional(),
    claude_model: z.string().min(1).max(120),
    codex_model: z.string().min(1).max(120),
  })
  .strict();

const CompareIdArgsSchema = z
  .object({
    run_id: z.string().min(1),
  })
  .strict();

const CompareListArgsSchema = z
  .object({
    session_id: z.string().min(1),
    limit: z.number().int().positive().max(100).optional(),
  })
  .strict();

// ────────────────────────────────────────────────────────────
// workspace/list-files + workspace/read-file (v0.6.0 — F-019)
// ────────────────────────────────────────────────────────────

/**
 * Workspace file enumeration limits.
 *
 * `MAX_FILES` 는 한 호출에서 돌려줄 수 있는 항목 수 상한 — 매우 큰 monorepo
 * 에서도 IPC payload 가 폭주하지 않도록. `MAX_DEPTH` 는 재귀 디렉토리 탐색
 * 최대 깊이로, 무한 심볼릭 루프 / 의도치 않은 거대한 트리에 대한 안전망.
 */
const FILE_LIST_DEFAULT_MAX_FILES = 5000;
const FILE_LIST_HARD_MAX_FILES = 10000;
const FILE_LIST_MAX_DEPTH = 16;

/** 단일 파일 read 의 byte 상한. 1MB 이상은 거절 — chat context 에 부적절. */
const FILE_READ_HARD_MAX_BYTES = 1024 * 1024;
const FILE_READ_DEFAULT_MAX_BYTES = 8192;

const ListFilesArgsSchema = z
  .object({
    workspace_root: z.string().min(1),
    ignore_patterns: z.array(z.string()).optional(),
    max_files: z
      .number()
      .int()
      .positive()
      .max(FILE_LIST_HARD_MAX_FILES)
      .optional(),
  })
  .strict();

const ReadFileArgsSchema = z
  .object({
    workspace_root: z.string().min(1),
    rel_path: z.string().min(1),
    max_bytes: z
      .number()
      .int()
      .positive()
      .max(FILE_READ_HARD_MAX_BYTES)
      .optional(),
  })
  .strict();

// ────────────────────────────────────────────────────────────
// Helpers
// ────────────────────────────────────────────────────────────

function toErrorMessage(err: unknown): string {
  if (err instanceof z.ZodError) {
    return `Validation error: ${err.issues
      .map((i) => `${i.path.join('.')}: ${i.message}`)
      .join('; ')}`;
  }
  if (err instanceof Error) return err.message;
  return String(err);
}

// ────────────────────────────────────────────────────────────
// Glob matcher (small, dependency-free) — used by workspace/list-files
// ────────────────────────────────────────────────────────────

/**
 * 단일 glob → RegExp. 의존성 없이 minimatch 의 가장 흔한 케이스만 지원:
 *   - `*`  : 한 path segment 안의 임의 문자 (`/` 제외) 0개 이상
 *   - `**` : path segment 들 0개 이상 포함 임의 문자
 *   - `?`  : 한 글자 (`/` 제외)
 *   - 그 외 정규식 메타문자는 escape
 *
 * 입력 / 비교 모두 forward-slash 정규화된 경로라고 가정 (Windows 의 `\` 는
 * 호출 측에서 미리 변환). 패턴은 path 의 어느 위치에도 매칭되도록
 * 'absolute' 가 아닌 'contains' 의미로 동작 — 사용자가
 * 'node_modules/**' 만 적어도 'src/.../node_modules/foo' 가 매칭된다.
 */
function compileGlob(pattern: string): RegExp {
  // 1) 정규식 메타문자 escape (단, `*`, `?` 는 곧 별도로 처리)
  let re = '';
  for (let i = 0; i < pattern.length; i++) {
    const ch = pattern[i];
    if (ch === '*') {
      // `**` → 모든 문자 (multi-segment)
      if (pattern[i + 1] === '*') {
        re += '.*';
        i += 1;
        // 다음 문자가 `/` 면 함께 소비 — `**/foo` 패턴은 `foo` 한정
        if (pattern[i + 1] === '/') {
          re += '(?:/|$)';
          i += 1;
        }
        continue;
      }
      // 단일 `*` → `/` 를 제외한 임의 문자
      re += '[^/]*';
      continue;
    }
    if (ch === '?') {
      re += '[^/]';
      continue;
    }
    if (ch === '.' || ch === '+' || ch === '(' || ch === ')' || ch === '|' || ch === '^' ||
        ch === '$' || ch === '{' || ch === '}' || ch === '[' || ch === ']' || ch === '\\') {
      re += '\\' + ch;
      continue;
    }
    re += ch ?? '';
  }
  // 'contains' 매칭 — 양 끝에 .* 추가. 단, `^` 또는 `/` 시작 패턴은 root 부터.
  return new RegExp(re);
}

/**
 * 한 relative path 가 ignore_patterns 중 하나라도 매칭하면 true.
 * relPath 는 forward-slash 정규화되어 있어야 한다.
 */
function isIgnored(relPath: string, compiledPatterns: ReadonlyArray<RegExp>): boolean {
  for (const re of compiledPatterns) {
    if (re.test(relPath)) return true;
  }
  return false;
}

// ────────────────────────────────────────────────────────────
// Path traversal guard — used by workspace/read-file
// ────────────────────────────────────────────────────────────

/**
 * `workspace_root` 안쪽의 파일에만 접근 허용. `..` 또는 절대경로 입력으로
 * workspace 바깥 (`/etc/passwd`, `C:\Windows\System32\...`) 으로 빠지는
 * traversal 공격 + symlink/junction 으로 우회하는 공격 방어. 반환은 정규화
 * 된 절대경로 (symlink 가 있으면 realpath).
 *
 * v1.0.9 (SEC-1): 이전 버전은 `path.resolve` prefix 만 검사 → workspace
 * 안에 외부를 가리키는 symlink/junction 을 두고 그 link 경로로 read-file 을
 * 호출하면 외부 파일 읽기 가능. realpath 까지 확인해 link target 도 검증.
 *
 * Throws "path traversal" 메시지의 Error 가 발생하면 호출 측 try/catch 가
 * `Result<never>` 의 fail 로 변환한다 (renderer 는 string 만 받음).
 */
async function resolveInsideWorkspace(
  workspaceRoot: string,
  relPath: string
): Promise<string> {
  // Step 1: workspace root 자체의 realpath (예: macOS 의 /tmp → /private/tmp,
  // Windows junction `C:\Dev\분석` 의 8.3 short path / junction alias 등도
  // 동일한 normalized form 으로 만든다).
  const root = await fsp.realpath(path.resolve(workspaceRoot)).catch(() => {
    return path.resolve(workspaceRoot);
  });
  const sep = path.sep;

  // Step 2: target path 계산. relPath 가 `..` 으로 시작하거나 절대경로면
  // path.resolve 가 그대로 반영 → 다음 prefix check 에서 걸러짐.
  const target = path.resolve(root, relPath);
  if (target !== root && !target.startsWith(root + sep)) {
    throw new Error('path traversal: rel_path resolves outside workspace_root');
  }

  // Step 3: target 의 realpath. symlink/junction 을 따라가서 진짜 file 위치
  // 를 알아낸 뒤 다시 prefix check. 파일이 존재하지 않으면 realpath 가 throw
  // → 이 경우 보안 위험 X (다음 stat() 에서 "file not found" 로 자연스럽게
  // 처리됨), target 그대로 반환.
  let realTarget: string;
  try {
    realTarget = await fsp.realpath(target);
  } catch {
    return target;
  }

  if (realTarget !== root && !realTarget.startsWith(root + sep)) {
    throw new Error(
      'path traversal: symlink/junction target resolves outside workspace_root'
    );
  }
  return realTarget;
}

/** Buffer 가 binary 파일인지 단순 휴리스틱: NUL byte 존재 여부. */
function looksBinary(buf: Buffer): boolean {
  // 처음 8KB 만 검사 — 매우 큰 파일도 즉시 판단 가능.
  const slice = buf.length > 8192 ? buf.subarray(0, 8192) : buf;
  for (let i = 0; i < slice.length; i++) {
    if (slice[i] === 0) return true;
  }
  return false;
}

function ok<T>(value: T): { ok: true; value: T } {
  return { ok: true, value };
}

function fail(err: unknown): { ok: false; error: string } {
  return { ok: false, error: toErrorMessage(err) };
}

// v1.0.14: workspaceConflict 모듈로 추출 (ipc.ts + main/index.ts 공유 + 단위
// 테스트). 본 파일에서 sym re-export.
import { checkUserDataConflict } from './workspaceConflict';

export interface LockHandlerConfig {
  /**
   * Resolve the LeaderElection instance for the BrowserWindow that invoked
   * this IPC call. Production uses one election per BrowserWindow; tests may
   * still pass a single LeaderElection directly.
   */
  getElection: (event: IpcMainInvokeEvent) => LeaderElection | null;
}

export interface ToolHandlerConfig {
  registry: ToolRegistry;
  queue: ToolQueue;
}

type LockHandlerSource = LeaderElection | LockHandlerConfig;

function isLockHandlerConfig(source: LockHandlerSource): source is LockHandlerConfig {
  return 'getElection' in source;
}

function resolveElection(source: LockHandlerSource, event: IpcMainInvokeEvent): LeaderElection {
  if (!isLockHandlerConfig(source)) return source;
  const election = source.getElection(event);
  if (election === null) {
    throw new Error('No LeaderElection registered for this window');
  }
  return election;
}

// ────────────────────────────────────────────────────────────
// Registration
// ────────────────────────────────────────────────────────────

/**
 * Register all main-process IPC handlers.
 *
 * @param electronApp - Electron App instance (defaults to module-level `app`).
 * @param store - Optional SessionStore. When omitted, only `app:*` handlers
 *                are registered. This keeps the module testable without
 *                booting an Electron app or opening a SQLite file.
 * @param election - Optional LeaderElection. When omitted, `lock/*` handlers
 *                   are not registered. Production passes a resolver that maps
 *                   each IPC sender window to its own LeaderElection.
 * @param browser  - Optional BrowserManager. When omitted, `browser/*`
 *                   handlers are not registered. Tests that don't exercise
 *                   the in-app browser can skip it. Spec: docs/session/browser.md
 * @param ai       - Optional AI handler config. When omitted, `ai/*` handlers
 *                   are not registered. Spec: docs/session/cross-ai-sync.md
 * @param tools    - Optional Tool Queue config. When omitted, `tool/*`
 *                   handlers are not registered.
 * @param mcp      - Optional McpManager. When omitted, `mcp/*` handlers are
 *                   not registered. Spec: docs/tools/mcp-bridge.md (Issue #5).
 * @param usage    - Optional UsageStore. When omitted, `usage/*` handlers are
 *                   not registered. Spec: ROADMAP.md (v0.4.0). Note: `ai`
 *                   handler config also reads `usage` so stream pump can
 *                   persist usage events fire-and-forget.
 * @param compare  - Optional Compare handler config. When omitted, `compare/*`
 *                   handlers are not registered. Spec: ROADMAP.md (v0.12.0 I).
 */
export function registerIpcHandlers(
  electronApp: App = app,
  store?: SessionStore,
  election?: LockHandlerSource,
  browser?: BrowserManager,
  ai?: AiHandlerConfig,
  tools?: ToolHandlerConfig,
  mcp?: McpManager,
  usage?: UsageStore,
  compare?: CompareHandlerConfig,
  audit?: AuditLogStore,
  permission?: PermissionHandlerConfig
): void {
  ipcMain.handle('app:get-version', (): AppInfo => {
    return {
      version: electronApp.getVersion(),
      platform: process.platform,
      electronVersion: process.versions.electron ?? '',
      nodeVersion: process.versions.node ?? '',
    };
  });

  ipcMain.handle('app:get-platform', (): NodeJS.Platform => {
    return process.platform;
  });

  ipcMain.handle('app:get-onboarding-status', (): Result<{ completed: boolean }> => {
    try {
      // Phase 3 B2: 첫 실행 wizard 표시 여부.
      // settings.onboarding_completed === true 만 true 로 취급. absent / null /
      // 다른 값은 모두 false (= wizard 표시) 로 fallback — corrupt JSON 에서도
      // 사용자에게 wizard 보여주는 게 침묵 실패보다 안전.
      // Spec: docs/ia/onboarding.md
      const settings = readSettings();
      return ok({ completed: settings.onboarding_completed === true });
    } catch (err) {
      return fail(err);
    }
  });

  ipcMain.handle('app:complete-onboarding', (): Result<void> => {
    try {
      // 사용자가 wizard 5단계 모두 끝냈거나 [건너뛰기] 클릭 시 호출.
      // Spec: docs/ia/onboarding.md
      writeSettings({ onboarding_completed: true });
      return ok(undefined);
    } catch (err) {
      return fail(err);
    }
  });

  ipcMain.handle('app:reset-onboarding', (): Result<void> => {
    try {
      // v0.3.0 — Sidebar 의 [온보딩 다시 보기] 클릭 시 호출. 다른 settings 는
      // 그대로 두고 onboarding_completed 만 false 로 reset → 다음 mount 에서
      // wizard 표시. workspace 등 사용자 설정은 보존.
      writeSettings({ onboarding_completed: false });
      return ok(undefined);
    } catch (err) {
      return fail(err);
    }
  });

  ipcMain.handle('app:get-default-provider', (): Result<DefaultProviderChoice> => {
    try {
      // v0.3.0 — wizard / 설정에서 사용자가 선택한 기본 provider 조회.
      // 미설정 시 'auto' fallback (model-prefix 기반 routing).
      const settings = readSettings();
      return ok(settings.default_provider ?? 'auto');
    } catch (err) {
      return fail(err);
    }
  });

  ipcMain.handle('app:set-default-provider', (_evt, raw: unknown): Result<void> => {
    try {
      // v0.3.0 — wizard 또는 설정에서 호출. Zod 스키마 대신 명시적 enum
      // 검증 — 작은 string union 에 schema 가 과하다.
      if (
        raw !== 'auto' &&
        raw !== 'claude' &&
        raw !== 'codex' &&
        raw !== 'mock'
      ) {
        throw new Error(
          'default_provider must be one of: auto, claude, codex, mock'
        );
      }
      writeSettings({ default_provider: raw });
      return ok(undefined);
    } catch (err) {
      return fail(err);
    }
  });

  ipcMain.handle('app:get-default-permission-level', (): Result<PermissionLevel> => {
    try {
      // v0.3.0 — 새 세션의 default_level. 미설정 시 'workspace_write'.
      const settings = readSettings();
      return ok(settings.default_permission_level ?? 'workspace_write');
    } catch (err) {
      return fail(err);
    }
  });

  ipcMain.handle('app:set-default-permission-level', (_evt, raw: unknown): Result<void> => {
    try {
      // v0.3.0 — Zod 로 enum 검증 후 영속.
      const validated = PermissionLevelSchema.parse(raw);
      writeSettings({ default_permission_level: validated });
      return ok(undefined);
    } catch (err) {
      return fail(err);
    }
  });

  // v0.8.0 — Settings 모달 [테마] 탭. 'system' 은 OS 설정을 따라가며, renderer
  // 가 document.documentElement 의 data-theme 을 수동으로 갱신.
  ipcMain.handle('app:get-theme', (): Result<ThemeChoice> => {
    try {
      const settings = readSettings();
      return ok(settings.theme ?? 'system');
    } catch (err) {
      return fail(err);
    }
  });

  ipcMain.handle('app:set-theme', (_evt, raw: unknown): Result<void> => {
    try {
      if (
        typeof raw !== 'string' ||
        !(THEME_VALUES as readonly string[]).includes(raw)
      ) {
        throw new Error(`theme must be one of: ${THEME_VALUES.join(', ')}`);
      }
      writeSettings({ theme: raw as ThemeChoice });
      return ok(undefined);
    } catch (err) {
      return fail(err);
    }
  });

  // v0.11.0 (B2) — Settings 모달 [언어] 탭. 'ko' default. 알 수 없는 값은
  // throw — renderer 가 ok=false 로 받아 silent fallback.
  ipcMain.handle('app:get-language', (): Result<LanguageChoice> => {
    try {
      const settings = readSettings();
      return ok(settings.language ?? 'ko');
    } catch (err) {
      return fail(err);
    }
  });

  ipcMain.handle('app:set-language', (_evt, raw: unknown): Result<void> => {
    try {
      if (
        typeof raw !== 'string' ||
        !(LANGUAGE_VALUES as readonly string[]).includes(raw)
      ) {
        throw new Error(`language must be one of: ${LANGUAGE_VALUES.join(', ')}`);
      }
      writeSettings({ language: raw as LanguageChoice });
      return ok(undefined);
    } catch (err) {
      return fail(err);
    }
  });

  // v0.8.0 — Settings 모달 [권한] 탭이 capability set 을 read-only 로 표시.
  // PermissionLevel 별 ReadonlySet<Capability> 를 plain string[] 로 직렬화해
  // renderer 로 전달 (Set 은 IPC 직렬화 시 빈 객체가 됨).
  ipcMain.handle(
    'app:get-permission-capabilities',
    (): Result<Record<PermissionLevel, string[]>> => {
      try {
        const out: Record<PermissionLevel, string[]> = {
          read_only: Array.from(LEVEL_CAPABILITIES.read_only),
          workspace_write: Array.from(LEVEL_CAPABILITIES.workspace_write),
          full_access: Array.from(LEVEL_CAPABILITIES.full_access),
          custom: Array.from(LEVEL_CAPABILITIES.custom),
        };
        return ok(out);
      } catch (err) {
        return fail(err);
      }
    }
  );

  // v1.5.0 — Settings 모달 [Direct API] 탭. Anthropic / OpenAI API key 입력.
  //
  // 보안: GET 은 raw key 반환 X. presence + 마지막 4글자 preview 만 노출 →
  //       renderer 가 화면에 ‘설정됨 (...abcd)’ 표시. SET 은 빈 문자열로 clear.
  //
  // 저장 위치: settings.json (userData/settings.json) — plain text. 향후 OS
  //           keychain 마이그레이션 권고 (settings.ts 의 주석 참고).
  ipcMain.handle(
    'app:get-direct-api-keys',
    (): Result<{
      anthropic: { present: boolean; preview: string | null };
      openai: { present: boolean; preview: string | null };
    }> => {
      try {
        const settings = readSettings();
        const previewOf = (key: string | undefined): string | null => {
          if (typeof key !== 'string' || key.length === 0) return null;
          // 마지막 4글자만 노출. 전체 길이가 4 이하면 *** 만 표시 (key 자체 노출 금지).
          if (key.length <= 4) return '****';
          return key.slice(-4);
        };
        return ok({
          anthropic: {
            present: typeof settings.api_key_anthropic === 'string' && settings.api_key_anthropic.length > 0,
            preview: previewOf(settings.api_key_anthropic),
          },
          openai: {
            present: typeof settings.api_key_openai === 'string' && settings.api_key_openai.length > 0,
            preview: previewOf(settings.api_key_openai),
          },
        });
      } catch (err) {
        return fail(err);
      }
    }
  );

  ipcMain.handle(
    'app:set-direct-api-key',
    (_evt, rawProvider: unknown, rawKey: unknown): Result<void> => {
      try {
        if (rawProvider !== 'anthropic' && rawProvider !== 'openai') {
          throw new Error("provider must be 'anthropic' or 'openai'");
        }
        if (typeof rawKey !== 'string') {
          throw new Error('key must be a string (empty string clears)');
        }
        // 길이 상한 — 의도치 않은 거대 payload / 붙여넣기 사고 차단. 실제 API key 는
        // 100~256 정도이지만 여유 있게 1024 까지 허용.
        if (rawKey.length > 1024) {
          throw new Error('key too long (max 1024 chars)');
        }
        const trimmed = rawKey.trim();
        if (rawProvider === 'anthropic') {
          writeSettings({ api_key_anthropic: trimmed.length === 0 ? undefined : trimmed });
        } else {
          writeSettings({ api_key_openai: trimmed.length === 0 ? undefined : trimmed });
        }
        return ok(undefined);
      } catch (err) {
        return fail(err);
      }
    }
  );

  // v0.10.0 — Settings 모달 [단축키] 탭. 사용자 지정 매핑 (action → combo).
  // GET 은 settings.json 의 keyboard_shortcut_overrides 를 그대로 반환 — 미설정
  // 시 빈 object. Renderer 의 useKeyboardShortcuts 가 default 와 merge.
  ipcMain.handle(
    'app:get-keyboard-shortcuts',
    (): Result<Record<string, string>> => {
      try {
        const settings = readSettings();
        return ok(settings.keyboard_shortcut_overrides ?? {});
      } catch (err) {
        return fail(err);
      }
    }
  );

  // SET 은 plain Record<string,string> 으로 검증. 빈 object 는 모든 override
  // 제거 = default 복원. action / combo 형식 검증은 renderer 가 책임 — main
  // 은 단순 영속 layer (corrupt-tolerant: 빈 키/값 drop, 그 외는 그대로 저장).
  ipcMain.handle(
    'app:set-keyboard-shortcuts',
    (_evt, raw: unknown): Result<void> => {
      try {
        if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) {
          throw new Error('keyboard_shortcut_overrides must be a plain object');
        }
        const obj = raw as Record<string, unknown>;
        const validated: Record<string, string> = {};
        for (const [k, v] of Object.entries(obj)) {
          if (typeof k !== 'string' || k.length === 0) continue;
          if (typeof v !== 'string' || v.length === 0) continue;
          // 키 / 값 길이 상한 — 의도치 않은 거대 payload 차단.
          if (k.length > 64) continue;
          if (v.length > 64) continue;
          validated[k] = v;
        }
        writeSettings({ keyboard_shortcut_overrides: validated });
        return ok(undefined);
      } catch (err) {
        return fail(err);
      }
    }
  );

  ipcMain.handle('app:get-default-workspace', (): Result<WorkspaceInfo | null> => {
    try {
      // 사용자가 picker 로 선택한 경로가 있으면 우선.
      // Spec: docs/permission/levels.md (workspace_write 의 의미: 사용자 의도된
      // 폴더에만 쓰기) — process.cwd() 는 우연한 위치일 수 있어 의도 표현이 약함.
      //
      // Phase 3 audit (HIGH) — packaged 빌드에선 settings 가 없으면 null 반환.
      // 이전엔 process.cwd() 로 fallback 했는데 packaged Electron 의 cwd 는
      // user 의도와 무관한 OS 기본 경로 (Program Files / Applications). 사용자
      // 가 picker 로 명시 선택해야 새 채팅을 만들 수 있도록 강제. 이 함수는
      // null 만 반환하고, renderer 가 null 을 보고 onboarding/picker 를 띄운다.
      const settings = readSettings();
      if (typeof settings.workspace_root === 'string' && settings.workspace_root.length > 0) {
        const root = settings.workspace_root;
        // v1.0.14 (META-4 hotfix — Codex blind spot 발견): 저장된 workspace
        // 가 userData 폴더와 충돌하면 null 반환 + 사용자에게 picker 강제.
        // v1.0.13 의 META-4 는 picker 시점만 차단했어서 이전 버전 / 수동
        // settings 편집 / upgrade 시 우회 가능했음.
        const userDataDir = electronApp.getPath('userData');
        const conflict = checkUserDataConflict(root, userDataDir);
        if (conflict !== null) {
          console.warn(
            '[app:get-default-workspace] saved workspace conflicts with userData — returning null:',
            conflict
          );
          return ok(null);
        }
        const name =
          typeof settings.workspace_name === 'string' && settings.workspace_name.length > 0
            ? settings.workspace_name
            : path.basename(root) || root;
        return ok({ root, name });
      }
      // 저장된 workspace 없음:
      //   packaged → null (사용자가 picker 로 선택해야 함)
      //   unpackaged (dev/e2e) → process.cwd() fallback (개발자 편의)
      if (electronApp.isPackaged) {
        return ok(null);
      }
      const root = process.cwd();
      const name = path.basename(root) || root;
      return ok({ root, name });
    } catch (err) {
      return fail(err);
    }
  });

  // v0.14.0 (A ABI Hardening) — 사용자 자가 진단 IPC. Settings 모달의 진단 탭이
  // 호출. SessionStore 가 없는 환경 (테스트 / pre-init) 에서도 platform / process
  // 정보는 반환. DB 쪽 정보는 store 가 있을 때만 채움.
  // v1.4.0 follow-up — 사용자가 [DB 진단] 패널에서 trigger. workspace_id
  // FNV → sha256 backfill 을 명시 호출. 결과 통계 반환.
  ipcMain.handle(
    'app:run-workspace-backfill',
    async (): Promise<
      Result<{
        scanned: number;
        updated: number;
        skipped: number;
        cascade_sessions: number;
        conflicts: number;
      }>
    > => {
      try {
        if (store === undefined) {
          throw new Error('SessionStore not initialized');
        }
        const { backfillWorkspaceIdsToSha256 } = await import(
          '../storage/workspaceBackfill'
        );
        const r = backfillWorkspaceIdsToSha256(store.getDb());
        return ok({
          scanned: r.scanned,
          updated: r.updated,
          skipped: r.skipped,
          cascade_sessions: r.cascade_sessions,
          conflicts: r.conflicts.length,
        });
      } catch (err) {
        return fail(err);
      }
    }
  );

  ipcMain.handle('app:diagnose', (): Result<AppDiagnoseResult> => {
    try {
      const out: AppDiagnoseResult = {
        platform: process.platform,
        arch: process.arch,
        node_version: process.versions.node ?? '',
        electron_version: process.versions.electron ?? '',
        app_version: electronApp.getVersion(),
        db_loaded: store !== undefined,
      };
      if (store !== undefined) {
        const diag = store.diagnose();
        out.db_ok = diag.ok;
        out.schema_version = diag.schema_version;
        out.table_count = diag.table_count;
        out.integrity_ok = diag.integrity_ok;
        out.wal_mode = diag.wal_mode;
        if (diag.integrity_message !== undefined) out.integrity_message = diag.integrity_message;
        if (diag.error !== undefined) out.db_error = diag.error;
      }
      return ok(out);
    } catch (err) {
      return fail(err);
    }
  });

  registerWorkspaceHandlers(electronApp);

  if (store) {
    registerSessionHandlers(store);
    if (election) registerLockHandlers(election);
  }
  if (browser) registerBrowserHandlers(browser);
  if (ai) registerAiHandlers(ai, usage);
  if (tools) registerToolHandlers(tools);
  if (mcp) registerMcpHandlers(mcp);
  if (usage) registerUsageHandlers(usage);
  if (compare) registerCompareHandlers(compare);
  if (audit) registerAuditHandlers(audit);
  if (permission) registerPermissionHandlers(permission, store);
  // v1.7.4 — Automation IPC. 부팅 시 1회 등록 (singleton instance).
  registerAutomationHandlers();
}

// ────────────────────────────────────────────────────────────
// v1.7.4 — automation/* IPC
// ────────────────────────────────────────────────────────────

// v1.7.14 — register/unregister 시 호출. handler 는 직렬화 불가라 제외.
function persistAutomationRules(rules: ReadonlyArray<AutomationRuleSummary>): void {
  try {
    const persisted = rules.map((r) => {
      const out: {
        name: string;
        kind: 'interval' | 'cron' | 'webhook';
        interval_ms?: number;
        cron_expr?: string;
        cron_tz?: string;
        webhook_path?: string;
      } = { name: r.name, kind: r.kind };
      if (r.interval_ms !== undefined) out.interval_ms = r.interval_ms;
      if (r.cron_expr !== undefined) out.cron_expr = r.cron_expr;
      if (r.cron_tz !== undefined) out.cron_tz = r.cron_tz;
      if (r.webhook_path !== undefined) out.webhook_path = r.webhook_path;
      return out;
    });
    writeSettings({ automation_rules: persisted });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.warn(`[ipc] persistAutomationRules failed: ${msg}`);
  }
}

function registerAutomationHandlers(): void {
  ipcMain.handle(
    'automation/list',
    (): Result<AutomationRuleSummary[]> => {
      try {
        const mgr = getAutomationManager();
        return ok(mgr.list().map((r) => summarizeRule(r)));
      } catch (err) {
        return fail(err);
      }
    }
  );

  ipcMain.handle(
    'automation/register',
    (_evt, raw: unknown): Result<AutomationRuleSummary> => {
      try {
        if (raw === null || typeof raw !== 'object') {
          throw new Error('rule must be an object');
        }
        const obj = raw as Record<string, unknown>;
        const name = String(obj['name'] ?? '');
        const kind = obj['kind'];
        if (kind !== 'interval' && kind !== 'cron' && kind !== 'webhook') {
          throw new Error("kind must be 'interval' | 'cron' | 'webhook'");
        }
        if (name.length === 0 || name.length > 64) {
          throw new Error('name must be 1..64 chars');
        }
        const mgr = getAutomationManager();
        // handler 는 IPC 로 못 받음 — 일단 no-op log handler 로 등록.
        // 실 handler 는 별도 슬롯에서 (LLM call / shell script 실행 등).
        const handler = async (): Promise<void> => {
          console.info(`[automation] rule fired (no-op): ${name}`);
        };
        mgr.register({
          name,
          kind,
          ...(typeof obj['interval_ms'] === 'number' && {
            interval_ms: obj['interval_ms'],
          }),
          ...(typeof obj['cron_expr'] === 'string' && {
            cron_expr: obj['cron_expr'],
          }),
          ...(typeof obj['cron_tz'] === 'string' && {
            cron_tz: obj['cron_tz'],
          }),
          ...(typeof obj['webhook_path'] === 'string' && {
            webhook_path: obj['webhook_path'],
          }),
          handler,
        });
        const registered = mgr.list().find((r) => r.name === name);
        if (registered === undefined) {
          throw new Error('register failed (rule not found after insert)');
        }
        // v1.7.14 — settings 에 write-through 영속.
        persistAutomationRules(mgr.list().map((rl) => summarizeRule(rl)));
        return ok(summarizeRule(registered));
      } catch (err) {
        return fail(err);
      }
    }
  );

  ipcMain.handle(
    'automation/unregister',
    (_evt, raw: unknown): Result<{ removed: boolean }> => {
      try {
        if (typeof raw !== 'string' || raw.length === 0) {
          throw new Error('rule name must be a non-empty string');
        }
        const mgr = getAutomationManager();
        const removed = mgr.unregister(raw);
        // v1.7.14 — write-through.
        if (removed) {
          persistAutomationRules(mgr.list().map((rl) => summarizeRule(rl)));
        }
        return ok({ removed });
      } catch (err) {
        return fail(err);
      }
    }
  );

  ipcMain.handle(
    'automation/fire',
    async (_evt, raw: unknown): Promise<Result<void>> => {
      try {
        if (typeof raw !== 'string' || raw.length === 0) {
          throw new Error('rule name must be a non-empty string');
        }
        const mgr = getAutomationManager();
        await mgr.fire(raw);
        return ok(undefined);
      } catch (err) {
        return fail(err);
      }
    }
  );

  ipcMain.handle(
    'automation/get-next-run',
    (_evt, exprRaw: unknown, tzRaw: unknown): Result<{ next_run: string | null }> => {
      try {
        if (typeof exprRaw !== 'string' || exprRaw.length === 0) {
          throw new Error('cron expression required');
        }
        const tz = typeof tzRaw === 'string' && tzRaw.length > 0 ? tzRaw : undefined;
        return ok({ next_run: AutomationManager.getNextRun(exprRaw, tz) });
      } catch (err) {
        return fail(err);
      }
    }
  );
}

// ────────────────────────────────────────────────────────────
// permission/* — v1.1.0 SEC-2 full
//
// IPC 의 main → renderer 'permission/request' 는 IpcPermissionConfirmer 가
// webContents.send 로 직접 발화 — 본 함수는 renderer → main invoke 만 등록.
// ────────────────────────────────────────────────────────────

export interface PermissionHandlerConfig {
  /** IpcPermissionConfirmer 인스턴스 — respond / listPending 위임. */
  confirmer: import('./IpcPermissionConfirmer').IpcPermissionConfirmer;
}

function registerPermissionHandlers(
  cfg: PermissionHandlerConfig,
  store?: SessionStore
): void {
  ipcMain.handle(
    'permission/respond',
    (event, raw: unknown): Result<{ matched: boolean }> => {
      try {
        const args = PermissionRespondArgsSchema.parse(raw);
        // v1.1.3 hotfix (Codex Q9): event.sender.id 를 confirmer 에 전달.
        // confirm 시점 owner webContents 와 다르면 silently drop — 다른 창
        // 또는 spoofed sender 차단.
        const senderId =
          typeof (event as { sender?: { id?: unknown } } | undefined)?.sender?.id === 'number'
            ? (event as { sender: { id: number } }).sender.id
            : undefined;
        const matched = cfg.confirmer.respond(
          args.request_id,
          args.decision,
          args.reason,
          senderId
        );
        return ok({ matched });
      } catch (err) {
        return fail(err);
      }
    }
  );

  ipcMain.handle('permission/list-pending', (event): Result<unknown[]> => {
    try {
      // v1.1.3 hotfix (Codex Q9): 같은 webContents 의 pending 만 노출.
      const senderId =
        typeof (event as { sender?: { id?: unknown } } | undefined)?.sender?.id === 'number'
          ? (event as { sender: { id: number } }).sender.id
          : undefined;
      return ok(cfg.confirmer.getPendingRequests(senderId));
    } catch (err) {
      return fail(err);
    }
  });

  ipcMain.handle('permission/grants/list', (_evt, raw: unknown): Result<unknown[]> => {
    try {
      const args = PermissionGrantsListArgsSchema.parse(raw);
      if (store === undefined) return ok([]);
      return ok(
        store.listActivePermissionGrants(args.session_id as import('@/types').SessionId)
      );
    } catch (err) {
      return fail(err);
    }
  });

  ipcMain.handle(
    'permission/grants/revoke',
    (_evt, raw: unknown): Result<{ revoked: boolean }> => {
      try {
        const args = PermissionGrantsRevokeArgsSchema.parse(raw);
        if (store === undefined) return ok({ revoked: false });
        const revoked = store.revokePermissionGrant(
          args.grant_id,
          new Date().toISOString()
        );
        return ok({ revoked });
      } catch (err) {
        return fail(err);
      }
    }
  );
}

// ────────────────────────────────────────────────────────────
// workspace/* — folder picker + persistence
// ────────────────────────────────────────────────────────────

function registerWorkspaceHandlers(electronApp: App): void {
  ipcMain.handle(
    'workspace/pick-folder',
    async (
      event: IpcMainInvokeEvent
    ): Promise<Result<{ path: string; name: string } | null>> => {
      try {
        // v1.0.4 fix — parent BrowserWindow 명시. 이전엔 옵션만 넘겨서
        // Windows 에서 dialog 가 main window 뒤로 가거나 안 뜨는 증상이 있었음
        // (사용자 직접 검증으로 발견, 새 채팅 / 온보딩 폴더 선택 둘 다 영향).
        const win = BrowserWindow.fromWebContents(event.sender);
        const opts: Electron.OpenDialogOptions = {
          properties: ['openDirectory'],
          title: '작업 폴더 선택',
        };
        const result =
          win !== null ? await dialog.showOpenDialog(win, opts) : await dialog.showOpenDialog(opts);
        if (result.canceled || result.filePaths.length === 0) {
          return ok(null);
        }
        const picked = result.filePaths[0];
        if (picked === undefined || picked.length === 0) {
          return ok(null);
        }
        // v1.0.13 (META-4): userData = workspace (또는 포함 관계) 차단.
        // SQLite WAL/journal/sessions.sqlite 파일이 사용자가 보는 workspace
        // 안에 노출되면 사용자가 실수로 commit / 삭제 / 동기화 가능. 정확
        // 일치 + parent + child 모두 차단 (Codex (a) picking).
        const userDataDir = electronApp.getPath('userData');
        const conflict = checkUserDataConflict(picked, userDataDir);
        if (conflict !== null) {
          // 차단 modal 은 renderer 가 띄우지만, IPC 레벨에서 거부 + 명확한
          // error code 로 보내 사용자가 picker 다시 띄울 수 있게.
          if (win !== null) {
            await dialog.showMessageBox(win, {
              type: 'warning',
              title: 'Dreampia-Dev — 작업 폴더 선택 차단',
              message: '선택한 폴더가 앱 데이터 폴더와 겹쳐요',
              detail: conflict,
              buttons: ['확인'],
              defaultId: 0,
            });
          }
          return { ok: false, error: `WORKSPACE_CONFLICT: ${conflict}` };
        }
        const name = path.basename(picked) || picked;
        writeSettings({ workspace_root: picked, workspace_name: name });
        return ok({ path: picked, name });
      } catch (err) {
        return fail(err);
      }
    }
  );

  ipcMain.handle('workspace/get', (): Result<{ path: string; name: string } | null> => {
    try {
      const settings = readSettings();
      if (
        typeof settings.workspace_root === 'string' &&
        settings.workspace_root.length > 0 &&
        typeof settings.workspace_name === 'string' &&
        settings.workspace_name.length > 0
      ) {
        // v1.0.14 (META-4 hotfix): 저장된 workspace 가 userData 와 충돌하면
        // null 반환 — 사용자가 picker 로 다시 선택해야 함.
        const userDataDir = electronApp.getPath('userData');
        const conflict = checkUserDataConflict(
          settings.workspace_root,
          userDataDir
        );
        if (conflict !== null) {
          console.warn('[workspace/get] saved workspace conflicts with userData:', conflict);
          return ok(null);
        }
        return ok({ path: settings.workspace_root, name: settings.workspace_name });
      }
      return ok(null);
    } catch (err) {
      return fail(err);
    }
  });

  // ── workspace/list-files (v0.6.0 — F-019 @ 멘션) ────────────────────
  // 입력: { workspace_root, ignore_patterns?, max_files? }
  // 출력: FileEntry[]  (path = forward-slash relative)
  // - root 바깥 / 비-디렉토리는 거절
  // - ignore_patterns 매칭 항목은 enumerate 단계에서 skip (디렉토리 단위로
  //   prune 해서 node_modules 같은 거대한 트리에 진입 X)
  // - max_files 도달 시 즉시 중단, 부분 결과 반환
  // - 심볼릭 / 권한 오류는 silently skip — 한 손상 항목이 전체 enumerate 를 깨뜨리지 않도록
  ipcMain.handle('workspace/list-files', async (_evt, raw: unknown): Promise<Result<FileEntry[]>> => {
    try {
      const args = ListFilesArgsSchema.parse(raw);
      const root = path.resolve(args.workspace_root);
      const stat = await fsp.stat(root).catch(() => null);
      if (stat === null || !stat.isDirectory()) {
        throw new Error('workspace_root must be an existing directory');
      }
      const cap = args.max_files ?? FILE_LIST_DEFAULT_MAX_FILES;
      const compiled = (args.ignore_patterns ?? []).map(compileGlob);
      const out: FileEntry[] = [];
      // BFS 가 아닌 DFS — 결과 순서는 caller 가 sort 한다.
      const stack: Array<{ abs: string; rel: string; depth: number }> = [
        { abs: root, rel: '', depth: 0 },
      ];
      while (stack.length > 0) {
        if (out.length >= cap) break;
        const top = stack.pop();
        if (top === undefined) break;
        if (top.depth > FILE_LIST_MAX_DEPTH) continue;
        let entries: import('node:fs').Dirent[] = [];
        try {
          entries = await fsp.readdir(top.abs, { withFileTypes: true });
        } catch {
          // 권한 / 손상 디렉토리는 skip — silent
          continue;
        }
        for (const ent of entries) {
          if (out.length >= cap) break;
          const childRel = top.rel.length === 0 ? ent.name : `${top.rel}/${ent.name}`;
          // POSIX-style relative path 로 정규화
          const relForMatch = childRel.split(path.sep).join('/');
          if (isIgnored(relForMatch, compiled)) continue;
          const childAbs = path.join(top.abs, ent.name);
          if (ent.isDirectory()) {
            stack.push({ abs: childAbs, rel: relForMatch, depth: top.depth + 1 });
            continue;
          }
          if (!ent.isFile()) continue; // symlink / device 등은 skip
          let size_bytes = 0;
          let mtime = '';
          try {
            const fileStat = await fsp.stat(childAbs);
            size_bytes = fileStat.size;
            mtime = fileStat.mtime.toISOString();
          } catch {
            continue; // stat 실패 → skip
          }
          out.push({ path: relForMatch, size_bytes, mtime });
        }
      }
      return ok(out);
    } catch (err) {
      return fail(err);
    }
  });

  // ── workspace/read-file (v0.6.0 — F-019 @ 멘션) ─────────────────────
  // 입력: { workspace_root, rel_path, max_bytes? }
  // 출력: FileContent { content, truncated, line_count }
  // 안전성:
  //   - path traversal 거절 (resolveInsideWorkspace)
  //   - 디렉토리 / 1MB 초과 / binary 파일 거절
  //   - max_bytes 까지만 읽고 truncated=true 표시
  ipcMain.handle('workspace/read-file', async (_evt, raw: unknown): Promise<Result<FileContent>> => {
    try {
      const args = ReadFileArgsSchema.parse(raw);
      const abs = await resolveInsideWorkspace(args.workspace_root, args.rel_path);
      const stat = await fsp.stat(abs).catch(() => null);
      if (stat === null) {
        throw new Error('file not found');
      }
      if (stat.isDirectory()) {
        throw new Error('path is a directory, not a file');
      }
      if (stat.size > FILE_READ_HARD_MAX_BYTES) {
        throw new Error(
          `file too large: ${stat.size} bytes (max ${FILE_READ_HARD_MAX_BYTES})`
        );
      }
      const limit = args.max_bytes ?? FILE_READ_DEFAULT_MAX_BYTES;
      const buf = await fsp.readFile(abs);
      if (looksBinary(buf)) {
        throw new Error('binary file rejected');
      }
      const truncated = buf.length > limit;
      const slice = truncated ? buf.subarray(0, limit) : buf;
      const content = slice.toString('utf8');
      // line_count = '\n' 개수 + 1 (빈 파일은 1줄로 간주). truncated 인 경우
      // 실제 파일은 더 많은 줄을 포함할 수 있지만 caller 에 표시되는 snippet
      // 기준 라인 수가 더 유용하다.
      let nl = 0;
      for (let i = 0; i < content.length; i++) {
        if (content.charCodeAt(i) === 10) nl++;
      }
      const line_count = nl + 1;
      return ok({ content, truncated, line_count });
    } catch (err) {
      return fail(err);
    }
  });
}

// ────────────────────────────────────────────────────────────
// Namespace registrations
// ────────────────────────────────────────────────────────────

function registerSessionHandlers(store: SessionStore): void {
  // ── session/* — SessionStore CRUD ────────────────────────────

  ipcMain.handle('session/list', (): Result<SessionMeta[]> => {
    try {
      return ok(store.listSessions());
    } catch (err) {
      return fail(err);
    }
  });

  ipcMain.handle('session/get', (_evt, id: unknown): Result<Session | null> => {
    try {
      if (typeof id !== 'string') {
        throw new Error('session id must be string');
      }
      return ok(store.getSession(id as SessionId));
    } catch (err) {
      return fail(err);
    }
  });

  ipcMain.handle('session/create', (_evt, raw: unknown): Result<Session> => {
    try {
      // Zod validates AND brands the ids — so the SessionStore call below
      // receives a fully-typed Session even though `raw` came from IPC.
      const session = SessionSchema.parse(raw);
      store.createSession(session);
      return ok(session);
    } catch (err) {
      return fail(err);
    }
  });

  // v1.6.3 — Session fork IPC. parent_session_id 필수, options 는 zod-less
  // shallow validation (간단한 객체).
  ipcMain.handle(
    'session/fork',
    (_evt, parentId: unknown, optionsRaw: unknown): Result<{ id: string }> => {
      try {
        if (typeof parentId !== 'string' || parentId.length === 0) {
          throw new Error('parentId must be a non-empty string');
        }
        const opts: { title?: string; truncateAt?: string } = {};
        if (optionsRaw !== undefined && optionsRaw !== null) {
          if (typeof optionsRaw !== 'object' || Array.isArray(optionsRaw)) {
            throw new Error('options must be an object');
          }
          const o = optionsRaw as Record<string, unknown>;
          if (typeof o['title'] === 'string' && o['title'].length > 0) {
            opts.title = o['title'];
          }
          if (typeof o['truncateAt'] === 'string' && o['truncateAt'].length > 0) {
            opts.truncateAt = o['truncateAt'];
          }
        }
        const newId = store.forkSession(parentId as SessionId, opts);
        return ok({ id: newId });
      } catch (err) {
        return fail(err);
      }
    }
  );

  ipcMain.handle(
    'session/append-turn',
    (_evt, sessionId: unknown, rawTurn: unknown): Result<void> => {
      try {
        if (typeof sessionId !== 'string') {
          throw new Error('session id must be string');
        }
        const turn: Turn = TurnSchema.parse(rawTurn);
        store.appendTurn(sessionId as SessionId, turn);
        return ok(undefined);
      } catch (err) {
        return fail(err);
      }
    }
  );

  ipcMain.handle(
    'session/update-meta',
    (_evt, sessionId: unknown, patch: unknown): Result<void> => {
      try {
        if (typeof sessionId !== 'string') {
          throw new Error('session id must be string');
        }
        const validated: SessionMetaPatch = SessionMetaPatchSchema.parse(patch);
        store.updateSessionMeta(sessionId as SessionId, validated);
        return ok(undefined);
      } catch (err) {
        return fail(err);
      }
    }
  );

  // v1.1.11 (Workspace UX): per-session sticky workspace lock toggle.
  // ChatHeader 의 🔒 toggle 이 호출. payload: { sessionId, locked }.
  ipcMain.handle(
    'session/set-workspace-locked',
    (_evt, raw: unknown): Result<{ ok: boolean }> => {
      try {
        if (typeof raw !== 'object' || raw === null) {
          throw new Error('payload must be object { sessionId, locked }');
        }
        const obj = raw as { sessionId?: unknown; locked?: unknown };
        if (typeof obj.sessionId !== 'string' || obj.sessionId.length === 0) {
          throw new Error('sessionId required');
        }
        if (typeof obj.locked !== 'boolean') {
          throw new Error('locked must be boolean');
        }
        const updated = store.setWorkspaceLocked(
          obj.sessionId as SessionId,
          obj.locked
        );
        return ok({ ok: updated });
      } catch (err) {
        return fail(err);
      }
    }
  );

  // v1.1.11: 특정 세션의 lock 상태 read — UI 가 mount 시 동기화.
  ipcMain.handle(
    'session/get-workspace-locked',
    (_evt, sessionId: unknown): Result<{ locked: boolean }> => {
      try {
        if (typeof sessionId !== 'string') {
          throw new Error('session id must be string');
        }
        return ok({ locked: store.getWorkspaceLocked(sessionId as SessionId) });
      } catch (err) {
        return fail(err);
      }
    }
  );

  ipcMain.handle('session/delete', (_evt, sessionId: unknown): Result<void> => {
    try {
      if (typeof sessionId !== 'string') {
        throw new Error('session id must be string');
      }
      store.deleteSession(sessionId as SessionId);
      return ok(undefined);
    } catch (err) {
      return fail(err);
    }
  });

  // v0.5.0 (F-018) — `/clear` 슬래시 명령. 현재 세션의 turn 만 모두 비우고
  // 세션 자체는 유지. 같은 channel 안에서 destructive 작업 명시 — 사용자가
  // 의도적으로 호출했을 때만 trigger.
  ipcMain.handle('session/clear-turns', (_evt, sessionId: unknown): Result<void> => {
    try {
      if (typeof sessionId !== 'string') {
        throw new Error('session id must be string');
      }
      store.clearTurns(sessionId as SessionId);
      return ok(undefined);
    } catch (err) {
      return fail(err);
    }
  });

  // v0.5.0 (F-018) — `/model <name>` 슬래시 명령. session.conversation 의
  // current_model / current_effort / current_mode 변경. patch 는 strict zod
  // 검증으로 알 수 없는 필드 / 잘못된 enum 모두 거절.
  ipcMain.handle(
    'session/update-conversation',
    (_evt, sessionId: unknown, patch: unknown): Result<Session> => {
      try {
        if (typeof sessionId !== 'string') {
          throw new Error('session id must be string');
        }
        const validated: ConversationPatch = ConversationPatchSchema.parse(patch);
        store.updateConversation(sessionId as SessionId, validated);
        const reloaded = store.getSession(sessionId as SessionId);
        if (reloaded === null) {
          throw new Error(`Cannot update conversation: session ${sessionId} not found`);
        }
        return ok(reloaded);
      } catch (err) {
        return fail(err);
      }
    }
  );

  // v0.7.0 (F-026) — Sidebar 검색 입력 → BM25 ranked turn matches across all
  // sessions. Renderer 는 결과를 클릭해 해당 turn 으로 scroll.
  // q 는 trim+1자 이상, 200자 미만, limit 은 100 미만 으로 Zod 가 강제.
  ipcMain.handle(
    'session/search',
    (_evt, raw: unknown): Result<TurnSearchResult[]> => {
      try {
        const { q, limit } = SearchTurnsArgsSchema.parse(raw);
        return ok(store.searchTurns(q, limit ?? 50));
      } catch (err) {
        return fail(err);
      }
    }
  );

  // v0.8.0 — H Permission Dropdown — 세션의 default_level 변경. metadata-only
  // change. 갱신된 Session 을 반환해 caller (renderer) 가 즉시 local state 에
  // shadow update 가능.
  ipcMain.handle(
    'session/update-permission',
    (_evt, sessionId: unknown, patch: unknown): Result<Session> => {
      try {
        if (typeof sessionId !== 'string') {
          throw new Error('session id must be string');
        }
        const validated: PermissionPatch = PermissionPatchSchema.parse(patch);
        store.updatePermission(sessionId as SessionId, validated);
        const reloaded = store.getSession(sessionId as SessionId);
        if (reloaded === null) {
          throw new Error(`Cannot update permission: session ${sessionId} not found`);
        }
        return ok(reloaded);
      } catch (err) {
        return fail(err);
      }
    }
  );
}

function registerLockHandlers(electionSource: LockHandlerSource): void {
  // ── lock/* — multi-window leader election ───────────────────
  // Spec: docs/session/multi-window.md

  ipcMain.handle(
    'lock/acquire',
    (
      evt: IpcMainInvokeEvent,
      sessionId: unknown
    ): Result<{ acquired: boolean; leader: SessionLock | null }> => {
      try {
        if (typeof sessionId !== 'string') {
          throw new Error('session id must be string');
        }
        const election = resolveElection(electionSource, evt);
        const acquired = election.acquireLeadership(sessionId as SessionId);
        const leader = election.getLeader(sessionId as SessionId);
        return ok({ acquired, leader });
      } catch (err) {
        return fail(err);
      }
    }
  );

  ipcMain.handle('lock/release', (evt: IpcMainInvokeEvent, sessionId: unknown): Result<void> => {
    try {
      if (typeof sessionId !== 'string') {
        throw new Error('session id must be string');
      }
      const election = resolveElection(electionSource, evt);
      election.releaseLeadership(sessionId as SessionId);
      return ok(undefined);
    } catch (err) {
      return fail(err);
    }
  });

  ipcMain.handle(
    'lock/get',
    (evt: IpcMainInvokeEvent, sessionId: unknown): Result<SessionLock | null> => {
      try {
        if (typeof sessionId !== 'string') {
          throw new Error('session id must be string');
        }
        const election = resolveElection(electionSource, evt);
        return ok(election.getLeader(sessionId as SessionId));
      } catch (err) {
        return fail(err);
      }
    }
  );

  ipcMain.handle(
    'lock/heartbeat',
    (evt: IpcMainInvokeEvent, sessionId: unknown): Result<boolean> => {
      try {
        if (typeof sessionId !== 'string') {
          throw new Error('session id must be string');
        }
        const election = resolveElection(electionSource, evt);
        return ok(election.heartbeat(sessionId as SessionId));
      } catch (err) {
        return fail(err);
      }
    }
  );

  ipcMain.handle(
    'lock/is-leader',
    (evt: IpcMainInvokeEvent, sessionId: unknown): Result<boolean> => {
      try {
        if (typeof sessionId !== 'string') {
          throw new Error('session id must be string');
        }
        const election = resolveElection(electionSource, evt);
        return ok(election.isLeader(sessionId as SessionId));
      } catch (err) {
        return fail(err);
      }
    }
  );
}

function registerBrowserHandlers(browser: BrowserManager): void {
  // ── browser/* — in-app WebContentsView per session (P1-5) ─────
  // Spec: docs/session/browser.md

  ipcMain.handle('browser/open-tab', (_evt, args: unknown): Result<BrowserTabState> => {
    try {
      const validated = OpenTabArgsSchema.parse(args);
      const state = browser.openTab({
        session_id: validated.session_id as SessionId,
        tab_id: validated.tab_id,
        url: validated.url,
      });
      return ok(state);
    } catch (err) {
      return fail(err);
    }
  });

  ipcMain.handle('browser/close-tab', (_evt, tabId: unknown): Result<void> => {
    try {
      if (typeof tabId !== 'string') {
        throw new Error('tab id must be string');
      }
      browser.closeTab(tabId);
      return ok(undefined);
    } catch (err) {
      return fail(err);
    }
  });

  ipcMain.handle('browser/switch-tab', (_evt, sessionId: unknown, tabId: unknown): Result<void> => {
    try {
      if (typeof sessionId !== 'string') {
        throw new Error('session id must be string');
      }
      if (typeof tabId !== 'string') {
        throw new Error('tab id must be string');
      }
      browser.switchTab(sessionId as SessionId, tabId);
      return ok(undefined);
    } catch (err) {
      return fail(err);
    }
  });

  ipcMain.handle('browser/navigate', (_evt, tabId: unknown, url: unknown): Result<void> => {
    try {
      if (typeof tabId !== 'string') {
        throw new Error('tab id must be string');
      }
      if (typeof url !== 'string' || url.length === 0) {
        throw new Error('url must be non-empty string');
      }
      browser.navigate(tabId, url);
      return ok(undefined);
    } catch (err) {
      return fail(err);
    }
  });

  ipcMain.handle('browser/back', (_evt, tabId: unknown): Result<void> => {
    try {
      if (typeof tabId !== 'string') {
        throw new Error('tab id must be string');
      }
      browser.goBack(tabId);
      return ok(undefined);
    } catch (err) {
      return fail(err);
    }
  });

  ipcMain.handle('browser/forward', (_evt, tabId: unknown): Result<void> => {
    try {
      if (typeof tabId !== 'string') {
        throw new Error('tab id must be string');
      }
      browser.goForward(tabId);
      return ok(undefined);
    } catch (err) {
      return fail(err);
    }
  });

  // v1.6.14 — DOM dump. webview 의 active page 의 DOM tree 를 stringified
  // JSON 으로 반환. webview 가 별도 process 라 renderer 직접 접근 X →
  // webContents.executeJavaScript 통해.
  ipcMain.handle(
    'browser/dump-dom',
    async (
      _evt,
      tabId: unknown,
      optionsRaw: unknown
    ): Promise<Result<{ url: string; selector: string; dump_json: string } | null>> => {
      try {
        if (typeof tabId !== 'string' || tabId.length === 0) {
          throw new Error('tab id required');
        }
        const opts: { selector?: string; maxDepth?: number; maxText?: number } = {};
        if (optionsRaw !== undefined && optionsRaw !== null) {
          if (typeof optionsRaw !== 'object' || Array.isArray(optionsRaw)) {
            throw new Error('options must be an object');
          }
          const o = optionsRaw as Record<string, unknown>;
          if (typeof o['selector'] === 'string' && o['selector'].length > 0) {
            opts.selector = o['selector'];
          }
          if (typeof o['maxDepth'] === 'number' && o['maxDepth'] > 0) {
            opts.maxDepth = o['maxDepth'];
          }
          if (typeof o['maxText'] === 'number' && o['maxText'] > 0) {
            opts.maxText = o['maxText'];
          }
        }
        const result = await browser.dumpTabDom(tabId, opts);
        return ok(result);
      } catch (err) {
        return fail(err);
      }
    }
  );

  // v1.6.1 — Screenshot capture. capturePage() 의 NativeImage 를 base64 PNG
  // 로 직렬화해 renderer 에 반환. 파일 저장은 renderer / 후속 슬롯에서.
  ipcMain.handle(
    'browser/capture-tab',
    async (_evt, tabId: unknown): Promise<Result<{
      png_base64: string;
      width: number;
      height: number;
    } | null>> => {
      try {
        if (typeof tabId !== 'string') {
          throw new Error('tab id must be string');
        }
        const result = await browser.captureTab(tabId);
        return ok(result);
      } catch (err) {
        return fail(err);
      }
    }
  );

  ipcMain.handle('browser/reload', (_evt, tabId: unknown): Result<void> => {
    try {
      if (typeof tabId !== 'string') {
        throw new Error('tab id must be string');
      }
      browser.reload(tabId);
      return ok(undefined);
    } catch (err) {
      return fail(err);
    }
  });

  ipcMain.handle('browser/set-bounds', (_evt, tabId: unknown, bounds: unknown): Result<void> => {
    try {
      if (typeof tabId !== 'string') {
        throw new Error('tab id must be string');
      }
      const validated = BoundsSchema.parse(bounds);
      browser.setBounds(tabId, validated);
      return ok(undefined);
    } catch (err) {
      return fail(err);
    }
  });

  ipcMain.handle('browser/list-tabs', (_evt, sessionId: unknown): Result<BrowserTabState[]> => {
    try {
      if (typeof sessionId !== 'string') {
        throw new Error('session id must be string');
      }
      return ok(browser.listTabs(sessionId as SessionId));
    } catch (err) {
      return fail(err);
    }
  });
}

function toolResultToRef(result: ToolResult): ToolResultRef {
  const ref: ToolResultRef = {
    call_id: result.call_id,
    status: result.status,
    duration_ms: result.duration_ms,
    ...(result.output !== undefined && { output: result.output }),
    ...(result.error !== undefined && {
      error: {
        code: result.error.code,
        message: result.error.message,
      },
    }),
  };
  return ref;
}

function registerToolHandlers(tools: ToolHandlerConfig): void {
  // ── tool/* — Tool Queue IPC bridge ─────────────────────────
  // Spec: docs/tools/queue.md

  ipcMain.handle(
    'tool/list',
    (): Result<
      Array<{
        id: string;
        version: string;
        source: string;
        name: string;
      }>
    > => {
      try {
        return ok(
          tools.registry.list().map((tool) => ({
            id: tool.id,
            version: tool.version,
            source: tool.source,
            name: tool.display.name,
          }))
        );
      } catch (err) {
        return fail(err);
      }
    }
  );

  ipcMain.handle('tool/execute', async (event, raw: unknown): Promise<Result<ToolResult>> => {
    try {
      const parsed = ToolCallArgsSchema.parse(raw);
      const call: ToolCall = {
        id: parsed.id as ToolCallId,
        tool_id: parsed.tool_id,
        session_id: parsed.session_id as SessionId,
        turn_id: parsed.turn_id as TurnId,
        input: parsed.input,
        origin: parsed.origin,
        created_at: parsed.created_at,
        ...(parsed.parent_call_id !== undefined && {
          parent_call_id: parsed.parent_call_id as ToolCallId,
        }),
        ...(parsed.timeout_ms !== undefined && { timeout_ms: parsed.timeout_ms }),
        ...(parsed.priority !== undefined && { priority: parsed.priority }),
      };
      // v1.1.2 hotfix (Codex Q8): event.sender.id 를 webContentsId 로 전달.
      // Electron 이 보장하는 신뢰 가능 출처 — renderer 가 spoof 불가. Queue
      // 의 sessionGrants 가 본 ID 버킷에 격리됨.
      return ok(
        await tools.queue.enqueue(call, { web_contents_id: event.sender.id })
      );
    } catch (err) {
      return fail(err);
    }
  });

  ipcMain.handle('tool/cancel-call', (event, callId: unknown, reason: unknown): Result<boolean> => {
    try {
      if (typeof callId !== 'string') {
        throw new Error('call id must be string');
      }
      if (reason !== undefined && typeof reason !== 'string') {
        throw new Error('reason must be string');
      }
      // v1.1.4 hotfix (Codex Q10): event.sender.id 를 cancelCall 에 전달.
      // call owner webContents 와 다르면 거절.
      const requesterId =
        typeof (event as { sender?: { id?: unknown } } | undefined)?.sender?.id === 'number'
          ? (event as { sender: { id: number } }).sender.id
          : undefined;
      return ok(tools.queue.cancelCall(callId as ToolCallId, reason, requesterId));
    } catch (err) {
      return fail(err);
    }
  });

  ipcMain.handle('tool/cancel-turn', (event, turnId: unknown, reason: unknown): Result<number> => {
    try {
      if (typeof turnId !== 'string') {
        throw new Error('turn id must be string');
      }
      if (reason !== undefined && typeof reason !== 'string') {
        throw new Error('reason must be string');
      }
      // v1.1.4 hotfix (Codex Q10): event.sender.id 를 cancelTurn 에 전달.
      // 다른 webContents 의 active calls 는 skip — 같은 owner 만 취소.
      const requesterId =
        typeof (event as { sender?: { id?: unknown } } | undefined)?.sender?.id === 'number'
          ? (event as { sender: { id: number } }).sender.id
          : undefined;
      return ok(tools.queue.cancelTurn(turnId as TurnId, reason, requesterId));
    } catch (err) {
      return fail(err);
    }
  });

  ipcMain.handle(
    'tool/stats',
    (): Result<{
      active: number;
      pending: number;
      by_session: Record<string, number>;
    }> => {
      try {
        const stats = tools.queue.getStats();
        return ok({
          active: stats.active,
          pending: stats.pending,
          by_session: Object.fromEntries(stats.by_session.entries()),
        });
      } catch (err) {
        return fail(err);
      }
    }
  );
}

// ────────────────────────────────────────────────────────────
// mcp/* — MCP Bridge (Issue #5, v0.2.0)
//
// Spec: docs/tools/mcp-bridge.md
//
// 5 handlers:
//   - mcp/list       — listServers()
//   - mcp/add        — config validate + addServer
//   - mcp/remove     — removeServer(id)
//   - mcp/restart    — restartServer(id)
//   - mcp/get-logs   — getServerLogs(id)
// ────────────────────────────────────────────────────────────

function registerMcpHandlers(mcp: McpManager): void {
  ipcMain.handle('mcp/list', (): Result<McpServerState[]> => {
    try {
      return ok(mcp.listServers());
    } catch (err) {
      return fail(err);
    }
  });

  ipcMain.handle('mcp/add', async (_evt, raw: unknown): Promise<Result<void>> => {
    try {
      // Renderer 의 input 은 신뢰 X — Zod 가 검증 + 기본값 채움 (args/env/enabled).
      const config = McpServerConfigSchema.parse(raw);
      await mcp.addServer(config);
      return ok(undefined);
    } catch (err) {
      return fail(err);
    }
  });

  ipcMain.handle('mcp/remove', async (_evt, id: unknown): Promise<Result<void>> => {
    try {
      if (typeof id !== 'string' || id.length === 0) {
        throw new Error('id must be non-empty string');
      }
      await mcp.removeServer(id);
      return ok(undefined);
    } catch (err) {
      return fail(err);
    }
  });

  ipcMain.handle('mcp/restart', async (_evt, id: unknown): Promise<Result<void>> => {
    try {
      if (typeof id !== 'string' || id.length === 0) {
        throw new Error('id must be non-empty string');
      }
      await mcp.restartServer(id);
      return ok(undefined);
    } catch (err) {
      return fail(err);
    }
  });

  ipcMain.handle('mcp/get-logs', (_evt, id: unknown): Result<string[]> => {
    try {
      if (typeof id !== 'string' || id.length === 0) {
        throw new Error('id must be non-empty string');
      }
      return ok(mcp.getServerLogs(id));
    } catch (err) {
      return fail(err);
    }
  });

  // v0.9.0 — MCP discovery. 정적 추천 + Claude/Codex CLI config 자동 탐지.
  // 모든 단계는 best-effort — fs 실패 / 권한 / 파일 부재 시 빈 배열 (silent).
  ipcMain.handle('mcp/discover', async (): Promise<Result<McpDiscoveryResult>> => {
    try {
      const [from_claude, from_codex] = await Promise.all([
        detectMcpFromClaudeConfig().catch(() => []),
        detectMcpFromCodexConfig().catch(() => []),
      ]);
      // 이미 등록된 server id 는 from_claude / from_codex 에서 제거 — 중복 추가
      // 방지 (사용자가 [추가] 버튼 누르면 등록되지만 이미 있는 건 노출 X).
      const registeredIds = new Set(mcp.listServers().map((s) => s.config.id));
      return ok({
        suggested: [...SUGGESTED_MCP_SERVERS],
        from_claude: from_claude.filter((c) => !registeredIds.has(c.id)),
        from_codex: from_codex.filter((c) => !registeredIds.has(c.id)),
      });
    } catch (err) {
      return fail(err);
    }
  });
}

interface McpDiscoveryResult {
  suggested: SuggestedMcpServer[];
  from_claude: import('@/types').McpServerConfig[];
  from_codex: import('@/types').McpServerConfig[];
}

// ────────────────────────────────────────────────────────────
// usage/* — Token / cost telemetry (v0.4.0)
//
// Spec: ROADMAP.md (v0.4.0 Usage/Cost Tracking MVP)
//
// 3 read-only handlers:
//   - usage/summary    — {from?, to?, provider?, model?, session_id?} → UsageSummary[]
//   - usage/daily      — {days, provider?} → DailyUsageRow[]
//   - usage/by-session — sessionId 문자열 → UsageEvent[]
//
// 모든 handler 는 Result<T> wrap + Zod 검증. Mutation IPC 는 의도적으로 X
// — append-only (recordEvent 는 stream pump 에서만 호출).
// ────────────────────────────────────────────────────────────

function registerUsageHandlers(usageStore: UsageStore): void {
  ipcMain.handle('usage/summary', (_evt, raw: unknown): Result<UsageSummary[]> => {
    try {
      const args = UsageSummaryArgsSchema.parse(raw ?? {});
      const filter: UsageRangeFilter = {};
      if (args.from !== undefined) filter.from = args.from;
      if (args.to !== undefined) filter.to = args.to;
      if (args.provider !== undefined) filter.provider = args.provider;
      if (args.model !== undefined) filter.model = args.model;
      if (args.session_id !== undefined) filter.session_id = args.session_id;
      return ok(usageStore.getSummary(filter));
    } catch (err) {
      return fail(err);
    }
  });

  ipcMain.handle('usage/daily', (_evt, raw: unknown): Result<DailyUsageRow[]> => {
    try {
      const args = UsageDailyArgsSchema.parse(raw);
      const provider: UsageProvider | undefined = args.provider;
      return ok(usageStore.getDailyTotals(args.days, provider));
    } catch (err) {
      return fail(err);
    }
  });

  ipcMain.handle('usage/by-session', (_evt, raw: unknown): Result<UsageEvent[]> => {
    try {
      if (typeof raw !== 'string' || raw.length === 0) {
        throw new Error('session_id must be non-empty string');
      }
      return ok(usageStore.getBySession(raw));
    } catch (err) {
      return fail(err);
    }
  });

  // v0.9.0 — Usage CSV export. Range filter 는 summary 와 동일 schema 재사용
  // (from/to/provider/model/session_id). 응답은 string — renderer 가 Blob 으로
  // wrap 해 download 트리거.
  ipcMain.handle('usage/export-csv', (_evt, raw: unknown): Result<string> => {
    try {
      const args = UsageSummaryArgsSchema.parse(raw ?? {});
      const filter: UsageRangeFilter = {};
      if (args.from !== undefined) filter.from = args.from;
      if (args.to !== undefined) filter.to = args.to;
      if (args.provider !== undefined) filter.provider = args.provider;
      if (args.model !== undefined) filter.model = args.model;
      if (args.session_id !== undefined) filter.session_id = args.session_id;
      return ok(usageStore.exportCsv(filter));
    } catch (err) {
      return fail(err);
    }
  });

  // v0.9.0 — 비용 한도 / 임계값 read+write. settings.json 에 영속.
  ipcMain.handle('usage/get-limits', (): Result<UsageLimits> => {
    try {
      const settings = readSettings();
      return ok({
        ...(typeof settings.usage_cost_limit_usd === 'number' && {
          cost_limit_usd: settings.usage_cost_limit_usd,
        }),
        alert_threshold:
          typeof settings.usage_alert_threshold === 'number'
            ? settings.usage_alert_threshold
            : 0.8,
      });
    } catch (err) {
      return fail(err);
    }
  });

  ipcMain.handle('usage/set-limits', (_evt, raw: unknown): Result<void> => {
    try {
      const args = UsageLimitsSchema.parse(raw);
      // 부분 patch — 미지정 키는 기존 값 유지. null 은 명시적 삭제 (한도/임계 제거).
      const patch: Partial<{
        usage_cost_limit_usd: number | undefined;
        usage_alert_threshold: number | undefined;
      }> = {};
      if (Object.prototype.hasOwnProperty.call(args, 'cost_limit_usd')) {
        patch.usage_cost_limit_usd = args.cost_limit_usd ?? undefined;
      }
      if (Object.prototype.hasOwnProperty.call(args, 'alert_threshold')) {
        patch.usage_alert_threshold = args.alert_threshold ?? undefined;
      }
      writeSettings(patch);
      return ok(undefined);
    } catch (err) {
      return fail(err);
    }
  });
}

// ────────────────────────────────────────────────────────────
// audit/* — v1.0.11 SEC-3 (Audit log read API)
//
// Spec: docs/v1.x-roadmap.md (SEC-3), 001_init.sql (audit_log)
//
// 2 read-only handlers:
//   - audit/recent     — { limit?, session_id?, capability?, event_prefix?, from?, to? } → AuditEvent[]
//   - audit/by-session — { session_id, limit? } → AuditEvent[] (시간 ASC)
//
// Mutation IPC 는 의도적으로 X — append-only (recordEvent 는 main 의 sink
// closure 에서만 호출).
// ────────────────────────────────────────────────────────────

function registerAuditHandlers(audit: AuditLogStore): void {
  ipcMain.handle('audit/recent', (_evt, raw: unknown): Result<AuditEvent[]> => {
    try {
      const args = AuditRecentArgsSchema.parse(raw ?? {});
      const limit = args.limit ?? 100;
      const filter: import('@/storage').AuditQueryFilter = {};
      if (args.session_id !== undefined) filter.session_id = args.session_id;
      if (args.capability !== undefined) filter.capability = args.capability;
      if (args.event_prefix !== undefined) filter.event_prefix = args.event_prefix;
      if (args.from !== undefined) filter.from = args.from;
      if (args.to !== undefined) filter.to = args.to;
      return ok(audit.getRecent(limit, filter));
    } catch (err) {
      return fail(err);
    }
  });

  ipcMain.handle('audit/by-session', (_evt, raw: unknown): Result<AuditEvent[]> => {
    try {
      const args = z
        .object({
          session_id: z.string().min(1),
          limit: z.number().int().positive().max(5000).optional(),
        })
        .strict()
        .parse(raw);
      return ok(audit.getBySession(args.session_id, args.limit ?? 500));
    } catch (err) {
      return fail(err);
    }
  });
}

// v0.9.0 — Usage limits 입력/출력 shape. 비용 한도 / 임계값.
const UsageLimitsSchema = z
  .object({
    cost_limit_usd: z.number().nonnegative().nullable().optional(),
    alert_threshold: z.number().min(0).max(1).nullable().optional(),
  })
  .strict();

interface UsageLimits {
  cost_limit_usd?: number;
  alert_threshold: number;
}

// ────────────────────────────────────────────────────────────
// ai/* — Real CLI subprocess streaming (P1-4)
// ────────────────────────────────────────────────────────────

/**
 * AI handler 의존성 주입.
 *
 * Tests 는 mock provider 를 inject 하여 child_process 없이 검증 가능.
 * Production 은 모든 옵션 생략 → @/providers 의 실제 구현 사용.
 */
export interface AiHandlerConfig {
  /** Renderer 로 stream-event 를 보낼 BrowserWindow getter. null 시 emit skip. */
  getMainWindow: () => BrowserWindow | null;
  /**
   * Override for tests. Default: @/providers getDefaultProvider.
   * v0.3.0 — userDefaultProvider 옵션 추가 (wizard 에서 사용자가 선택한 값).
   */
  getDefaultProvider?: (
    model: string,
    signal?: AbortSignal,
    cwd?: string,
    permissionLevel?: PermissionLevel,
    userDefaultProvider?: 'auto' | 'claude' | 'codex' | 'mock'
  ) => Promise<AutoProviderResult>;
  /** Override for tests. Default: @/providers detectCli. */
  detectCli?: () => Promise<CliDetectionResult>;
  /** Optional Tool Queue integration for provider-emitted tool calls. */
  toolQueue?: ToolQueue;
  /**
   * v1.0.12 (COST-2): pre-flight cost limit gate. 미지정 시 enforcement 없음
   * (테스트 / pre-init 환경 호환). 본 객체가 있으면 매 ai/start-stream 직전에
   * checkBeforeStream 호출.
   */
  costGate?: import('./CostGate').CostGate;
  /**
   * v1.0.12 (COST-2): cost gate 차단 / threshold 도달 시 audit event 발행.
   * 기본 (별도 sink) 미설정 시 audit 미기록 — Queue 의 audit_sink 와 다른 경로.
   */
  costAuditSink?: (event: import('./CostGate').CostAuditEvent) => void;
  /**
   * v1.6.5 — Plugin Hook integration. AI stream 시작/종료 시점에 plugin
   * hook (pre_turn / post_turn) 실행. 미지정 시 hook 호출 X (테스트 호환).
   */
  pluginManager?: import('./plugins/PluginManager').PluginManager;
  pluginHookRunner?: import('./plugins/PluginHookRunner').PluginHookRunner;
}

interface ActiveStream {
  abort: () => void;
}

const activeStreams = new Map<string, ActiveStream>();

/**
 * Test helper — 활성 스트림 모두 abort + 등록 해제.
 *
 * Production 에서는 app.before-quit 에서 호출.
 */
export function shutdownAiHandlers(): void {
  for (const [, s] of activeStreams) {
    try {
      s.abort();
    } catch {
      // ignore
    }
  }
  activeStreams.clear();
}

function registerAiHandlers(cfg: AiHandlerConfig, usage?: UsageStore): void {
  const getDefaultProviderFn = cfg.getDefaultProvider ?? defaultGetDefaultProvider;
  const detectCliFn = cfg.detectCli ?? defaultDetectCli;

  ipcMain.handle('ai/detect-cli', async (): Promise<Result<CliDetectionResult>> => {
    try {
      const detected = await detectCliFn();
      return ok(detected);
    } catch (err) {
      return fail(err);
    }
  });

  ipcMain.handle(
    'ai/start-stream',
    async (event, args: unknown): Promise<Result<{ stream_id: string; source: string }>> => {
      try {
        // v1.1.2 hotfix (Codex Q8): renderer 가 spoof 할 수 없는 webContentsId.
        // tool/execute 와 동일하게 Queue 의 sessionGrants 가 본 ID 버킷에 격리.
        // 테스트 stub 의 evt.sender 가 number 가 아니어도 안전한 fallback.
        const senderId =
          typeof (event as { sender?: { id?: unknown } } | undefined)?.sender?.id === 'number'
            ? ((event as { sender: { id: number } }).sender.id)
            : 0;
        const { stream_id, model, turns, session_id, workspace_root, permission_level } =
          StartStreamArgsSchema.parse(args);

        // Reject collisions before provider detection/spawn work.
        if (activeStreams.has(stream_id)) {
          return { ok: false, error: `stream_id "${stream_id}" already active` };
        }

        // v1.0.12 (COST-2): pre-flight cost limit check. 차단 시 즉시 fail
        // — provider detection / spawn / stream 어떤 비용도 발생 X.
        // Codex 외부 검토 결론: enforcement 는 main IPC boundary 에서만.
        if (cfg.costGate !== undefined) {
          // input estimate — turns 의 누적 char 수 기반 보수 추정 (4 chars ≈ 1 token).
          const inputEstChars = turns.reduce((sum, t) => {
            for (const block of t.content) {
              if ('text' in block && typeof block.text === 'string') {
                sum += block.text.length;
              }
            }
            return sum;
          }, 0);
          const decision = cfg.costGate.checkBeforeStream({
            model,
            input_estimate_tokens: Math.ceil(inputEstChars / 4),
            output_max_tokens: 4096,
          });

          if (decision.kind === 'block') {
            // Audit (Codex picking).
            cfg.costAuditSink?.({
              timestamp: new Date().toISOString(),
              session_id: session_id ?? '',
              event:
                decision.reason === 'unknown_model_under_limit'
                  ? 'cost.unknown_model_blocked'
                  : 'cost.limit_blocked',
              model,
              target_json: JSON.stringify({
                reason: decision.reason,
                limit_usd: decision.limit_usd,
                mtd_total_usd: decision.mtd_total_usd,
                projected_total_usd: decision.projected_total_usd,
                projected_increment_usd: decision.projected_increment_usd,
              }),
              outcome: 'blocked',
              hint: decision.hint,
            });
            // 사용자에게 보여줄 친화적 에러 — code 가 'COST_LIMIT_EXCEEDED'.
            return {
              ok: false,
              error: JSON.stringify({
                code: 'COST_LIMIT_EXCEEDED',
                message: decision.hint,
                details: {
                  reason: decision.reason,
                  limit_usd: decision.limit_usd,
                  mtd_total_usd: decision.mtd_total_usd,
                  projected_total_usd: decision.projected_total_usd,
                },
              }),
            };
          }

          // allow + alert threshold 도달 시 audit (차단 X, toast 만).
          if (decision.alert) {
            cfg.costAuditSink?.({
              timestamp: new Date().toISOString(),
              session_id: session_id ?? '',
              event: 'cost.alert_threshold',
              model,
              target_json: JSON.stringify({
                projected_total_usd: decision.projected_total_usd,
                projected_increment_usd: decision.projected_increment_usd,
              }),
              outcome: 'allowed_with_alert',
            });
          }

          // Reserved ledger 등록 — stream 종료 시 release.
          cfg.costGate.reserve(stream_id, decision.projected_increment_usd);
        }

        // Codex spec 의 안전한 default — renderer 가 명시 안 했어도 sandbox 가
        // 강제되도록. Spec: docs/permission/provider-mapping.md
        const effectiveLevel: PermissionLevel = permission_level ?? 'workspace_write';
        // v0.3.0 — settings.default_provider 를 매 stream 마다 fresh 로 읽음.
        // 사용자가 wizard 또는 설정에서 변경하면 즉시 반영. 'auto' 는 종전 동작.
        const settings = readSettings();
        const userDefaultProvider: DefaultProviderChoice =
          settings.default_provider ?? 'auto';
        const controller = new AbortController();
        const { provider, source } = await getDefaultProviderFn(
          model,
          controller.signal,
          workspace_root,
          effectiveLevel,
          userDefaultProvider
        );
        activeStreams.set(stream_id, {
          abort: () => controller.abort(),
        });

        // Stream 은 background 로 실행. Result 는 즉시 반환.
        // CostGate.release 는 runStreamPump 의 finally 에서 호출되도록 wire.
        void runStreamPump(
          stream_id,
          provider,
          { turns, model, session_id },
          controller,
          cfg,
          usage,
          senderId
        );

        return ok({ stream_id, source });
      } catch (err) {
        return fail(err);
      }
    }
  );

  ipcMain.handle('ai/stop-stream', (_evt, streamId: unknown): Result<void> => {
    try {
      if (typeof streamId !== 'string') {
        throw new Error('stream_id must be string');
      }
      const stream = activeStreams.get(streamId);
      if (stream !== undefined) {
        stream.abort();
        activeStreams.delete(streamId);
      }
      return ok(undefined);
    } catch (err) {
      return fail(err);
    }
  });
}

async function runStreamPump(
  streamId: string,
  provider: StreamingProvider,
  input: { turns: Turn[]; model: string; session_id?: string },
  controller: AbortController,
  cfg: AiHandlerConfig,
  usage: UsageStore | undefined,
  // v1.1.2 hotfix (Codex Q8): tool 호출 시 Queue 에 전달할 IPC 출처 ID.
  // ai/start-stream 핸들러의 event.sender.id. 테스트는 0 fallback.
  webContentsId: number
): Promise<void> {
  const send = (channel: string, payload: unknown): void => {
    const win = cfg.getMainWindow();
    if (win === null) return;
    try {
      // Electron 에서 destroyed window 는 호출 시 throw 함 → guard.
      if ('isDestroyed' in win && (win as { isDestroyed?: () => boolean }).isDestroyed?.()) {
        return;
      }
      win.webContents.send(channel, payload);
    } catch {
      // ignore — renderer 가 unmount 됐거나 window 가 닫혔을 수 있음
    }
  };

  let terminalEmitted = false;
  let currentTurnId: TurnId | null = null;

  // v1.6.5 — Plugin Hook integration. pre_turn 호출 (best-effort, throw 무시).
  // 본 시점은 실제 provider stream 시작 직전 — plugin 이 ctx.payload 를
  // 통해 turn 의 model/session 정보 확인 가능.
  if (
    cfg.pluginManager !== undefined &&
    cfg.pluginHookRunner !== undefined
  ) {
    const plugins = cfg.pluginManager.list().loaded;
    if (plugins.length > 0) {
      try {
        await cfg.pluginHookRunner.runHook(plugins, 'pre_turn', {
          kind: 'pre_turn',
          payload: {
            session_id: input.session_id ?? '',
            model: input.model,
            stream_id: streamId,
          },
        });
      } catch {
        // best-effort — plugin runtime 의 throw 가 stream 을 막지 X.
      }
    }
  }
  // v0.4.0 — translator 가 한 turn 동안 usage event 를 여러 번 emit 할 수 있다
  // (Claude assistant message + result 양쪽). DB 에는 마지막 1건만 영속해야
  // 누적이 정확. 매 usage 가 도착할 때마다 latest 를 갱신하고 stream 종료
  // 직전에 한 번만 recordEvent.
  let latestUsage: { type: 'usage'; data: import('@/providers').UsageEventData } | null = null;
  const persistLatestUsage = (): void => {
    if (latestUsage === null || usage === undefined) return;
    if (input.session_id === undefined || input.session_id.length === 0) return;
    try {
      usage.recordEvent({
        session_id: input.session_id,
        turn_id: latestUsage.data.turn_id,
        provider: latestUsage.data.provider,
        model: latestUsage.data.model,
        input_tokens: latestUsage.data.input_tokens,
        output_tokens: latestUsage.data.output_tokens,
        ...(latestUsage.data.cache_creation_input_tokens !== undefined && {
          cache_creation_input_tokens: latestUsage.data.cache_creation_input_tokens,
        }),
        ...(latestUsage.data.cache_read_input_tokens !== undefined && {
          cache_read_input_tokens: latestUsage.data.cache_read_input_tokens,
        }),
        ...(latestUsage.data.reasoning_output_tokens !== undefined && {
          reasoning_output_tokens: latestUsage.data.reasoning_output_tokens,
        }),
        total_cost_usd: latestUsage.data.total_cost_usd,
        recorded_at: latestUsage.data.recorded_at,
        // v1.0.12 (COST-1): unknown_pricing flag 전달 — UsageStore 가 영속.
        ...(latestUsage.data.unknown_pricing !== undefined && {
          unknown_pricing: latestUsage.data.unknown_pricing,
        }),
      });
    } catch {
      // fire-and-forget — usage 기록 실패가 stream 을 깨뜨리면 안 됨
    }
    latestUsage = null;
  };
  try {
    for await (const ev of provider.stream(input)) {
      if (controller.signal.aborted) break;
      if (ev.type === 'message_start') {
        currentTurnId = ev.turn_id as TurnId;
      }
      // usage event 는 latest 만 보관 + renderer 로도 forward (UI 가 라이브
      // 비용 표시할 수 있도록).
      if (ev.type === 'usage') {
        latestUsage = ev;
      }
      send('ai/stream-event', { stream_id: streamId, event: ev });
      if (ev.type === 'tool_call_complete') {
        await runToolCallFromStream({
          streamId,
          toolCall: ev.tool_call,
          sessionId: input.session_id,
          turnId: currentTurnId,
          cfg,
          send,
          webContentsId,
        });
      }
      if (ev.type === 'message_complete' || ev.type === 'error') {
        terminalEmitted = true;
        break;
      }
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const errorEvent: StreamEvent = { type: 'error', error: message };
    send('ai/stream-event', { stream_id: streamId, event: errorEvent });
    terminalEmitted = true;
  } finally {
    activeStreams.delete(streamId);
    // v0.4.0 — stream 종료 시 마지막 usage event 1건 영속.
    // session_id 가 없는 stream (e.g. detect 단계) 은 자동 skip.
    persistLatestUsage();
    // v1.0.12 (COST-2): reserved ledger 해제 — 실 비용은 persistLatestUsage 가
    // 영속하므로 reserved 는 단순 삭제. 다음 ai/start-stream 호출의 MTD 합계
    // 가 갱신된 durable 합계 + (이번 stream 미반영) reserved 0 으로 정확.
    cfg.costGate?.release(streamId);

    // v1.6.5/v1.6.6 — Plugin post_turn hook (best-effort). cost-limit-hook
    // 이 본 ctx.payload.mtd_total_usd / limit_usd 검사 → 한도 초과 시 toast.
    if (
      cfg.pluginManager !== undefined &&
      cfg.pluginHookRunner !== undefined
    ) {
      const plugins = cfg.pluginManager.list().loaded;
      if (plugins.length > 0) {
        const payload: Record<string, unknown> = {
          session_id: input.session_id ?? '',
          model: input.model,
          stream_id: streamId,
        };
        if (latestUsage !== null) {
          payload['cost_usd'] = latestUsage.data.total_cost_usd;
        }
        // v1.6.6: usage store 가 있으면 month-to-date 합계 + settings 한도.
        if (usage !== undefined) {
          try {
            payload['mtd_total_usd'] = usage.getMonthToDateCostUsd(new Date());
          } catch {
            // ignore — usage store 가 schema mismatch 등으로 throw 가능.
          }
        }
        try {
          const settings = readSettings();
          if (typeof settings.usage_cost_limit_usd === 'number') {
            payload['limit_usd'] = settings.usage_cost_limit_usd;
          }
        } catch {
          // test 환경 등.
        }
        try {
          await cfg.pluginHookRunner.runHook(plugins, 'post_turn', {
            kind: 'post_turn',
            payload,
            // ctx.notify 가 renderer 의 toast 로 forward.
            notify: (message, kind): void => {
              send('plugin/notify', { message, kind: kind ?? 'info' });
            },
          });
        } catch {
          // best-effort
        }
      }
    }

    // Aborted 이고 terminal event 도 못 보냈으면 가짜 error event 발행 (renderer
    // 에서 hang 방지).
    if (!terminalEmitted && controller.signal.aborted) {
      send('ai/stream-event', {
        stream_id: streamId,
        event: { type: 'error', error: 'stream aborted' } satisfies StreamEvent,
      });
    }
    send('ai/stream-end', { stream_id: streamId });
  }
}

async function runToolCallFromStream(args: {
  streamId: string;
  toolCall: { id: string; tool_id: string; input?: unknown };
  sessionId?: string;
  turnId: TurnId | null;
  cfg: AiHandlerConfig;
  send: (channel: string, payload: unknown) => void;
  /** v1.1.2 hotfix (Codex Q8): IPC 출처 ID — sessionGrants 격리 키. */
  webContentsId: number;
}): Promise<void> {
  if (args.cfg.toolQueue === undefined || args.sessionId === undefined) return;

  const call: ToolCall = {
    id: args.toolCall.id as ToolCallId,
    tool_id: args.toolCall.tool_id,
    session_id: args.sessionId as SessionId,
    turn_id: args.turnId ?? newTurnId(),
    input: args.toolCall.input,
    origin: 'ai',
    created_at: new Date().toISOString(),
  };

  const result = await args.cfg.toolQueue.enqueue(call, {
    web_contents_id: args.webContentsId,
  });
  const event: StreamEvent = {
    type: 'tool_result',
    result: toolResultToRef(result),
  };
  args.send('ai/stream-event', { stream_id: args.streamId, event });
}

// ────────────────────────────────────────────────────────────
// compare/* — v0.12.0 I (Cross-AI Verify/Compare MVP)
// ────────────────────────────────────────────────────────────

/**
 * Compare 핸들러 의존성 주입.
 *
 * Tests 는 mock store / factory 를 inject 하여 실제 child process / DB 없이
 * 검증 가능. Production 은 SessionStore.getDb() 를 공유한 CompareStore 와
 * defaultRunCompare 를 주입.
 */
export interface CompareHandlerConfig {
  store: CompareStore;
  /** Renderer 로 compare/stream-event 를 보낼 BrowserWindow getter. null 시 emit skip. */
  getMainWindow: () => BrowserWindow | null;
  /**
   * Provider factory — orchestrator 가 양쪽 호출. test 에선 mock 주입.
   * Production 은 main/index.ts 가 getDefaultProvider 를 wrap 한 factory 주입.
   */
  factory: ProviderFactory;
  /**
   * Override for tests. Default: orchestrator.runCompare. test 가 mock 으로
   * resolve / reject 동작을 미리 정의 가능.
   */
  runCompare?: (
    args: CompareOrchestratorArgs,
    store: CompareStore,
    factory: ProviderFactory,
    emit: (event: CompareEvent) => void
  ) => Promise<unknown>;
}

interface ActiveCompare {
  abort: () => void;
}

const activeCompareRuns = new Map<string, ActiveCompare>();

/**
 * Test helper — 활성 compare run 모두 abort + 등록 해제.
 * Production 은 app.before-quit 에서 호출하여 child process leak 방지.
 */
export function shutdownCompareHandlers(): void {
  for (const [, c] of activeCompareRuns) {
    try {
      c.abort();
    } catch {
      // ignore
    }
  }
  activeCompareRuns.clear();
}

function registerCompareHandlers(cfg: CompareHandlerConfig): void {
  const runCompareFn = cfg.runCompare ?? defaultRunCompare;

  ipcMain.handle('compare/run', async (_evt, raw: unknown): Promise<Result<{ run_id: string }>> => {
    try {
      const parsed = CompareRunArgsSchema.parse(raw);
      const effectiveLevel: PermissionLevel = parsed.permission_level ?? 'workspace_write';
      const controller = new AbortController();

      // Pre-create the run so we can return the id immediately + register
      // abort. The orchestrator itself also calls store.createRun in tests
      // when invoked directly — we use a distinct path here: caller schedules
      // in background, returns id, then orchestrator runs the same prompt.
      // To avoid double-create we just call orchestrator and pull run_id from
      // the first emitted compare_start event.
      const send = (channel: string, payload: unknown): void => {
        const win = cfg.getMainWindow();
        if (win === null) return;
        try {
          if ('isDestroyed' in win && (win as { isDestroyed?: () => boolean }).isDestroyed?.()) {
            return;
          }
          win.webContents.send(channel, payload);
        } catch {
          // ignore — renderer unmounted
        }
      };

      let resolvedRunId: string | null = null;
      const pending: CompareEvent[] = [];
      let pendingResolve: ((id: string) => void) | null = null;
      const startPromise = new Promise<string>((resolve) => {
        pendingResolve = resolve;
      });

      const emit = (event: CompareEvent): void => {
        if (event.type === 'compare_start') {
          resolvedRunId = event.run_id;
          activeCompareRuns.set(event.run_id, {
            abort: () => controller.abort(),
          });
          if (pendingResolve !== null) {
            pendingResolve(event.run_id);
            pendingResolve = null;
          }
          // Flush queued events with run_id (none expected before start, defensive).
          for (const queued of pending) {
            send('compare/stream-event', queued);
          }
          pending.length = 0;
        }
        if (resolvedRunId === null) {
          pending.push(event);
        } else {
          send('compare/stream-event', event);
        }
        if (event.type === 'compare_complete' && resolvedRunId !== null) {
          activeCompareRuns.delete(resolvedRunId);
        }
      };

      // Background pump — caller awaits only the first run_id.
      void (async (): Promise<void> => {
        try {
          await runCompareFn(
            {
              prompt: parsed.prompt,
              session_id: parsed.session_id,
              workspace_root: parsed.workspace_root,
              permission_level: effectiveLevel,
              claude_model: parsed.claude_model,
              codex_model: parsed.codex_model,
              abortSignal: controller.signal,
            },
            cfg.store,
            cfg.factory,
            emit
          );
        } catch (err) {
          // Orchestrator should be never-throws but defensive — surface as
          // a fake error event so renderer can clean up.
          if (resolvedRunId !== null) {
            send('compare/stream-event', {
              type: 'compare_side_error',
              run_id: resolvedRunId,
              side: 'claude',
              error: err instanceof Error ? err.message : String(err),
            } satisfies CompareEvent);
          }
        } finally {
          if (resolvedRunId !== null) {
            activeCompareRuns.delete(resolvedRunId);
          }
        }
      })();

      const runId = await startPromise;
      return ok({ run_id: runId });
    } catch (err) {
      return fail(err);
    }
  });

  ipcMain.handle('compare/get', (_evt, raw: unknown): Result<CompareRun | null> => {
    try {
      const { run_id } = CompareIdArgsSchema.parse(raw);
      const run = cfg.store.getRun(run_id);
      return ok(run);
    } catch (err) {
      return fail(err);
    }
  });

  ipcMain.handle('compare/list', (_evt, raw: unknown): Result<CompareRun[]> => {
    try {
      const { session_id, limit } = CompareListArgsSchema.parse(raw);
      const runs =
        limit !== undefined
          ? cfg.store.listBySession(session_id, limit)
          : cfg.store.listBySession(session_id);
      return ok(runs);
    } catch (err) {
      return fail(err);
    }
  });

  ipcMain.handle('compare/cancel', (_evt, raw: unknown): Result<void> => {
    try {
      const { run_id } = CompareIdArgsSchema.parse(raw);
      const active = activeCompareRuns.get(run_id);
      if (active !== undefined) {
        active.abort();
        activeCompareRuns.delete(run_id);
      }
      return ok(undefined);
    } catch (err) {
      return fail(err);
    }
  });
}
