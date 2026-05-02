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

interface MockBrowserTabState {
  tab_id: string;
  session_id: string;
  url: string;
  title: string;
  favicon_url: string | null;
  status: 'loading' | 'ready' | 'failed';
  can_go_back: boolean;
  can_go_forward: boolean;
}

interface MockBrowserBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

type BrowserUpdateListener = (state: MockBrowserTabState) => void;

// ── ai/* (P1-4) — mock IPC for IpcStreamingProvider tests ──
interface MockCliInfo {
  path: string;
  version: string | null;
}
interface MockCliDetection {
  claude: MockCliInfo | null;
  codex: MockCliInfo | null;
}
type MockStreamEventPayload = { stream_id: string; event: unknown };
type MockStreamEndPayload = { stream_id: string };
type AiStreamEventListener = (payload: MockStreamEventPayload) => void;
type AiStreamEndListener = (payload: MockStreamEndPayload) => void;

const mockStore = {
  sessions: new Map<string, Session>(),
  locks: new Map<string, MockSessionLock>(),
  /** This window's id (mocked). Tests can override to simulate other windows. */
  windowId: 'test-window-1',

  // ── browser/* (P1-5) ───────────────────────────────────────
  // Reproduces the BrowserManager surface in-memory:
  //   browserTabs:    tab_id -> state
  //   browserActive:  session_id -> tab_id (the visible tab per session)
  //   browserBounds:  tab_id -> last reported bounds
  //   browserListeners: subscribers to onTabUpdated
  browserTabs: new Map<string, MockBrowserTabState>(),
  browserActive: new Map<string, string>(),
  browserBounds: new Map<string, MockBrowserBounds>(),
  browserListeners: new Set<BrowserUpdateListener>(),

  // ── ai/* (P1-4) ───────────────────────────────────────
  // Tests can inject events via __emitAiStreamEvent / __emitAiStreamEnd.
  // detect default: claude detected, codex null. Override per-test by
  // mutating __mockStore.aiDetection.
  aiDetection: {
    claude: { path: '/usr/local/bin/claude', version: '1.2.3' },
    codex: null,
  } as MockCliDetection,
  aiStartedStreams: new Map<string, { model: string; turns: unknown[] }>(),
  aiStoppedStreams: new Set<string>(),
  aiEventListeners: new Set<AiStreamEventListener>(),
  aiEndListeners: new Set<AiStreamEndListener>(),
};

function emitBrowserUpdate(state: MockBrowserTabState): void {
  for (const fn of mockStore.browserListeners) {
    try {
      fn(state);
    } catch {
      // ignore listener errors in tests
    }
  }
}

function emitAiStreamEvent(payload: MockStreamEventPayload): void {
  for (const fn of mockStore.aiEventListeners) {
    try {
      fn(payload);
    } catch {
      // ignore listener errors in tests
    }
  }
}

function emitAiStreamEnd(payload: MockStreamEndPayload): void {
  for (const fn of mockStore.aiEndListeners) {
    try {
      fn(payload);
    } catch {
      // ignore listener errors in tests
    }
  }
}

/**
 * Test helper: seed mockStore from a test file.
 *
 * Usage:
 *   import { __mockStore } from '../setup';
 *   __mockStore.sessions.set(s.id, s);
 *   __mockStore.locks.set(id, { ... });
 *   __mockStore.windowId = 'window-A';
 *   __mockStore.browserTabs.set(tabId, { ... });
 *   __emitBrowserUpdate(state);  // simulate main → renderer event
 *   __emitAiStreamEvent({stream_id, event});  // P1-4
 *   __emitAiStreamEnd({stream_id});           // P1-4
 */
