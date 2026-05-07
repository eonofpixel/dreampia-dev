/**
 * PluginManager — Dreampia-Dev Plugin Loader MVP (v1.1.14).
 *
 * Spec: docs/v1.x-roadmap.md (P1 v1.1.x Plugin Loader).
 *
 * 본 commit 의 minimum:
 *   - `~/.dreampia/plugins/<name>/manifest.json` discovery.
 *   - Manifest schema 검증 (name / version / description / hooks).
 *   - 디렉토리 변경 시 다시 scan API.
 *   - sidebar [플러그인] 의 "준비 중" 해체 — list IPC 반환.
 *
 * 후속 commits:
 *   - Hook runtime 실행 (pre-turn / post-turn).
 *   - Sandbox + capability grant (SEC-2 인프라 활용).
 *   - Cost-limit-hook example.
 *
 * 디자인 원칙:
 *   - main process 전용 (subprocess / fs 접근).
 *   - manifest 만 읽음 — index 파일은 hook 실행 시점에 dynamic import (지연
 *     loading). 본 commit 은 import 까지 X — manifest 검증만.
 *   - Plugin 로드 실패 (manifest 누락 / 잘못된 schema) → silently skip +
 *     audit log. 다른 plugin 의 실행 차단 X.
 */

import { promises as fsp } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';

export interface PluginManifest {
  /** Plugin 식별자 — 디렉토리 이름과 일치 권고. */
  name: string;
  /** semver. plugin 호환성 추적 (현재는 정보용). */
  version: string;
  /** 사용자 표시용. */
  description?: string;
  /**
   * 본 plugin 이 등록할 hook 목록. 본 MVP 에서는 manifest 만 검증, 실제
   * 호출은 v1.1.15+ 에서.
   *
   * Hook entry 는 manifest 의 'hooks' 필드 키 (pre_turn / post_turn) +
   * value (relative path to JS file from plugin dir).
   */
  hooks?: {
    pre_turn?: string;
    post_turn?: string;
  };
  /**
   * 본 plugin 이 사용할 capability 목록 — SEC-2 인프라 활용 (v1.1.15+).
   * 사용자가 plugin 설치 시 manifest 의 capabilities 를 검토 + 승인.
   */
  capabilities?: string[];
}

export interface LoadedPlugin {
  /** Plugin manifest 가 위치한 디렉토리 절대경로. */
  dir: string;
  manifest: PluginManifest;
}

export interface PluginLoadIssue {
  /** Plugin dir 또는 manifest.json 경로. */
  path: string;
  /** 사람 읽기용 사유. */
  reason: string;
}

export interface PluginManagerOptions {
  /** Plugin root dir. default `~/.dreampia/plugins`. */
  rootDir?: string;
  /**
   * Audit sink — load failure / invalid manifest 등 plugin discovery 이벤트.
   * 미지정 시 console.error 로 fallback.
   */
  auditSink?: (event: PluginAuditEvent) => void;
}

export interface PluginAuditEvent {
  timestamp: string;
  event: 'plugin.loaded' | 'plugin.invalid_manifest' | 'plugin.missing_manifest';
  plugin_dir: string;
  reason?: string;
}

export class PluginManager {
  private readonly rootDir: string;
  private readonly auditSink: (event: PluginAuditEvent) => void;
  private cache: { loaded: LoadedPlugin[]; issues: PluginLoadIssue[] } | null = null;

  constructor(options: PluginManagerOptions = {}) {
    this.rootDir = options.rootDir ?? join(homedir(), '.dreampia', 'plugins');
    this.auditSink =
      options.auditSink ??
      ((event): void => {
        if (event.event !== 'plugin.loaded') {
          console.error(
            `[PluginManager] ${event.event} ${event.plugin_dir}: ${event.reason ?? ''}`
          );
        }
      });
  }

