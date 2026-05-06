/**
 * v1.7.24 — Shell exec handler.
 *
 * 검증:
 *  - shell handler 가 settings.automation_shell_enabled === false 일 때
 *    ok=false + 'disabled' 메시지.
 *  - true 일 때 spawn 호출 + exit 0 → ok=true + output 캡처.
 *  - exit code !== 0 → ok=false + error 캡처 (stderr).
 *  - timeout → SIGKILL + ok=false + 'timeout after Nms'.
 *  - command 누락 → ok=false.
 *  - args / cwd / env / timeout_ms config 전달 검증.
 *  - registerBuiltinHandlers 가 'shell-exec' 등록.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { EventEmitter } from 'node:events';

import {
  shellExecHandler,
  setShellSpawnForTesting,
  setShellSettingsForTesting,
  SHELL_EXEC_HANDLER_NAME,
} from '../../src/main/automation/handlers/shellExecHandler';
import {
  registerBuiltinHandlers,
  resetBuiltinHandlersForTesting,
  handlerRegistry,
} from '../../src/main/automation/handlers';

interface FakeChild extends EventEmitter {
  stdout: EventEmitter;
  stderr: EventEmitter;
  kill: (sig?: string) => boolean;
}

function makeFakeChild(): FakeChild {
  const ee = new EventEmitter() as FakeChild;
  ee.stdout = new EventEmitter();
  ee.stderr = new EventEmitter();
  ee.kill = vi.fn(() => true);
  return ee;
}

describe('v1.7.24 — shellExecHandler', () => {
  beforeEach(() => {
    setShellSpawnForTesting(null);
    setShellSettingsForTesting(null);
  });

  it('settings 비활성 → ok=false + disabled 메시지', async () => {
    setShellSettingsForTesting({ automation_shell_enabled: false });
    const r = await shellExecHandler({
      rule_name: 'r',
      config: { command: 'echo' },
    });
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/disabled/);
  });

  it('command 누락 → ok=false', async () => {
    setShellSettingsForTesting({ automation_shell_enabled: true });
    const r = await shellExecHandler({ rule_name: 'r', config: {} });
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/command required/);
  });

  it('exit 0 + stdout → ok=true + output 캡처', async () => {
    setShellSettingsForTesting({ automation_shell_enabled: true });
    const fake = makeFakeChild();
    setShellSpawnForTesting(() => fake as unknown as import('node:child_process').ChildProcess);

    const promise = shellExecHandler({
      rule_name: 'r',
      config: { command: 'echo', args: ['hello'] },
    });
    setImmediate(() => {
      fake.stdout.emit('data', 'hello\n');
      fake.emit('close', 0);
    });
    const r = await promise;
    expect(r.ok).toBe(true);
    expect(r.output).toContain('exit 0');
    expect(r.output).toContain('hello');
  });

  it('exit 1 + stderr → ok=false + error', async () => {
    setShellSettingsForTesting({ automation_shell_enabled: true });
    const fake = makeFakeChild();
    setShellSpawnForTesting(() => fake as unknown as import('node:child_process').ChildProcess);

    const promise = shellExecHandler({
      rule_name: 'r',
      config: { command: 'false' },
    });
    setImmediate(() => {
      fake.stderr.emit('data', 'something failed');
      fake.emit('close', 1);
    });
    const r = await promise;
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/exit 1/);
    expect(r.error).toMatch(/something failed/);
  });

  it('spawn 즉시 throw (ENOENT) → ok=false', async () => {
    setShellSettingsForTesting({ automation_shell_enabled: true });
    setShellSpawnForTesting(() => {
      throw new Error('spawn ENOENT');
    });
    const r = await shellExecHandler({
      rule_name: 'r',
      config: { command: 'nonexistent-binary' },
    });
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/ENOENT/);
  });

  it('child error 이벤트 → ok=false', async () => {
    setShellSettingsForTesting({ automation_shell_enabled: true });
    const fake = makeFakeChild();
    setShellSpawnForTesting(() => fake as unknown as import('node:child_process').ChildProcess);
    const promise = shellExecHandler({
      rule_name: 'r',
      config: { command: 'echo' },
    });
    setImmediate(() => {
      fake.emit('error', new Error('process crashed'));
    });
    const r = await promise;
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/process crashed/);
  });

  it('timeout → SIGKILL + ok=false', async () => {
    setShellSettingsForTesting({ automation_shell_enabled: true });
    const fake = makeFakeChild();
    setShellSpawnForTesting(() => fake as unknown as import('node:child_process').ChildProcess);

    const r = await shellExecHandler({
      rule_name: 'r',
      config: { command: 'sleep', args: ['100'], timeout_ms: 50 },
    });
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/timeout after 50ms/);
    expect(fake.kill).toHaveBeenCalledWith('SIGKILL');
  });

  it('args / cwd / env 가 spawn 에 전달', async () => {
    setShellSettingsForTesting({ automation_shell_enabled: true });
    const fake = makeFakeChild();
    let capturedCmd = '';
    let capturedArgs: ReadonlyArray<string> = [];
    let capturedCwd: string | undefined;
    let capturedEnv: NodeJS.ProcessEnv | undefined;
    setShellSpawnForTesting((cmd, args, opts) => {
      capturedCmd = cmd;
      capturedArgs = args;
      capturedCwd = opts.cwd;
      capturedEnv = opts.env;
      return fake as unknown as import('node:child_process').ChildProcess;
    });

    const promise = shellExecHandler({
      rule_name: 'r',
      config: {
        command: 'mybin',
        args: ['--flag', 'val'],
        cwd: '/tmp/work',
        env: { CUSTOM_VAR: 'xyz' },
      },
    });
    setImmediate(() => fake.emit('close', 0));
    await promise;

    expect(capturedCmd).toBe('mybin');
    expect(capturedArgs).toEqual(['--flag', 'val']);
    expect(capturedCwd).toBe('/tmp/work');
    expect(capturedEnv?.['CUSTOM_VAR']).toBe('xyz');
    // process.env 와 머지 — 적어도 PATH 같은 기존 var 도 있어야 함.
    expect(Object.keys(capturedEnv ?? {}).length).toBeGreaterThan(1);
  });

  it('args 가 array 가 아닌 값 → 빈 array 로 fallback (injection 방지)', async () => {
    setShellSettingsForTesting({ automation_shell_enabled: true });
    const fake = makeFakeChild();
    let capturedArgs: ReadonlyArray<string> = ['will-be-overwritten'];
    setShellSpawnForTesting((_cmd, args, _opts) => {
      capturedArgs = args;
      return fake as unknown as import('node:child_process').ChildProcess;
    });

    const promise = shellExecHandler({
      rule_name: 'r',
      // args 가 string (array 가 아님) — runtime 에서 무시되어야 함.
      config: { command: 'mybin', args: 'rm -rf /' as unknown as string[] },
    });
    setImmediate(() => fake.emit('close', 0));
    await promise;

    expect(capturedArgs).toEqual([]);
  });
});

describe('v1.7.24 — registerBuiltinHandlers includes shell-exec', () => {
  beforeEach(() => {
    resetBuiltinHandlersForTesting();
  });

  it('shell-exec 등록됨', () => {
    registerBuiltinHandlers();
    expect(handlerRegistry.has(SHELL_EXEC_HANDLER_NAME)).toBe(true);
  });
});
