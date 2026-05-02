/**
 * Electron Main Process
 *
 * Creates the main browser window, handles app lifecycle.
 * Spec: docs/session/_index.md, docs/performance/electron-tuning.md
 */

import { app, BrowserWindow, shell } from 'electron';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { registerIpcHandlers, shutdownAiHandlers } from './ipc';
import { BrowserManager } from './BrowserManager';
import { LeaderElection, SessionStore } from '@/storage';
import { ShellRunTool, ToolQueue, ToolRegistry } from '@/tools';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Disable hardware acceleration in development if needed
// app.disableHardwareAcceleration();

// V8 memory: 4GB (default 1.5GB)
app.commandLine.appendSwitch('js-flags', '--max-old-space-size=4096');

let mainWindow: BrowserWindow | null = null;
let sessionStore: SessionStore | null = null;
let browserManager: BrowserManager | null = null;

interface WindowRuntime {
  election: LeaderElection;
}

const windowRuntimes = new Map<number, WindowRuntime>();

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
      preload: path.join(__dirname, 'preload.js'),
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
  sessionStore = new SessionStore(dbPath);

  // Tool Queue: main process owns all tool execution. Renderer/AI streams use
  // IPC only; subprocess-capable tools never cross into the sandboxed renderer.
  const registry = new ToolRegistry();
  registry.register(ShellRunTool);
  const queue = new ToolQueue(registry, (id) => sessionStore?.getSession(id) ?? undefined);

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

  // P1-4: AI handlers (ai/detect-cli, ai/start-stream, ai/stop-stream).
  // Renderer 가 stream-event/end 를 받으려면 mainWindow getter 필요.
  // Spec: docs/session/cross-ai-sync.md
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
    }
  );
  mainWindow = createMainWindow();

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
  browserManager?.shutdown();
  browserManager = null;
  for (const runtime of windowRuntimes.values()) {
    runtime.election.shutdown();
  }
  windowRuntimes.clear();
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
