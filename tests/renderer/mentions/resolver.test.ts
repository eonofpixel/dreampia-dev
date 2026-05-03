/**
 * @ mention resolver unit tests (v0.6.0).
 *
 * IPC + getSession 은 mock 으로 주입. 검증 포커스:
 *   - 빈 입력
 *   - file 정상 read → snippet/line_count/truncated 채움
 *   - file IPC 실패 → kind='error'
 *   - session 정상 fetch → context_text 채움
 *   - session 미발견 → kind='error'
 *   - formatMentionsAsContext 가 plain-text prepend 형태로 직렬화
 *
 * Spec: docs/ux/patterns/F-019-mention-palette.md
 */

import { describe, it, expect, vi } from 'vitest';
import {
  resolveMentions,
  formatMentionsAsContext,
  type ResolverContext,
  type ResolvedMention,
} from '../../../src/renderer/mentions/resolver';
import type { MentionMatch } from '../../../src/renderer/mentions/parser';
import type { Session } from '../../../src/types';

function fileMention(value: string): MentionMatch {
  return { kind: 'file', value, query: value, start: 0, end: value.length + 1 };
}
function sessionMention(value: string): MentionMatch {
  const query = `session:${value}`;
  return { kind: 'session', value, query, start: 0, end: query.length + 1 };
}
function unknownMention(): MentionMatch {
  return { kind: 'unknown', value: '', query: '', start: 0, end: 1 };
}

function fakeSession(id: string, turns: Array<{ role: 'user' | 'assistant'; text: string }>): Session {
  return {
    id,
    title: 'fake',
    pinned: false,
    archived: false,
    schema_version: 1,
    created_at: '2025-01-01T00:00:00.000Z',
    updated_at: '2025-01-01T00:00:00.000Z',
    provider: 'codex',
    workspace_id: 'ws',
    conversation: {
      turns: turns.map((t, i) => ({
        id: `turn-${i}`,
        role: t.role,
        timestamp: '2025-01-01T00:00:00.000Z',
        status: 'completed',
        content: [{ type: 'text', text: t.text }],
      })),
      current_model: 'gpt-5.5',
      current_effort: 'high',
      current_mode: 'standard',
    },
    workspace: {
      root: '/ws',
      name: 'ws',
      worktrees: [],
      recent_files: [],
      open_files: [],
      ignore_patterns: [],
      index_status: 'idle',
      is_temporary: false,
    },
    terminal: { panes: [], panel_open: false, height_px: 200 },
    browser: { tabs: [], panel_visible: false, layout: 'hidden', partition_id: 'p' },
    plan: { active: false, browser_tool_enabled: false },
    permission: { grants: [], default_level: 'read_only', temporarily_blocked_capabilities: [] },
    metadata: {},
  } as unknown as Session;
}

