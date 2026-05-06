/**
 * Sentry adapter — `@sentry/node` 의 namespace 를 SentryClientLike interface
 * 로 어댑팅 + DSN 환경변수 기반 부트스트랩 (v1.7.0).
 *
 * Spec: docs/v1.x-roadmap.md (v1.7.0 — Sentry SDK 통합).
 *
 * 구조:
 *   `init(SentryNamespace, options)`
 *      - Sentry.init(dsn, …) 호출
 *      - 같은 namespace 를 SentryClientLike 로 wrap → SentrySink 에 주입.
 *   `initFromEnv(SentryNamespace)`
 *      - SENTRY_DSN env var 가 있으면 init, 없으면 null 반환.
 *      - production 부트스트랩 path.
 *
 * Why dependency injection:
 *   - 본 모듈이 직접 `import * as Sentry from '@sentry/node'` 하면 unit test
 *     가 SDK 의 init 부작용을 피하기 어렵다. Caller (main/index.ts) 가 import
 *     해서 namespace 를 넘기면 testable.
 */

import type { SentryClientLike } from './Telemetry';

/**
 * `@sentry/node` 가 노출하는 함수 중 본 어댑터가 사용하는 것들. 광범위한
 * Sentry namespace 전체 import 보다 narrow 한 contract 만 의존.
 */
export interface SentryNamespaceLike {
  init: (options: SentryInitOptionsLike) => void;
  captureException: (
    error: Error | string,
    hint?: SentryHintLike
  ) => unknown;
  captureMessage: (
    message: string,
    levelOrHint?: SentryLevelLike | SentryHintLike
  ) => unknown;
  /**
   * Sentry node SDK 의 `metrics.distribution`. 일부 버전 / 빌드에는 없을 수
   * 있어 optional.
   */
  metrics?: {
    distribution: (
      name: string,
      value: number,
      options?: { tags?: Record<string, string> }
    ) => void;
  };
}

export interface SentryInitOptionsLike {
  dsn: string;
  environment?: string;
  release?: string;
  /**
   * Sample rate for tracing (0..1). 본 어댑터는 error/event 위주라 default 0.
   */
  tracesSampleRate?: number;
  /** 추가 옵션 — Sentry SDK 가 받지 않는 키는 무시. */
  [k: string]: unknown;
}

export interface SentryHintLike {
  level?: SentryLevelLike;
  tags?: Record<string, string>;
  extra?: Record<string, unknown>;
}

export type SentryLevelLike = 'debug' | 'info' | 'warning' | 'error' | 'fatal' | 'log';

export interface InitSentryOptions {
  dsn: string;
  /** e.g. 'production' / 'staging' / 'development'. 미지정 시 NODE_ENV. */
  environment?: string;
  /** 앱 버전 (package.json). Sentry 의 release tracking 에 사용. */
  release?: string;
  tracesSampleRate?: number;
}

/**
 * Sentry namespace + options 를 받아 init + SentryClientLike 어댑터 반환.
 * 본 함수가 init 부작용 발생시 — caller 책임으로 production 1회 호출.
 */
export function initSentry(
  Sentry: SentryNamespaceLike,
  options: InitSentryOptions
): SentryClientLike {
  if (options.dsn.length === 0) {
    throw new Error('Sentry DSN required');
  }
  Sentry.init({
    dsn: options.dsn,
    ...(options.environment !== undefined && { environment: options.environment }),
    ...(options.release !== undefined && { release: options.release }),
    tracesSampleRate: options.tracesSampleRate ?? 0,
  });
  return wrapSentryClient(Sentry);
}

/**
 * 환경변수 기반 부트스트랩 — `SENTRY_DSN` 이 set 되어 있으면 init, 없으면 null.
 * `SENTRY_ENVIRONMENT` / `SENTRY_RELEASE` 도 자동 인식.
 */
export function initSentryFromEnv(
  Sentry: SentryNamespaceLike,
  env: NodeJS.ProcessEnv = process.env
): SentryClientLike | null {
  const dsn = env['SENTRY_DSN'];
  if (typeof dsn !== 'string' || dsn.length === 0) return null;
  const opts: InitSentryOptions = { dsn };
  const environment = env['SENTRY_ENVIRONMENT'] ?? env['NODE_ENV'];
  if (typeof environment === 'string' && environment.length > 0) {
    opts.environment = environment;
  }
  const release = env['SENTRY_RELEASE'];
  if (typeof release === 'string' && release.length > 0) {
    opts.release = release;
  }
  return initSentry(Sentry, opts);
}

/**
 * Sentry namespace 를 SentryClientLike 로 wrap. 본 함수는 init 호출 X —
 * 단순 method dispatch.
 */
export function wrapSentryClient(Sentry: SentryNamespaceLike): SentryClientLike {
  const client: SentryClientLike = {
    captureException: (error, hint) => {
      Sentry.captureException(error, hint);
    },
    captureMessage: (message, hint) => {
      Sentry.captureMessage(message, hint);
    },
  };
  // metrics.distribution 이 namespace 에 있으면 wrap, 없으면 SentrySink 가
  // captureMessage(debug) fallback.
  if (Sentry.metrics?.distribution !== undefined) {
    const dist = Sentry.metrics.distribution;
    client.metricsDistribution = (name, value, options) => {
      dist(name, value, options);
    };
  }
  return client;
}
