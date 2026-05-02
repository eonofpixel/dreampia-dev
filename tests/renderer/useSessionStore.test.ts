/**
 * useSessionStore — renderer hook tests.
 *
 * Uses the in-memory `__mockStore` from tests/setup.ts which exposes the
 * same `window.dreampia.session.*` API as the production preload.
 *
 * Spec: docs/session/persistence.md, docs/ia/chat-flow.md
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { useSessionStore } from '../../src/renderer/hooks/useSessionStore';
import {
  SessionSchema,
  type Session,
  type SessionId,
  type TurnId,
} from '../../src/types';
import { __mockStore } from '../setup';

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURES_DIR = join(__dirname, '..', 'fixtures', 'sessions');

function loadFixture(name: string): Session {
  const raw = JSON.parse(readFileSync(join(FIXTURES_DIR, name), 'utf-8'));
  return SessionSchema.parse(raw);
}

describe('useSessionStore', () => {
  beforeEach(() => {
    __mockStore.sessions.clear();
  });

  it('initially loads an empty list', async () => {
    const { result } = renderHook(() => useSessionStore());

    // Initial state: loading
    expect(result.current.state.loading).toBe(true);

    await waitFor(() => {
      expect(result.current.state.loading).toBe(false);
    });
    expect(result.current.state.sessions).toEqual([]);
    expect(result.current.state.error).toBeNull();
  });

  it('lists sessions seeded into the mock store', async () => {
    const fixture = loadFixture('02-single-turn.json');
    __mockStore.sessions.set(fixture.id, fixture);

    const { result } = renderHook(() => useSessionStore());

    await waitFor(() => {
      expect(result.current.state.loading).toBe(false);
    });
    expect(result.current.state.sessions).toHaveLength(1);
    expect(result.current.state.sessions[0]?.id).toBe(fixture.id);
    expect(result.current.state.sessions[0]?.title).toBe(fixture.title);
  });

  it('create() persists and refreshes the list', async () => {
    const { result } = renderHook(() => useSessionStore());

    await waitFor(() => expect(result.current.state.loading).toBe(false));

    const fixture = loadFixture('01-empty.json');

    let created: Session | null = null;
    await act(async () => {
      created = await result.current.create(fixture);
    });

    expect(created).not.toBeNull();
    expect(result.current.state.sessions).toHaveLength(1);
    expect(result.current.state.sessions[0]?.id).toBe(fixture.id);
  });

  it('get() fetches a full session including conversation', async () => {
    const fixture = loadFixture('02-single-turn.json');
    __mockStore.sessions.set(fixture.id, fixture);

    const { result } = renderHook(() => useSessionStore());
    await waitFor(() => expect(result.current.state.loading).toBe(false));

    let fetched: Session | null = null;
    await act(async () => {
      fetched = await result.current.get(fixture.id);
    });

    expect(fetched).not.toBeNull();
    expect(fetched!.conversation.turns).toHaveLength(2);
  });

  it('appendTurn() updates an existing session', async () => {
    const fixture = loadFixture('01-empty.json');
    __mockStore.sessions.set(fixture.id, fixture);

    const { result } = renderHook(() => useSessionStore());
    await waitFor(() => expect(result.current.state.loading).toBe(false));

    const newTurn = {
      id: '019d0099-0000-7000-8000-000000000001' as TurnId,
      role: 'user' as const,
      timestamp: '2026-05-02T03:00:00.000Z',
      status: 'completed' as const,
      content: [{ type: 'text' as const, text: '추가' }],
    };

    let appended = false;
    await act(async () => {
      appended = await result.current.appendTurn(fixture.id, newTurn);
    });

    expect(appended).toBe(true);
    const stored = __mockStore.sessions.get(fixture.id);
    expect(stored?.conversation.turns).toHaveLength(1);
    expect(stored?.conversation.turns[0]?.content[0]).toEqual({
      type: 'text',
      text: '추가',
    });
  });

  it('appendTurn() returns false when session is missing', async () => {
    const { result } = renderHook(() => useSessionStore());
    await waitFor(() => expect(result.current.state.loading).toBe(false));

    let appended = true;
    await act(async () => {
      appended = await result.current.appendTurn(
        '019d0099-0000-7000-8000-0000000000ee' as SessionId,
        {
          id: '019d0099-0000-7000-8000-0000000000ef' as TurnId,
          role: 'user',
          timestamp: '2026-05-02T04:00:00.000Z',
          status: 'completed',
          content: [{ type: 'text', text: 'hi' }],
        }
      );
    });

    expect(appended).toBe(false);
    expect(result.current.state.error).toMatch(/not found/);
  });

  it('updateMeta() patches title and refreshes', async () => {
    const fixture = loadFixture('01-empty.json');
    __mockStore.sessions.set(fixture.id, fixture);

    const { result } = renderHook(() => useSessionStore());
    await waitFor(() => expect(result.current.state.loading).toBe(false));

    let ok = false;
    await act(async () => {
      ok = await result.current.updateMeta(fixture.id, {
        title: '새 제목',
      });
    });

    expect(ok).toBe(true);
    expect(result.current.state.sessions[0]?.title).toBe('새 제목');
  });

  it('remove() deletes and refreshes', async () => {
    const fixture = loadFixture('01-empty.json');
    __mockStore.sessions.set(fixture.id, fixture);

    const { result } = renderHook(() => useSessionStore());
    await waitFor(() => expect(result.current.state.loading).toBe(false));
    expect(result.current.state.sessions).toHaveLength(1);

    let removed = false;
    await act(async () => {
      removed = await result.current.remove(fixture.id);
    });

    expect(removed).toBe(true);
    expect(result.current.state.sessions).toHaveLength(0);
    expect(__mockStore.sessions.has(fixture.id)).toBe(false);
  });

  it('refresh() picks up changes made outside the hook', async () => {
    const { result } = renderHook(() => useSessionStore());
    await waitFor(() => expect(result.current.state.loading).toBe(false));
    expect(result.current.state.sessions).toHaveLength(0);

    // Simulate a change from another window / tab.
    const fixture = loadFixture('01-empty.json');
    __mockStore.sessions.set(fixture.id, fixture);

    await act(async () => {
      await result.current.refresh();
    });

    expect(result.current.state.sessions).toHaveLength(1);
  });
});
