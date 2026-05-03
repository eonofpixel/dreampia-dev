/**
 * @ mention parser unit tests (v0.6.0).
 *
 * 검증:
 *   - 빈 입력 / `@` 없음 → null
 *   - cursor 가 멘션 안에 있어야 detect (이메일 토큰 같은 경우 거절)
 *   - kind 분류: file / session / unknown
 *   - findAllMentions 가 모든 멘션을 첫 등장 순서로 반환
 *
 * Spec: docs/ux/patterns/F-019-mention-palette.md
 */

import { describe, it, expect } from 'vitest';
import {
  findActiveMention,
  findAllMentions,
} from '../../../src/renderer/mentions/parser';

describe('findActiveMention', () => {
  it('returns null for empty text', () => {
    expect(findActiveMention('', 0)).toBeNull();
  });

  it('returns null when cursor not inside any @ token', () => {
    expect(findActiveMention('hello world', 5)).toBeNull();
  });

  it('detects file mention with cursor at end', () => {
    const text = 'Read @src/main';
    const result = findActiveMention(text, text.length);
    expect(result).not.toBeNull();
    if (result === null) return;
    expect(result.kind).toBe('file');
    expect(result.query).toBe('src/main');
    expect(result.value).toBe('src/main');
    expect(result.start).toBe(5);
    expect(result.end).toBe(text.length);
  });

  it('detects file mention at start of input', () => {
    const text = '@README.md';
    const result = findActiveMention(text, text.length);
    expect(result).not.toBeNull();
    if (result === null) return;
    expect(result.kind).toBe('file');
    expect(result.value).toBe('README.md');
    expect(result.start).toBe(0);
  });

  it('detects session mention', () => {
    const text = '@session:abc123';
    const result = findActiveMention(text, text.length);
    expect(result).not.toBeNull();
    if (result === null) return;
    expect(result.kind).toBe('session');
    expect(result.value).toBe('abc123');
    expect(result.query).toBe('session:abc123');
  });

  it('classifies bare @ as unknown kind', () => {
    const text = 'hi @';
    const result = findActiveMention(text, text.length);
    expect(result).not.toBeNull();
    if (result === null) return;
    expect(result.kind).toBe('unknown');
    expect(result.query).toBe('');
    expect(result.value).toBe('');
  });

  it('does NOT detect mention when @ is not preceded by whitespace (email-like)', () => {
    const text = 'send to user@host.com';
    const result = findActiveMention(text, text.length);
    expect(result).toBeNull();
  });

  it('cursor in middle of token returns prefix as query', () => {
    // text = "Read @src/main/file" cursor right after "src/"
    const text = 'Read @src/main/file';
    // cursor at position 10 = right after "src/"
    const cursor = 10;
    const result = findActiveMention(text, cursor);
    expect(result).not.toBeNull();
    if (result === null) return;
    expect(result.kind).toBe('file');
    // entire token should be captured (cursor extends to whitespace boundary)
    expect(result.value).toBe('src/main/file');
  });

  it('returns null when @ is followed by whitespace before cursor', () => {
    // "Look at @ now" cursor at end — after @ there's a space
    const text = 'Look at @ now';
    const result = findActiveMention(text, text.length);
    // cursor at end (after "now"), @ is far behind a space → null
    expect(result).toBeNull();
  });

  it('returns mention when cursor is right after the @', () => {
    const text = 'Hi @';
    const result = findActiveMention(text, 4);
    expect(result).not.toBeNull();
    if (result === null) return;
    expect(result.kind).toBe('unknown');
  });

  it('handles tab + newline as boundaries', () => {
    const text = '@foo\thi';
    const result = findActiveMention(text, 4);
    expect(result).not.toBeNull();
    if (result === null) return;
    expect(result.kind).toBe('file');
    expect(result.value).toBe('foo');
  });

  it('cursor clamps to text length', () => {
    const text = '@x';
    const result = findActiveMention(text, 999);
    expect(result).not.toBeNull();
    if (result === null) return;
    expect(result.value).toBe('x');
  });
});

describe('findAllMentions', () => {
  it('returns empty array for empty input', () => {
    expect(findAllMentions('')).toEqual([]);
  });

  it('returns empty array when no @ tokens', () => {
    expect(findAllMentions('plain message')).toEqual([]);
  });

  it('finds multiple mentions in order', () => {
    const text = 'See @README.md and @src/main/index.ts and @session:abc';
    const result = findAllMentions(text);
    expect(result).toHaveLength(3);
    expect(result[0]?.value).toBe('README.md');
    expect(result[0]?.kind).toBe('file');
    expect(result[1]?.value).toBe('src/main/index.ts');
    expect(result[1]?.kind).toBe('file');
    expect(result[2]?.value).toBe('abc');
    expect(result[2]?.kind).toBe('session');
  });

  it('skips bare @ (no query)', () => {
    const text = 'Look @ here and @file.ts';
    const result = findAllMentions(text);
    expect(result).toHaveLength(1);
    expect(result[0]?.value).toBe('file.ts');
  });

  it('skips email-like @host (not preceded by whitespace)', () => {
    const text = 'mail user@host.com and @real';
    const result = findAllMentions(text);
    expect(result).toHaveLength(1);
    expect(result[0]?.value).toBe('real');
  });

  it('start/end correctly slice each mention', () => {
    const text = 'A @foo B';
    const result = findAllMentions(text);
    expect(result).toHaveLength(1);
    const m = result[0];
    expect(m).toBeDefined();
    if (m === undefined) return;
    expect(text.slice(m.start, m.end)).toBe('@foo');
  });

  it('@ at start of text is detected', () => {
    const text = '@first thing';
    const result = findAllMentions(text);
    expect(result).toHaveLength(1);
    expect(result[0]?.value).toBe('first');
    expect(result[0]?.start).toBe(0);
  });

  it('multiple session mentions both classified correctly', () => {
    const text = '@session:abc and @session:xyz';
    const result = findAllMentions(text);
    expect(result).toHaveLength(2);
    expect(result.map((m) => m.kind)).toEqual(['session', 'session']);
    expect(result.map((m) => m.value)).toEqual(['abc', 'xyz']);
  });
});
