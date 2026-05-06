/**
 * Telemetry bootstrap — main process 시작 시 1회 호출 (v1.7.0 production wiring).
 *
 * 동작:
 *  - SENTRY_DSN env var 있으면 @sentry/node 로 init + SentrySink 어댑팅 →
 *    Telemetry singleton 의 sink 로 주입.
 *  - 없으면 console fallback 유지.
 *  - Telemetry.enabled 는 settings.telemetry_enabled === true 여야 emit.
 *    (사용자 opt-in 정책 보존.)
 *
 * 실패 안전:
 *  - @sentry/node import / init 자체가 throw 해도 main bootstrap 은 계속.
 *    Telemetry 는 ConsoleSink 로 fallback.
 *  - sink 가 throw 해도 application 계속 (Telemetry.error/event/metric 안에서
 *    이미 catch).
 */

import { Telemetry, SentrySink } from './Telemetry';
import { initSentryFromEnv, type SentryNamespaceLike } from './SentryAdapter';

/**
 * Bootstrap result — main 의 후속 코드가 결과 분기 가능.
 *  - sentry: Sentry 초기화 성공 여부.
 *  - reason: sentry=false 일 때 이유 (DSN missing / init failed / SDK missing).
 */
export interface TelemetryBootstrapResult {
  sentry: boolean;
  reason?: string;
}

export interface TelemetryBootstrapOptions {
  /**
   * Singleton telemetry — caller 가 `getTelemetry()` 결과를 전달. Test 에서
   * fresh instance 주입 가능.
   */
  telemetry: Telemetry;
  /**
   * @sentry/node namespace. Production 은 `import * as Sentry from '@sentry/node'`,
   * 미주입 시 dynamic import 시도. test 는 mock 주입.
   */
  Sentry?: SentryNamespaceLike;
  /** 환경 변수 — 기본 process.env. */
  env?: NodeJS.ProcessEnv;
  /** settings.telemetry_enabled 값 — true 면 setEnabled(true). */
  enabled?: boolean;
}

/**
 * Init sequence — 안전 fail-soft.
 */
export async function bootstrapTelemetry(
  options: TelemetryBootstrapOptions
): Promise<TelemetryBootstrapResult> {
  const { telemetry, env = process.env, enabled = false } = options;

  telemetry.setEnabled(enabled);

  const dsn = env['SENTRY_DSN'];
  if (typeof dsn !== 'string' || dsn.length === 0) {
    return { sentry: false, reason: 'SENTRY_DSN not set' };
  }

  let Sentry: SentryNamespaceLike | undefined = options.Sentry;
  if (Sentry === undefined) {
    try {
      // Dynamic import — production 만 실 SDK 로딩. test 는 namespace 주입.
      const mod = (await import('@sentry/node')) as unknown as SentryNamespaceLike;
      Sentry = mod;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return { sentry: false, reason: `@sentry/node import failed: ${msg}` };
    }
  }

  try {
    const client = initSentryFromEnv(Sentry, env);
    if (client === null) {
      return { sentry: false, reason: 'initSentryFromEnv returned null' };
    }
    const sink = new SentrySink(client);
    // Telemetry singleton 의 sink 교체 — 본 commit 에서 setSink API 추가.
    telemetry.setSink(sink);
    return { sentry: true };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { sentry: false, reason: `Sentry init failed: ${msg}` };
  }
}
