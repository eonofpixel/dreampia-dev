/**
 * Telemetry bootstrap (v1.7.0 production wiring).
 *
 * 검증:
 *  - SENTRY_DSN 미정 → sentry=false + reason='SENTRY_DSN not set'.
 *  - SENTRY_DSN 있고 Sentry namespace 주입됨 → sentry=true + Sentry.init 호출.
 *  - SDK init throw → sentry=false + reason 메시지.
 *  - enabled=true 전달 시 telemetry.setEnabled(true).
 *  - 성공 후 telemetry.error 호출 → SentrySink 통해 Sentry.captureException.
 */

import { describe, it, expect, vi } from 'vitest';
import { Telemetry } from '../../src/main/telemetry/Telemetry';
import { bootstrapTelemetry } from '../../src/main/telemetry/bootstrap';
import type { SentryNamespaceLike } from '../../src/main/telemetry/SentryAdapter';

function makeFakeSentry(): SentryNamespaceLike & {
  initCalled: boolean;
  exceptionCalls: unknown[];
} {
  let initCalled = false;
  const exceptionCalls: unknown[] = [];
  return {
    initCalled,
    exceptionCalls,
    init: vi.fn(() => {
      initCalled = true;
    }),
    captureException: vi.fn((error) => {
      exceptionCalls.push(error);
    }),
    captureMessage: vi.fn(),
  } as unknown as SentryNamespaceLike & {
    initCalled: boolean;
    exceptionCalls: unknown[];
  };
}

describe('v1.7.0 — bootstrapTelemetry', () => {
  it('SENTRY_DSN 미정 → sentry=false + reason', async () => {
    const tel = new Telemetry();
    const r = await bootstrapTelemetry({
      telemetry: tel,
      env: {} as NodeJS.ProcessEnv,
    });
    expect(r.sentry).toBe(false);
    expect(r.reason).toBe('SENTRY_DSN not set');
  });

  it('Sentry 주입 + DSN 있음 → sentry=true', async () => {
    const Sentry = makeFakeSentry();
    const tel = new Telemetry();
    const r = await bootstrapTelemetry({
      telemetry: tel,
      Sentry,
      env: {
        SENTRY_DSN: 'https://x@o0.ingest.sentry.io/1',
        NODE_ENV: 'production',
      } as NodeJS.ProcessEnv,
    });
    expect(r.sentry).toBe(true);
    expect(Sentry.init).toHaveBeenCalledTimes(1);
  });

  it('Sentry.init throw → sentry=false + reason 메시지', async () => {
    const tel = new Telemetry();
    const Sentry = makeFakeSentry();
    (Sentry.init as unknown as { mockImplementation: (fn: () => void) => void }).mockImplementation(
      () => {
        throw new Error('init exploded');
      }
    );
    const r = await bootstrapTelemetry({
      telemetry: tel,
      Sentry,
      env: {
        SENTRY_DSN: 'https://x@o0.ingest.sentry.io/1',
      } as NodeJS.ProcessEnv,
    });
    expect(r.sentry).toBe(false);
    expect(r.reason).toContain('init exploded');
  });

  it('enabled=true 전달 시 telemetry.setEnabled(true)', async () => {
    const tel = new Telemetry();
    expect(tel.isEnabled()).toBe(false);
    await bootstrapTelemetry({
      telemetry: tel,
      env: {} as NodeJS.ProcessEnv,
      enabled: true,
    });
    expect(tel.isEnabled()).toBe(true);
  });

  it('enabled=false → setEnabled(false) (default)', async () => {
    const tel = new Telemetry({ enabled: true });
    await bootstrapTelemetry({
      telemetry: tel,
      env: {} as NodeJS.ProcessEnv,
      enabled: false,
    });
    expect(tel.isEnabled()).toBe(false);
  });

  it('성공 후 telemetry.error → Sentry.captureException 호출', async () => {
    const Sentry = makeFakeSentry();
    const tel = new Telemetry();
    await bootstrapTelemetry({
      telemetry: tel,
      Sentry,
      env: {
        SENTRY_DSN: 'https://x@o0.ingest.sentry.io/1',
      } as NodeJS.ProcessEnv,
      enabled: true,
    });
    tel.error('boom', new Error('oops'));
    expect(Sentry.captureException).toHaveBeenCalledTimes(1);
  });
});
