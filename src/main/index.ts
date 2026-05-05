/**
 * Electron Main Process
 *
 * Creates the main browser window, handles app lifecycle.
 * Spec: docs/session/_index.md, docs/performance/electron-tuning.md
 */

import { app, BrowserWindow, dialog, shell } from 'electron';
import { autoUpdater } from 'electron-updater';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import {
  registerIpcHandlers,
  shutdownAiHandlers,
  shutdownCompareHandlers,
} from './ipc';
import { BrowserManager } from './BrowserManager';
import { McpManager, createSettingsAdapter } from './mcp';
import {
  AuditLogStore,
  CompareStore,
  LeaderElection,
  SessionStore,
  UsageStore,
} from '@/storage';
import { ShellRunTool, ToolQueue, ToolRegistry, type ToolAuditEvent } from '@/tools';
import { getDefaultProvider } from '@/providers/auto';
import type { ProviderFactory } from './compare/orchestrator';
import { CostGate, type CostLimits, type CostAuditEvent } from './CostGate';
import { readSettings, writeSettings } from './settings';
import { classifyUserDataConflict } from './workspaceConflict';
import { IpcPermissionConfirmer } from './IpcPermissionConfirmer';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Disable hardware acceleration in development if needed
// app.disableHardwareAcceleration();

// V8 memory: 4GB (default 1.5GB)
app.commandLine.appendSwitch('js-flags', '--max-old-space-size=4096');

let mainWindow: BrowserWindow | null = null;
let sessionStore: SessionStore | null = null;
let browserManager: BrowserManager | null = null;
let mcpManager: McpManager | null = null;
let usageStore: UsageStore | null = null;
let compareStore: CompareStore | null = null;
let auditLogStore: AuditLogStore | null = null;

interface WindowRuntime {
  election: LeaderElection;
}

const windowRuntimes = new Map<number, WindowRuntime>();

/**
 * 자동 업데이트 — packaged build (production) 만 활성.
 *
 * - dev/e2e: app.isPackaged === false → early return.
 *   electron-updater 가 lazy-load 하는 native 의존성이 dev 환경에서 실패할 수
 *   있고, 그 외에도 GitHub Releases 체크는 의미가 없다 (어차피 dev URL 로드).
 * - production: 첫 윈도우 ready 후 5초 뒤 한 번 체크 (앱 시작 부하 분산).
 *   `autoDownload=true` + `autoInstallOnAppQuit=true` 로 사용자 개입 최소.
 *
 * Spec: docs/release.md, docs/performance/electron-tuning.md (Auto-update 섹션)
 */
/**
 * v1.0.14 (META-4 hotfix): boot 시점 saved workspace 충돌 검사.
 *
 * Codex 외부 검토에서 발견된 blind spot — v1.0.13 의 META-4 가 picker 시점만
 * 차단해 이전 버전 / 수동 settings 편집 시 우회 가능했음. 본 함수가 boot
 * 직후 settings.workspace_root 를 다시 검사 + 충돌 시 dialog + settings 리셋.
 *
 * 시퀀스:
 *  1. settings.workspace_root 읽음.
 *  2. userData 와 충돌 검사 (정확/자식/부모).
 *  3. 충돌 → dialog "저장된 작업 폴더가 위험" + Confirm. settings 의
 *     workspace_root / workspace_name 제거 → 다음 부팅 / 새 채팅 시 picker.
 *  4. 충돌 X → no-op.
 *
 * 동기 dialog 가 main window 로딩을 막을 수 있어 setImmediate 한 tick 늦춤.
 */
