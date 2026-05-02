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

import { app, dialog, ipcMain, type App, type BrowserWindow, type IpcMainInvokeEvent } from 'electron';
import path from 'node:path';
import { z } from 'zod';
import { readSettings, writeSettings } from './settings';
import {
  PermissionLevelSchema,
  SessionSchema,
  TurnSchema,
  newTurnId,
  type PermissionLevel,
  type Session,
  type SessionId,
  type ToolCallId,
  type ToolResultRef,
  type Turn,
  type TurnId,
} from '@/types';
import type { LeaderElection, SessionLock, SessionMeta, SessionStore } from '@/storage';
import type { StreamEvent, StreamingProvider } from '@/providers';
import type { ToolCall, ToolQueue, ToolRegistry, ToolResult } from '@/tools';
// CLI / auto 는 Node-only — main 에서만 import. providers barrel 은
// renderer 와 공유되므로 여기서 직접 명시적 경로로 가져온다.
import {
  getDefaultProvider as defaultGetDefaultProvider,
  type AutoProviderResult,
} from '@/providers/auto';
import { detectCli as defaultDetectCli, type CliDetectionResult } from '@/providers/cli/detect';
import type { BrowserManager, BrowserTabState } from './BrowserManager';
import type { Result, SessionMetaPatch, WorkspaceInfo } from './types';

export type { Result, SessionMetaPatch } from './types';

