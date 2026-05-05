/**
 * workspaceConflict — userData ↔ workspace path 충돌 검사.
 *
 * Spec: docs/v1.x-roadmap.md (META-4), Codex 외부 검토 v1.0.13 (q4) +
 *       v1.0.14 hotfix blind spot 발견 (q5).
 *
 * 정책 (Codex (a) picking):
 *  - 정확 일치 / 자식 / 부모 모두 차단.
 *  - SQLite WAL/journal/sessions.sqlite 가 사용자 작업 트리에 노출되면 실수
 *    commit / 삭제 / 동기화 위험.
 *
 * 사용처:
 *  1. workspace/pick-folder IPC — picker 시점 차단 (v1.0.13).
 *  2. app:get-default-workspace / workspace/get — 저장된 값 재검증 (v1.0.14).
 *  3. main process boot — saved workspace 충돌 시 dialog + settings 리셋.
 *
 * Renderer 와 안전하게 공유 가능 — Node-only 의존성 X (path 만 사용).
 */

import path from 'node:path';

/**
 * @returns 사용자에게 보여줄 차단 메시지 (한국어). null 이면 안전 (충돌 X).
 *
 * Windows 는 case-insensitive — toLowerCase 후 비교. POSIX 는 그대로.
 *
 * @param picked 사용자가 고르거나 저장된 workspace path.
 * @param userDataDir Electron app.getPath('userData') 값.
 */
export function checkUserDataConflict(
  picked: string,
  userDataDir: string
): string | null {
  const resolvedPicked = path.resolve(picked);
  const resolvedUd = path.resolve(userDataDir);
  const a =
    process.platform === 'win32' ? resolvedPicked.toLowerCase() : resolvedPicked;
  const b = process.platform === 'win32' ? resolvedUd.toLowerCase() : resolvedUd;

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
  const a =
    process.platform === 'win32'
      ? path.resolve(picked).toLowerCase()
      : path.resolve(picked);
  const b =
    process.platform === 'win32'
      ? path.resolve(userDataDir).toLowerCase()
      : path.resolve(userDataDir);

  if (a === b) return 'exact';
  if (a.startsWith(`${b}${path.sep}`) || a.startsWith(`${b}/`)) return 'child';
  if (b.startsWith(`${a}${path.sep}`) || b.startsWith(`${a}/`)) return 'parent';
  return null;
}
