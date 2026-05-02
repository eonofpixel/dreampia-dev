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
import { registerIpcHandlers } from './ipc';
import { LeaderElection, SessionStore } from '@/storage';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Disable hardware acceleration in development if needed
// app.disableHardwareAcceleration();

// V8 memory: 4GB (default 1.5GB)
app.commandLine.appendSwitch('js-flags', '--max-old-space-size=4096');

let mainWindow: BrowserWindow | null = null;
let sessionStore: SessionStore | null = null;
let leaderElection: LeaderElection | null = null;

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

  // Multi-window leader election (SS-5). Each app launch generates a unique
  // window_id; in Phase 1 there is only one main process, so all
  // BrowserWindows share this election instance. Phase 2 may split per-window.
  // Spec: docs/session/multi-window.md
  leaderElection = new LeaderElection(sessionStore.getDb(), {
    window_id: randomUUID(),
    heartbeat_interval_ms: 5000,
    ttl_seconds: 30,
  });

  registerIpcHandlers(app, sessionStore, leaderElection);
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
// Order matters: shutdown election first (releases held locks via DB writes)
// then close the DB.
app.on('before-quit', () => {
  leaderElection?.shutdown();
  leaderElection = null;
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
