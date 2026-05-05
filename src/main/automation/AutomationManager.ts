/**
 * AutomationManager — Bot Automation 시간/webhook trigger (v1.3.7).
 *
 * Spec: docs/v1.x-roadmap.md (P3 v1.3.7 Bot Automation 본격).
 *
 * 본 commit MVP:
 *   - in-memory schedule registry (cron 표현식 단순 — interval ms 기반).
 *   - register(name, intervalMs, handler) / unregister(name).
 *   - start() / stop() — process 생애 동안 setInterval 으로 fire.
 *   - 'webhook' kind 는 stub — 실제 HTTP listener 는 후속.
 *
 * 본 commit 은 사이드바 [자동화] 가짜 완성 해소를 위한 backend 인프라.
 * UI 활성화는 후속.
 */

export type AutomationKind = 'interval' | 'webhook';

export interface AutomationRule {
  name: string;
  kind: AutomationKind;
  /** kind=interval 의 ms. */
  interval_ms?: number;
  /** kind=webhook 의 path (e.g. '/hooks/abc'). 후속 commit 의 HTTP listener 가 mount. */
  webhook_path?: string;
  /** Trigger 시 호출. async 지원. throw 는 audit 만 + 다음 fire 정상 진행. */
  handler: () => Promise<void> | void;
}

export interface AutomationAuditEvent {
  timestamp: string;
  event: 'automation.fired' | 'automation.error';
  rule_name: string;
  duration_ms: number;
  error?: string;
}

export interface AutomationManagerOptions {
  auditSink?: (event: AutomationAuditEvent) => void;
}

export class AutomationManager {
  private readonly rules = new Map<string, AutomationRule>();
  private readonly timers = new Map<string, NodeJS.Timeout>();
  private running = false;
  private readonly auditSink: (event: AutomationAuditEvent) => void;

  constructor(options: AutomationManagerOptions = {}) {
    this.auditSink =
      options.auditSink ??
      ((e): void => {
        if (e.event === 'automation.error') {
          console.error(`[AutomationManager] ${e.rule_name}: ${e.error ?? ''}`);
        }
      });
  }

  register(rule: AutomationRule): void {
    if (rule.name.length === 0) throw new Error('rule.name required');
    if (rule.kind === 'interval' && (rule.interval_ms === undefined || rule.interval_ms <= 0)) {
      throw new Error('interval kind requires interval_ms > 0');
    }
    this.rules.set(rule.name, rule);
    if (this.running && rule.kind === 'interval' && rule.interval_ms !== undefined) {
      this.scheduleInterval(rule, rule.interval_ms);
    }
  }

  unregister(name: string): boolean {
    const had = this.rules.delete(name);
    const timer = this.timers.get(name);
    if (timer !== undefined) {
      clearInterval(timer);
      this.timers.delete(name);
    }
    return had;
  }

  list(): ReadonlyArray<AutomationRule> {
    return Array.from(this.rules.values());
  }

  start(): void {
    if (this.running) return;
    this.running = true;
    for (const rule of this.rules.values()) {
      if (rule.kind === 'interval' && rule.interval_ms !== undefined) {
        this.scheduleInterval(rule, rule.interval_ms);
      }
    }
  }

  stop(): void {
    this.running = false;
    for (const timer of this.timers.values()) {
      clearInterval(timer);
    }
    this.timers.clear();
  }

  /** Test/programmatic — 즉시 1회 fire. */
  async fire(name: string): Promise<void> {
    const rule = this.rules.get(name);
    if (rule === undefined) return;
    await this.runOnce(rule);
  }

  private scheduleInterval(rule: AutomationRule, intervalMs: number): void {
    const timer = setInterval(() => {
      void this.runOnce(rule);
    }, intervalMs);
    this.timers.set(rule.name, timer);
  }

  private async runOnce(rule: AutomationRule): Promise<void> {
    const startedAt = Date.now();
    try {
      await Promise.resolve(rule.handler());
      this.auditSink({
        timestamp: new Date().toISOString(),
        event: 'automation.fired',
        rule_name: rule.name,
        duration_ms: Date.now() - startedAt,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.auditSink({
        timestamp: new Date().toISOString(),
        event: 'automation.error',
        rule_name: rule.name,
        duration_ms: Date.now() - startedAt,
        error: msg,
      });
    }
  }
}
