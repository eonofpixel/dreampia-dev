/**
 * JsonlParser test — round5-bugs.md 기반 강건성 검증.
 */

import { describe, it, expect } from 'vitest';
import { JsonlParser } from '../../../src/providers/cli/jsonlParser';

describe('JsonlParser', () => {
  it('returns empty array for empty input', () => {
    const p = new JsonlParser();
    expect(p.push('')).toEqual([]);
    expect(p.flush()).toEqual([]);
  });

  it('parses a single JSON line ending with newline', () => {
    const p = new JsonlParser();
    const out = p.push('{"foo":1}\n');
    expect(out).toEqual([{ foo: 1 }]);
  });

  it('parses two lines in one chunk', () => {
    const p = new JsonlParser();
    const out = p.push('{"a":1}\n{"b":2}\n');
    expect(out).toEqual([{ a: 1 }, { b: 2 }]);
  });

  it('reassembles a JSON object split across chunks', () => {
    const p = new JsonlParser();
    expect(p.push('{"foo":')).toEqual([]);
    expect(p.push('"bar"}')).toEqual([]);
    expect(p.push('\n')).toEqual([{ foo: 'bar' }]);
  });

  it('skips non-JSON preface lines (round5 bug guard)', () => {
    const p = new JsonlParser();
    const out = p.push(
      'Welcome to Claude CLI v0.18.2\n' +
        'Some banner text\n' +
        '{"type":"text_delta","text":"hi"}\n'
    );
    expect(out).toEqual([{ type: 'text_delta', text: 'hi' }]);
  });

  it('skips empty lines', () => {
    const p = new JsonlParser();
    const out = p.push('\n\n{"a":1}\n\n{"b":2}\n');
    expect(out).toEqual([{ a: 1 }, { b: 2 }]);
  });

  it('skips lines that fail JSON.parse', () => {
    const p = new JsonlParser();
    const out = p.push('{not valid json}\n{"good":true}\n');
    expect(out).toEqual([{ good: true }]);
  });

  it('flush() recovers tail without trailing newline', () => {
    const p = new JsonlParser();
    p.push('{"a":1}\n{"b":2}');
    expect(p.flush()).toEqual([{ b: 2 }]);
    expect(p.flush()).toEqual([]); // buffer 가 비워졌으므로 두번째 flush 는 빈 배열
  });

  it('handles mixed valid/invalid lines silently', () => {
    const p = new JsonlParser();
    const out = p.push(
      'SUCCESS: process started\n' +
        '\n' +
        '{"valid":1}\n' +
        '> banner\n' +
        '{"valid":2}\n'
    );
    expect(out).toEqual([{ valid: 1 }, { valid: 2 }]);
  });

  it('skips ANSI / timestamp prefixes that do not start with {/[', () => {
    const p = new JsonlParser();
    const out = p.push(
      '[2026-05-02T10:00:00Z] starting...\n' +
        '[32mOK[0m\n' +
        '{"event":"ok"}\n'
    );
    expect(out).toEqual([{ event: 'ok' }]);
  });

  it('parses array JSON lines (starts with [)', () => {
    const p = new JsonlParser();
    const out = p.push('[1,2,3]\n');
    expect(out).toEqual([[1, 2, 3]]);
  });

  it('handles \\r\\n (Windows) line endings', () => {
    const p = new JsonlParser();
    const out = p.push('{"a":1}\r\n{"b":2}\r\n');
    expect(out).toEqual([{ a: 1 }, { b: 2 }]);
  });
});
