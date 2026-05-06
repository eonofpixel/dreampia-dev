/**
 * SentryAdapter — Sentry namespace ↔ SentryClientLike 어댑팅 (v1.7.0).
 *
 * 검증:
 *  - initSentry — Sentry.init 호출 + DSN 전달 + SentryClientLike 반환.
 *  - initSentry — 빈 DSN throw.
 *  - initSentryFromEnv — SENTRY_DSN 없으면 null.
 *  - initSentryFromEnv — DSN 있으면 init + environment/release 자동 매핑.
 *  - wrapSentryClient — captureException / captureMessage 위임.
 *  - wrapSentryClient — metrics.distribution 있으면 metricsDistribution wrap.
 *  - wrapSentryClient — metrics 미정 시 metricsDistribution undefined.
 *  - SentrySink + wrapped client 통합 — error/event/metric 라운드트립.
 */

import { describe, it, expect, vi } from 'vitest';
import {
  initSentry,
  initSentryFromEnv,
  wrapSentryClient,
  type SentryNamespaceLike,
} from '../../src/main/telemetry/SentryAdapter';
import { SentrySink, Telemetry } from '../../src/main/telemetry/Telemetry';

function makeFakeSentry(opts: { hasMetrics?: boolean } = {}): SentryNamespaceLike & {
  initCalls: Array<{ dsn: string; environment?: string; release?: string }>;
  exceptionCalls: Array<{ error: unknown; hint?: unknown }>;
  messageCalls: Array<{ message: string; hint?: unknown }>;
  metricsCalls: Array<{ name: string; value: number; options?: unknown }>;
} {
  const initCalls: Array<{ dsn: string; environment?: string; release?: string }> = [];
  const exceptionCalls: Array<{ error: unknown; hint?: unknown }> = [];
  const messageCalls: Array<{ message: string; hint?: unknown }> = [];
  const metricsCalls: Array<{ name: string; value: number; options?: unknown }> = [];
  const ns: SentryNamespaceLike & {
    initCalls: typeof initCalls;
    exceptionCalls: typeof exceptionCalls;
    messageCalls: typeof messageCalls;
    metricsCalls: typeof metricsCalls;
  } = {
    initCalls,
    exceptionCalls,
    messageCalls,
    metricsCalls,
    init: vi.fn((options) => {
      initCalls.push({
        dsn: options.dsn,
        ...(options.environment !== undefined && { environment: String(options.environment) }),
        ...(options.release !== undefined && { release: String(options.release) }),
      });
    }),
    captureException: vi.fn((error, hint) => {
      exceptionCalls.push({ error, ...(hint !== undefined && { hint }) });
      return 'evt-x';
    }),
    captureMessage: vi.fn((message, hint) => {
      messageCalls.push({ message, ...(hint !== undefined && { hint }) });
      return 'evt-m';
    }),
  };
  if (opts.hasMetrics === true) {
    ns.metrics = {
      distribution: vi.fn((name, value, options) => {
        metricsCalls.push({ name, value, ...(options !== undefined && { options }) });
      }),
    };
  }
  return ns;
}

describe('v1.7.0 — SentryAdapter', () => {
  it('initSentry — DSN 전달 + SentryClientLike 반환', () => {
    const ns = makeFakeSentry();
    const client = initSentry(ns, {
      dsn: 'https://abc@o0.ingest.sentry.io/1',
      environment: 'production',
      release: 'dreampia-dev@1.7.0',
    });
    expect(ns.initCalls.length).toBe(1);
    expect(ns.initCalls[0]!.dsn).toBe('https://abc@o0.ingest.sentry.io/1');
    expect(ns.initCalls[0]!.environment).toBe('production');
    expect(ns.initCalls[0]!.release).toBe('dreampia-dev@1.7.0');
    expect(typeof client.captureException).toBe('function');
    expect(typeof client.captureMessage).toBe('function');
  });

  it('initSentry — 빈 DSN throw', () => {
    const ns = makeFakeSentry();
    expect(() => initSentry(ns, { dsn: '' })).toThrow(/DSN required/);
  });

  it('initSentryFromEnv — DSN 미정 → null', () => {
    const ns = makeFakeSentry();
    const result = initSentryFromEnv(ns, {} as NodeJS.ProcessEnv);
    expect(result).toBeNull();
    expect(ns.initCalls.length).toBe(0);
  });

  it('initSentryFromEnv — SENTRY_DSN + ENVIRONMENT + RELEASE 매핑', () => {
    const ns = makeFakeSentry();
    const env = {
      SENTRY_DSN: 'https://x@o0.ingest.sentry.io/1',
      SENTRY_ENVIRONMENT: 'staging',
      SENTRY_RELEASE: 'app@2.0',
      NODE_ENV: 'production',
    } as NodeJS.ProcessEnv;
    const client = initSentryFromEnv(ns, env);
    expect(client).not.toBeNull();
    expect(ns.initCalls[0]!.environment).toBe('staging'); // SENTRY_ENVIRONMENT 우선
    expect(ns.initCalls[0]!.release).toBe('app@2.0');
  });

  it('initSentryFromEnv — SENTRY_ENVIRONMENT 없으면 NODE_ENV fallback', () => {
    const ns = makeFakeSentry();
    initSentryFromEnv(ns, {
      SENTRY_DSN: 'https://x@o0.ingest.sentry.io/1',
      NODE_ENV: 'development',
    } as NodeJS.ProcessEnv);
    expect(ns.initCalls[0]!.environment).toBe('development');
  });

  it('wrapSentryClient — captureException / captureMessage 위임', () => {
    const ns = makeFakeSentry();
    const client = wrapSentryClient(ns);
    client.captureException(new Error('boom'), { tags: { x: '1' } });
    client.captureMessage('hi', { level: 'info', tags: { y: '2' } });
    expect(ns.exceptionCalls.length).toBe(1);
    expect(ns.messageCalls.length).toBe(1);
    expect((ns.messageCalls[0]!.hint as { level?: string }).level).toBe('info');
  });

  it('wrapSentryClient — metrics 있으면 metricsDistribution wrap', () => {
    const ns = makeFakeSentry({ hasMetrics: true });
    const client = wrapSentryClient(ns);
    expect(typeof client.metricsDistribution).toBe('function');
    client.metricsDistribution!('m', 7, { tags: { p: 'q' } });
    expect(ns.metricsCalls.length).toBe(1);
    expect(ns.metricsCalls[0]!.name).toBe('m');
    expect(ns.metricsCalls[0]!.value).toBe(7);
  });

  it('wrapSentryClient — metrics 미정 시 metricsDistribution undefined', () => {
    const ns = makeFakeSentry({ hasMetrics: false });
    const client = wrapSentryClient(ns);
    expect(client.metricsDistribution).toBeUndefined();
  });

  it('SentrySink + wrapped client 통합 — error/event/metric round-trip', () => {
    const ns = makeFakeSentry({ hasMetrics: true });
    const client = wrapSentryClient(ns);
    const sink = new SentrySink(client);
    const tel = new Telemetry({ sink, enabled: true });
    tel.error('e1', new Error('boom'), { tool: 'fs' });
    tel.event('ev1', { theme: 'dark' });
    tel.metric('m1', 42, { provider: 'claude' });
    expect(ns.exceptionCalls.length).toBe(1);
    expect(ns.messageCalls.length).toBe(1);
    expect(ns.metricsCalls.length).toBe(1);
    expect(ns.metricsCalls[0]!.name).toBe('m1');
    expect(ns.metricsCalls[0]!.value).toBe(42);
  });
});
