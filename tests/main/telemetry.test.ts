/**
 * Telemetry unit tests (v1.3.6).
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { vi } from 'vitest';
import {
  Telemetry,
  type TelemetryRecord,
  type TelemetrySink,
  type SentryClientLike,
  SentrySink,
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

// ────────────────────────────────────────────────────────────
// v1.7.1 — SentrySink
// ────────────────────────────────────────────────────────────

function makeMockClient(): SentryClientLike & {
  capturedExceptions: Array<{ error: Error | string; hint?: object }>;
  capturedMessages: Array<{ message: string; hint?: object }>;
  capturedMetrics: Array<{ name: string; value: number; options?: object }>;
} {
  const exceptions: Array<{ error: Error | string; hint?: object }> = [];
  const messages: Array<{ message: string; hint?: object }> = [];
  const metrics: Array<{ name: string; value: number; options?: object }> = [];
  return {
    capturedExceptions: exceptions,
    capturedMessages: messages,
    capturedMetrics: metrics,
    captureException: vi.fn((error, hint) => {
      exceptions.push({ error, ...(hint !== undefined && { hint }) });
    }),
    captureMessage: vi.fn((message, hint) => {
      messages.push({ message, ...(hint !== undefined && { hint }) });
    }),
    metricsDistribution: vi.fn((name, value, options) => {
      metrics.push({ name, value, ...(options !== undefined && { options }) });
    }),
  };
}

describe('v1.7.1 — SentrySink', () => {
  it('error → captureException with stack/string + tags + extra (with name)', () => {
    const client = makeMockClient();
    const sink = new SentrySink(client);
    const tel = new Telemetry({ sink, enabled: true });
    tel.error('tool.failed', new Error('boom'), {
      tool_id: 'fs.read',
      session: 'sess1',
      retries: 3,
    });
    expect(client.capturedExceptions.length).toBe(1);
    const captured = client.capturedExceptions[0]!;
    // tags: tool_id + session (string short).
    expect((captured.hint as { tags?: Record<string, string> }).tags).toEqual({
      tool_id: 'fs.read',
      session: 'sess1',
    });
    // extra: retries (number) + name (메시지 식별자).
    expect((captured.hint as { extra?: Record<string, unknown> }).extra).toEqual({
      retries: 3,
      name: 'tool.failed',
    });
  });

  it('event → captureMessage with level=info', () => {
    const client = makeMockClient();
    const sink = new SentrySink(client);
    const tel = new Telemetry({ sink, enabled: true });
    tel.event('session.created', { theme: 'dark' });
    expect(client.capturedMessages.length).toBe(1);
    expect(client.capturedMessages[0]!.message).toBe('session.created');
    expect((client.capturedMessages[0]!.hint as { level?: string }).level).toBe('info');
  });

  it('metric → metricsDistribution if available', () => {
    const client = makeMockClient();
    const sink = new SentrySink(client);
    const tel = new Telemetry({ sink, enabled: true });
    tel.metric('turn.duration_ms', 1234, { provider: 'claude' });
    expect(client.capturedMetrics.length).toBe(1);
    expect(client.capturedMetrics[0]!).toMatchObject({
      name: 'turn.duration_ms',
      value: 1234,
    });
    // tag/extra split: provider 는 tag.
    expect(
      (client.capturedMetrics[0]!.options as { tags?: Record<string, string> }).tags
    ).toEqual({ provider: 'claude' });
  });

  it('metric falls back to captureMessage(debug) when SDK has no metricsDistribution', () => {
    const client = makeMockClient();
    delete (client as { metricsDistribution?: unknown }).metricsDistribution;
    const sink = new SentrySink(client);
    const tel = new Telemetry({ sink, enabled: true });
    tel.metric('m', 42);
    expect(client.capturedMessages.length).toBe(1);
    expect(client.capturedMessages[0]!.message).toBe('[metric] m=42');
    expect((client.capturedMessages[0]!.hint as { level?: string }).level).toBe('debug');
  });

  it('long string context goes to extra (not tags) — tag length 가드', () => {
    const client = makeMockClient();
    const sink = new SentrySink(client);
    const tel = new Telemetry({ sink, enabled: true });
    const longStr = 'x'.repeat(200);
    tel.event('e', { short: 'ok', long: longStr });
    const hint = client.capturedMessages[0]!.hint as {
      tags?: Record<string, string>;
      extra?: Record<string, unknown>;
    };
    expect(hint.tags).toEqual({ short: 'ok' });
    expect(hint.extra).toEqual({ long: longStr });
  });

  it('disabled telemetry — sink 호출 X', () => {
    const client = makeMockClient();
    const sink = new SentrySink(client);
    const tel = new Telemetry({ sink, enabled: false });
    tel.error('x', 'err');
    tel.event('y');
    tel.metric('z', 1);
    expect(client.capturedExceptions.length).toBe(0);
    expect(client.capturedMessages.length).toBe(0);
    expect(client.capturedMetrics.length).toBe(0);
  });
});
