/**
 * v0.13.0 (J) — typed-block resolver helpers tests.
 *
 * 검증:
 *   1. resolveMentionsToTypedBlocks — file → file_reference, session → session_reference
 *   2. error mention 은 inline text(error) block 으로 fallback
 *   3. 빈 입력 → 빈 배열
 *   4. session block 에 title + turn_count 캡처
 *   5. file block 에 language hint X (resolver 가 채우지 않음 — caller 설정)
 *   6. stripMentionTokens — 토큰 제거 + 공백 정규화
 */

import { describe, it, expect, vi } from 'vitest';
import {
  resolveMentions,
  resolveMentionsToTypedBlocks,
  stripMentionTokens,
  type ResolvedMention,
  type ResolverContext,
} from '../../../src/renderer/mentions/resolver';
import type { MentionMatch } from '../../../src/renderer/mentions/parser';
import type { Session } from '../../../src/types';

function fileMention(value: string, start = 0): MentionMatch {
  return { kind: 'file', value, query: value, start, end: start + value.length + 1 };
}
function sessionMention(value: string, start = 0): MentionMatch {
  const query = `session:${value}`;
  return { kind: 'session', value, query, start, end: start + query.length + 1 };
}

function fakeSession(
  id: string,
  title: string,
  turns: Array<{ role: 'user' | 'assistant'; text: string }>
): Session {
  return {
    id,
    title,
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

describe('resolveMentionsToTypedBlocks', () => {
  it('returns empty array for empty input', () => {
    expect(resolveMentionsToTypedBlocks([])).toEqual([]);
  });

  it('maps file mention to file_reference block', () => {
    const resolved: ResolvedMention[] = [
      {
        match: fileMention('README.md'),
        kind: 'file',
        path: 'README.md',
        snippet: '# Hello',
        line_count: 1,
        truncated: false,
      },
    ];
    const blocks = resolveMentionsToTypedBlocks(resolved);
    expect(blocks).toHaveLength(1);
    expect(blocks[0]?.type).toBe('file_reference');
    if (blocks[0]?.type === 'file_reference') {
      expect(blocks[0].path).toBe('README.md');
      expect(blocks[0].snippet).toBe('# Hello');
      expect(blocks[0].line_count).toBe(1);
      expect(blocks[0].truncated).toBe(false);
    }
  });

  it('maps session mention to session_reference block with title + turn_count', () => {
    const resolved: ResolvedMention[] = [
      {
        match: sessionMention('s1'),
        kind: 'session',
        session_id: 's1',
        context_text: '사용자: hi\nAI: hello',
        session_title: 'Prior chat',
        session_turn_count: 5,
      },
    ];
    const blocks = resolveMentionsToTypedBlocks(resolved);
    expect(blocks).toHaveLength(1);
    expect(blocks[0]?.type).toBe('session_reference');
    if (blocks[0]?.type === 'session_reference') {
      expect(blocks[0].session_id).toBe('s1');
      expect(blocks[0].title).toBe('Prior chat');
      expect(blocks[0].context_text).toContain('사용자');
      expect(blocks[0].turn_count).toBe(5);
    }
  });

  it('falls back to inline text block for error mentions', () => {
    const resolved: ResolvedMention[] = [
      {
        match: fileMention('bad.txt'),
        kind: 'error',
        error: 'not found',
      },
    ];
    const blocks = resolveMentionsToTypedBlocks(resolved);
    expect(blocks).toHaveLength(1);
    expect(blocks[0]?.type).toBe('text');
    if (blocks[0]?.type === 'text') {
      expect(blocks[0].text).toContain('[오류]');
      expect(blocks[0].text).toContain('not found');
    }
  });

  it('preserves order across mixed kinds', () => {
    const resolved: ResolvedMention[] = [
      {
        match: fileMention('a.ts'),
        kind: 'file',
        path: 'a.ts',
        snippet: 'a',
        line_count: 1,
        truncated: false,
      },
      {
        match: sessionMention('s1'),
        kind: 'session',
        session_id: 's1',
        context_text: 'x',
        session_title: 'S1',
        session_turn_count: 1,
      },
      { match: fileMention('bad'), kind: 'error', error: 'oops' },
    ];
    const blocks = resolveMentionsToTypedBlocks(resolved);
    expect(blocks.map((b) => b.type)).toEqual([
      'file_reference',
      'session_reference',
      'text',
    ]);
  });

  it('integrates end-to-end with resolveMentions for session', async () => {
    const session = fakeSession('s2', 'Prior', [
      { role: 'user', text: 'q1' },
      { role: 'assistant', text: 'a1' },
    ]);
    const ctx: ResolverContext = {
      workspaceRoot: '/ws',
      readFile: vi.fn(),
      getSession: vi.fn(async (id: string) => (id === 's2' ? session : null)),
    };
    const resolved = await resolveMentions([sessionMention('s2')], ctx);
    const blocks = resolveMentionsToTypedBlocks(resolved);
    expect(blocks).toHaveLength(1);
    if (blocks[0]?.type === 'session_reference') {
      expect(blocks[0].title).toBe('Prior');
      expect(blocks[0].turn_count).toBe(2);
    }
  });
});

describe('stripMentionTokens', () => {
  it('returns text unchanged when no mentions', () => {
    expect(stripMentionTokens('hello world', [])).toBe('hello world');
  });

  it('strips a single file mention with surrounding whitespace', () => {
    const text = 'Look at @README.md please';
    // start=8, end=18 ('@README.md' = 10 chars)
    const m: MentionMatch = {
      kind: 'file',
      value: 'README.md',
      query: 'README.md',
      start: 8,
      end: 18,
    };
    expect(stripMentionTokens(text, [m])).toBe('Look at please');
  });

  it('strips trailing mention', () => {
    const text = 'See @file.ts';
    const m: MentionMatch = {
      kind: 'file',
      value: 'file.ts',
      query: 'file.ts',
      start: 4,
      end: 12,
    };
    expect(stripMentionTokens(text, [m])).toBe('See');
  });

  it('strips multiple mentions in any input order', () => {
    const text = 'compare @a.ts vs @b.ts now';
    const ma: MentionMatch = {
      kind: 'file',
      value: 'a.ts',
      query: 'a.ts',
      start: 8,
      end: 13,
    };
    const mb: MentionMatch = {
      kind: 'file',
      value: 'b.ts',
      query: 'b.ts',
      start: 17,
      end: 22,
    };
    // 입력 순서 [ma, mb] / [mb, ma] 모두 같은 결과.
    expect(stripMentionTokens(text, [ma, mb])).toBe('compare vs now');
    expect(stripMentionTokens(text, [mb, ma])).toBe('compare vs now');
  });
});
