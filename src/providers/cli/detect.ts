/**
 * CLI binary detection — Claude / Codex.
 *
 * Spec: docs/ia/onboarding.md (Step 2: CLI 감지 / 설치)
 *
 * 목적:
 *   - 설치된 Claude / Codex CLI 위치 + 버전 탐지
 *   - 미설치 시 null (설치 가이드는 onboarding UI 가 표시)
 *
 * 검색 순서 (CLI 별):
 *   1. 잘 알려진 글로벌 설치 경로 (~/.claude/bin, ~/.codex/bin) + Windows .exe
 *   2. PATH lookup (where / which) — npm 글로벌 설치 자동 감지
 *
 * 결정사항:
 *   - subprocess timeout 2-3s (느린 응답 시 사용자 대기 X)
 *   - 어떤 에러도 throw 하지 않음 — 항상 null fallback
 *   - shell:false 로 spawn (인젝션 방지)
 */

import { spawn } from 'node:child_process';
import { existsSync, statSync } from 'node:fs';
import { homedir, platform } from 'node:os';
import { join } from 'node:path';
import { spawnSafe } from './spawnSafe';

export interface CliInfo {
  path: string;
  version: string | null;
}

export interface CliDetectionResult {
  claude: CliInfo | null;
  codex: CliInfo | null;
}

/**
 * 설치된 Claude / Codex CLI 탐지.
 *
 * 두 CLI 를 병렬 탐지. 어떤 실패도 캡처되어 null 로 surface.
 */
export async function detectCli(): Promise<CliDetectionResult> {
  const [claude, codex] = await Promise.all([
    detectOne('claude', [
      '~/.claude/bin/claude',
      '~/.claude/bin/claude.exe',
      '~/.claude/local/claude',
      '~/.claude/local/claude.exe',
    ]),
    detectOne('codex', [
      '~/.codex/bin/codex',
      '~/.codex/bin/codex.exe',
      '~/.codex/local/codex',
      '~/.codex/local/codex.exe',
    ]),
  ]);
  return { claude, codex };
}

/**
 * 단일 CLI 탐지. 알려진 경로 → PATH 순으로 시도.
 *
 * 비용은 disk stat 몇 번 + 최대 2번의 subprocess (where/which + --version).
 */
export async function detectOne(binaryName: string, knownPaths: string[]): Promise<CliInfo | null> {
  // 1. 알려진 경로 우선 — 절대경로 stat 만으로 빠름
  for (const raw of knownPaths) {
    const path = expandHome(raw);
    try {
      if (existsSync(path) && statSync(path).isFile()) {
        const version = await getVersion(path);
        return { path, version };
      }
    } catch {
      // ignore — try next path
    }
  }

  // 2. PATH lookup — 플랫폼별 'where' (Windows) / 'which' (Unix)
  //
  // v1.0.5 fix — Windows 에서 `where` 가 multiple line 반환 (npm global 의
  // shell wrapper + .cmd + .ps1). 첫 줄이 확장자 없는 Unix shell wrapper 면
  // child_process.spawn 이 ENOENT 로 fail (Windows 는 PATHEXT 자동 처리 X
  // 직접 spawn 시). .cmd / .exe / .bat 우선 선택해 spawn 가능한 binary 만 사용.
  const cmd = platform() === 'win32' ? 'where' : 'which';
  try {
    const found = await execPathLookup(cmd, binaryName);
    if (found !== null) {
      const version = await getVersion(found);
      return { path: found, version };
    }
  } catch {
    // not found
  }

  return null;
}

/**
 * Windows-aware PATH lookup. Returns the first binary path that the OS can
 * actually spawn directly. On Windows, prefers `.cmd` / `.exe` / `.bat` over
 * extensionless unix wrappers that npm install generates.
 */
async function execPathLookup(cmd: string, binaryName: string): Promise<string | null> {
  const lines = await execLines(cmd, [binaryName]);
  if (lines.length === 0) return null;
  if (platform() !== 'win32') return lines[0] ?? null;

  // Windows — sort so .cmd / .exe / .bat (executable wrappers) come first,
  // then `.ps1`, then anything else. Stable within priority groups.
  const priority = (p: string): number => {
    const lower = p.toLowerCase();
    if (lower.endsWith('.cmd')) return 0;
    if (lower.endsWith('.exe')) return 0;
    if (lower.endsWith('.bat')) return 0;
    if (lower.endsWith('.ps1')) return 2; // PowerShell needs `shell:true` to spawn
    return 3; // extensionless unix wrapper — last resort
  };
  const sorted = [...lines].sort((a, b) => priority(a) - priority(b));
  return sorted[0] ?? null;
}

