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
