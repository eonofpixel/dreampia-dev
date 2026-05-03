/**
 * Settings — minimal JSON persistence at `userData/settings.json`.
 *
 * Phase 2: 사용자가 picker 로 선택한 workspace 경로를 reload 후에도
 * 기억하도록 저장. 추후 theme/language 등 사용자 preference 도 여기로 확장.
 *
 * v0.2.0 추가: MCP 서버 설정 (mcp_servers) 영속화. McpManager 가 이 파일을
 * read/write 어댑터로 받아 사용 (Phase 1 P0 — Issue #5).
 *
 * MAIN process 전용 — preload/renderer 에서 import 금지 (electron / node:fs 사용).
 *
 * 캐시 정책:
 *   - 첫 read 시 디스크 → memory cache 채움
 *   - write 시 cache 와 디스크 둘 다 갱신 (next read 는 cache hit)
 *   - 테스트는 `__resetSettingsCache()` 로 모듈 캐시 초기화 가능
 *
 * Spec: docs/findings/round5-ipc-telemetry.md (settings.json 패턴),
 *       docs/tools/mcp-bridge.md (mcp_servers 영속)
 */

import { app } from 'electron';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { McpServerConfigSchema, type McpServerConfig } from '@/types';

export interface AppSettings {
  /** 마지막으로 선택한 작업 폴더 절대 경로. */
  workspace_root?: string;
  /** UI 표시용 폴더 이름 (basename). */
  workspace_name?: string;
  /**
   * 첫 실행 onboarding wizard 완료 여부 (Phase 3 B2).
   * absent / false → 다음 실행 시 wizard 표시. true → main app 으로 직행.
   * Spec: docs/ia/onboarding.md
   */
  onboarding_completed?: boolean;
  /**
   * v0.2.0 — 사용자가 등록한 MCP 서버 목록 (Issue #5).
   * 부팅 시 McpManager.loadFromSettings() 가 enabled=true 인 항목만 spawn.
   */
  mcp_servers?: McpServerConfig[];
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
      if (typeof obj['onboarding_completed'] === 'boolean') {
        next.onboarding_completed = obj['onboarding_completed'];
      }
      // mcp_servers — 런타임에 받은 신뢰 못할 데이터 → 각 항목을 Zod 로 검증.
      // 1개 깨진 항목이 전체 기능을 막지 않도록 통과한 것만 보존.
      if (Array.isArray(obj['mcp_servers'])) {
        const valid: McpServerConfig[] = [];
        for (const item of obj['mcp_servers']) {
          const result = McpServerConfigSchema.safeParse(item);
          if (result.success) {
            valid.push(result.data);
          }
          // 손상된 항목은 silent drop — 다음 write 시 정상 항목만 남는다.
        }
        next.mcp_servers = valid;
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
