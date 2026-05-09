/**
 * pluginIsolationTelemetry tests (v2.3.0 US-603).
 *
 * Coverage:
 *   - 3-event hook (spawn / exit / error) emits to sink
 *   - exit captures code + signal + stderr_tail
 *   - decideSpawnFailure: strict = hard-fail
 *   - decideSpawnFailure: in_process = fallback always
 *   - decideSpawnFailure: auto + prior consent = fallback
 *   - decideSpawnFailure: auto + no consent + no prompt = hard-fail (NEVER silent fallback)
 *   - decideSpawnFailure: auto + prompt resolves true = fallback
 *   - decideSpawnFailure: auto + prompt resolves false = hard-fail
 */

import { describe, it, expect } from 'vitest';
import {
  attachIsolationTelemetry,
  decideSpawnFailure,
  type IsolationTelemetryEvent,
  type UtilityProcessLike,
} from '../../../src/main/plugins/pluginIsolationTelemetry';

interface FakeProcess extends UtilityProcessLike {
  fireSpawn: () => void;
  fireExit: (code: number | null, signal?: string | null) => void;
  fireError: (err: Error) => void;
  fireStderr: (chunk: string) => void;
}

function fakeProcess(pid: number): FakeProcess {
  let spawnL: (() => void) | null = null;
  let exitL: ((c: number | null, s?: string | null) => void) | null = null;
  let errorL: ((e: Error) => void) | null = null;
  let stderrL: ((c: Buffer | string) => void) | null = null;
  const p: FakeProcess = {
    pid,
    fireSpawn: () => spawnL?.(),
    fireExit: (c, s) => exitL?.(c, s),
    fireError: (e) => errorL?.(e),
    fireStderr: (c) => stderrL?.(c),
    on: (event, listener): unknown => {
      if (event === 'spawn') spawnL = listener as () => void;
      if (event === 'exit') exitL = listener as (c: number | null, s?: string | null) => void;
      if (event === 'error') errorL = listener as (e: Error) => void;
      return p;
    },
    stderr: {
      on: (_event, listener): unknown => {
        stderrL = listener;
        return p;
      },
    },
  };
  return p;
}

describe('v2.3.0 US-603 — attachIsolationTelemetry 3-event hook', () => {
  it('spawn event emits with pid', () => {
    const events: IsolationTelemetryEvent[] = [];
    const p = fakeProcess(1234);
    attachIsolationTelemetry(p, 'plugin-a', (e) => events.push(e));
    p.fireSpawn();
    const spawn = events.find((e) => e.event === 'spawn');
    expect(spawn).toBeDefined();
    expect(spawn?.pid).toBe(1234);
    expect(spawn?.plugin_id).toBe('plugin-a');
  });

  it('exit event captures code + signal', () => {
    const events: IsolationTelemetryEvent[] = [];
    const p = fakeProcess(1234);
    attachIsolationTelemetry(p, 'plugin-a', (e) => events.push(e));
    p.fireExit(137, 'SIGKILL');
    const exit = events.find((e) => e.event === 'exit');
    expect(exit?.exit_code).toBe(137);
    expect(exit?.signal).toBe('SIGKILL');
  });

  it('error event captures message', () => {
    const events: IsolationTelemetryEvent[] = [];
    const p = fakeProcess(1234);
    attachIsolationTelemetry(p, 'plugin-a', (e) => events.push(e));
    p.fireError(new Error('AV blocked spawn'));
    const err = events.find((e) => e.event === 'error');
    expect(err?.error_message).toBe('AV blocked spawn');
  });

  it('stderr_tail captures last 1KB on exit', () => {
    const events: IsolationTelemetryEvent[] = [];
    const p = fakeProcess(1234);
    attachIsolationTelemetry(p, 'plugin-a', (e) => events.push(e));
    p.fireStderr('x'.repeat(2000));
    p.fireExit(1, null);
    const exit = events.find((e) => e.event === 'exit');
    expect(exit?.stderr_tail?.length).toBe(1024);
  });
});

describe('v2.3.0 US-603 — decideSpawnFailure (G4 codex)', () => {
  const baseSink = (): void => {};

  it('isolationMode=utility_process (strict) → hard-fail, no fallback', async () => {
    const r = await decideSpawnFailure(
      {
        telemetrySink: baseSink,
        hasDowngradeConsent: () => false,
        isolationMode: 'utility_process',
      },
      'p1',
      'fork ENOENT',
    );
    expect(r.fallback_in_process).toBe(false);
  });

  it('isolationMode=in_process → always fallback', async () => {
    const r = await decideSpawnFailure(
      {
        telemetrySink: baseSink,
        hasDowngradeConsent: () => false,
        isolationMode: 'in_process',
      },
      'p1',
      'fork ENOENT',
    );
    expect(r.fallback_in_process).toBe(true);
  });

  it('isolationMode=auto + prior consent → fallback', async () => {
    const r = await decideSpawnFailure(
      {
        telemetrySink: baseSink,
        hasDowngradeConsent: () => true,
        isolationMode: 'auto',
      },
      'p1',
      'fork ENOENT',
    );
    expect(r.fallback_in_process).toBe(true);
    expect(r.reason).toContain('prior consent');
  });

  it('isolationMode=auto + no consent + no prompt → hard-fail (NEVER silent fallback)', async () => {
    const r = await decideSpawnFailure(
      {
        telemetrySink: baseSink,
        hasDowngradeConsent: () => false,
        isolationMode: 'auto',
      },
      'p1',
      'fork ENOENT',
    );
    expect(r.fallback_in_process).toBe(false);
    expect(r.reason).toContain('no consent prompt available');
  });

  it('isolationMode=auto + prompt resolves true → fallback', async () => {
    const r = await decideSpawnFailure(
      {
        telemetrySink: baseSink,
        hasDowngradeConsent: () => false,
        promptForDowngradeConsent: () => Promise.resolve(true),
        isolationMode: 'auto',
      },
      'p1',
      'AV blocked',
    );
    expect(r.fallback_in_process).toBe(true);
    expect(r.reason).toContain('user granted');
  });

  it('isolationMode=auto + prompt resolves false → hard-fail (user declined)', async () => {
    const r = await decideSpawnFailure(
      {
        telemetrySink: baseSink,
        hasDowngradeConsent: () => false,
        promptForDowngradeConsent: () => Promise.resolve(false),
        isolationMode: 'auto',
      },
      'p1',
      'AV blocked',
    );
    expect(r.fallback_in_process).toBe(false);
    expect(r.reason).toContain('user declined');
  });
});
