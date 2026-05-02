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

import { app, ipcMain, type App } from 'electron';
import { z } from 'zod';
import {
  SessionSchema,
  TurnSchema,
  type Session,
  type SessionId,
  type Turn,
} from '@/types';
import type {
  LeaderElection,
  SessionLock,
  SessionMeta,
  SessionStore,
} from '@/storage';
import type { Result, SessionMetaPatch } from './types';

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
 *                   are not registered. Tests that don't exercise locks can
 *                   skip it; production always passes one.
 */
export function registerIpcHandlers(
  electronApp: App = app,
  store?: SessionStore,
  election?: LeaderElection
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

  if (!store) return;

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

  ipcMain.handle(
    'session/delete',
    (_evt, sessionId: unknown): Result<void> => {
      try {
        if (typeof sessionId !== 'string') {
          throw new Error('session id must be string');
        }
        store.deleteSession(sessionId as SessionId);
        return ok(undefined);
      } catch (err) {
        return fail(err);
      }
    }
  );

  if (!election) return;

  // ── lock/* — multi-window leader election ───────────────────
  // Spec: docs/session/multi-window.md

  ipcMain.handle(
    'lock/acquire',
    (
      _evt,
      sessionId: unknown
    ): Result<{ acquired: boolean; leader: SessionLock | null }> => {
      try {
        if (typeof sessionId !== 'string') {
          throw new Error('session id must be string');
        }
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
    (_evt, sessionId: unknown): Result<void> => {
      try {
        if (typeof sessionId !== 'string') {
          throw new Error('session id must be string');
        }
        election.releaseLeadership(sessionId as SessionId);
        return ok(undefined);
      } catch (err) {
        return fail(err);
      }
    }
  );

  ipcMain.handle(
    'lock/get',
    (_evt, sessionId: unknown): Result<SessionLock | null> => {
      try {
        if (typeof sessionId !== 'string') {
          throw new Error('session id must be string');
        }
        return ok(election.getLeader(sessionId as SessionId));
      } catch (err) {
        return fail(err);
      }
    }
  );

  ipcMain.handle(
    'lock/heartbeat',
    (_evt, sessionId: unknown): Result<boolean> => {
      try {
        if (typeof sessionId !== 'string') {
          throw new Error('session id must be string');
        }
        return ok(election.heartbeat(sessionId as SessionId));
      } catch (err) {
        return fail(err);
      }
    }
  );

  ipcMain.handle(
    'lock/is-leader',
    (_evt, sessionId: unknown): Result<boolean> => {
      try {
        if (typeof sessionId !== 'string') {
          throw new Error('session id must be string');
        }
        return ok(election.isLeader(sessionId as SessionId));
      } catch (err) {
        return fail(err);
      }
    }
  );
}
