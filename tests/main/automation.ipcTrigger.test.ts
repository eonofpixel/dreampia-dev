/**
 * v1.7.25 — IPC trigger handler.
 *
 * 검증:
 *  - emitter 미주입 → ok=false.
 *  - channel 누락 → ok=false.
 *  - allow-list 위반 (automation/ prefix 없음) → ok=false.
 *  - 정상 emit → ok=true + emitter 호출 인자 검증.
 *  - payload 직렬화 불가 (circular) → ok=false.
 *  - emitter throw → ok=false.
 *  - registerBuiltinHandlers 가 'ipc-trigger' 등록.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

import {
  ipcTriggerHandler,
  setIpcTriggerEmitterForTesting,
  IPC_TRIGGER_HANDLER_NAME,
} from '../../src/main/automation/handlers/ipcTriggerHandler';
import {
  registerBuiltinHandlers,
  resetBuiltinHandlersForTesting,
  handlerRegistry,
} from '../../src/main/automation/handlers';

describe('v1.7.25 — ipcTriggerHandler', () => {
  beforeEach(() => {
    setIpcTriggerEmitterForTesting(null);
  });

  it('emitter 미주입 → ok=false', async () => {
    const r = await ipcTriggerHandler({
      rule_name: 'r',
      config: { channel: 'automation/test' },
    });
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/emitter not configured/);
  });

  it('channel 누락 → ok=false', async () => {
    setIpcTriggerEmitterForTesting(vi.fn());
    const r = await ipcTriggerHandler({ rule_name: 'r', config: {} });
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/channel required/);
  });

  it('allow-list 위반 → ok=false', async () => {
    setIpcTriggerEmitterForTesting(vi.fn());
    const r = await ipcTriggerHandler({
      rule_name: 'r',
      config: { channel: 'permission/respond' },
    });
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/automation\//);
  });

  it('정상 emit → ok=true + 인자 검증', async () => {
    const fakeEmit = vi.fn();
    setIpcTriggerEmitterForTesting(fakeEmit);
    const r = await ipcTriggerHandler({
      rule_name: 'morning-briefing',
      config: { channel: 'automation/notify', payload: { msg: 'hi' } },
    });
    expect(r.ok).toBe(true);
    expect(fakeEmit).toHaveBeenCalledTimes(1);
    expect(fakeEmit).toHaveBeenCalledWith('automation/notify', { msg: 'hi' });
    expect(r.output).toContain('automation/notify');
    expect(r.output).toContain('hi');
  });

  it('payload undefined — emit 정상', async () => {
    const fakeEmit = vi.fn();
    setIpcTriggerEmitterForTesting(fakeEmit);
    const r = await ipcTriggerHandler({
      rule_name: 'r',
      config: { channel: 'automation/ping' },
    });
    expect(r.ok).toBe(true);
    expect(fakeEmit).toHaveBeenCalledWith('automation/ping', undefined);
  });

  it('payload 직렬화 불가 (circular) → ok=false', async () => {
    setIpcTriggerEmitterForTesting(vi.fn());
    const circular: Record<string, unknown> = { name: 'foo' };
    circular['self'] = circular;
    const r = await ipcTriggerHandler({
      rule_name: 'r',
      config: { channel: 'automation/x', payload: circular },
    });
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/not serializable/);
  });

  it('emitter throw → ok=false', async () => {
    setIpcTriggerEmitterForTesting(() => {
      throw new Error('window destroyed');
    });
    const r = await ipcTriggerHandler({
      rule_name: 'r',
      config: { channel: 'automation/test' },
    });
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/window destroyed/);
  });
});

describe('v1.7.25 — registerBuiltinHandlers includes ipc-trigger', () => {
  beforeEach(() => {
    resetBuiltinHandlersForTesting();
  });

  it('ipc-trigger 등록됨', () => {
    registerBuiltinHandlers();
    expect(handlerRegistry.has(IPC_TRIGGER_HANDLER_NAME)).toBe(true);
  });

  it('전체 builtin 4개 등록 — noop-log / llm-prompt / shell-exec / ipc-trigger', () => {
    registerBuiltinHandlers();
    const list = handlerRegistry.list();
    expect(list).toContain('noop-log');
    expect(list).toContain('llm-prompt');
    expect(list).toContain('shell-exec');
    expect(list).toContain('ipc-trigger');
  });
});
