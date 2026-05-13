/**
 * recentFiles — Code 모드 워크스페이스별 최근 열린 파일 보관 (localStorage).
 *
 * v2.7.0 의 last-opened single-entry storage 를 확장. QuickOpenModal 이
 * query 가 비어 있을 때 "Recents" 섹션으로 노출. CodePanel 의 loadFile
 * 성공/실패 path 에서 push/clear.
 *
 * 형식: localStorage[`dreampia.codeMode.recentFiles.${workspaceRoot}`] =
 *   JSON.stringify(string[]) — index 0 이 가장 최근. MAX_RECENTS 만 유지.
 *
 * 모든 함수는 localStorage 접근 실패 (private mode / quota / SSR) 에 대해
 * 조용히 빈 배열 또는 no-op 으로 fallback. Storage 가 손상돼도 UX 가
 * 멈추지 않도록. 실제 storage 예외 처리는 renderer 공용 safeStorage 에
 * 모아 호출부가 같은 try/catch 를 반복하지 않게 한다.
 */

import { readLocalStorageJson, writeLocalStorage } from '../../utils/safeStorage';

const STORAGE_PREFIX = 'dreampia.codeMode.recentFiles.';
export const MAX_RECENTS = 5;

function key(workspaceRoot: string): string {
  return STORAGE_PREFIX + workspaceRoot;
}

export function loadRecentFiles(workspaceRoot: string): ReadonlyArray<string> {
  if (workspaceRoot.length === 0) return [];
  const parsed = readLocalStorageJson(key(workspaceRoot));
  if (!Array.isArray(parsed)) return [];
  // string only + dedup (corrupt storage 방어)
  const seen = new Set<string>();
  const out: string[] = [];
  for (const item of parsed) {
    if (typeof item !== 'string' || item.length === 0) continue;
    if (seen.has(item)) continue;
    seen.add(item);
    out.push(item);
    if (out.length >= MAX_RECENTS) break;
  }
  return out;
}

export function pushRecentFile(workspaceRoot: string, relPath: string): void {
  if (workspaceRoot.length === 0 || relPath.length === 0) return;
  const current = loadRecentFiles(workspaceRoot);
  const next = [relPath, ...current.filter((p) => p !== relPath)].slice(0, MAX_RECENTS);
  writeLocalStorage(key(workspaceRoot), JSON.stringify(next));
}

export function removeRecentFile(workspaceRoot: string, relPath: string): void {
  if (workspaceRoot.length === 0 || relPath.length === 0) return;
  const current = loadRecentFiles(workspaceRoot);
  const next = current.filter((p) => p !== relPath);
  if (next.length === current.length) return;
  writeLocalStorage(key(workspaceRoot), JSON.stringify(next));
}