export const __mockStore = mockStore;
export const __emitBrowserUpdate = emitBrowserUpdate;
export const __emitAiStreamEvent = emitAiStreamEvent;
export const __emitAiStreamEnd = emitAiStreamEnd;

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
  mockStore.browserTabs.clear();
  mockStore.browserActive.clear();
  mockStore.browserBounds.clear();
  mockStore.browserListeners.clear();
  mockStore.aiDetection = {
    claude: { path: '/usr/local/bin/claude', version: '1.2.3' },
    codex: null,
  };
  mockStore.aiStartedStreams.clear();
  mockStore.aiStoppedStreams.clear();
  mockStore.aiEventListeners.clear();
  mockStore.aiEndListeners.clear();
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

      // P1-5: in-app browser. Mirrors BrowserManager semantics in-memory.
      // No real WebContentsView; tabs are pure state objects.
      browser: {
        openTab: vi.fn(
          async (args: {
            session_id: string;
            tab_id: string;
            url: string;
          }): Promise<Result<MockBrowserTabState>> => {
            const existing = mockStore.browserTabs.get(args.tab_id);
            if (existing) {
              return { ok: true, value: existing };
            }
            const state: MockBrowserTabState = {
              tab_id: args.tab_id,
              session_id: args.session_id,
              url: args.url,
              title: 'Loading...',
              favicon_url: null,
              status: 'loading',
              can_go_back: false,
              can_go_forward: false,
            };
            mockStore.browserTabs.set(args.tab_id, state);
            return { ok: true, value: state };
          }
        ),

        closeTab: vi.fn(async (tabId: string): Promise<Result<void>> => {
          const tab = mockStore.browserTabs.get(tabId);
          mockStore.browserTabs.delete(tabId);
          mockStore.browserBounds.delete(tabId);
          if (tab && mockStore.browserActive.get(tab.session_id) === tabId) {
            mockStore.browserActive.delete(tab.session_id);
          }
          return { ok: true, value: undefined };
        }),

        switchTab: vi.fn(
          async (
            sessionId: string,
            tabId: string
          ): Promise<Result<void>> => {
            const tab = mockStore.browserTabs.get(tabId);
            if (!tab || tab.session_id !== sessionId) {
              return { ok: true, value: undefined };
            }
            mockStore.browserActive.set(sessionId, tabId);
            return { ok: true, value: undefined };
          }
        ),

        navigate: vi.fn(
          async (tabId: string, url: string): Promise<Result<void>> => {
            const tab = mockStore.browserTabs.get(tabId);
            if (!tab) return { ok: true, value: undefined };
            const next: MockBrowserTabState = { ...tab, url, status: 'loading' };
            mockStore.browserTabs.set(tabId, next);
            emitBrowserUpdate(next);
            return { ok: true, value: undefined };
          }
        ),

        back: vi.fn(async (_tabId: string): Promise<Result<void>> => {
          return { ok: true, value: undefined };
        }),

        forward: vi.fn(async (_tabId: string): Promise<Result<void>> => {
          return { ok: true, value: undefined };
        }),

        reload: vi.fn(async (tabId: string): Promise<Result<void>> => {
          const tab = mockStore.browserTabs.get(tabId);
          if (!tab) return { ok: true, value: undefined };
          const next: MockBrowserTabState = { ...tab, status: 'loading' };
          mockStore.browserTabs.set(tabId, next);
          emitBrowserUpdate(next);
          return { ok: true, value: undefined };
        }),

        setBounds: vi.fn(
          async (
            tabId: string,
            bounds: MockBrowserBounds
          ): Promise<Result<void>> => {
            mockStore.browserBounds.set(tabId, bounds);
            return { ok: true, value: undefined };
          }
        ),

        listTabs: vi.fn(
          async (
            sessionId: string
          ): Promise<Result<MockBrowserTabState[]>> => ({
            ok: true,
            value: Array.from(mockStore.browserTabs.values()).filter(
              (t) => t.session_id === sessionId
            ),
          })
        ),

        onTabUpdated: vi.fn((listener: BrowserUpdateListener): (() => void) => {
          mockStore.browserListeners.add(listener);
          return () => {
            mockStore.browserListeners.delete(listener);
          };
        }),
      },

      // P1-4: AI streaming via real CLI subprocess. Renderer-side IPC is
      // mocked in-memory — tests inject events with __emitAiStreamEvent /
      // __emitAiStreamEnd. detectCli returns __mockStore.aiDetection.
      ai: {
        detectCli: vi.fn(
          async (): Promise<Result<MockCliDetection>> => ({
            ok: true,
            value: mockStore.aiDetection,
          })
        ),

        startStream: vi.fn(
          async (args: {
            stream_id: string;
            model: string;
            turns: unknown[];
          }): Promise<Result<{ stream_id: string; source: string }>> => {
            mockStore.aiStartedStreams.set(args.stream_id, {
              model: args.model,
              turns: args.turns,
            });
            // Source 추론 (테스트에서 검증할 수 있도록).
            const lower = args.model.toLowerCase();
            const isClaude = ['claude-', 'sonnet-', 'opus-', 'haiku-'].some(
              (p) => lower.startsWith(p)
            );
            const isCodex = ['gpt-', 'o1-', 'o3-', 'codex-'].some((p) =>
              lower.startsWith(p)
            );
            let source: 'claude-cli' | 'codex-cli' | 'mock' = 'mock';
            if (isClaude && mockStore.aiDetection.claude !== null) {
              source = 'claude-cli';
            } else if (isCodex && mockStore.aiDetection.codex !== null) {
              source = 'codex-cli';
            }
            return { ok: true, value: { stream_id: args.stream_id, source } };
          }
        ),

        stopStream: vi.fn(
          async (streamId: string): Promise<Result<void>> => {
            mockStore.aiStoppedStreams.add(streamId);
            return { ok: true, value: undefined };
          }
        ),

        onStreamEvent: vi.fn(
          (listener: AiStreamEventListener): (() => void) => {
            mockStore.aiEventListeners.add(listener);
            return () => {
              mockStore.aiEventListeners.delete(listener);
            };
          }
        ),

        onStreamEnd: vi.fn((listener: AiStreamEndListener): (() => void) => {
          mockStore.aiEndListeners.add(listener);
          return () => {
            mockStore.aiEndListeners.delete(listener);
          };
        }),
      },
    },
  });
}

// Mock scrollIntoView for jsdom (not implemented in jsdom by default)
if (typeof window !== 'undefined') {
  window.HTMLElement.prototype.scrollIntoView = function () {};
}
