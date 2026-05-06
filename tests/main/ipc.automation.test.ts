/**
 * Automation IPC handlers (v1.7.4).
 *
 * 검증:
 *  - automation/list — 빈 목록.
 *  - automation/register — cron rule 등록 + summary 반환.
 *  - automation/register — invalid cron throw → fail.
 *  - automation/register — interval rule.
 *  - automation/unregister — true / 미존재 false.
 *  - automation/get-next-run — valid + invalid.
 *  - automation/fire — no-op handler 실행.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

type Handler = (evt: unknown, ...args: unknown[]) => unknown | Promise<unknown>;
const handlers = new Map<string, Handler>();

const automationUserDataRef = vi.hoisted(() => ({ current: '' }));

vi.mock('electron', () => ({
  app: {
    getVersion: () => '0.0.1-test',
    getPath: () => automationUserDataRef.current,
    isPackaged: false,
  },
  ipcMain: {
    handle: (channel: string, handler: Handler): void => {
      handlers.set(channel, handler);
    },
    removeHandler: (channel: string): void => {
      handlers.delete(channel);
    },
  },
  dialog: { showOpenDialog: vi.fn() },
}));

import { registerIpcHandlers } from '../../src/main/ipc';
import { resetAutomationManagerForTesting } from '../../src/main/automation/AutomationManager';
import type { Result } from '../../src/main/types';

const evt = {} as unknown;

async function call<T>(channel: string, ...args: unknown[]): Promise<T> {
  const h = handlers.get(channel);
  if (h === undefined) throw new Error(`no handler: ${channel}`);
  return (await h(evt, ...args)) as T;
}

interface RuleSummary {
  name: string;
  kind: 'interval' | 'cron' | 'webhook';
  cron_expr?: string;
  next_run: string | null;
}

describe('v1.7.4 — Automation IPC handlers', () => {
  const stubApp = {
    getVersion: () => '0.0.1-test',
    getPath: () => automationUserDataRef.current,
    isPackaged: false,
  } as unknown as Parameters<typeof registerIpcHandlers>[0];

  beforeEach(() => {
    handlers.clear();
    resetAutomationManagerForTesting();
    registerIpcHandlers(stubApp);
  });

  afterEach(() => {
    resetAutomationManagerForTesting();
  });

  it('all 5 channels registered', () => {
    expect(handlers.has('automation/list')).toBe(true);
    expect(handlers.has('automation/register')).toBe(true);
    expect(handlers.has('automation/unregister')).toBe(true);
    expect(handlers.has('automation/fire')).toBe(true);
    expect(handlers.has('automation/get-next-run')).toBe(true);
  });

  it('empty list — no rules registered', async () => {
    const r = await call<Result<RuleSummary[]>>('automation/list');
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value).toEqual([]);
  });

  it('register cron rule + summary 포함 next_run', async () => {
    const reg = await call<Result<RuleSummary>>('automation/register', {
      name: 'wakeup',
      kind: 'cron',
      cron_expr: '0 9 * * *',
    });
    expect(reg.ok).toBe(true);
    if (!reg.ok) return;
    expect(reg.value.name).toBe('wakeup');
    expect(reg.value.kind).toBe('cron');
    expect(reg.value.cron_expr).toBe('0 9 * * *');
    expect(reg.value.next_run).not.toBeNull();
    expect(reg.value.next_run).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it('register invalid cron → fail', async () => {
    const reg = await call<Result<RuleSummary>>('automation/register', {
      name: 'bad',
      kind: 'cron',
      cron_expr: 'not a cron',
    });
    expect(reg.ok).toBe(false);
  });

  it('register interval rule', async () => {
    const reg = await call<Result<RuleSummary>>('automation/register', {
      name: 'iv',
      kind: 'interval',
      interval_ms: 60_000,
    });
    expect(reg.ok).toBe(true);
    if (!reg.ok) return;
    expect(reg.value.kind).toBe('interval');
    expect(reg.value.next_run).toBeNull();
  });

  it('register webhook rule', async () => {
    const reg = await call<Result<RuleSummary>>('automation/register', {
      name: 'wh',
      kind: 'webhook',
      webhook_path: '/hooks/wh',
    });
    expect(reg.ok).toBe(true);
  });

  it('register name 빈 문자열 → fail', async () => {
    const reg = await call<Result<RuleSummary>>('automation/register', {
      name: '',
      kind: 'cron',
      cron_expr: '* * * * *',
    });
    expect(reg.ok).toBe(false);
  });

  it('unregister — true / 미존재 false', async () => {
    await call('automation/register', {
      name: 'x',
      kind: 'cron',
      cron_expr: '* * * * *',
    });
    const u1 = await call<Result<{ removed: boolean }>>('automation/unregister', 'x');
    expect(u1.ok).toBe(true);
    if (!u1.ok) return;
    expect(u1.value.removed).toBe(true);

    const u2 = await call<Result<{ removed: boolean }>>('automation/unregister', 'x');
    expect(u2.ok).toBe(true);
    if (!u2.ok) return;
    expect(u2.value.removed).toBe(false);
  });

  it('list — 등록된 rules 반환', async () => {
    await call('automation/register', {
      name: 'a',
      kind: 'interval',
      interval_ms: 1000,
    });
    await call('automation/register', {
      name: 'b',
      kind: 'webhook',
      webhook_path: '/hooks/b',
    });
    const r = await call<Result<RuleSummary[]>>('automation/list');
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.length).toBe(2);
    expect(r.value.map((x) => x.name).sort()).toEqual(['a', 'b']);
  });

  it('get-next-run — valid expr + tz', async () => {
    const r = await call<Result<{ next_run: string | null }>>(
      'automation/get-next-run',
      '0 9 * * *',
      'Asia/Seoul'
    );
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.next_run).not.toBeNull();
  });

  it('get-next-run — invalid → null', async () => {
    const r = await call<Result<{ next_run: string | null }>>(
      'automation/get-next-run',
      'not a cron'
    );
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.next_run).toBeNull();
  });

  it('fire — 등록된 rule 실행 (no-op handler)', async () => {
    await call('automation/register', {
      name: 'noop',
      kind: 'cron',
      cron_expr: '* * * * *',
    });
    const r = await call<Result<void>>('automation/fire', 'noop');
    expect(r.ok).toBe(true);
  });

  it('fire — 빈 name → fail', async () => {
    const r = await call<Result<void>>('automation/fire', '');
    expect(r.ok).toBe(false);
  });

  it('register → settings.json 에 영속 (v1.7.14)', async () => {
    await call('automation/register', {
      name: 'persisted-1',
      kind: 'cron',
      cron_expr: '0 9 * * *',
      cron_tz: 'Asia/Seoul',
    });
    // settings.json 읽어서 automation_rules 가 있는지 확인.
    const { readSettings, __resetSettingsCache } = await import(
      '../../src/main/settings'
    );
    __resetSettingsCache();
    const settings = readSettings();
    expect(settings.automation_rules).toBeDefined();
    expect(settings.automation_rules!.length).toBe(1);
    expect(settings.automation_rules![0]!.name).toBe('persisted-1');
    expect(settings.automation_rules![0]!.kind).toBe('cron');
    expect(settings.automation_rules![0]!.cron_expr).toBe('0 9 * * *');
    expect(settings.automation_rules![0]!.cron_tz).toBe('Asia/Seoul');
  });

  it('unregister → settings 에서도 제거 (v1.7.14)', async () => {
    await call('automation/register', {
      name: 'will-remove',
      kind: 'interval',
      interval_ms: 5000,
    });
    await call('automation/unregister', 'will-remove');
    const { readSettings, __resetSettingsCache } = await import(
      '../../src/main/settings'
    );
    __resetSettingsCache();
    const settings = readSettings();
    // 다른 rule 들도 있을 수 있어 정확 비교 X — 'will-remove' 만 없으면 OK.
    const names = (settings.automation_rules ?? []).map((r) => r.name);
    expect(names).not.toContain('will-remove');
  });
});
