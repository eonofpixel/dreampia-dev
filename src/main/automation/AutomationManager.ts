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
 * v1.7.3 — `cron` kind 추가. `croner` 라이브러리로 cron expression parse +
 *  next-fire 계산. 'interval' / 'cron' / 'webhook' 3 종 kind.
 */

import { Cron } from 'croner';

export type AutomationKind = 'interval' | 'cron' | 'webhook';

export interface AutomationRule {
  name: string;
  kind: AutomationKind;
  /** kind=interval 의 ms. */
  interval_ms?: number;
  /**
   * kind=cron 의 표현식 (예: `"0 9 * * 1-5"` — 평일 오전 9시).
   * croner 가 parse 시 throw. timezone 미지정 시 system local TZ.
   */
  cron_expr?: string;
  /** kind=cron 의 timezone (e.g. 'Asia/Seoul', 'UTC'). 미지정 시 local. */
  cron_tz?: string;
  /** kind=webhook 의 path (e.g. '/hooks/abc'). HTTP listener 가 mount. */
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
  /**
   * v1.7.3 — cron kind 의 active job. croner.Cron 인스턴스가 자체 timer 관리.
   * stop / unregister 시 .stop() 호출.
   */
  private readonly cronJobs = new Map<string, Cron>();
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
    if (rule.kind === 'cron') {
      if (rule.cron_expr === undefined || rule.cron_expr.length === 0) {
        throw new Error('cron kind requires cron_expr');
      }
      // 등록 시점에 expression validation (croner 가 throw).
      AutomationManager.validateCronExpr(rule.cron_expr, rule.cron_tz);
    }
    this.rules.set(rule.name, rule);
    if (this.running) {
      if (rule.kind === 'interval' && rule.interval_ms !== undefined) {
        this.scheduleInterval(rule, rule.interval_ms);
      } else if (rule.kind === 'cron' && rule.cron_expr !== undefined) {
        this.scheduleCron(rule, rule.cron_expr, rule.cron_tz);
      }
    }
  }

  unregister(name: string): boolean {
    const had = this.rules.delete(name);
    const timer = this.timers.get(name);
    if (timer !== undefined) {
      clearInterval(timer);
      this.timers.delete(name);
    }
    const job = this.cronJobs.get(name);
    if (job !== undefined) {
      job.stop();
      this.cronJobs.delete(name);
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
      } else if (rule.kind === 'cron' && rule.cron_expr !== undefined) {
        this.scheduleCron(rule, rule.cron_expr, rule.cron_tz);
      }
    }
  }

  stop(): void {
    this.running = false;
    for (const timer of this.timers.values()) {
      clearInterval(timer);
    }
    this.timers.clear();
    for (const job of this.cronJobs.values()) {
      job.stop();
    }
    this.cronJobs.clear();
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

  /**
   * v1.7.3 — cron kind 등록. croner Cron 객체가 자체 timer 관리. options.tz
   * 가 있으면 IANA timezone (e.g. 'Asia/Seoul'), 없으면 system local.
   */
  private scheduleCron(rule: AutomationRule, expr: string, tz?: string): void {
    const job = new Cron(
      expr,
      { ...(tz !== undefined && { timezone: tz }), name: rule.name, paused: false },
      () => {
        void this.runOnce(rule);
      }
    );
    this.cronJobs.set(rule.name, job);
  }

  /**
   * v1.7.3 — 정적 utility: 표현식 + 옵션 timezone 의 다음 fire 시각.
   * 등록 시 사용자 미리보기 / 잘못된 expression 검증에 사용.
   *
   * @returns 다음 fire 의 ISO8601 timestamp, 또는 expression invalid 시 null.
   */
  static getNextRun(expr: string, tz?: string): string | null {
    try {
      const job = new Cron(expr, { ...(tz !== undefined && { timezone: tz }), paused: true });
      const next = job.nextRun();
      job.stop();
      if (next === null) return null;
      return next.toISOString();
    } catch {
      return null;
    }
  }

  private static validateCronExpr(expr: string, tz?: string): void {
    // croner 가 throw 하면 그대로 caller 에 전달 (등록 거절).
    const job = new Cron(expr, { ...(tz !== undefined && { timezone: tz }), paused: true });
    job.stop();
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

// ────────────────────────────────────────────────────────────
// v1.7.4 — Singleton accessor + IPC 직렬화 helpers
// ────────────────────────────────────────────────────────────

let _instance: AutomationManager | null = null;

/**
 * Main process 전용 singleton. IPC handlers + 부팅 시 1회 instantiation.
 * 첫 호출 시 instance 생성 + start(). 후속 호출은 동일 instance.
 */
export function getAutomationManager(): AutomationManager {
  if (_instance === null) {
    _instance = new AutomationManager();
    _instance.start();
  }
  return _instance;
}

/** Test/shutdown reset. */
export function resetAutomationManagerForTesting(): void {
  if (_instance !== null) {
    _instance.stop();
  }
  _instance = null;
}

/**
 * IPC 직렬화 가능한 rule shape. handler 는 closure 라 보낼 수 없어 제외.
 * 대신 next_run (cron) 같은 derived 정보를 동봉 — UI 의 [다음 실행] 표시.
 */
export interface AutomationRuleSummary {
  name: string;
  kind: AutomationKind;
  interval_ms?: number;
  cron_expr?: string;
  cron_tz?: string;
  webhook_path?: string;
  /** kind=cron 일 때 다음 fire ISO timestamp, invalid/미정 시 null. */
  next_run: string | null;
}

export function summarizeRule(rule: AutomationRule): AutomationRuleSummary {
  const summary: AutomationRuleSummary = {
    name: rule.name,
    kind: rule.kind,
    next_run: null,
  };
  if (rule.interval_ms !== undefined) summary.interval_ms = rule.interval_ms;
  if (rule.cron_expr !== undefined) summary.cron_expr = rule.cron_expr;
  if (rule.cron_tz !== undefined) summary.cron_tz = rule.cron_tz;
  if (rule.webhook_path !== undefined) summary.webhook_path = rule.webhook_path;
  if (rule.kind === 'cron' && rule.cron_expr !== undefined) {
    summary.next_run = AutomationManager.getNextRun(rule.cron_expr, rule.cron_tz);
  }
  return summary;
}
