/**
 * Cross-platform spawn helper — Windows .cmd / .bat 보안 우회.
 *
 * v1.0.5 — Node.js 18.20.2+ / 20.12.2+ / 22+ 부터 child_process.spawn 으로
 * .cmd / .bat 파일을 직접 실행하면 EINVAL 거부 (CVE-2024-27980 — Windows
 * batch file argument injection 방어). npm global 패키지의 wrapper 가
 * .cmd 라서 영향 큼.
 *
 * 해결: Windows + .cmd / .bat / .ps1 인 경우 cmd.exe / pwsh 로 wrapping.
 *
 * Spec: https://nodejs.org/en/blog/vulnerability/april-2024-security-releases-2
 */

import { spawn, type ChildProcess, type SpawnOptions } from 'node:child_process';
import { createHash } from 'node:crypto';
import { promises as fsp } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

/**
 * `child_process.spawn` 의 cross-platform 안전 wrapper.
 *
 * 동작:
 *   - Windows + .cmd / .bat → `cmd.exe /c <wrapper> <args>` 로 변환
 *   - Windows + .ps1        → `powershell -ExecutionPolicy Bypass -File <wrapper> <args>`
 *   - 그 외                  → 그대로 spawn (인젝션 방지 유지)
 *
 * cmd.exe / powershell 우회 시에도 args 는 array 로 전달 → Node 가 자동 quoting.
 * shell:true 로 가지 않아 인젝션 위험 없음 (binaryPath 가 신뢰할 수 있는 경우).
 */
export function spawnSafe(
  binaryPath: string,
  args: ReadonlyArray<string>,
  options: SpawnOptions = {}
): ChildProcess {
  if (process.platform !== 'win32') {
    return spawn(binaryPath, [...args], { ...options, shell: false });
  }

  const lower = binaryPath.toLowerCase();
  if (lower.endsWith('.cmd') || lower.endsWith('.bat')) {
    // cmd.exe 가 .cmd / .bat 를 정상 실행. /c 는 명령 후 종료.
    // /d 는 AutoRun 무시 (악성 AutoRun 회피).
    return spawn('cmd.exe', ['/d', '/s', '/c', binaryPath, ...args], {
      ...options,
      shell: false,
    });
  }
  if (lower.endsWith('.ps1')) {
    // PowerShell wrapper — npm 의 .ps1 도 동일 보안 영향.
    return spawn(
      'powershell.exe',
      ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', binaryPath, ...args],
      { ...options, shell: false }
    );
  }
  return spawn(binaryPath, [...args], { ...options, shell: false });
}

/**
 * 주어진 path 가 Windows 에서 직접 spawn 가능한지 판정.
 * detect.ts 의 path 우선순위 sort 가 이 결과를 신뢰.
 */
export function isDirectlySpawnable(binaryPath: string): boolean {
  if (process.platform !== 'win32') return true;
  const lower = binaryPath.toLowerCase();
  // 확장자가 없거나 알 수 없는 확장자는 Node spawn 이 거부.
  // .exe 는 항상 OK. .cmd / .bat / .ps1 은 우리 spawnSafe 가 wrapping.
  return (
    lower.endsWith('.exe') ||
    lower.endsWith('.cmd') ||
    lower.endsWith('.bat') ||
    lower.endsWith('.ps1')
  );
}

/**
 * v1.0.6 — Windows 에서 한국어 / 비-ASCII 폴더 경로를 8.3 short path 로 변환.
 *
 * 배경:
 *   Codex CLI 가 HTTP header `x-codex-turn-metadata` 에 cwd 를 JSON 으로 넣는데,
 *   한국어 등 non-ASCII 경로가 UTF-8 raw bytes 로 그대로 들어가 server 가 reject
 *   ("UTF-8 encoding error: failed to convert header to str"). 사용자 시스템의
 *   workspace 가 한국어면 codex 사용 불가.
 *
 *   Workaround: Windows 의 8.3 short path (예: `BUNSEK~1`) 로 변환해 cwd 로 사용.
 *   short path 는 항상 ASCII-only 라 HTTP header 에 그대로 들어가도 안전.
 *
 * 동작:
 *   - non-Windows → 입력 그대로
 *   - 이미 ASCII-only → 입력 그대로
 *   - 그 외 → cmd.exe 의 `for %I in ("path") do @echo %~sI` 로 short path 조회
 *   - 변환 실패 (8.3 disabled / 권한 등) → 입력 그대로 (best-effort)
 */
