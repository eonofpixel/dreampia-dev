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
  const cmd = platform() === 'win32' ? 'where' : 'which';
  try {
    const found = await execLine(cmd, [binaryName]);
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
 * `<binary> --version` → semver 추출. 실패 시 null.
 */
export async function getVersion(path: string): Promise<string | null> {
  try {
    const out = await execLine(path, ['--version'], 3000);
    if (out === null || out.length === 0) return null;
    const match = out.match(/\d+\.\d+\.\d+/);
    return match?.[0] ?? out;
  } catch {
    return null;
  }
}