async function checkSavedWorkspaceConflictAtBoot(): Promise<void> {
  // window 가 ready-to-show 직후 띄우도록 짧은 delay.
  await new Promise<void>((resolve) => setTimeout(resolve, 500));
  try {
    const settings = readSettings();
    const root = settings.workspace_root;
    if (typeof root !== 'string' || root.length === 0) return;

    const userDataDir = app.getPath('userData');
    const kind = classifyUserDataConflict(root, userDataDir);
    if (kind === null) return;

    const conflictLabel =
      kind === 'exact'
        ? 'userData 와 정확히 같은 폴더'
        : kind === 'child'
          ? 'userData 폴더 안'
          : 'userData 의 부모 폴더';

    const win = mainWindow;
    if (win === null || win.isDestroyed()) return;

    await dialog.showMessageBox(win, {
      type: 'warning',
      title: 'Dreampia-Dev — 저장된 작업 폴더가 위험합니다',
      message: '저장된 작업 폴더를 사용할 수 없어요',
      detail: [
        `저장된 작업 폴더: ${root}`,
        `앱 데이터 폴더: ${userDataDir}`,
        `상태: ${conflictLabel}`,
        '',
        'SQLite WAL/journal/sessions.sqlite 파일이 작업 트리에 노출되면 사용자 실수로 손상될 위험이 있어요.',
        '',
        '확인을 누르면 저장된 작업 폴더 설정이 초기화되고, 사이드바의 [프로젝트] 에서 다른 폴더를 선택할 수 있어요. 기존 채팅 세션은 그대로 보존됩니다.',
      ].join('\n'),
      buttons: ['확인'],
      defaultId: 0,
    });

    // settings 리셋 — workspace_root / workspace_name 제거.
    // writeSettings 가 Partial<AppSettings> 를 받고 undefined 는 JSON.stringify
    // 가 자연스럽게 drop 하므로 다음 부팅 시 saved 가 없는 상태.
    writeSettings({
      workspace_root: undefined,
      workspace_name: undefined,
    });
  } catch (err) {
    console.error('[checkSavedWorkspaceConflictAtBoot] failed:', err);
  }
}

function setupAutoUpdater(): void {
  if (!app.isPackaged) return;
  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;
  autoUpdater.on('error', (err) => {
    console.error('[autoUpdater]', err);
  });
  setTimeout(() => {
    autoUpdater.checkForUpdatesAndNotify().catch((err) => {
      console.error('[autoUpdater] check failed:', err);
    });
  }, 5_000);
}

function createMainWindow(): BrowserWindow {
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 800,
    minHeight: 600,

    // Hide until ready (avoid flash)
    show: false,

    // Title bar (custom in Phase 2)
    titleBarStyle: 'default',

    // Background color (matches dark theme)
    backgroundColor: '#131517',

    webPreferences: {
      // ★ .cjs 확장자: package.json 의 "type":"module" 때문에 .js 는 ESM
      // 로 해석되어 sandbox preload 가 로드 못함. vite.config.ts 에서
      // CommonJS 로 빌드 (entryFileNames '[name].cjs').
      preload: path.join(__dirname, 'preload.cjs'),
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
      backgroundThrottling: true,
    },
  });

  // Load renderer
  if (process.env.VITE_DEV_SERVER_URL) {
    win.loadURL(process.env.VITE_DEV_SERVER_URL);
    win.webContents.openDevTools();
  } else {
    win.loadFile(path.join(__dirname, '../renderer/index.html'));
  }

  // Show when ready (avoid blank flash)
  win.once('ready-to-show', () => {
    win.show();
  });

  // External links → OS default browser
  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });

  // Crash recovery (TODO: integrate with sentry)
  win.webContents.on('render-process-gone', (_event, details) => {
    console.error('Renderer process gone:', details);
    if (details.reason !== 'clean-exit') {
      win.reload();
    }
  });

  if (sessionStore !== null) {
    const election = new LeaderElection(sessionStore.getDb(), {
      window_id: randomUUID(),
      heartbeat_interval_ms: 5000,
      ttl_seconds: 30,
    });
    // ★ webContents.id 를 closed 핸들러 등록 전에 캡처.
    // 'closed' 이벤트 시점엔 webContents 가 이미 destroyed 라 .id 접근 시
    // TypeError: Object has been destroyed (실제 dev 실행 중 발견).
    const webContentsId = win.webContents.id;
    windowRuntimes.set(webContentsId, { election });
    win.on('closed', () => {
      election.shutdown();
      windowRuntimes.delete(webContentsId);
      if (mainWindow === win) {
        mainWindow = null;
      }
    });
  }

  return win;
}

