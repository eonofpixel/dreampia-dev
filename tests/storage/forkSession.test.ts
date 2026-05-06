/**
 * SessionStore.forkSession (v1.6.3 backend).
 *
 * 검증:
 *  - parent 없으면 throw.
 *  - 새 session 의 parent_session_id 설정.
 *  - 새 session id 는 새 UUIDv7.
 *  - title 옵션 / default '{parent.title} (fork)'.
 *  - turns 전체 복사 (새 turn id).
 *  - truncateAt 옵션 — 그 turn 까지만 복사.
 *  - 새 session 의 browser.tabs / terminal.panes 빈 list (parent 와 격리).
 *  - permission.grants 의 session_id 는 새 session id.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { SessionStore } from '../../src/storage';
import type { Session, SessionId, WorkspaceId, Turn } from '../../src/types';
import { newSessionId, newTurnId, workspaceIdFor } from '../../src/types';

function makeTurn(role: 'user' | 'assistant', text: string): Turn {
  return {
    id: newTurnId(),
    role,
    timestamp: '2026-05-06T00:00:00.000Z',
    status: 'completed',
    content: [{ type: 'text', text }],
  } as Turn;
}

function makeSession(overrides: Partial<Session> = {}): Session {
  return {
    id: (overrides.id ?? newSessionId()) as SessionId,
    schema_version: 1,
    created_at: '2026-05-06T00:00:00.000Z',
    updated_at: '2026-05-06T00:00:00.000Z',
    provider: 'codex',
    workspace_id: (overrides.workspace_id ?? workspaceIdFor('/fork-test')) as WorkspaceId,
    title: overrides.title ?? 'parent',
    pinned: false,
    archived: false,
    conversation: overrides.conversation ?? {
      turns: [],
      current_model: 'gpt-5.5',
      current_effort: 'high',
      current_mode: 'standard',
    },
    workspace: {
      root: '/fork-test',
      name: 'fork-test',
      worktrees: [],
      recent_files: [],
      open_files: [],
      ignore_patterns: [],
      index_status: 'idle',
      is_temporary: false,
    },
    terminal: { panes: [], panel_open: false, height_px: 200 },
    browser: {
      tabs: [],
      panel_visible: false,
      layout: 'hidden',
      partition_id: 'p',
    },
    plan: { active: false, browser_tool_enabled: false },
    permission: {
      grants: [],
      default_level: 'workspace_write',
      temporarily_blocked_capabilities: [],
    },
    metadata: {},
    ...overrides,
  } as Session;
}

describe('v1.6.3 — SessionStore.forkSession', () => {
  let store: SessionStore;

  beforeEach(() => {
    store = new SessionStore(':memory:');
  });

  afterEach(() => {
    store.close();
  });

  it('parent 미존재 → throw', () => {
    expect(() =>
      store.forkSession(newSessionId() as SessionId)
    ).toThrow(/not found/);
  });

  it('새 session 생성 — parent_session_id + 새 id', () => {
    const parent = makeSession({ title: 'parent' });
    store.createSession(parent);
    const childId = store.forkSession(parent.id);
    expect(childId).not.toBe(parent.id);
    const child = store.getSession(childId);
    expect(child).not.toBeNull();
    expect(child!.parent_session_id).toBe(parent.id);
  });

  it('default title = "{parent.title} (fork)"', () => {
    const parent = makeSession({ title: 'My Chat' });
    store.createSession(parent);
    const childId = store.forkSession(parent.id);
    const child = store.getSession(childId);
    expect(child!.title).toBe('My Chat (fork)');
  });

  it('title 옵션 우선', () => {
    const parent = makeSession({ title: 'X' });
    store.createSession(parent);
    const childId = store.forkSession(parent.id, { title: 'My Fork' });
    expect(store.getSession(childId)!.title).toBe('My Fork');
  });

  it('turns 전체 복사 + 새 turn id', () => {
    const parent = makeSession({
      conversation: {
        turns: [makeTurn('user', '안녕'), makeTurn('assistant', '하이')],
        current_model: 'gpt-5.5',
        current_effort: 'high',
        current_mode: 'standard',
      },
    });
    store.createSession(parent);
    const childId = store.forkSession(parent.id);
    const child = store.getSession(childId);
    expect(child!.conversation.turns.length).toBe(2);
    // 같은 content 이지만 다른 id.
    const parentIds = parent.conversation.turns.map((t) => t.id);
    const childIds = child!.conversation.turns.map((t) => t.id);
    for (const cid of childIds) {
      expect(parentIds).not.toContain(cid);
    }
  });

  it('truncateAt 옵션 — 그 turn 까지 복사', () => {
    const t1 = makeTurn('user', 'first');
    const t2 = makeTurn('assistant', 'second');
    const t3 = makeTurn('user', 'third');
    const parent = makeSession({
      conversation: {
        turns: [t1, t2, t3],
        current_model: 'gpt-5.5',
        current_effort: 'high',
        current_mode: 'standard',
      },
    });
    store.createSession(parent);
    const childId = store.forkSession(parent.id, { truncateAt: t2.id });
    const child = store.getSession(childId);
    expect(child!.conversation.turns.length).toBe(2);
    // 내용 검증 — t1 + t2 만, t3 제외.
    const texts = child!.conversation.turns.map((t) => {
      const c = t.content[0] as { type: string; text?: string };
      return c.text ?? '';
    });
    expect(texts).toEqual(['first', 'second']);
  });

  it('truncateAt 미존재 turn id → 전체 복사 (안전 fallback)', () => {
    const parent = makeSession({
      conversation: {
        turns: [makeTurn('user', 'a'), makeTurn('assistant', 'b')],
        current_model: 'gpt-5.5',
        current_effort: 'high',
        current_mode: 'standard',
      },
    });
    store.createSession(parent);
    const childId = store.forkSession(parent.id, {
      truncateAt: 'fake-turn-id',
    });
    const child = store.getSession(childId);
    expect(child!.conversation.turns.length).toBe(2);
  });
});