describe('resolveMentions', () => {
  it('returns empty array when mentions empty', async () => {
    const ctx: ResolverContext = {
      workspaceRoot: '/ws',
      readFile: vi.fn(),
      getSession: vi.fn(),
    };
    const result = await resolveMentions([], ctx);
    expect(result).toEqual([]);
  });

  it('resolves a file mention with content + line_count', async () => {
    const readFile = vi.fn(async () => ({
      ok: true as const,
      value: { content: 'a\nb\nc', truncated: false, line_count: 3 },
    }));
    const ctx: ResolverContext = {
      workspaceRoot: '/ws',
      readFile,
      getSession: vi.fn(),
    };
    const out = await resolveMentions([fileMention('README.md')], ctx);
    expect(out).toHaveLength(1);
    expect(out[0]?.kind).toBe('file');
    expect(out[0]?.path).toBe('README.md');
    expect(out[0]?.snippet).toBe('a\nb\nc');
    expect(out[0]?.line_count).toBe(3);
    expect(out[0]?.truncated).toBe(false);
    expect(readFile).toHaveBeenCalledTimes(1);
    expect(readFile).toHaveBeenCalledWith({
      workspace_root: '/ws',
      rel_path: 'README.md',
      max_bytes: 8192,
    });
  });

  it('returns kind=error when file IPC fails', async () => {
    const ctx: ResolverContext = {
      workspaceRoot: '/ws',
      readFile: vi.fn(async () => ({ ok: false as const, error: 'path traversal' })),
      getSession: vi.fn(),
    };
    const out = await resolveMentions([fileMention('../etc/passwd')], ctx);
    expect(out).toHaveLength(1);
    expect(out[0]?.kind).toBe('error');
    expect(out[0]?.error).toContain('traversal');
  });

  it('resolves a session mention with context_text', async () => {
    const session = fakeSession('s1', [
      { role: 'user', text: 'hello' },
      { role: 'assistant', text: 'hi there' },
    ]);
    const getSession = vi.fn(async (id: string) =>
      id === 's1' ? session : null
    );
    const ctx: ResolverContext = {
      workspaceRoot: '/ws',
      readFile: vi.fn(),
      getSession,
    };
    const out = await resolveMentions([sessionMention('s1')], ctx);
    expect(out).toHaveLength(1);
    expect(out[0]?.kind).toBe('session');
    expect(out[0]?.session_id).toBe('s1');
    expect(out[0]?.context_text).toContain('사용자: hello');
    expect(out[0]?.context_text).toContain('AI: hi there');
  });

  it('returns kind=error when session not found', async () => {
    const ctx: ResolverContext = {
      workspaceRoot: '/ws',
      readFile: vi.fn(),
      getSession: vi.fn(async () => null),
    };
    const out = await resolveMentions([sessionMention('missing')], ctx);
    expect(out).toHaveLength(1);
    expect(out[0]?.kind).toBe('error');
    expect(out[0]?.error).toContain('찾을 수 없습니다');
  });

  it('handles unknown mentions as errors', async () => {
    const ctx: ResolverContext = {
      workspaceRoot: '/ws',
      readFile: vi.fn(),
      getSession: vi.fn(),
    };
    const out = await resolveMentions([unknownMention()], ctx);
    expect(out).toHaveLength(1);
    expect(out[0]?.kind).toBe('error');
  });

  it('runs file/session mentions in parallel (no sequential dependency)', async () => {
    let fileResolved = false;
    let sessionResolved = false;
    const ctx: ResolverContext = {
      workspaceRoot: '/ws',
      readFile: vi.fn(async () => {
        await new Promise((r) => setTimeout(r, 5));
        fileResolved = true;
        return { ok: true as const, value: { content: 'x', truncated: false, line_count: 1 } };
      }),
      getSession: vi.fn(async () => {
        await new Promise((r) => setTimeout(r, 5));
        sessionResolved = true;
        return fakeSession('sX', []);
      }),
    };
    const out = await resolveMentions(
      [fileMention('a.txt'), sessionMention('sX')],
      ctx
    );
    expect(out).toHaveLength(2);
    expect(fileResolved).toBe(true);
    expect(sessionResolved).toBe(true);
  });

  it('catches readFile throw and returns error mention', async () => {
    const ctx: ResolverContext = {
      workspaceRoot: '/ws',
      readFile: vi.fn(async () => {
        throw new Error('boom');
      }),
      getSession: vi.fn(),
    };
    const out = await resolveMentions([fileMention('a.txt')], ctx);
    expect(out).toHaveLength(1);
    expect(out[0]?.kind).toBe('error');
    expect(out[0]?.error).toContain('boom');
  });
});

describe('formatMentionsAsContext', () => {
  it('returns original text unchanged when no mentions resolved', () => {
    expect(formatMentionsAsContext('hello', [])).toBe('hello');
  });

  it('appends file context section with code fence', () => {
    const resolved: ResolvedMention[] = [
      {
        match: fileMention('README.md'),
        kind: 'file',
        path: 'README.md',
        snippet: 'Hello\nworld',
        line_count: 2,
        truncated: false,
      },
    ];
    const out = formatMentionsAsContext('Read this:', resolved);
    expect(out).toContain('Read this:');
    expect(out).toContain('--- 컨텍스트 ---');
    expect(out).toContain('@README.md');
    expect(out).toContain('```');
    expect(out).toContain('Hello\nworld');
  });

  it('appends session context with last turns', () => {
    const resolved: ResolvedMention[] = [
      {
        match: sessionMention('s1'),
        kind: 'session',
        session_id: 's1',
        context_text: '사용자: hi\nAI: hello',
      },
    ];
    const out = formatMentionsAsContext('see prior:', resolved);
    expect(out).toContain('@session:s1');
    expect(out).toContain('사용자: hi');
    expect(out).toContain('AI: hello');
  });

  it('shows error for failed mentions', () => {
    const resolved: ResolvedMention[] = [
      {
        match: fileMention('bad.txt'),
        kind: 'error',
        error: 'file not found',
      },
    ];
    const out = formatMentionsAsContext('msg', resolved);
    expect(out).toContain('[오류]');
    expect(out).toContain('file not found');
  });
});
