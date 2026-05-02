/**
 * Vitest setup — runs before every test file.
 *
 * Provides:
 *   - @testing-library/jest-dom matchers (toBeInTheDocument, etc.)
 *   - Cleanup after each test
 *   - Mock window.dreampia (IPC bridge) with in-memory SessionStore stand-in
 */

import '@testing-library/jest-dom/vitest';
import { afterEach, beforeEach, vi } from 'vitest';
import { cleanup } from '@testing-library/react';
import type { Session, Turn } from '../src/types';
import type { Result, SessionMetaPatch } from '../src/main/types';

// ────────────────────────────────────────────────────────────
// In-memory mock store (shared across all renderer tests)
// ────────────────────────────────────────────────────────────

interface MockSessionMeta {
  id: string;
  schema_version: number;
  provider: 'claude' | 'codex';
  workspace_id: string;
  title: string;
  pinned: boolean;
  archived: boolean;
  parent_session_id?: string;
  created_at: string;
  updated_at: string;
}

interface MockSessionLock {
  session_id: string;
  leader_window_id: string;
  leader_pid: number;
  acquired_at: string;
  heartbeat_at: string;
  ttl_seconds: number;
}

const mockStore = {
  sessions: new Map<string, Session>(),
  locks: new Map<string, MockSessionLock>(),
  /** This window's id (mocked). Tests can override to simulate other windows. */
  windowId: 'test-window-1',
};

/**
 * Test helper: seed mockStore from a test file.
 *
 * Usage:
 *   import { __mockStore } from '../setup';
 *   __mockStore.sessions.set(s.id, s);
 *   __mockStore.locks.set(id, { ... });
 *   __mockStore.windowId = 'window-A';
 */
export const __mockStore = mockStore;

function toMeta(s: Session): MockSessionMeta {
  const meta: MockSessionMeta = {
    id: s.id,
    schema_version: s.schema_version,
    provider: s.provider,
    workspace_id: s.workspace_id,
    title: s.title,
    pinned: s.pinned,
    archived: s.archived,
    created_at: s.created_at,
    updated_at: s.updated_at,
  };
  if (s.parent_session_id !== undefined) {
    meta.parent_session_id = s.parent_session_id;
  }
  return meta;
}

beforeEach(() => {
  mockStore.sessions.clear();
  mockStore.locks.clear();
  mockStore.windowId = 'test-window-1';
});

afterEach(() => {
  cleanup();
});

// ────────────────────────────────────────────────────────────
// Mock IPC bridge in renderer tests
// ────────────────────────────────────────────────────────────

