/**
 * IPC handlers for the main process.
 *
 * Pattern follows Codex's AppServerConnection: {namespace}/{action}.
 * Spec: docs/findings/round5-ipc-telemetry.md
 *
 * All handlers are registered via `registerIpcHandlers(app)`.
 */

import { app, ipcMain, type App } from 'electron';

// Types shared with renderer (preload only exposes whitelisted channels)
export type AppInfo = {
  version: string;
  platform: NodeJS.Platform;
  electronVersion: string;
  nodeVersion: string;
};

/**
 * Register all main-process IPC handlers.
 *
 * Day 4 (얇게): app/version + app/platform 만.
 * Phase 1+: session/list, plugin/list, config/read 등 추가.
 */
export function registerIpcHandlers(electronApp: App = app): void {
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
}
