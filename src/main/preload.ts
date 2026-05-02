/**
 * Electron Preload Script
 *
 * IPC bridge between main and renderer.
 * Spec: docs/findings/round5-ipc-telemetry.md (AppServerConnection 패턴)
 */

import { contextBridge, ipcRenderer } from 'electron';

// Whitelist of IPC channels (security)
const ALLOWED_INVOKE_CHANNELS = [
  'app:get-version',
  'app:get-platform',
  // Phase 2+:
  // 'session:list',
  // 'session:create',
  // 'config:read',
  // 'plugin:list',
] as const;

const ALLOWED_RECEIVE_CHANNELS = [
  // Phase 2+:
  // 'session:updated',
  // 'tool:result',
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
};

contextBridge.exposeInMainWorld('dreampia', api);

// TypeScript: window.dreampia type
declare global {
  interface Window {
    dreampia: typeof api;
  }
}