// Types shared with renderer (preload only exposes whitelisted channels)
export type AppInfo = {
  version: string;
  platform: NodeJS.Platform;
  electronVersion: string;
  nodeVersion: string;
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

function ok<T>(value: T): { ok: true; value: T } {
  return { ok: true, value };
}

function fail(err: unknown): { ok: false; error: string } {
  return { ok: false, error: toErrorMessage(err) };
}

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

function resolveElection(
  source: LockHandlerSource,
  event: IpcMainInvokeEvent
): LeaderElection {
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
 */
export function registerIpcHandlers(
  electronApp: App = app,
  store?: SessionStore,
  election?: LockHandlerSource,
  browser?: BrowserManager,
  ai?: AiHandlerConfig,
  tools?: ToolHandlerConfig
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

  ipcMain.handle('app:get-default-workspace', (): Result<WorkspaceInfo> => {
    try {
      // 사용자가 picker 로 선택한 경로가 있으면 우선. 없으면 process.cwd() 로 fallback.
      // Spec: docs/permission/levels.md (workspace_write 의 의미: 사용자 의도된
      // 폴더에만 쓰기) — process.cwd() 는 우연한 위치일 수 있어 의도 표현이 약함.
      const settings = readSettings();
      if (
        typeof settings.workspace_root === 'string' &&
        settings.workspace_root.length > 0
      ) {
        const root = settings.workspace_root;
        const name =
          typeof settings.workspace_name === 'string' && settings.workspace_name.length > 0
            ? settings.workspace_name
            : path.basename(root) || root;
        return ok({ root, name });
      }
      const root = process.cwd();
      const name = path.basename(root) || root;
      return ok({ root, name });
    } catch (err) {
      return fail(err);
    }
  });

  registerWorkspaceHandlers();

  if (store) {
    registerSessionHandlers(store);
    if (election) registerLockHandlers(election);
  }
  if (browser) registerBrowserHandlers(browser);
  if (ai) registerAiHandlers(ai);
  if (tools) registerToolHandlers(tools);
}

// ────────────────────────────────────────────────────────────
// workspace/* — folder picker + persistence
// ────────────────────────────────────────────────────────────

function registerWorkspaceHandlers(): void {
  ipcMain.handle(
    'workspace/pick-folder',
    async (): Promise<Result<{ path: string; name: string } | null>> => {
      try {
        const result = await dialog.showOpenDialog({
          properties: ['openDirectory'],
          title: '작업 폴더 선택',
        });
        if (result.canceled || result.filePaths.length === 0) {
          return ok(null);
        }
        const picked = result.filePaths[0];
        if (picked === undefined || picked.length === 0) {
          return ok(null);
        }
        const name = path.basename(picked) || picked;
        writeSettings({ workspace_root: picked, workspace_name: name });
        return ok({ path: picked, name });
      } catch (err) {
        return fail(err);
      }
    }
  );

  ipcMain.handle(
    'workspace/get',
    (): Result<{ path: string; name: string } | null> => {
      try {
        const settings = readSettings();
        if (
          typeof settings.workspace_root === 'string' &&
          settings.workspace_root.length > 0 &&
          typeof settings.workspace_name === 'string' &&
          settings.workspace_name.length > 0
        ) {
          return ok({ path: settings.workspace_root, name: settings.workspace_name });
        }
        return ok(null);
      } catch (err) {
        return fail(err);
      }
    }
  );
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

  ipcMain.handle(
    'lock/release',
    (evt: IpcMainInvokeEvent, sessionId: unknown): Result<void> => {
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
    }
  );

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

  ipcMain.handle('tool/list', (): Result<Array<{
    id: string;
    version: string;
    source: string;
    name: string;
  }>> => {
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
  });

  ipcMain.handle('tool/execute', async (_evt, raw: unknown): Promise<Result<ToolResult>> => {
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
      return ok(await tools.queue.enqueue(call));
    } catch (err) {
      return fail(err);
    }
  });

  ipcMain.handle('tool/cancel-call', (_evt, callId: unknown, reason: unknown): Result<boolean> => {
    try {
      if (typeof callId !== 'string') {
        throw new Error('call id must be string');
      }
      if (reason !== undefined && typeof reason !== 'string') {
        throw new Error('reason must be string');
      }
      return ok(tools.queue.cancelCall(callId as ToolCallId, reason));
    } catch (err) {
      return fail(err);
    }
  });

  ipcMain.handle('tool/cancel-turn', (_evt, turnId: unknown, reason: unknown): Result<number> => {
    try {
      if (typeof turnId !== 'string') {
        throw new Error('turn id must be string');
      }
      if (reason !== undefined && typeof reason !== 'string') {
        throw new Error('reason must be string');
      }
      return ok(tools.queue.cancelTurn(turnId as TurnId, reason));
    } catch (err) {
      return fail(err);
    }
  });

  ipcMain.handle('tool/stats', (): Result<{
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
  });
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
  /** Override for tests. Default: @/providers getDefaultProvider. */
  getDefaultProvider?: (
    model: string,
    signal?: AbortSignal,
    cwd?: string,
    permissionLevel?: PermissionLevel
  ) => Promise<AutoProviderResult>;
  /** Override for tests. Default: @/providers detectCli. */
  detectCli?: () => Promise<CliDetectionResult>;
  /** Optional Tool Queue integration for provider-emitted tool calls. */
  toolQueue?: ToolQueue;
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

function registerAiHandlers(cfg: AiHandlerConfig): void {
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
    async (_evt, args: unknown): Promise<Result<{ stream_id: string; source: string }>> => {
      try {
        const { stream_id, model, turns, session_id, workspace_root, permission_level } =
          StartStreamArgsSchema.parse(args);

        // Reject collisions before provider detection/spawn work.
        if (activeStreams.has(stream_id)) {
          return { ok: false, error: `stream_id "${stream_id}" already active` };
        }

        // Codex spec 의 안전한 default — renderer 가 명시 안 했어도 sandbox 가
        // 강제되도록. Spec: docs/permission/provider-mapping.md
        const effectiveLevel: PermissionLevel = permission_level ?? 'workspace_write';
        const controller = new AbortController();
        const { provider, source } = await getDefaultProviderFn(
          model,
          controller.signal,
          workspace_root,
          effectiveLevel
        );
        activeStreams.set(stream_id, {
          abort: () => controller.abort(),
        });

        // Stream 은 background 로 실행. Result 는 즉시 반환.
        void runStreamPump(
          stream_id,
          provider,
          { turns, model, session_id },
          controller,
          cfg
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
  cfg: AiHandlerConfig
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
  try {
    for await (const ev of provider.stream(input)) {
      if (controller.signal.aborted) break;
      if (ev.type === 'message_start') {
        currentTurnId = ev.turn_id as TurnId;
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

  const result = await args.cfg.toolQueue.enqueue(call);
  const event: StreamEvent = {
    type: 'tool_result',
    result: toolResultToRef(result),
  };
  args.send('ai/stream-event', { stream_id: args.streamId, event });
}
