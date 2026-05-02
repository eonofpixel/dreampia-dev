/**
 * detect.ts test — CLI binary 탐지.
 *
 * Spec: docs/ia/onboarding.md (Step 2: CLI 감지)
 *
 * child_process.spawn / fs.existsSync 를 vi.mock 으로 가짜로 대체.
 * vi.mock 은 hoisting 되므로 module 외부에서 imported 가 mock 으로 잡힌다.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { EventEmitter } from 'node:events';

// ────────────────────────────────────────────────────────────
// Mocks (반드시 import 전에 선언; vi.mock 은 hoisted)
// ────────────────────────────────────────────────────────────

const fakeFs = {
  existsSync: vi.fn(),
  statSync: vi.fn(),
};

vi.mock('node:fs', () => ({
  existsSync: (p: string) => fakeFs.existsSync(p),
  statSync: (p: string) => fakeFs.statSync(p),
}));

interface FakeChild extends EventEmitter {
  stdout: EventEmitter;
  stderr: EventEmitter;
  kill: () => void;
}

const spawnQueue: Array<(child: FakeChild) => void> = [];

vi.mock('node:child_process', () => ({
  spawn: vi.fn(() => {
    const child: FakeChild = Object.assign(new EventEmitter(), {
      stdout: new EventEmitter(),
      stderr: new EventEmitter(),
      kill: vi.fn(),
    });
    const handler = spawnQueue.shift();
    if (handler !== undefined) {
      // setImmediate 로 비동기 emission — listener attach 시간 확보.
      setImmediate(() => handler(child));
    } else {
      // Default: 빈 출력 + 정상 종료.
      setImmediate(() => child.emit('close', 0));
    }
    return child;
  }),
}));

vi.mock('node:os', () => ({
  homedir: () => '/home/test',
  platform: () => 'linux',
}));

// 위 mock 들은 hoisted — import 후엔 mock 적용됨.
import { detectCli, detectOne, expandHome, getVersion } from '../../../src/providers/cli/detect';

beforeEach(() => {
  fakeFs.existsSync.mockReset();
  fakeFs.statSync.mockReset();
  spawnQueue.length = 0;
});

// 출력 + close 를 emit 하는 spawn handler 헬퍼.
function spawnYielding(stdout: string, exitCode = 0): (child: FakeChild) => void {
  return (child) => {
    child.stdout.emit('data', Buffer.from(stdout));
    child.emit('close', exitCode);
  };
}

describe('detect.ts — CLI detection', () => {
  it('detectCli returns null for both when nothing installed', async () => {
    fakeFs.existsSync.mockReturnValue(false);
    // PATH lookup 도 빈 출력
    spawnQueue.push(spawnYielding(''));
    spawnQueue.push(spawnYielding(''));

    const result = await detectCli();
    expect(result.claude).toBeNull();
    expect(result.codex).toBeNull();
  });

  it('detectOne finds binary in known path + reads version', async () => {
    fakeFs.existsSync.mockImplementation((p: string) => p.includes('claude'));
    fakeFs.statSync.mockReturnValue({ isFile: () => true });
    spawnQueue.push(spawnYielding('1.2.3\n')); // --version

    const result = await detectOne('claude', ['~/.claude/bin/claude']);
    expect(result).not.toBeNull();
    expect(result?.path).toContain('claude');
    expect(result?.version).toBe('1.2.3');
  });

  it('detectOne falls through to PATH lookup when known paths fail', async () => {
    fakeFs.existsSync.mockReturnValue(false);
    spawnQueue.push(spawnYielding('/usr/local/bin/codex\n')); // which output
    spawnQueue.push(spawnYielding('codex 0.5.0\n')); // version

    const result = await detectOne('codex', ['~/.codex/bin/codex']);
    expect(result).not.toBeNull();
    expect(result?.path).toBe('/usr/local/bin/codex');
    expect(result?.version).toBe('0.5.0');
  });

  it('detectOne returns null when PATH lookup yields empty', async () => {
    fakeFs.existsSync.mockReturnValue(false);
    spawnQueue.push(spawnYielding('')); // which: no output

    const result = await detectOne('zzznope', ['~/notreal']);
    expect(result).toBeNull();
  });

  it('expandHome handles ~/ prefix', () => {
    // path.join 의 결과는 OS dependent (Windows: '\\', Unix: '/'). 검증은
    // 핵심 의미 — homedir 가 prefix 로 붙는다 — 만 확인.
    const expanded = expandHome('~/foo/bar');
    expect(expanded.startsWith('/home/test') || expanded.startsWith('\\home\\test')).toBe(true);
    expect(expanded).toMatch(/foo[\\/]bar$/);
    expect(expandHome('/abs/path')).toBe('/abs/path');
    expect(expandHome('relative')).toBe('relative');
  });

  it('getVersion extracts semver from CLI output', async () => {
    spawnQueue.push(spawnYielding('claude version 0.18.2 (build abc)\n'));
    const v = await getVersion('/fake/claude');
    expect(v).toBe('0.18.2');
  });

  it('getVersion returns null when child fails to start', async () => {
    spawnQueue.push((child) => {
      child.emit('error', new Error('ENOENT'));
    });
    const v = await getVersion('/nonexistent');
    expect(v).toBeNull();
  });

  it('getVersion returns full output when no semver pattern found', async () => {
    spawnQueue.push(spawnYielding('vNext-experimental\n'));
    const v = await getVersion('/fake');
    expect(v).toBe('vNext-experimental');
  });
});
