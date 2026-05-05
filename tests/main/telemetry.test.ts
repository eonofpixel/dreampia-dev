/**
 * Telemetry unit tests (v1.3.6).
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  Telemetry,
  type TelemetryRecord,
  type TelemetrySink,
  getTelemetry,
  resetTelemetryForTesting,
} from '../../src/main/telemetry/Telemetry';

class CaptureSink implements TelemetrySink {
  records: TelemetryRecord[] = [];
  emit(r: TelemetryRecord): void {
    this.records.push(r);
  }
}

beforeEach(() => {
  resetTelemetryForTesting();
});

describe('v1.3.6 — Telemetry', () => {
  it('disabled (default) — emit X', () => {
    const sink = new CaptureSink();
    const t = new Telemetry({ sink });
    t.error('test', 'boom');
    t.event('test');
    t.metric('test', 1);
    expect(sink.records).toEqual([]);
  });

  it('enabled — error kind 정확', () => {
    const sink = new CaptureSink();
    const t = new Telemetry({ sink, enabled: true });
    t.error('session.failed', 'boom', { session: 'abc' });
    expect(sink.records.length).toBe(1);
    const r = sink.records[0];
    if (r === undefined) throw new Error('no record');
    expect(r.kind).toBe('error');
    expect(r.name).toBe('session.failed');
    expect(r.error).toBe('boom');
    expect(r.context).toEqual({ session: 'abc' });
  });

  it('Error 객체 → stack 보존', () => {
    const sink = new CaptureSink();
    const t = new Telemetry({ sink, enabled: true });
    const e = new Error('xxx');
    t.error('e', e);
    const r = sink.records[0];
    if (r === undefined) throw new Error('no record');
    expect(typeof r.error).toBe('string');
    expect(r.error).toMatch(/xxx/);
  });

  it('event + metric kind', () => {
    const sink = new CaptureSink();
    const t = new Telemetry({ sink, enabled: true });
    t.event('chat.created', { provider: 'claude' });
    t.metric('streaming.duration_ms', 1234, { model: 'claude-sonnet' });
    expect(sink.records.length).toBe(2);
    expect(sink.records[0]?.kind).toBe('event');
    expect(sink.records[1]?.kind).toBe('metric');
    expect(sink.records[1]?.context?.value).toBe(1234);
  });

  it('setEnabled(false) — emit 중단', () => {
    const sink = new CaptureSink();
    const t = new Telemetry({ sink, enabled: true });
    t.event('a');
    t.setEnabled(false);
    t.event('b');
    expect(sink.records.length).toBe(1);
  });

  it('getTelemetry() — singleton', () => {
    const a = getTelemetry();
    const b = getTelemetry();
    expect(a).toBe(b);
  });
});
