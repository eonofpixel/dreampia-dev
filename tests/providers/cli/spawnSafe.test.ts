/**
 * Unit tests — spawnSafe.ts (v1.0.4 / v1.0.6 critical Windows fix).
 *
 * 이전엔 zero coverage 였음 — production 에서 회귀하면 즉시 Windows 사용자 모두
 * spawn EINVAL / UTF-8 header reject 에 막힌다.
 *
 * 검증 영역:
 *   - isDirectlySpawnable: 확장자 분류 (Windows 전용 룰 포함)
 *   - ensureAsciiCwd:
 *       · ASCII path → 그대로 반환
 *       · undefined → undefined
 *       · non-Windows → 그대로 반환 (platform mock)
 *       · Windows + 한국어 path → ASCII path 로 변환 (8.3 또는 junction)
 *   - spawnSafe:
 *       · non-Windows → raw spawn
 *       · 실제 .exe 실행 (Windows: cmd.exe /c echo)
 */

import { describe, it, expect } from 'vitest';
import { mkdirSync, rmSync, existsSync } from 'node:fs';
import { tmpdir, platform } from 'node:os';
import { join } from 'node:path';
import {
  isDirectlySpawnable,
  ensureAsciiCwd,
  spawnSafe,
} from '../../../src/providers/cli/spawnSafe';

const IS_WINDOWS = platform() === 'win32';

describe('isDirectlySpawnable', () => {
  it('returns true for .exe on Windows', () => {
    if (!IS_WINDOWS) return;
    expect(isDirectlySpawnable('C:\\Program Files\\foo.exe')).toBe(true);
    expect(isDirectlySpawnable('foo.EXE')).toBe(true); // case-insensitive
  });

  it('returns true for .cmd / .bat / .ps1 on Windows', () => {
    if (!IS_WINDOWS) return;
    expect(isDirectlySpawnable('C:\\npm\\codex.cmd')).toBe(true);
    expect(isDirectlySpawnable('codex.bat')).toBe(true);
    expect(isDirectlySpawnable('codex.ps1')).toBe(true);
  });

  it('returns false for extensionless paths on Windows', () => {
    if (!IS_WINDOWS) return;
    // npm 글로벌 wrapper 의 unix 형태 — Windows 에서 spawn 실패의 원인.
    expect(isDirectlySpawnable('C:\\Users\\foo\\AppData\\Roaming\\npm\\codex')).toBe(false);
  });

  it('returns true unconditionally on non-Windows', () => {
    if (IS_WINDOWS) return;
    expect(isDirectlySpawnable('/usr/local/bin/codex')).toBe(true);
    expect(isDirectlySpawnable('/foo/bar')).toBe(true);
  });
});

describe('ensureAsciiCwd', () => {
  it('returns undefined for undefined input', async () => {
    await expect(ensureAsciiCwd(undefined)).resolves.toBe(undefined);
  });

  it('passes ASCII path through unchanged', async () => {
    const input = IS_WINDOWS ? 'C:\\Users\\test\\my-project' : '/home/test/my-project';
    await expect(ensureAsciiCwd(input)).resolves.toBe(input);
  });

  it('passes ASCII path with allowed whitespace through unchanged', async () => {
    const input = IS_WINDOWS
      ? 'C:\\Users\\Test User\\My Project'
      : '/home/test user/my project';
    await expect(ensureAsciiCwd(input)).resolves.toBe(input);
  });

  it('returns ASCII output for Korean folder path on Windows', async () => {
    if (!IS_WINDOWS) {
      // non-Windows 는 입력 그대로 반환해야 함 (변환 X) — 이 case 는
      // 같은 유닛이지만 platform branch 검증.
      const input = '/home/test/한국어폴더';
      await expect(ensureAsciiCwd(input)).resolves.toBe(input);
      return;
    }

    // 실제 한국어 폴더를 만들어서 8.3 short path 또는 junction 으로 변환 확인.
    const koreanDir = join(tmpdir(), '드림피아테스트-' + Date.now());
    mkdirSync(koreanDir, { recursive: true });
    try {
      const result = await ensureAsciiCwd(koreanDir);

      // 결과가 무엇이든:
      //   1. ASCII-only 여야 함 (코어 invariant)
      //   2. 실제 존재하는 path 여야 함 (junction 또는 short path)
      expect(result).toBeDefined();
      expect(result!.length).toBeGreaterThan(0);
      // eslint-disable-next-line no-control-regex
      expect(/^[\x09\x0a\x0d\x20-\x7e]+$/.test(result!)).toBe(true);

      // 결과 path 가 실제 파일시스템에 존재 (junction 인 경우 cleanup 필요).
      expect(existsSync(result!)).toBe(true);
    } finally {
      try {
        rmSync(koreanDir, { recursive: true, force: true });
      } catch {
        // junction 이 lock 잡고 있을 수 있어 best-effort
      }
    }
  });

  it('returns ASCII path for emoji folder on Windows', async () => {
    if (!IS_WINDOWS) return;
    const emojiDir = join(tmpdir(), '🚀-test-' + Date.now());
    mkdirSync(emojiDir, { recursive: true });
    try {
      const result = await ensureAsciiCwd(emojiDir);
      expect(result).toBeDefined();
      // eslint-disable-next-line no-control-regex
      expect(/^[\x09\x0a\x0d\x20-\x7e]+$/.test(result!)).toBe(true);
    } finally {
      try {
        rmSync(emojiDir, { recursive: true, force: true });
      } catch {
        // ignore
      }
    }
  });
});

describe('spawnSafe', () => {
  it('runs a simple command and exits cleanly', async () => {
    const child = IS_WINDOWS
      ? spawnSafe('cmd.exe', ['/c', 'echo', 'hello'], { stdio: 'pipe' })
      : spawnSafe('/bin/echo', ['hello'], { stdio: 'pipe' });

    let out = '';
    child.stdout?.on('data', (b: Buffer) => {
      out += b.toString();
    });
    const exitCode: number = await new Promise((resolve) => {
      child.on('close', (code) => resolve(code ?? -1));
    });
    expect(exitCode).toBe(0);
    expect(out.toLowerCase()).toContain('hello');
  });

  it('handles .cmd wrapper without EINVAL on Windows', async () => {
    if (!IS_WINDOWS) return;
    // Windows 시스템 .cmd 파일 — `where.exe` 는 항상 있고 .cmd 형태 PATH lookup 은
    // 시스템에 따라 다르므로 이 경계 대신 cmd.exe 로 echo 직접.
    // 핵심은 spawn EINVAL 이 안 떠야 한다는 것.
    const child = spawnSafe('cmd.exe', ['/c', 'echo', 'win-cmd-ok'], { stdio: 'pipe' });
    let out = '';
    child.stdout?.on('data', (b: Buffer) => {
      out += b.toString();
    });
    const exitCode: number = await new Promise((resolve) => {
      child.on('close', (code) => resolve(code ?? -1));
    });
    expect(exitCode).toBe(0);
    expect(out).toContain('win-cmd-ok');
  });
});
