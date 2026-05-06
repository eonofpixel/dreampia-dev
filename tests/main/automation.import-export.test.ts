/**
 * v1.7.28 — Automation rules JSON import/export.
 *
 * 검증:
 *  - exportAutomationRulesJson — empty manager 정상.
 *  - export → import roundtrip — 동일 rule set 복원.
 *  - import — invalid JSON 거부 (errors → fail).
 *  - import — name 충돌 시 skip (overwrite=false).
 *  - import — handler_name 미지정 → noop-log fallback.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { AutomationManager } from '../../src/main/automation/AutomationManager';
import { registerBuiltinHandlers } from '../../src/main/automation/handlers';
import {
  exportAutomationRulesJson,
  importAutomationRulesJson,
} from '../../src/main/ipc';

describe('v1.7.28 — Automation rules JSON import/export', () => {
  beforeEach(() => {
    registerBuiltinHandlers();
  });

  it('export — empty manager → version 1, rules=[]', () => {
    const mgr = new AutomationManager();
    const out = exportAutomationRulesJson(mgr);
    const parsed = JSON.parse(out) as {
      version: number;
      exported_at: string;
      rules: unknown[];
    };
    expect(parsed.version).toBe(1);
    expect(parsed.rules).toEqual([]);
    expect(parsed.exported_at).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it('export → import roundtrip — 동일 rule set 복원', () => {
    const src = new AutomationManager();
    src.register({
      name: 'r1',
      kind: 'interval',
      interval_ms: 30_000,
      handler: async () => undefined,
      handler_name: 'noop-log',
    });
    src.register({
      name: 'r2',
      kind: 'cron',
      cron_expr: '0 9 * * 1-5',
      cron_tz: 'Asia/Seoul',
      handler: async () => undefined,
      handler_name: 'noop-log',
      enabled: false,
    });
    const json = exportAutomationRulesJson(src);

    const dst = new AutomationManager();
    const r = importAutomationRulesJson(dst, json, false);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.added).toBe(2);
    expect(r.value.skipped).toBe(0);
    expect(r.value.errors).toEqual([]);
    expect(dst.list().map((rl) => rl.name).sort()).toEqual(['r1', 'r2']);
    const r2 = dst.list().find((rl) => rl.name === 'r2');
    expect(r2?.enabled).toBe(false);
    expect(r2?.cron_expr).toBe('0 9 * * 1-5');
    expect(r2?.cron_tz).toBe('Asia/Seoul');
  });

  it('import — invalid JSON 거부', () => {
    const mgr = new AutomationManager();
    const r = importAutomationRulesJson(mgr, '{ not valid json', false);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error).toContain('invalid JSON');
  });

  it('import — { rules: [...] } shape 강제', () => {
    const mgr = new AutomationManager();
    const r = importAutomationRulesJson(mgr, JSON.stringify({}), false);
    expect(r.ok).toBe(false);
  });

  it('import — name 충돌 시 skip (overwrite=false)', () => {
    const mgr = new AutomationManager();
    mgr.register({
      name: 'dup',
      kind: 'interval',
      interval_ms: 1000,
      handler: async () => undefined,
      handler_name: 'noop-log',
    });
    const json = JSON.stringify({
      version: 1,
      rules: [
        { name: 'dup', kind: 'interval', interval_ms: 5000, handler_name: 'noop-log' },
        { name: 'fresh', kind: 'interval', interval_ms: 5000, handler_name: 'noop-log' },
      ],
    });
    const r = importAutomationRulesJson(mgr, json, false);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.added).toBe(1);
    expect(r.value.skipped).toBe(1);
    // dup 의 interval_ms 는 1000 그대로 (skip).
    expect(mgr.list().find((rl) => rl.name === 'dup')?.interval_ms).toBe(1000);
    expect(mgr.list().find((rl) => rl.name === 'fresh')?.interval_ms).toBe(5000);
  });

  it('import — overwrite=true 면 기존 rule 교체', () => {
    const mgr = new AutomationManager();
    mgr.register({
      name: 'dup',
      kind: 'interval',
      interval_ms: 1000,
      handler: async () => undefined,
      handler_name: 'noop-log',
    });
    const json = JSON.stringify({
      version: 1,
      rules: [
        { name: 'dup', kind: 'interval', interval_ms: 9999, handler_name: 'noop-log' },
      ],
    });
    const r = importAutomationRulesJson(mgr, json, true);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.added).toBe(1);
    expect(mgr.list().find((rl) => rl.name === 'dup')?.interval_ms).toBe(9999);
  });

  it('import — handler_name 미지정 → noop-log fallback (errors 없음)', () => {
    const mgr = new AutomationManager();
    const json = JSON.stringify({
      version: 1,
      rules: [{ name: 'no-handler', kind: 'interval', interval_ms: 1000 }],
    });
    const r = importAutomationRulesJson(mgr, json, false);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.added).toBe(1);
    expect(r.value.errors).toEqual([]);
    expect(mgr.list().find((rl) => rl.name === 'no-handler')?.handler_name).toBe(
      'noop-log'
    );
  });

  it('import — invalid kind 는 errors[] 누적, 다른 rule 은 진행', () => {
    const mgr = new AutomationManager();
    const json = JSON.stringify({
      version: 1,
      rules: [
        { name: 'bad', kind: 'unknown' },
        { name: 'good', kind: 'interval', interval_ms: 5000, handler_name: 'noop-log' },
      ],
    });
    const r = importAutomationRulesJson(mgr, json, false);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.added).toBe(1);
    expect(r.value.errors.length).toBe(1);
    expect(r.value.errors[0]).toContain('bad');
  });
});
