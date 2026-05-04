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
      // tool_id 는 ai_model 컬럼에 임시 backfill — schema 가 별도 컬럼 없음.
      // architectural debt: v1.3.x 에서 audit_log 컬럼 promote 권장.
      ai_model: event.tool_id,
    });
  };
  const queue = new ToolQueue(registry, (id) => sessionStore?.getSession(id) ?? undefined, {
    audit_sink: toolAuditSink,
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
  mcpManager = new McpManager(registry, { settings: createSettingsAdapter() });
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
    auditLogStore
  );
  mainWindow = createMainWindow();

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

// Prevent multiple instances
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });
}

// Custom protocol: dreampia-dev://
// Phase 2: 딥링크 (codex:// 패턴 차용)
app.setAsDefaultProtocolClient('dreampia-dev');