if (typeof window !== 'undefined') {
  Object.defineProperty(window, 'dreampia', {
    writable: true,
    configurable: true,
    value: {
      invoke: vi.fn(),
      on: vi.fn(),

      session: {
        list: vi.fn(
          async (): Promise<Result<MockSessionMeta[]>> => ({
            ok: true,
            value: [...mockStore.sessions.values()]
              .map(toMeta)
              // Mirror SessionStore: ORDER BY updated_at DESC.
              .sort((a, b) => (a.updated_at < b.updated_at ? 1 : -1)),
          })
        ),

        get: vi.fn(
          async (id: string): Promise<Result<Session | null>> => ({
            ok: true,
            value: mockStore.sessions.get(id) ?? null,
          })
        ),

        create: vi.fn(
          async (session: Session): Promise<Result<Session>> => {
            mockStore.sessions.set(session.id, session);
            return { ok: true, value: session };
          }
        ),

        appendTurn: vi.fn(
          async (id: string, turn: Turn): Promise<Result<void>> => {
            const s = mockStore.sessions.get(id);
            if (s === undefined) {
              return { ok: false, error: `session ${id} not found` };
            }
            const next: Session = {
              ...s,
              updated_at: new Date().toISOString(),
              conversation: {
                ...s.conversation,
                turns: [...s.conversation.turns, turn],
              },
            };
            mockStore.sessions.set(id, next);
            return { ok: true, value: undefined };
          }
        ),

        updateMeta: vi.fn(
          async (
            id: string,
            patch: SessionMetaPatch
          ): Promise<Result<void>> => {
            const s = mockStore.sessions.get(id);
            if (s === undefined) {
              return { ok: false, error: `session ${id} not found` };
            }
            const next: Session = {
              ...s,
              ...(patch.title !== undefined && { title: patch.title }),
              ...(patch.pinned !== undefined && { pinned: patch.pinned }),
              ...(patch.archived !== undefined && { archived: patch.archived }),
              updated_at: new Date().toISOString(),
            };
            mockStore.sessions.set(id, next);
            return { ok: true, value: undefined };
          }
        ),

        delete: vi.fn(async (id: string): Promise<Result<void>> => {
          mockStore.sessions.delete(id);
          return { ok: true, value: undefined };
        }),
      },

      // Mock for SS-5 multi-window leader election. Mirrors the production
      // LeaderElection semantics in-memory: PRIMARY KEY on session_id,
      // takeover when heartbeat_at is older than (now - ttl_seconds), etc.
      lock: {
        acquire: vi.fn(
          async (
            sessionId: string
          ): Promise<
            Result<{ acquired: boolean; leader: MockSessionLock | null }>
          > => {
            const now = new Date().toISOString();
            const existing = mockStore.locks.get(sessionId);
            const ttl = existing?.ttl_seconds ?? 30;
            const expiry = new Date(Date.now() - ttl * 1000).toISOString();

            if (existing) {
              if (existing.leader_window_id === mockStore.windowId) {
                existing.heartbeat_at = now;
                return {
                  ok: true,
                  value: { acquired: true, leader: existing },
                };
              }
              if (existing.heartbeat_at < expiry) {
                const taken: MockSessionLock = {
                  session_id: sessionId,
                  leader_window_id: mockStore.windowId,
                  leader_pid: 12345,
                  acquired_at: now,
                  heartbeat_at: now,
                  ttl_seconds: ttl,
                };
                mockStore.locks.set(sessionId, taken);
                return {
                  ok: true,
                  value: { acquired: true, leader: taken },
                };
              }
              return {
                ok: true,
                value: { acquired: false, leader: existing },
              };
            }
            const created: MockSessionLock = {
              session_id: sessionId,
              leader_window_id: mockStore.windowId,
              leader_pid: 12345,
              acquired_at: now,
              heartbeat_at: now,
              ttl_seconds: 30,
            };
            mockStore.locks.set(sessionId, created);
            return {
              ok: true,
              value: { acquired: true, leader: created },
            };
          }
        ),

        release: vi.fn(async (sessionId: string): Promise<Result<void>> => {
          const existing = mockStore.locks.get(sessionId);
          if (existing && existing.leader_window_id === mockStore.windowId) {
            mockStore.locks.delete(sessionId);
          }
          return { ok: true, value: undefined };
        }),

        get: vi.fn(
          async (
            sessionId: string
          ): Promise<Result<MockSessionLock | null>> => ({
            ok: true,
            value: mockStore.locks.get(sessionId) ?? null,
          })
        ),

        heartbeat: vi.fn(
          async (sessionId: string): Promise<Result<boolean>> => {
            const existing = mockStore.locks.get(sessionId);
            if (
              !existing ||
              existing.leader_window_id !== mockStore.windowId
            ) {
              return { ok: true, value: false };
            }
            existing.heartbeat_at = new Date().toISOString();
            return { ok: true, value: true };
          }
        ),

        isLeader: vi.fn(
          async (sessionId: string): Promise<Result<boolean>> => {
            const existing = mockStore.locks.get(sessionId);
            return {
              ok: true,
              value:
                existing !== undefined &&
                existing.leader_window_id === mockStore.windowId,
            };
          }
        ),
      },
    },
  });
}

// Mock scrollIntoView for jsdom (not implemented in jsdom by default)
if (typeof window !== 'undefined') {
  window.HTMLElement.prototype.scrollIntoView = function () {};
}