  /**
   * Plugin root 를 scan 해서 모든 manifest 를 검증. 캐시 갱신 후 반환.
   * Plugin root 미존재 → 빈 결과.
   */
  async scan(): Promise<{ loaded: LoadedPlugin[]; issues: PluginLoadIssue[] }> {
    const loaded: LoadedPlugin[] = [];
    const issues: PluginLoadIssue[] = [];

    let entries: string[];
    try {
      entries = await fsp.readdir(this.rootDir);
    } catch (err) {
      const code = (err as NodeJS.ErrnoException).code;
      if (code === 'ENOENT') {
        // 정상 — 사용자가 아직 plugin 설치 안 했음.
        this.cache = { loaded, issues };
        return this.cache;
      }
      // 다른 에러는 issue 로 기록 후 빈 결과.
      issues.push({ path: this.rootDir, reason: `readdir failed: ${(err as Error).message}` });
      this.cache = { loaded, issues };
      return this.cache;
    }

    for (const entry of entries) {
      const dir = join(this.rootDir, entry);
      let stat;
      try {
        stat = await fsp.stat(dir);
      } catch {
        continue;
      }
      if (!stat.isDirectory()) continue;

      const manifestPath = join(dir, 'manifest.json');
      let raw: string;
      try {
        raw = await fsp.readFile(manifestPath, 'utf8');
      } catch {
        issues.push({ path: manifestPath, reason: 'manifest.json missing' });
        this.auditSink({
          timestamp: new Date().toISOString(),
          event: 'plugin.missing_manifest',
          plugin_dir: dir,
        });
        continue;
      }

      let parsed: unknown;
      try {
        parsed = JSON.parse(raw);
      } catch (err) {
        const reason = `JSON parse failed: ${(err as Error).message}`;
        issues.push({ path: manifestPath, reason });
        this.auditSink({
          timestamp: new Date().toISOString(),
          event: 'plugin.invalid_manifest',
          plugin_dir: dir,
          reason,
        });
        continue;
      }

      const valid = validateManifest(parsed);
      if (valid.ok === false) {
        issues.push({ path: manifestPath, reason: valid.reason });
        this.auditSink({
          timestamp: new Date().toISOString(),
          event: 'plugin.invalid_manifest',
          plugin_dir: dir,
          reason: valid.reason,
        });
        continue;
      }

      loaded.push({ dir, manifest: valid.manifest });
      this.auditSink({
        timestamp: new Date().toISOString(),
        event: 'plugin.loaded',
        plugin_dir: dir,
      });
    }

    this.cache = { loaded, issues };
    return this.cache;
  }

  /** 캐시된 결과. scan 안 됐으면 빈 배열. */
  list(): { loaded: LoadedPlugin[]; issues: PluginLoadIssue[] } {
    return this.cache ?? { loaded: [], issues: [] };
  }

  /** Plugin root path — UI 가 사용자에게 안내 (e.g. "C:\Users\...\.dreampia\plugins"). */
  getRootDir(): string {
    return this.rootDir;
  }
}

function validateManifest(
  raw: unknown
): { ok: true; manifest: PluginManifest } | { ok: false; reason: string } {
  if (typeof raw !== 'object' || raw === null) {
    return { ok: false, reason: 'manifest must be object' };
  }
  const obj = raw as Record<string, unknown>;
  if (typeof obj.name !== 'string' || obj.name.length === 0) {
    return { ok: false, reason: "missing 'name' (string)" };
  }
  if (typeof obj.version !== 'string' || obj.version.length === 0) {
    return { ok: false, reason: "missing 'version' (string)" };
  }
  if (obj.description !== undefined && typeof obj.description !== 'string') {
    return { ok: false, reason: "'description' must be string" };
  }
  if (obj.hooks !== undefined) {
    if (typeof obj.hooks !== 'object' || obj.hooks === null) {
      return { ok: false, reason: "'hooks' must be object" };
    }
    const hooks = obj.hooks as Record<string, unknown>;
    for (const key of ['pre_turn', 'post_turn']) {
      if (hooks[key] !== undefined && typeof hooks[key] !== 'string') {
        return { ok: false, reason: `'hooks.${key}' must be string (relative path)` };
      }
    }
  }
  if (obj.capabilities !== undefined) {
    if (!Array.isArray(obj.capabilities)) {
      return { ok: false, reason: "'capabilities' must be string array" };
    }
    for (const c of obj.capabilities) {
      if (typeof c !== 'string') {
        return { ok: false, reason: "'capabilities[]' must be string" };
      }
    }
  }
  const manifest: PluginManifest = {
    name: obj.name,
    version: obj.version,
  };
  if (typeof obj.description === 'string') manifest.description = obj.description;
  if (obj.hooks !== undefined) manifest.hooks = obj.hooks as PluginManifest['hooks'];
  if (Array.isArray(obj.capabilities)) {
    manifest.capabilities = obj.capabilities as string[];
  }
  return { ok: true, manifest };
}
