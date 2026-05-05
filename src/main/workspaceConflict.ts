/**
 * workspaceConflict — userData ↔ workspace path 충돌 검사.
 *
 * Spec: docs/v1.x-roadmap.md (META-4), Codex 외부 검토 v1.0.13 (q4) +
 *       v1.0.14 hotfix blind spot (q5) + v1.0.15 lexical 우회 (q6).
 *
 * 정책 (Codex (a) picking):
 *  - 정확 일치 / 자식 / 부모 모두 차단.
 *  - SQLite WAL/journal/sessions.sqlite 가 사용자 작업 트리에 노출되면 실수
 *    commit / 삭제 / 동기화 위험.
 *
 * v1.0.15 (Codex Q6 발견):
 *  - lexical 비교만으론 symlink / junction / subst (Windows) /  `\\?\`
 *    long-path prefix alias 우회 가능. `fs.realpathSync.native` 로 정규화
 *    후 비교. 정규화 실패 (path 미존재) 시 lexical fallback (그래야 picker
 *    내 미존재 path 도 처리 가능).
 *
 * 사용처:
 *  1. workspace/pick-folder IPC — picker 시점 차단 (v1.0.13).
 *  2. app:get-default-workspace / workspace/get — 저장된 값 재검증 (v1.0.14).
 *  3. main process boot — saved workspace 충돌 시 dialog + settings 리셋.
 *
 * Main-only — fs 사용. Renderer 가 import 하면 vite 가 polyfill 시도하므로
 * checkUserDataConflict (lexical-only) 만 export 가능하도록 분리도 고려했으나
 * 실제 renderer 가 안 부르므로 그냥 한 파일.
 */

import path from 'node:path';
import { realpathSync } from 'node:fs';

/**
 * v1.0.15 (Codex Q6): Windows long-path `\\?\` prefix 정규화 + 후행 `\` 제거.
 *
 * `\\?\C:\foo` 와 `C:\foo` 는 같은 path 지만 lexical 비교로는 다름. realpath
 * 가 둘 중 하나로 정규화하지 않을 수 있어 caller 가 명시적 strip.
 * UNC 의 `\\?\UNC\server\share` → `\\server\share` 도 함께 처리.
 */
function stripLongPathPrefix(p: string): string {
  if (process.platform !== 'win32') return p;
  // `\\?\UNC\server\share` → `\\server\share`
  if (p.startsWith('\\\\?\\UNC\\')) {
    return `\\\\${p.slice('\\\\?\\UNC\\'.length)}`;
  }
  // `\\?\C:\foo` → `C:\foo`
  if (p.startsWith('\\\\?\\')) {
    return p.slice('\\\\?\\'.length);
  }
  return p;
}

/**
 * v1.0.15: 단일 path 를 realpath 로 정규화 (symlink/junction/subst 통과).
 * 미존재 등 실패 시 lexical resolve fallback — caller 가 결과를 그대로 비교
 * 가능. case-insensitive 처리는 caller (Windows toLowerCase).
 */
function normalizePath(p: string): string {
  const resolved = path.resolve(p);
  try {
    // realpathSync.native 가 fs.realpathSync 보다 Windows junction / subst 처리
    // 정확. Linux/macOS 는 동일.
    const real = realpathSync.native(resolved);
    return stripLongPathPrefix(real);
  } catch {
    // path 미존재 / 권한 부족 — lexical fallback. 보안 입장에서 false negative
    // 줄이려면 fail-closed 가 안전하지만, 사용자가 freshly-renamed 폴더 등
    // 정상 케이스에서 모든 picker 가 막히면 UX 망함. lexical 결과를 반환해
    // false negative 가능성을 감수.
    return stripLongPathPrefix(resolved);
  }
}

/**
 * @returns 사용자에게 보여줄 차단 메시지 (한국어). null 이면 안전 (충돌 X).
 *
 * Windows 는 case-insensitive — toLowerCase 후 비교. POSIX 는 그대로.
 *
 * v1.0.15: realpath 정규화 추가 — symlink / junction / subst / `\\?\` prefix
 * 우회 차단. realpath 실패 시 lexical fallback (picker 의 미존재 path 호환).
 *
 * @param picked 사용자가 고르거나 저장된 workspace path.
 * @param userDataDir Electron app.getPath('userData') 값.
 */
export function checkUserDataConflict(
  picked: string,
  userDataDir: string
): string | null {
  const normalizedPicked = normalizePath(picked);
  const normalizedUd = normalizePath(userDataDir);
  const a =
    process.platform === 'win32' ? normalizedPicked.toLowerCase() : normalizedPicked;
  const b =
    process.platform === 'win32' ? normalizedUd.toLowerCase() : normalizedUd;

  if (a === b) {
    return `선택한 폴더 "${picked}" 가 앱 데이터 폴더 "${userDataDir}" 와 정확히 같아요. SQLite WAL/journal 파일이 작업 폴더에 노출되면 위험합니다. 다른 폴더를 선택해주세요.`;
  }
  // picked 가 userData 안 (자식)
  if (a.startsWith(`${b}${path.sep}`) || a.startsWith(`${b}/`)) {
    return `선택한 폴더 "${picked}" 가 앱 데이터 폴더 "${userDataDir}" 안에 있어요. SQLite 파일이 같은 트리에 있으면 사용자 실수로 손상 가능. 다른 위치의 폴더를 선택해주세요.`;
  }
  // picked 가 userData 의 부모
  if (b.startsWith(`${a}${path.sep}`) || b.startsWith(`${a}/`)) {
    return `선택한 폴더 "${picked}" 가 앱 데이터 폴더 "${userDataDir}" 의 상위 폴더에요. SQLite 파일이 작업 폴더 안에 노출됩니다. 더 깊은 곳의 폴더를 선택해주세요.`;
  }
  return null;
}

/**
 * v1.0.14: 차단 사유 분류 — UI / dialog 가 짧은 키로 분기 가능.
 */
export type WorkspaceConflictKind = 'exact' | 'child' | 'parent' | null;

export function classifyUserDataConflict(
  picked: string,
  userDataDir: string
): WorkspaceConflictKind {
  // v1.0.15: realpath 정규화 + `\\?\` prefix strip. checkUserDataConflict 와
  // 일관 (둘은 동일 정규화를 거쳐야 — message 와 kind 가 분리되면 안 됨).
  const normalizedPicked = normalizePath(picked);
  const normalizedUd = normalizePath(userDataDir);
  const a =
    process.platform === 'win32' ? normalizedPicked.toLowerCase() : normalizedPicked;
  const b =
    process.platform === 'win32' ? normalizedUd.toLowerCase() : normalizedUd;

  if (a === b) return 'exact';
  if (a.startsWith(`${b}${path.sep}`) || a.startsWith(`${b}/`)) return 'child';
  if (b.startsWith(`${a}${path.sep}`) || b.startsWith(`${a}/`)) return 'parent';
  return null;
}
