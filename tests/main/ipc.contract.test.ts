import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

type Handler = (evt: unknown, ...args: unknown[]) => unknown | Promise<unknown>;
const handlers = new Map<string, Handler>();

const userDataRef = vi.hoisted(() => ({ current: '' }));
const packagedRef = vi.hoisted(() => ({ current: false }));

vi.mock('electron', () => {
  return {
    app: {
      getVersion: () => '0.0.1-test',
      getPath: (_name: string): string => userDataRef.current,
      get isPackaged(): boolean {
        return packagedRef.current;
      },
    },
    BrowserWindow: {
      fromWebContents: vi.fn(),
    },
    dialog: {
      showOpenDialog: vi.fn(),
      showMessageBox: vi.fn(),
    },
    ipcMain: {
      handle: (channel: string, handler: Handler): void => {
        handlers.set(channel, handler);
      },
      removeHandler: (channel: string): void => {
        handlers.delete(channel);
      },
    },
  };
});

import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { registerIpcHandlers } from '../../src/main/ipc';
import { __resetSettingsCache } from '../../src/main/settings';

const stubApp = {
  getVersion: () => '0.0.1-test',
  getPath: (_name: string): string => userDataRef.current,
  get isPackaged(): boolean {
    return packagedRef.current;
  },
} as unknown as Parameters<typeof registerIpcHandlers>[0];

let testTmpDir = '';

beforeEach(() => {
  handlers.clear();
  testTmpDir = mkdtempSync(join(tmpdir(), 'dreampia-ipc-contract-'));
  userDataRef.current = testTmpDir;
  packagedRef.current = false;
  __resetSettingsCache();
});

afterEach(() => {
  if (testTmpDir.length > 0) {
    rmSync(testTmpDir, { recursive: true, force: true });
  }
});

describe('registerIpcHandlers contract', () => {
  it('keeps the default channel surface stable', () => {
    registerIpcHandlers(stubApp);

    expect([...handlers.keys()].sort()).toMatchInlineSnapshot(`
      [
        "app:check-workspace-backfill",
        "app:complete-onboarding",
        "app:delete-legacy-workspace",
        "app:diagnose",
        "app:dismiss-workspace-backfill",
        "app:get-default-permission-level",
        "app:get-default-provider",
        "app:get-default-workspace",
        "app:get-direct-api-keys",
        "app:get-keyboard-shortcuts",
        "app:get-language",
        "app:get-onboarding-status",
        "app:get-permission-capabilities",
        "app:get-platform",
        "app:get-plugin-security",
        "app:get-telemetry-enabled",
        "app:get-theme",
        "app:get-version",
        "app:list-backfill-conflicts",
        "app:reset-onboarding",
        "app:run-workspace-backfill",
        "app:set-default-permission-level",
        "app:set-default-provider",
        "app:set-direct-api-key",
        "app:set-keyboard-shortcuts",
        "app:set-language",
        "app:set-mcp-revocation-feed-publisher",
        "app:set-mcp-verification-mode",
        "app:set-plugin-isolation-mode",
        "app:set-telemetry-enabled",
        "app:set-theme",
        "automation/audit-log",
        "automation/export",
        "automation/fire",
        "automation/get-next-run",
        "automation/import",
        "automation/list",
        "automation/list-handlers",
        "automation/register",
        "automation/set-enabled",
        "automation/unregister",
        "workspace/get",
        "workspace/inspect",
        "workspace/list-files",
        "workspace/pick-folder",
        "workspace/read-file",
        "workspace/run-safe-command",
        "workspace/stat-file",
        "workspace/write-file",
      ]
    `);
  });
});