app.whenReady().then(() => {
  // Open session DB at OS-specific user data dir.
  //   Windows: %APPDATA%/Dreampia-Dev/sessions.sqlite
  //   macOS:   ~/Library/Application Support/Dreampia-Dev/sessions.sqlite
  //   Linux:   ~/.config/Dreampia-Dev/sessions.sqlite
  // (Electron creates the userData dir automatically on first access.)
  const dbPath = path.join(app.getPath('userData'), 'sessions.sqlite');

  // v0.14.0 (A ABI Hardening) — SessionStore 생성 자체가 native-load 실패로
  // throw 할 수 있다 (rewrapNativeLoadError 가 사용자 친화적 메시지 첨부).
  // 사용자가 console 만 보지 않고 dialog 로도 안내받도록 capture → showErrorBox.
  // 그 후 process.exit 으로 깔끔한 종료 — partial state 로 계속 띄우면 더
  // confusing 함.
  try {
    sessionStore = new SessionStore(dbPath);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[main] SessionStore init failed:', message);
    if (app.isPackaged) {
      dialog.showErrorBox('Dreampia-Dev — 데이터베이스 초기화 실패', message);
    }
    app.exit(1);
    return;
  }

  // v0.14.0 — boot-time integrity check. quick_check 실패 시 사용자에게
  // 알림 + 백업 권고. 실패해도 계속 진행 (사용자 데이터 손상 위험은 있지만
  // hard-stop 보다 사용자가 export / backup 기회를 갖는 게 낫다).
  const diag = sessionStore.diagnose();
  if (diag.integrity_ok === false) {
    const detail = diag.integrity_message ?? '(no detail)';
    console.error('[main] DB integrity check failed:', detail);
    if (app.isPackaged) {
      dialog.showErrorBox(
        'Dreampia-Dev — 데이터베이스 무결성 경고',
        [
          'SQLite quick_check 가 통과하지 않았어요. 데이터 손상이 의심됩니다.',
          '',
          `세부: ${detail}`,
          '',
          'sessions.sqlite 파일을 백업한 뒤 앱을 재시작하세요.',
          `위치: ${dbPath}`,
        ].join('\n')
      );
    }
  }

  // v0.4.0 — Usage / Cost telemetry. Same DB connection as SessionStore so
  // WAL + FK pragmas are shared. UsageStore 는 append-only — 내부에서 자체
  // mutation 안 하고 stream pump 에서만 recordEvent 호출.
  usageStore = new UsageStore(sessionStore.getDb());

  // v0.12.0 (I) — Cross-AI Verify/Compare runs. 동일 DB connection 공유.
  compareStore = new CompareStore(sessionStore.getDb());

  // v1.0.11 (SEC-3) — Audit log: 모든 tool_use 결정 + permission grant/denial
  // 자동 영속. 동일 DB connection 공유. AuditLogStore 자체는 sink 가 없으면
  // dormant — Queue / SessionStore 가 callback 으로 호출.
  auditLogStore = new AuditLogStore(sessionStore.getDb());

  // Permission grant 영속 시점에 audit_log 자동 기록 — main 가 두 store 를 다
  // 알고 있을 때 wire-up. 미설정이면 audit 미기록 (테스트 격리 호환).
  sessionStore.setPermissionGrantAuditSink((event) => {
    auditLogStore?.recordEvent({
      timestamp: event.timestamp,
      session_id: event.session_id,
      event: 'permission.granted',
      capability: event.capability,
      target_json: event.target_json,
      decision_reason: 'granted',
      outcome: `granted_by:${event.granted_by};scope:${event.scope}`,
      ...(event.expires_at !== null ? { ai_reason: `expires_at=${event.expires_at}` } : {}),
      ...(event.reason !== null ? { error: event.reason } : {}),
    });
  });

  // v1.1.0 SEC-2 full: IpcPermissionConfirmer. Queue 가 사용자 confirmation
  // 필요 시 본 객체의 confirm() 호출 → main 이 webContents.send 로 renderer
  // 에 'permission/request' 전송.
  const permissionConfirmer = new IpcPermissionConfirmer({
    send: (channel, payload): boolean => {
      const win = mainWindow;
      if (win === null || win.isDestroyed()) return false;
      try {
        win.webContents.send(channel, payload);
        return true;
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error(`[IpcPermissionConfirmer.send] ${channel}: ${msg}`);
        return false;
      }
    },
  });

  // Tool Queue: main process owns all tool execution. Renderer/AI streams use
  // IPC only; subprocess-capable tools never cross into the sandboxed renderer.
  const registry = new ToolRegistry();
  registry.register(ShellRunTool);
  const toolAuditSink = (event: ToolAuditEvent): void => {
    auditLogStore?.recordEvent({
      timestamp: event.timestamp,
      session_id: event.session_id,
      ...(event.turn_id !== undefined ? { turn_id: event.turn_id } : {}),
      event: event.event,
      capability: event.capability,
      target_json: event.target_json,
      decision_reason: event.decision_reason,
      ...(event.outcome !== undefined ? { outcome: event.outcome } : {}),
      ...(event.error !== undefined ? { error: event.error } : {}),
      // v1.0.12 (migration 006): tool_id 정식 컬럼. v1.0.11 의 ai_model
      // backfill debt 청산.
      tool_id: event.tool_id,
    });
  };
  const queue = new ToolQueue(registry, (id) => sessionStore?.getSession(id) ?? undefined, {
    audit_sink: toolAuditSink,
    permission_confirmer: permissionConfirmer,
    grant_persister: (sessionId, grant, duration) => {
      // v1.1.1 hotfix (Codex Q7 blind spot): 'always' 만 DB 영속.
      // 'session' grant 는 Queue 의 in-memory sessionGrants 가 처리 — Queue
      // 가 grantPersister 호출 자체를 안 함. 본 콜백은 'always' 만 받음.
      void sessionId;
      if (duration !== 'always') return;
      sessionStore?.addPermissionGrant(grant);
    },
  });

  // BrowserManager owns one WebContentsView per tab. It needs the
  // current main window (constructed below) — pass a getter so it
  // can re-resolve after re-creation on macOS dock-click. Tab-state
  // diffs are forwarded to the renderer over `browser/tab-updated`.
  // Spec: docs/session/browser.md
  browserManager = new BrowserManager({
    getMainWindow: () => mainWindow,
    onTabUpdate: (state) => {
      const win = mainWindow;
      if (!win || win.isDestroyed()) return;
      win.webContents.send('browser/tab-updated', state);
    },
  });

  // v0.2.0 — MCP Bridge MVP (Issue #5).
  // McpManager 가 settings.json 의 mcp_servers 를 읽어 stdio MCP 서버를 spawn,
  // tools/list 결과를 ToolRegistry 에 'mcp.{server_id}.{tool_name}' 으로 등록.
  // Spec: docs/tools/mcp-bridge.md
  // v1.0.13 (FAKE-5): schema 변환 결과 audit_log 자동 기록. Codex 권고:
  // "조용한 validation fail 은 디버깅 비용이 크다."
  mcpManager = new McpManager(registry, {
    settings: createSettingsAdapter(),
    schemaAuditSink: (event) => {
      auditLogStore?.recordEvent({
        timestamp: event.timestamp,
        session_id: 'mcp-server',
        event: event.event,
        capability: 'NETWORK_MCP',
        target_json: JSON.stringify({
          server_id: event.server_id,
          tool_name: event.tool_name,
          warnings: event.warnings,
        }),
        decision_reason:
          event.event === 'mcp.input_schema_converted' ? 'converted' : 'unconverted',
        outcome: event.warnings.length > 0 ? 'partial' : 'ok',
        ...(event.warnings.length > 0 && { error: event.warnings.join('; ') }),
      });
    },
  });
  void mcpManager.loadFromSettings();

  // P1-4: AI handlers (ai/detect-cli, ai/start-stream, ai/stop-stream).
  // Renderer 가 stream-event/end 를 받으려면 mainWindow getter 필요.
  // Spec: docs/session/cross-ai-sync.md
  // v0.12.0 (I) — compare provider factory. Each side gets its own provider
  // via getDefaultProvider so that user's wizard preference (claude / codex /
  // mock override) still applies, but model prefix routing forces the chosen
  // CLI per side. We pass `userDefaultProvider='auto'` so model prefix wins.
  const compareFactory: ProviderFactory = async (
    side,
    model,
    signal,
    cwd,
    permissionLevel
  ) => {
    const result = await getDefaultProvider(model, signal, cwd, permissionLevel, 'auto');
    void side;
    return { provider: result.provider, source: result.source };
  };

  // v1.0.12 (COST-2): cost gate. settings.json 의 cost_limit_usd /
  // alert_threshold 를 매 호출마다 fresh 로 읽어 사용자가 설정 변경 시 즉시
  // 반영. 미설정이면 enforcement 무력화 (한도 없음 → 모두 통과).
  const costGate = new CostGate(usageStore, (): CostLimits => {
    const settings = readSettings();
    const out: CostLimits = {};
    if (typeof settings.usage_cost_limit_usd === 'number') {
      out.cost_limit_usd = settings.usage_cost_limit_usd;
    }
    if (typeof settings.usage_alert_threshold === 'number') {
      out.alert_threshold = settings.usage_alert_threshold;
    }
    return out;
  });

  // v1.0.12 (COST-2): cost-gate audit sink — Codex 외부 검토에서 강조된
  // 'cost.limit_blocked' / 'cost.unknown_model_blocked' / 'cost.alert_threshold'
  // 를 audit_log 에 영속.
  const costAuditSink = (event: CostAuditEvent): void => {
    auditLogStore?.recordEvent({
      timestamp: event.timestamp,
      session_id: event.session_id.length > 0 ? event.session_id : 'unknown',
      event: event.event,
      capability: 'NETWORK_AI',
      target_json: event.target_json,
      decision_reason: event.outcome,
      ai_model: event.model,
      outcome: event.outcome,
      ...(event.hint !== undefined ? { error: event.hint } : {}),
    });
  };

  registerIpcHandlers(
    app,
    sessionStore,
    {
      getElection: (event) => windowRuntimes.get(event.sender.id)?.election ?? null,
    },
    browserManager,
    {
      getMainWindow: () => mainWindow,
      toolQueue: queue,
      costGate,
      costAuditSink,
    },
    {
      registry,
      queue,
    },
    mcpManager,
    usageStore,
    {
      store: compareStore,
      getMainWindow: () => mainWindow,
      factory: compareFactory,
    },
    auditLogStore,
    {
      // v1.1.0 SEC-2 full: permission/* IPC handlers.
      confirmer: permissionConfirmer,
    }
  );
  mainWindow = createMainWindow();

  // v1.0.14 (META-4 hotfix — Codex blind spot): 저장된 workspace 가 userData
  // 와 충돌하면 사용자에게 dialog 로 알리고 picker 강제 (settings 리셋).
  // packaged build 에서만 표시 — dev/e2e 자동화 흐름 보호.
  if (app.isPackaged) {
    void checkSavedWorkspaceConflictAtBoot();
  }

  // packaged build 에서만 GitHub Releases 폴링. dev/e2e 엔 영향 X.
  setupAutoUpdater();

  app.on('activate', () => {
    // macOS: re-create window when dock icon clicked
    if (BrowserWindow.getAllWindows().length === 0) {
      mainWindow = createMainWindow();
    }
  });
});

