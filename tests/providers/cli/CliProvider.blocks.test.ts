/**
 * CliProvider.renderTurnAsPrompt — v0.13.0 (J) typed block rendering tests.
 *
 * 검증:
 *   1. text-only turn → text 그대로
 *   2. file_reference → "[파일] {path} (line 1-{n})" + fenced code block
 *   3. file_reference truncated=true → ", truncated" 포함
 *   4. file_reference language → 코드 fence 에 lang 지정
 *   5. session_reference → "[세션] {title} ({n}턴)" + quote 형식 context
 *   6. text + file_reference + session_reference 혼합 — 순서 보존, 줄바꿈 분리
 */

import { describe, it, expect } from 'vitest';
import { CliProvider } from '../../../src/providers/cli/CliProvider';
import type { Turn } from '../../../src/types';
import { newTurnId, nowIso } from '../../../src/types';

function makeUserTurn(content: Turn['content']): Turn {
  return {
    id: newTurnId(),
    role: 'user',
    timestamp: nowIso(),
    status: 'completed',
    content,
  };
}

describe('CliProvider.renderTurnAsPrompt', () => {
  it('renders text-only turn as plain text', () => {
    const turn = makeUserTurn([{ type: 'text', text: 'hello' }]);
    expect(CliProvider.renderTurnAsPrompt(turn)).toBe('hello');
  });

  it('renders file_reference as fenced code with header', () => {
    const turn = makeUserTurn([
      {
        type: 'file_reference',
        path: 'src/x.ts',
        snippet: 'const a = 1;',
        line_count: 1,
        truncated: false,
      },
    ]);
    const out = CliProvider.renderTurnAsPrompt(turn);
    expect(out).toContain('[파일] src/x.ts (line 1-1)');
    expect(out).toContain('```\nconst a = 1;\n```');
    // truncated=false 면 ", truncated" 표기 X
    expect(out).not.toContain('truncated');
  });

  it('marks truncated=true in the header', () => {
    const turn = makeUserTurn([
      {
        type: 'file_reference',
        path: 'big.txt',
        snippet: 'x',
        line_count: 9999,
        truncated: true,
      },
    ]);
    const out = CliProvider.renderTurnAsPrompt(turn);
    expect(out).toContain(', truncated');
  });

  it('passes language hint to code fence', () => {
    const turn = makeUserTurn([
      {
        type: 'file_reference',
        path: 'a.py',
        snippet: 'print(1)',
        line_count: 1,
        truncated: false,
        language: 'py',
      },
    ]);
    const out = CliProvider.renderTurnAsPrompt(turn);
    expect(out).toContain('```py');
  });

  it('renders session_reference as quote block with header', () => {
    const turn = makeUserTurn([
      {
        type: 'session_reference',
        session_id: 's1',
        title: 'Prior chat',
        context_text: '사용자: hi\nAI: hello',
        turn_count: 2,
      },
    ]);
    const out = CliProvider.renderTurnAsPrompt(turn);
    expect(out).toContain('[세션] Prior chat (2턴)');
    expect(out).toContain('> 사용자: hi');
    expect(out).toContain('> AI: hello');
  });

  it('falls back to session_id when title is empty', () => {
    const turn = makeUserTurn([
      {
        type: 'session_reference',
        session_id: 'abc-xyz',
        title: '',
        context_text: 'q\na',
        turn_count: 1,
      },
    ]);
    const out = CliProvider.renderTurnAsPrompt(turn);
    expect(out).toContain('[세션] abc-xyz (1턴)');
  });

  it('preserves block order and joins with newlines', () => {
    const turn = makeUserTurn([
      { type: 'text', text: 'compare these two:' },
      {
        type: 'file_reference',
        path: 'a.ts',
        snippet: 'A',
        line_count: 1,
        truncated: false,
      },
      {
        type: 'session_reference',
        session_id: 's1',
        title: 'Prev',
        context_text: 'q',
        turn_count: 1,
      },
    ]);
    const out = CliProvider.renderTurnAsPrompt(turn);
    const idxText = out.indexOf('compare these two:');
    const idxFile = out.indexOf('[파일] a.ts');
    const idxSession = out.indexOf('[세션] Prev');
    expect(idxText).toBeGreaterThanOrEqual(0);
    expect(idxFile).toBeGreaterThan(idxText);
    expect(idxSession).toBeGreaterThan(idxFile);
  });
});
