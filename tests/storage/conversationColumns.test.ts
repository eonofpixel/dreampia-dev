/**
 * v1.4.2 (B-3 1단계) — sessions.conversation columns dual-write/read 검증.
 *
 * 검증:
 *  - migration 14 적용 후 컬럼 type=TEXT 존재.
 *  - 새 session 생성 → column + metadata_json._extra 둘 다 채워짐.
 *  - updateConversation → column + JSON 둘 다 갱신.
 *  - column 만 채워진 row → load 시 conversation.current_model 정상.
 *  - JSON 만 채워진 row (옛 데이터) → fallback 정상.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { SessionStore } from '../../src/storage';
import type { Session, SessionId, WorkspaceId } from '../../src/types';
import { newSessionId, workspaceIdFor } from '../../src/types';

interface TableInfoRow {
  name: string;
  type: string;
}

function makeSession(overrides: Partial<Session> = {}): Session {
  return {
    id: (overrides.id ?? newSessionId()) as SessionId,
    schema_version: 1,
    created_at: '2026-05-06T00:00:00.000Z',
    updated_at: '2026-05-06T00:00:00.000Z',
    provider: 'codex',
    workspace_id: (overrides.workspace_id ?? workspaceIdFor('/conv-test')) as WorkspaceId,
    title: 'sess',
    pinned: false,
    archived: false,
    conversation: {
      turns: [],
      current_model: 'gpt-5.5',
      current_effort: 'high',
      current_mode: 'standard',
    },
    workspace: {
      root: '/conv',
      name: 'conv',
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

describe('v1.4.2 — sessions.conversation columns', () => {
  let store: SessionStore;

  beforeEach(() => {
    store = new SessionStore(':memory:');
  });

  afterEach(() => {
    store.close();
  });

  it('migration 14 — current_model/effort/mode 컬럼 존재', () => {
    const rows = store
      .getDb()
      .prepare('PRAGMA table_info(sessions)')
      .all() as TableInfoRow[];
    const names = rows.map((r) => r.name);
    expect(names).toContain('current_model');
    expect(names).toContain('current_effort');
    expect(names).toContain('current_mode');
    for (const cn of ['current_model', 'current_effort', 'current_mode']) {
      expect(rows.find((r) => r.name === cn)!.type).toBe('TEXT');
    }
  });

  it('createSession → column + JSON dual-write', () => {
    const sess = makeSession();
    store.createSession(sess);
    const row = store
      .getDb()
      .prepare(
        'SELECT current_model, current_effort, current_mode, metadata_json FROM sessions WHERE id = ?'
      )
      .get(sess.id) as {
      current_model: string;
      current_effort: string;
      current_mode: string;
      metadata_json: string;
    };
    expect(row.current_model).toBe('gpt-5.5');
    expect(row.current_effort).toBe('high');
    expect(row.current_mode).toBe('standard');
    const meta = JSON.parse(row.metadata_json) as {
      _extra: { conversation: { current_model: string } };
    };
    expect(meta._extra.conversation.current_model).toBe('gpt-5.5');
  });

  it('updateConversation → column + JSON 둘 다 갱신', () => {
    const sess = makeSession();
    store.createSession(sess);
    store.updateConversation(sess.id, { current_model: 'claude-opus-4-7' });
    const row = store
      .getDb()
      .prepare(
        'SELECT current_model, metadata_json FROM sessions WHERE id = ?'
      )
      .get(sess.id) as { current_model: string; metadata_json: string };
    expect(row.current_model).toBe('claude-opus-4-7');
    const meta = JSON.parse(row.metadata_json) as {
      _extra: { conversation: { current_model: string } };
    };
    expect(meta._extra.conversation.current_model).toBe('claude-opus-4-7');
  });

  it('load — column 우선 (column + JSON 일치 시)', () => {
    const sess = makeSession();
    store.createSession(sess);
    const loaded = store.getSession(sess.id);
    expect(loaded).not.toBeNull();
    expect(loaded!.conversation.current_model).toBe('gpt-5.5');
  });

  it('load — column NULL 일 때 JSON fallback (옛 데이터 시뮬레이션)', () => {
    const sess = makeSession();
    store.createSession(sess);
    // column 만 강제로 NULL — JSON 은 그대로.
    store
      .getDb()
      .prepare(
        'UPDATE sessions SET current_model = NULL, current_effort = NULL, current_mode = NULL WHERE id = ?'
      )
      .run(sess.id);
    const loaded = store.getSession(sess.id);
    expect(loaded).not.toBeNull();
    expect(loaded!.conversation.current_model).toBe('gpt-5.5');
  });

  it('load — column / JSON 다른 값일 때 column 우선', () => {
    const sess = makeSession();
    store.createSession(sess);
    // column 만 변경 (JSON 은 stale 그대로) — 실 production 에서는 안 일어나지만
    // backwards-compat 안전망 확인.
    store
      .getDb()
      .prepare('UPDATE sessions SET current_model = ? WHERE id = ?')
      .run('column-only-value', sess.id);
    const loaded = store.getSession(sess.id);
    expect(loaded!.conversation.current_model).toBe('column-only-value');
  });
});
