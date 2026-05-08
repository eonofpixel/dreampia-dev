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

import { promises as fsp, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';

const TRUST_FILE = '.trust.json';

export interface PluginManifest {
  /** Plugin 식별자 — 디렉토리 이름과 일치 권고. */
  name: string;
  /** semver. plugin 호환성 추적 (현재는 정보용). */
  version: string;
  /** 사용자 표시용. */
  description?: string;
  /** v1.1.6 (D1): trust-on-install 검토용. 사용자가 install 시 author 확인. */
  author?: string;
  /** v1.1.6 (D1): SPDX license id (e.g., "MIT", "Apache-2.0"). */
  license?: string;
  /** v1.1.6 (D1): plugin source / docs url. */
  homepage?: string;
  /**
   * 본 plugin 이 등록할 hook 목록. 본 MVP 에서는 manifest 만 검증, 실제
   * 호출은 v1.1.15+ 에서.
   *
   * Hook entry 는 manifest 의 'hooks' 필드 키 (pre_turn / post_turn) +
   * value (relative path to JS file from plugin dir).
   *
   * v1.1.6 (SEC audit C): path 는 plugin dir 안에 contained 되어야 함 —
   * `..` / 절대경로 / drive letter 거절 (validateManifest 가 enforce).
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
  /**
   * v1.1.6 (D1 — trust-on-install): 사용자가 install 시 trust 부여 여부.
   * `<rootDir>/.trust.json` 의 plugin name 목록으로 영속. untrusted plugin 은
   * scan 결과에 포함되지만 hook 실행 path 에서는 제외 — host 는 trusted 만
   * runHook 으로 전달해야 함.
   */
  trusted: boolean;
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
  /** v1.1.6 (D1): 사용자가 명시적으로 trust 한 plugin name 들. */
  private readonly trustedNames: Set<string> = new Set();

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
    this.loadTrustSet();
  }

  /**
   * v1.1.6 (D1): `<rootDir>/.trust.json` 에서 trusted plugin 목록 로드.
   * 파일 미존재 / 손상 시 silent skip — 모든 plugin 이 untrusted 로 시작.
   */
  private loadTrustSet(): void {
    try {
      const trustPath = join(this.rootDir, TRUST_FILE);
      if (!existsSync(trustPath)) return;
      const raw = readFileSync(trustPath, 'utf-8');
      const parsed: unknown = JSON.parse(raw);
      if (parsed === null || typeof parsed !== 'object') return;
      const obj = parsed as Record<string, unknown>;
      if (!Array.isArray(obj['trusted'])) return;
      for (const n of obj['trusted']) {
        if (typeof n === 'string' && n.length > 0) this.trustedNames.add(n);
      }
    } catch {
      // 손상 / 권한 등 — silent skip.
    }
  }

  /**
   * v1.1.6 (D1): 사용자가 plugin 을 trust / untrust 처리. 즉시 file 영속 +
   * in-memory cache 갱신. 파일 IO 실패 시 false 반환 (UI 가 toast).
   */
  setTrust(pluginName: string, trusted: boolean): boolean {
    if (trusted) this.trustedNames.add(pluginName);
    else this.trustedNames.delete(pluginName);
    try {
      const trustPath = join(this.rootDir, TRUST_FILE);
      const payload = JSON.stringify(
        { trusted: Array.from(this.trustedNames).sort() },
        null,
        2
      );
      writeFileSync(trustPath, payload, 'utf-8');
    } catch (err) {
      console.error(`[PluginManager] trust persist failed: ${(err as Error).message}`);
      return false;
    }
    if (this.cache !== null) {
      this.cache = {
        loaded: this.cache.loaded.map((p) =>
          p.manifest.name === pluginName ? { ...p, trusted } : p
        ),
        issues: this.cache.issues,
      };
    }
    return true;
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

      loaded.push({
        dir,
        manifest: valid.manifest,
        trusted: this.trustedNames.has(valid.manifest.name),
      });
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
      const path = hooks[key];
      if (path === undefined) continue;
      if (typeof path !== 'string') {
        return { ok: false, reason: `'hooks.${key}' must be string (relative path)` };
      }
      // v1.1.6 (SEC audit C): path traversal 차단. plugin dir 밖으로 나가는
      // 경로는 거절. `..` 컴포넌트, 절대경로, drive letter 모두 차단.
      if (
        path.includes('..') ||
        path.startsWith('/') ||
        path.startsWith('\\') ||
        /^[a-zA-Z]:/.test(path)
      ) {
        return { ok: false, reason: `'hooks.${key}' must be a relative path inside plugin dir` };
      }
    }
  }
  if (obj.author !== undefined && typeof obj.author !== 'string') {
    return { ok: false, reason: "'author' must be string" };
  }
  if (obj.license !== undefined && typeof obj.license !== 'string') {
    return { ok: false, reason: "'license' must be string" };
  }
  if (obj.homepage !== undefined && typeof obj.homepage !== 'string') {
    return { ok: false, reason: "'homepage' must be string" };
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
  if (typeof obj.author === 'string') manifest.author = obj.author;
  if (typeof obj.license === 'string') manifest.license = obj.license;
  if (typeof obj.homepage === 'string') manifest.homepage = obj.homepage;
  if (obj.hooks !== undefined) manifest.hooks = obj.hooks as PluginManifest['hooks'];
  if (Array.isArray(obj.capabilities)) {
    manifest.capabilities = obj.capabilities as string[];
  }
  return { ok: true, manifest };
}