export async function ensureAsciiCwd(cwd: string | undefined): Promise<string | undefined> {
  if (cwd === undefined) return undefined;
  if (process.platform !== 'win32') return cwd;
  // ASCII printable + tab/newline range — 한국어 / 일본어 / 중국어 / 이모지 등 모두 거름.
  // eslint-disable-next-line no-control-regex
  if (/^[\x09\x0a\x0d\x20-\x7e]*$/.test(cwd)) return cwd;

  return new Promise((resolve) => {
    let out = '';
    let resolved = false;
    const finish = (val: string): void => {
      if (resolved) return;
      resolved = true;
      resolve(val);
    };

    let child: ChildProcess;
    try {
      // `for %I in (...)` 안의 quoted path 를 cmd.exe 가 GetShortPathName 로 변환.
      child = spawn(
        'cmd.exe',
        ['/d', '/s', '/c', `for %I in ("${cwd}") do @echo %~sI`],
        { shell: false }
      );
    } catch {
      finish(cwd);
      return;
    }

    const timer = setTimeout(() => {
      try {
        child.kill();
      } catch {
        // ignore
      }
      finish(cwd);
    }, 2000);

    child.stdout?.on('data', (chunk: Buffer) => {
      out += chunk.toString();
    });
    child.on('close', async () => {
      clearTimeout(timer);
      const trimmed = out.trim();
      // 빈 문자열 또는 long path 그대로 (8.3 비활성화) → junction fallback 시도.
      if (trimmed.length === 0 || trimmed === cwd) {
        finish(await createJunctionAlias(cwd));
        return;
      }
      // short path 가 ASCII 검증 (cmd.exe 가 한국어 그대로 echo 했을 가능성).
      // eslint-disable-next-line no-control-regex
      if (/^[\x09\x0a\x0d\x20-\x7e]*$/.test(trimmed)) {
        finish(trimmed);
      } else {
        // 8.3 가 부모 폴더를 변환 못해 한국어가 남았음 → junction fallback.
        finish(await createJunctionAlias(cwd));
      }
    });
    child.on('error', async () => {
      clearTimeout(timer);
      finish(await createJunctionAlias(cwd));
    });
  });
}

/**
 * v1.0.6 — junction (NTFS reparse point) 으로 ASCII alias 생성.
 *
 * Windows 8.3 short name 이 부모 폴더에서 disabled 인 경우 GetShortPathName 이
 * 한국어 부분을 변환 못 함. 그럴 때 fallback 으로 `%TEMP%\dreampia-cwd-<hash>` →
 * 원본 cwd 로 가는 junction 을 만들어 ASCII path 만 codex CLI 에 노출.
 *
 * - junction 은 사용자 권한 (admin 불요) 으로 생성 가능
 * - 동일 cwd 로 재호출 시 cache hit (재생성 X)
 * - 실패 시 원본 cwd 반환 (best-effort)
 */
async function createJunctionAlias(cwd: string): Promise<string> {
  const hash = createHash('sha1').update(cwd).digest('hex').slice(0, 10);
  const junctionPath = join(tmpdir(), `dreampia-cwd-${hash}`);

  // 1. 이미 존재하는 junction 이 같은 target 을 가리키면 재사용.
  try {
    const target = await fsp.readlink(junctionPath);
    if (target === cwd || target.replace(/\\\?\\/, '') === cwd) {
      return junctionPath;
    }
    // 다른 target → 제거 후 재생성.
    await fsp.rm(junctionPath, { recursive: true, force: true });
  } catch {
    // 존재 안 함 — 새로 만들어야 함.
  }

  // 2. PowerShell 로 junction 생성 (cmd.exe mklink 보다 인자 escape 안전).
  return new Promise((resolve) => {
    let resolved = false;
    const finish = (val: string): void => {
      if (resolved) return;
      resolved = true;
      resolve(val);
    };

    let child: ChildProcess;
    try {
      // PowerShell single-quoted string 안에서 single quote escape 는 ''
      const psTarget = cwd.replace(/'/g, "''");
      const psPath = junctionPath.replace(/'/g, "''");
      child = spawn(
        'powershell.exe',
        [
          '-NoProfile',
          '-NonInteractive',
          '-ExecutionPolicy',
          'Bypass',
          '-Command',
          `New-Item -ItemType Junction -Path '${psPath}' -Target '${psTarget}' | Out-Null`,
        ],
        { shell: false }
      );
    } catch {
      finish(cwd);
      return;
    }

    const timer = setTimeout(() => {
      try {
        child.kill();
      } catch {
        // ignore
      }
      finish(cwd);
    }, 5000);

    child.on('close', (code) => {
      clearTimeout(timer);
      if (code === 0) {
        finish(junctionPath);
      } else {
        finish(cwd);
      }
    });
    child.on('error', () => {
      clearTimeout(timer);
      finish(cwd);
    });
  });
}
