/**
 * Schema tests — v0.13.0 (J) typed reference blocks.
 *
 * 검증:
 *   1. `file_reference` 블록이 ContentBlockSchema 의 valid variant
 *   2. `session_reference` 블록이 ContentBlockSchema 의 valid variant
 *   3. Discriminated union — 알 수 없는 type 은 reject
 *   4. 기존 `text` / `mention` / `embedded_card` block 은 변경 없이 parse
 *   5. 누락 필드 reject (file_reference: path/snippet/line_count/truncated)
 *   6. Optional `language` 필드 round-trip
 *   7. `Turn.content` 안에 typed block + text block 혼합 OK
 *   8. legacy plain-text only turn (mention 없음) 은 변경 없이 parse — 백워드 호환
 *   9. file_reference: line_count 음수 reject
 *  10. session_reference: turn_count 0 OK (빈 세션)
 *
 * Spec: docs/session/conversation.md (typed reference blocks)
 */

import { describe, it, expect } from 'vitest';
import { ContentBlockSchema, TurnSchema } from '../../src/types';

describe('v0.13.0 typed file_reference block', () => {
  it('parses a valid file_reference block', () => {
    const block = {
      type: 'file_reference',
      path: 'src/index.ts',
      snippet: 'export const x = 1;',
      line_count: 1,
      truncated: false,
    };
    const parsed = ContentBlockSchema.parse(block);
    expect(parsed.type).toBe('file_reference');
    if (parsed.type === 'file_reference') {
      expect(parsed.path).toBe('src/index.ts');
      expect(parsed.snippet).toBe('export const x = 1;');
      expect(parsed.line_count).toBe(1);
      expect(parsed.truncated).toBe(false);
    }
  });

  it('round-trips optional language', () => {
    const block = {
      type: 'file_reference',
      path: 'app.py',
      snippet: 'print(1)',
      line_count: 1,
      truncated: false,
      language: 'py',
    };
    const parsed = ContentBlockSchema.parse(block);
    if (parsed.type === 'file_reference') {
      expect(parsed.language).toBe('py');
    }
  });

  it('rejects empty path', () => {
    expect(() =>
      ContentBlockSchema.parse({
        type: 'file_reference',
        path: '',
        snippet: '',
        line_count: 0,
        truncated: false,
      })
    ).toThrow();
  });

  it('rejects negative line_count', () => {
    expect(() =>
      ContentBlockSchema.parse({
        type: 'file_reference',
        path: 'a.txt',
        snippet: 'x',
        line_count: -1,
        truncated: false,
      })
    ).toThrow();
  });

  it('rejects missing truncated field', () => {
    expect(() =>
      ContentBlockSchema.parse({
        type: 'file_reference',
        path: 'a.txt',
        snippet: 'x',
        line_count: 1,
      })
    ).toThrow();
  });

  it('rejects non-boolean truncated', () => {
    expect(() =>
      ContentBlockSchema.parse({
        type: 'file_reference',
        path: 'a.txt',
        snippet: 'x',
        line_count: 1,
        truncated: 'yes',
      })
    ).toThrow();
  });
});

describe('v0.13.0 typed session_reference block', () => {
  it('parses a valid session_reference block', () => {
    const block = {
      type: 'session_reference',
      session_id: 'sess-123',
      title: 'Prior conversation',
      context_text: '사용자: hi\nAI: hello',
      turn_count: 2,
    };
    const parsed = ContentBlockSchema.parse(block);
    expect(parsed.type).toBe('session_reference');
    if (parsed.type === 'session_reference') {
      expect(parsed.session_id).toBe('sess-123');
      expect(parsed.title).toBe('Prior conversation');
      expect(parsed.context_text).toContain('사용자');
      expect(parsed.turn_count).toBe(2);
    }
  });

  it('accepts turn_count of 0 (empty session)', () => {
    const block = {
      type: 'session_reference',
      session_id: 'empty',
      title: '',
      context_text: '',
      turn_count: 0,
    };
    expect(() => ContentBlockSchema.parse(block)).not.toThrow();
  });

  it('rejects empty session_id', () => {
    expect(() =>
      ContentBlockSchema.parse({
        type: 'session_reference',
        session_id: '',
        title: 't',
        context_text: '',
        turn_count: 0,
      })
    ).toThrow();
  });

  it('rejects negative turn_count', () => {
    expect(() =>
      ContentBlockSchema.parse({
        type: 'session_reference',
        session_id: 's',
        title: '',
        context_text: '',
        turn_count: -1,
      })
    ).toThrow();
  });
});

describe('Discriminated union — backwards compat', () => {
  it('still parses legacy text block unchanged', () => {
    const block = { type: 'text', text: 'hello' };
    const parsed = ContentBlockSchema.parse(block);
    expect(parsed.type).toBe('text');
    if (parsed.type === 'text') expect(parsed.text).toBe('hello');
  });

  it('still parses legacy mention block unchanged', () => {
    const block = {
      type: 'mention',
      ref: { kind: 'file', id: 'README.md', display: 'README.md' },
    };
    const parsed = ContentBlockSchema.parse(block);
    expect(parsed.type).toBe('mention');
  });

  it('still parses legacy embedded_card block unchanged', () => {
    const block = {
      type: 'embedded_card',
      card: { kind: 'web_preview', title: 'Hello' },
    };
    const parsed = ContentBlockSchema.parse(block);
    expect(parsed.type).toBe('embedded_card');
  });

  it('rejects unknown block type — forward compat is intentionally strict', () => {
    expect(() =>
      ContentBlockSchema.parse({ type: 'totally_new_block', payload: 'x' })
    ).toThrow();
  });
});

describe('Turn.content with mixed typed + text blocks', () => {
  it('accepts a user turn with text + file_reference + session_reference', () => {
    const turn = {
      id: '019d0001-0000-7000-8000-000000000001',
      role: 'user',
      timestamp: '2026-05-02T01:00:10.000Z',
      status: 'completed',
      content: [
        { type: 'text', text: 'Look at these:' },
        {
          type: 'file_reference',
          path: 'src/index.ts',
          snippet: 'console.log(1);',
          line_count: 1,
          truncated: false,
        },
        {
          type: 'session_reference',
          session_id: 'prior',
          title: 'Prior',
          context_text: '...',
          turn_count: 5,
        },
      ],
    };
    const parsed = TurnSchema.parse(turn);
    expect(parsed.content).toHaveLength(3);
    expect(parsed.content[0]?.type).toBe('text');
    expect(parsed.content[1]?.type).toBe('file_reference');
    expect(parsed.content[2]?.type).toBe('session_reference');
  });

  it('accepts a legacy plain-text turn (no mentions) — backward compat', () => {
    const turn = {
      id: '019d0001-0000-7000-8000-000000000001',
      role: 'user',
      timestamp: '2026-05-02T01:00:10.000Z',
      status: 'completed',
      // v0.6 ~ v0.12 형식 — "--- 컨텍스트 ---" 가 단일 text block 안에 있음.
      content: [
        {
          type: 'text',
          text: 'See file:\n\n--- 컨텍스트 ---\n[파일] @README.md (line 1-3):\n```\nHello\n```',
        },
      ],
    };
    const parsed = TurnSchema.parse(turn);
    expect(parsed.content).toHaveLength(1);
    expect(parsed.content[0]?.type).toBe('text');
  });
});