/**
 * `~/foo` → `/home/user/foo` 변환.
 *
 * 이외에는 그대로 반환 (relative 경로는 호출자 책임).
 */
export function expandHome(p: string): string {
  if (p.startsWith('~/') || p === '~') {
    return join(homedir(), p.slice(2));
  }
  return p;
}

/**
 * 단일 라인 출력 명령 실행. 타임아웃 시 null.
 *
 * shell:false — 인젝션 방지. 인자는 array 로만 전달.
 */
export function execLine(cmd: string, args: string[], timeoutMs = 2000): Promise<string | null> {
  return new Promise((resolve) => {
    let resolved = false;
    const finish = (val: string | null): void => {
      if (resolved) return;
      resolved = true;
      resolve(val);
    };

    let child: ReturnType<typeof spawn>;
    try {
      child = spawn(cmd, args, { shell: false });
    } catch {
      finish(null);
      return;
    }

    let out = '';
    const timer = setTimeout(() => {
      try {
        child.kill();
      } catch {
        // ignore
      }
      finish(null);
    }, timeoutMs);

    child.stdout?.on('data', (chunk: Buffer) => {
      out += chunk.toString();
    });
    child.on('close', () => {
      clearTimeout(timer);
      const first = out
        .split(/\r?\n/)
        .find((l) => l.trim().length > 0)
        ?.trim();
      finish(first ?? null);
    });
    child.on('error', () => {
      clearTimeout(timer);
      finish(null);
    });
  });
}

/**
 * 명령 실행 결과의 모든 stdout line 을 trimmed 배열로 반환. 타임아웃 시 빈 배열.
 *
 * v1.0.5 — Windows `where` multi-line 처리. shell:false 유지 (인젝션 방지).
 */
export function execLines(cmd: string, args: string[], timeoutMs = 2000): Promise<string[]> {
  return new Promise((resolve) => {
    let resolved = false;
    const finish = (val: string[]): void => {
      if (resolved) return;
      resolved = true;
      resolve(val);
    };

    let child: ReturnType<typeof spawn>;
    try {
      child = spawn(cmd, args, { shell: false });
    } catch {
      finish([]);
      return;
    }

    let out = '';
    const timer = setTimeout(() => {
      try {
        child.kill();
      } catch {
        // ignore
      }
      finish([]);
    }, timeoutMs);

    child.stdout?.on('data', (chunk: Buffer) => {
      out += chunk.toString();
    });
    child.on('close', () => {
      clearTimeout(timer);
      const lines = out
        .split(/\r?\n/)
        .map((l) => l.trim())
        .filter((l) => l.length > 0);
      finish(lines);
    });
    child.on('error', () => {
      clearTimeout(timer);
      finish([]);
    });
  });
}

/**
 * `<binary> --version` → semver 추출. 실패 시 null.
 *
 * v1.0.5 — Windows .cmd / .bat 는 spawnSafe 사용 (Node 22 EINVAL 회피).
 */
export async function getVersion(path: string): Promise<string | null> {
  try {
    const out = await execLineSafe(path, ['--version'], 3000);
    if (out === null || out.length === 0) return null;
    const match = out.match(/\d+\.\d+\.\d+/);
    return match?.[0] ?? out;
  } catch {
    return null;
  }
}

/**
 * execLine 의 spawnSafe 버전 — Windows .cmd 도 cmd.exe /c 로 wrap. 외부
 * binary 호출 (codex.cmd --version 등) 에 전용. system command (where, which)
 * 는 평범한 execLine 사용.
 */
function execLineSafe(cmd: string, args: string[], timeoutMs = 2000): Promise<string | null> {
  return new Promise((resolve) => {
    let resolved = false;
    const finish = (val: string | null): void => {
      if (resolved) return;
      resolved = true;
      resolve(val);
    };

    let child: ReturnType<typeof spawnSafe>;
    try {
      child = spawnSafe(cmd, args);
    } catch {
      finish(null);
      return;
    }

    let out = '';
    const timer = setTimeout(() => {
      try {
        child.kill();
      } catch {
        // ignore
      }
      finish(null);
    }, timeoutMs);

    child.stdout?.on('data', (chunk: Buffer) => {
      out += chunk.toString();
    });
    child.on('close', () => {
      clearTimeout(timer);
      const first = out
        .split(/\r?\n/)
        .find((l) => l.trim().length > 0)
        ?.trim();
      finish(first ?? null);
    });
    child.on('error', () => {
      clearTimeout(timer);
      finish(null);
    });
  });
}