app.on('window-all-closed', () => {
  // macOS keeps app running. Others quit.
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

// Close DB on quit (flush WAL, release file handle).
// Order matters:
//   1) tear down BrowserManager (releases WebContentsView resources first
//      so partition file handles are flushed before app exit),
//   2) shutdown election (releases held locks via DB writes),
//   3) close the DB.
app.on('before-quit', () => {
  // 활성 AI streams 먼저 abort — subprocess leak 방지.
  shutdownAiHandlers();
  // v0.12.0 — 활성 compare runs 도 abort.
  shutdownCompareHandlers();
  // MCP children 도 stop. fire-and-forget — quit 흐름은 sync 한정.
  if (mcpManager !== null) {
    void mcpManager.shutdown();
    mcpManager = null;
  }
  browserManager?.shutdown();
  browserManager = null;
  for (const runtime of windowRuntimes.values()) {
    runtime.election.shutdown();
  }
  windowRuntimes.clear();
  // UsageStore / CompareStore 는 SessionStore 의 DB connection 을 공유하므로
  // 별도 close X. SessionStore.close() 가 connection 도 닫는다.
  usageStore = null;
  compareStore = null;
  sessionStore?.close();
  sessionStore = null;
});

// v1.0.13 (FAKE-4) — Single-instance + 사용자 친화 UX (Codex 권고).
//
// 이전 (v1.0.12 까지): 두 번째 instance 가 silent app.quit() — 사용자 입장
// 에서 "더블클릭 했는데 아무 일도 없음". 첫 instance 는 단순 focus.
//
// 개선:
//  1. 두 번째 instance — `setImmediate` 로 OS event loop 한 tick 내 quit
//     (electron 권고). 첫 instance 의 'second-instance' 핸들러가 dialog 와
//     focus 처리 — 두 번째 process 는 dialog 띄우지 않음 (첫 인스턴스가
//     이미 띄움).
//  2. 첫 instance — 'second-instance' 시점에 기존 창 focus + 명시적 dialog
//     ("이미 실행 중. 이 창을 forward 합니다") 로 사용자 인지.
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  // 두 번째 instance — 즉시 종료. 첫 instance 가 dialog 처리.
  app.quit();
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
      // packaged build 에서만 modal — dev/e2e 는 자동화 흐름 깨면 안 됨.
      if (app.isPackaged) {
        dialog
          .showMessageBox(mainWindow, {
            type: 'info',
            title: 'Dreampia-Dev — 이미 실행 중',
            message: '앱이 이미 실행 중이에요',
            detail:
              '두 번째 인스턴스를 띄우려고 시도했지만 single-instance lock 으로 차단됐습니다. 이 창이 활성 인스턴스입니다.',
            buttons: ['확인'],
            defaultId: 0,
          })
          .catch((err: unknown) => {
            // 사용자가 dialog 를 닫는 것은 정상 — 로깅만.
            console.warn('[second-instance dialog] failed:', err);
          });
      }
    }
  });
}

// Custom protocol: dreampia-dev://
// Phase 2: 딥링크 (codex:// 패턴 차용)
app.setAsDefaultProtocolClient('dreampia-dev');
