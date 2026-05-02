/**
 * Settings — minimal JSON persistence at `userData/settings.json`.
 *
 * Phase 2: 사용자가 picker 로 선택한 workspace 경로를 reload 후에도
 * 기억하도록 저장. 추후 theme/language 등 사용자 preference 도 여기로 확장.
 *
 * MAIN process 전용 — preload/renderer 에서 import 금지 (electron / node:fs 사용).
 *
 * 캐시 정책:
 *   - 첫 read 시 디스크 → memory cache 채움
 *   - write 시 cache 와 디스크 둘 다 갱신 (next read 는 cache hit)
 *   - 테스트는 `__resetSettingsCache()` 로 모듈 캐시 초기화 가능
 *
 * Spec: docs/findings/round5-ipc-telemetry.md (settings.json 패턴)
 */

import { app } from 'electron';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

export interface AppSettings {
  /** 마지막으로 선택한 작업 폴더 절대 경로. */
  workspace_root?: string;
  /** UI 표시용 폴더 이름 (basename). */
  workspace_name?: string;
}

let cached: AppSettings | null = null;

function settingsPath(): string {
  return join(app.getPath('userData'), 'settings.json');
}

export function readSettings(): AppSettings {
  if (cached !== null) return cached;
  const path = settingsPath();
  if (!existsSync(path)) {
    cached = {};
    return cached;
  }
  try {
    const raw = readFileSync(path, 'utf-8');
    const parsed: unknown = JSON.parse(raw);
    if (parsed !== null && typeof parsed === 'object') {
      const obj = parsed as Record<string, unknown>;
      const next: AppSettings = {};
      if (typeof obj['workspace_root'] === 'string') {
        next.workspace_root = obj['workspace_root'];
      }
      if (typeof obj['workspace_name'] === 'string') {
        next.workspace_name = obj['workspace_name'];
      }
      cached = next;
    } else {
      cached = {};
    }
  } catch {
    // 손상된 JSON / 권한 문제 → 빈 객체로 안전 fallback. 다음 write 시 정상화.
    cached = {};
  }
  return cached;
}

export function writeSettings(patch: Partial<AppSettings>): void {
  const current = readSettings();
  cached = { ...current, ...patch };
  const path = settingsPath();
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify(cached, null, 2), 'utf-8');
}

/**
 * 테스트 전용 — module-level cache 초기화.
 * Production 코드는 호출 X.
 */
export function __resetSettingsCache(): void {
  cached = null;
}
