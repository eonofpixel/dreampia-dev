/**
 * Telemetry — Sentry / 사용자 텔레메트리 stub (v1.3.6).
 *
 * Spec: docs/v1.x-roadmap.md (P3 v1.3.6 운영 안정성).
 *
 * 본 commit 은 인터페이스 + console fallback 만. 실제 Sentry SDK 통합은
 * 후속 PR (env DSN + opt-in flag 검토 후).
 *
 * 정책 (Codex 권고):
 *  - opt-in 만 — settings.telemetry_enabled === true 인 경우만 emit.
 *  - PII X — session_id 같은 IDs 는 hash, 사용자 입력 텍스트 는 X.
 *  - error / event / metric 3 종.
 */

export type TelemetryKind = 'error' | 'event' | 'metric';

export interface TelemetryRecord {
  kind: TelemetryKind;
  /** 식별자 (e.g. 'session.created', 'tool.failed'). */
  name: string;
  /** Free-form context — PII 금지. number/boolean/string scalar 만 권고. */
  context?: Record<string, string | number | boolean>;
  /** error kind 의 stack — pass-through. */
  error?: string;
}

export interface TelemetrySink {
  emit(record: TelemetryRecord): void;
}

/**
 * Console fallback — 실제 Sentry 미연결 환경에서 debug 용.
 */
class ConsoleSink implements TelemetrySink {
  emit(r: TelemetryRecord): void {
    if (r.kind === 'error') {
      console.error(`[telemetry.error] ${r.name}: ${r.error ?? ''}`, r.context ?? {});
    }
    // event/metric 은 console.debug — production noise 방지.
  }
}

// ────────────────────────────────────────────────────────────
// v1.7.1 — Sentry sink (dependency-injected client interface)
//
// 실제 @sentry/electron / @sentry/node SDK 는 v1.7.0 에서 install + 초기화.
// 본 sink 는 그 SDK 가 노출하는 api 의 narrow interface (`SentryClientLike`)
// 만 의존 — 런타임에 SDK 가 있으면 client 주입, 없으면 ConsoleSink 로 fallback.
//
// 본 분리는 두 가지 이점:
//  - Test 가 SDK 없이 SentrySink 동작 검증 가능 (mock client 주입).
//  - SDK 업그레이드 / 교체 시 본 코드 변경 X (interface 만 안정).
// ────────────────────────────────────────────────────────────

export interface SentryClientLike {
  /** error kind — `Sentry.captureException` 와 호환. */
  captureException(error: Error | string, hint?: { tags?: Record<string, string>; extra?: Record<string, unknown> }): void;
  /** event kind — `Sentry.captureMessage` 와 호환. */
  captureMessage(
    message: string,
    hint?: {
      level?: 'debug' | 'info' | 'warning' | 'error';
      tags?: Record<string, string>;
      extra?: Record<string, unknown>;
    }
  ): void;
  /**
   * metric kind — Sentry Metrics API. 모든 SDK 버전이 지원하지는 않으므로
   * 본 메서드가 없으면 SentrySink 가 captureMessage 로 fallback.
   */
  metricsDistribution?: (
    name: string,
    value: number,
    options?: { tags?: Record<string, string> }
  ) => void;
}

/**
 * SentryClientLike 의 모든 메서드를 구현해 SentrySink 에 주입.
 *
 * - `error` → `captureException` (error 가 string 이면 string).
 * - `event` → `captureMessage(level=info)`.
 * - `metric` → `metricsDistribution` 있으면 그것, 아니면 captureMessage(level=debug).
 *
 * Context 는 tags / extra 로 분리:
 *  - 짧은 string scalar 는 tags (Sentry 에서 indexed search 가능).
 *  - 길거나 number/boolean 은 extra (검색 X, 본문에 표시).
 */
export class SentrySink implements TelemetrySink {
  constructor(private readonly client: SentryClientLike) {}

  emit(record: TelemetryRecord): void {
    const { tags, extra } = splitContext(record.context);
    if (record.kind === 'error') {
      const err = record.error ?? record.name;
      this.client.captureException(err, { tags, extra: { ...extra, name: record.name } });
      return;
    }
    if (record.kind === 'metric') {
      const valueRaw = record.context?.['value'];
      const value = typeof valueRaw === 'number' ? valueRaw : 0;
      if (typeof this.client.metricsDistribution === 'function') {
        this.client.metricsDistribution(record.name, value, { tags });
        return;
      }
      // SDK 가 metrics 미지원 → captureMessage(debug) 로 fallback.
      this.client.captureMessage(`[metric] ${record.name}=${value}`, {
        level: 'debug',
        tags,
        extra,
      });
      return;
    }
    // event
    this.client.captureMessage(record.name, { level: 'info', tags, extra });
  }
}

/**
 * Context 의 string 값 (≤ 64자) 은 tags 로, 그 외 (긴 string / number / boolean)
 * 는 extra 로 분리. Sentry tag 는 indexable 하지만 길이/타입 제약 있음.
 */
function splitContext(
  ctx: Record<string, string | number | boolean> | undefined
): { tags?: Record<string, string>; extra?: Record<string, unknown> } {
  if (ctx === undefined) return {};
  const tags: Record<string, string> = {};
  const extra: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(ctx)) {
    if (typeof v === 'string' && v.length <= 64) {
      tags[k] = v;
    } else {
      extra[k] = v;
    }
  }
  const out: { tags?: Record<string, string>; extra?: Record<string, unknown> } = {};
  if (Object.keys(tags).length > 0) out.tags = tags;
  if (Object.keys(extra).length > 0) out.extra = extra;
  return out;
}

export class Telemetry {
  private sink: TelemetrySink;
  private enabled: boolean;

  constructor(options: { sink?: TelemetrySink; enabled?: boolean } = {}) {
    this.sink = options.sink ?? new ConsoleSink();
    this.enabled = options.enabled ?? false;
  }

  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
  }

  isEnabled(): boolean {
    return this.enabled;
  }

  error(name: string, error: string | Error, context?: Record<string, string | number | boolean>): void {
    if (!this.enabled) return;
    const errStr = error instanceof Error ? error.stack ?? error.message : error;
    this.sink.emit({ kind: 'error', name, error: errStr, ...(context !== undefined && { context }) });
  }

  event(name: string, context?: Record<string, string | number | boolean>): void {
    if (!this.enabled) return;
    this.sink.emit({ kind: 'event', name, ...(context !== undefined && { context }) });
  }

  metric(name: string, value: number, context?: Record<string, string | number | boolean>): void {
    if (!this.enabled) return;
    const merged = { ...(context ?? {}), value };
    this.sink.emit({ kind: 'metric', name, context: merged });
  }
}

/** Singleton — main process 전용. */
let _instance: Telemetry | null = null;

export function getTelemetry(): Telemetry {
  if (_instance === null) {
    _instance = new Telemetry();
  }
  return _instance;
}

/** Test/shutdown reset. */
export function resetTelemetryForTesting(): void {
  _instance = null;
}
