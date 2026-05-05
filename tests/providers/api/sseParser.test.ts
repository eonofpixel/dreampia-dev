/**
 * SSE parser unit tests (v1.2.2).
 */

import { describe, it, expect } from 'vitest';
import { SseParser } from '../../../src/providers/api/sseParser';

function* allOf(parser: SseParser, chunks: string[]) {
  for (const c of chunks) {
    yield* parser.push(c);
  }
  yield* parser.flush();
}

describe('v1.2.2 — SSE parser', () => {
  it('단일 event — data only', () => {
    const events = [...allOf(new SseParser(), ['data: hello\n\n'])];
    expect(events.length).toBe(1);
    expect(events[0]?.event).toBe('message');
    expect(events[0]?.data).toBe('hello');
  });

  it('event + data', () => {
    const events = [...allOf(new SseParser(), ['event: ping\ndata: 123\n\n'])];
    expect(events[0]?.event).toBe('ping');
    expect(events[0]?.data).toBe('123');
  });

  it('multi-line data', () => {
    const events = [...allOf(new SseParser(), ['data: line1\ndata: line2\n\n'])];
    expect(events[0]?.data).toBe('line1\nline2');
  });

  it('chunked input — split mid-event', () => {
    const events = [...allOf(new SseParser(), ['data: ', 'partial', '\n\n'])];
    expect(events[0]?.data).toBe('partial');
  });

  it('CRLF 정규화', () => {
    const events = [...allOf(new SseParser(), ['data: x\r\n\r\n'])];
    expect(events[0]?.data).toBe('x');
  });

  it('comment line 무시', () => {
    const events = [...allOf(new SseParser(), [': heartbeat\ndata: ok\n\n'])];
    expect(events.length).toBe(1);
    expect(events[0]?.data).toBe('ok');
  });

  it('id field', () => {
    const events = [...allOf(new SseParser(), ['id: 42\ndata: x\n\n'])];
    expect(events[0]?.id).toBe('42');
  });

  it('field 가 colon 없음 (field-only)', () => {
    // 명세: `data\n\n` 는 data 필드 (값 빈 문자열).
    const events = [...allOf(new SseParser(), ['data\n\n'])];
    expect(events[0]?.data).toBe('');
  });

  it('value leading space 제거', () => {
    const events = [...allOf(new SseParser(), ['data:  with-space\n\n'])];
    expect(events[0]?.data).toBe(' with-space');
  });

  it('연속된 events', () => {
    const events = [
      ...allOf(new SseParser(), ['data: a\n\ndata: b\n\ndata: c\n\n']),
    ];
    expect(events.map((e) => e.data)).toEqual(['a', 'b', 'c']);
  });

  it('flush 가 미완성 event 강제 emit', () => {
    const parser = new SseParser();
    [...parser.push('data: incomplete\n')];
    const events = [...parser.flush()];
    expect(events[0]?.data).toBe('incomplete');
  });
});
