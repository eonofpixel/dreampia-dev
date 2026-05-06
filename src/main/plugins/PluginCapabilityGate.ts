/**
 * PluginCapabilityGate — Plugin manifest.capabilities 사용자 승인 (v1.1.23).
 *
 * Spec: docs/v1.x-roadmap.md (P1 v1.1.x Plugin Loader / Sandbox + capability).
 *
 * 책임:
 *  - Plugin loaded 시 manifest.capabilities 를 검사 → 승인 안 된 capability 면
 *    `IpcPermissionConfirmer` 통해 사용자 1회 승인 요청.
 *  - 승인 결과를 in-memory `Map<pluginName, Set<capability>>` 캐시 (현재 process
 *    동안만).
 *  - v1.6.7 — 'always' decision 은 `<storageDir>/<plugin>/.granted.json` 에
 *    파일 영속. 다음 process 시작 시 자동 로드 → 사용자 재승인 X. 'once' /
 *    'session' 은 영속 X (의도된 한정 grant).
 */

import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { join } from 'node:path';

import type {
  PermissionConfirmer,
  PermissionGrantDuration,
  PermissionRequest,
} from '../../tools';

export interface PluginCapabilityAuditEvent {
  timestamp: string;
  event: 'plugin.cap_granted' | 'plugin.cap_denied' | 'plugin.cap_no_confirmer';
  plugin_name: string;
  capability: string;
  duration?: PermissionGrantDuration;
}

export interface PluginCapabilityGateOptions {
  /** Production 은 IpcPermissionConfirmer 주입. 미지정 시 모든 capability 거절. */
  confirmer?: PermissionConfirmer;
  auditSink?: (event: PluginCapabilityAuditEvent) => void;
  /**
   * v1.6.7 — `<storageDir>/<plugin>/.granted.json` 에 'always' decision 영속.
   * 미지정 시 파일 영속 X (in-memory 만). production 은 보통
   * `path.join(app.getPath('userData'), 'plugin-grants')` 주입.
   */
  storageDir?: string;
}

interface GrantedFileShape {
  /** 영속된 capability 이름. duplicate 는 read 시 dedup. */
  capabilities: string[];
}

const GRANTED_FILENAME = '.granted.json';

export class PluginCapabilityGate {
  private readonly confirmer: PermissionConfirmer | undefined;
  private readonly auditSink: (event: PluginCapabilityAuditEvent) => void;
  private readonly storageDir: string | undefined;
  /** Plugin name → 승인된 capability set (in-memory, process 생애). */
  private readonly granted = new Map<string, Set<string>>();
  /** Plugin name → 명시적으로 거절된 capability set (재요청 차단). */
  private readonly denied = new Map<string, Set<string>>();
  /**
   * v1.6.7 — 어떤 capability 가 'always' 로 영속된 상태인지 추적 — 'session' /
   * 'once' 가 같은 cap 을 grant 하더라도 file write 가 발생하지 않도록.
   */
  private readonly persisted = new Map<string, Set<string>>();

  constructor(options: PluginCapabilityGateOptions = {}) {
    this.confirmer = options.confirmer;
    this.storageDir = options.storageDir;
    this.auditSink =
      options.auditSink ??
      ((e): void => {
        if (e.event !== 'plugin.cap_granted') {
          console.warn(
            `[PluginCapabilityGate] ${e.event} ${e.plugin_name}/${e.capability}`
          );
        }
      });
    if (this.storageDir !== undefined) {
      this.loadAllPersisted(this.storageDir);
    }
  }

  /**
   * v1.6.7 — 생성자에서 한 번만 호출. storageDir 의 모든 `<plugin>/.granted.json`
   * 을 스캔해 in-memory granted + persisted set 채움. 손상된 JSON / 권한 문제는
   * silent skip (grant 없는 상태로 fallback).
   */
  private loadAllPersisted(dir: string): void {
    if (!existsSync(dir)) return;
    let entries: string[];
    try {
      entries = readdirSync(dir);
    } catch {
      return;
    }
    for (const entry of entries) {
      const pluginDir = join(dir, entry);
      let isDir = false;
      try {
        isDir = statSync(pluginDir).isDirectory();
      } catch {
        continue;
      }
      if (!isDir) continue;
      const file = join(pluginDir, GRANTED_FILENAME);
      if (!existsSync(file)) continue;
      try {
        const raw = readFileSync(file, 'utf-8');
        const parsed: unknown = JSON.parse(raw);
        if (parsed === null || typeof parsed !== 'object') continue;
        const obj = parsed as Record<string, unknown>;
        if (!Array.isArray(obj['capabilities'])) continue;
        const caps = obj['capabilities'].filter(
          (x): x is string => typeof x === 'string' && x.length > 0
        );
        if (caps.length === 0) continue;
        const grantedSet = new Set<string>(caps);
        this.granted.set(entry, grantedSet);
        this.persisted.set(entry, new Set<string>(caps));
      } catch {
        // corrupt file → skip. 다음 'always' 시 overwrite.
      }
    }
  }

  /**
   * v1.6.7 — 'always' grant 시점에 파일 1회 write. 같은 cap 을 다시 'always'
   * 받아도 persisted set 에 있으면 write skip (idempotent).
   */
  private persistAlways(pluginName: string, capability: string): void {
    if (this.storageDir === undefined) return;
    const persistedSet = this.persisted.get(pluginName) ?? new Set<string>();
    if (persistedSet.has(capability)) return;
    persistedSet.add(capability);
    this.persisted.set(pluginName, persistedSet);
    const pluginDir = join(this.storageDir, pluginName);
    try {
      mkdirSync(pluginDir, { recursive: true });
      const data: GrantedFileShape = {
        capabilities: Array.from(persistedSet).sort(),
      };
      writeFileSync(join(pluginDir, GRANTED_FILENAME), JSON.stringify(data, null, 2), 'utf-8');
    } catch (err) {
      // write 실패 → in-memory 만 유지. 다음 process restart 시 재요청.
      const msg = err instanceof Error ? err.message : String(err);
      console.warn(
        `[PluginCapabilityGate] persist failed for ${pluginName}/${capability}: ${msg}`
      );
    }
  }

  /**
   * Plugin 의 manifest.capabilities 모두 ensure. 이미 승인된 건 skip.
   * 거절된 건 false (다시 묻지 X).
   *
   * @returns 모든 capability 승인됨 → true. 하나라도 거절 → false.
   */
  async ensureGranted(
    pluginName: string,
    capabilities: ReadonlyArray<string>
  ): Promise<boolean> {
    const grantedSet = this.granted.get(pluginName) ?? new Set<string>();
    const deniedSet = this.denied.get(pluginName) ?? new Set<string>();
    // Map 에 ref 가 새 Set 이면 방금 만든 것이라 set 에 등록.
    if (!this.granted.has(pluginName)) this.granted.set(pluginName, grantedSet);
    if (!this.denied.has(pluginName)) this.denied.set(pluginName, deniedSet);

    for (const cap of capabilities) {
      if (grantedSet.has(cap)) continue;
      if (deniedSet.has(cap)) return false;
      const result = await this.requestOne(pluginName, cap);
      if (!result) {
        deniedSet.add(cap);
        return false;
      }
      grantedSet.add(cap);
    }
    return true;
  }

  /** Test inspection. */
  isGranted(pluginName: string, capability: string): boolean {
    return this.granted.get(pluginName)?.has(capability) === true;
  }

  /**
   * Test/shutdown — in-memory grant 제거. v1.6.7 기준 file 영속은 보존 — 다음
   * `loadAllPersisted` 호출 또는 새 인스턴스 생성 시 자동 복원. 파일까지 지우려면
   * 별도 API 가 필요 (현재 미노출 — 사용자가 수동 삭제).
   */
  clearAll(): void {
    this.granted.clear();
    this.denied.clear();
    this.persisted.clear();
  }

  private async requestOne(pluginName: string, capability: string): Promise<boolean> {
    if (this.confirmer === undefined) {
      this.auditSink({
        timestamp: new Date().toISOString(),
        event: 'plugin.cap_no_confirmer',
        plugin_name: pluginName,
        capability,
      });
      return false;
    }
    const request: PermissionRequest = {
      request_id: `plugin-${pluginName}-${capability}-${Date.now()}`,
      session_id: 'plugin-loader' as PermissionRequest['session_id'],
      turn_id: 'plugin-grant' as PermissionRequest['turn_id'],
      call_id: `plugin-${pluginName}` as PermissionRequest['call_id'],
      tool_id: `plugin/${pluginName}`,
      capability,
      target: { kind: 'global', value: '' },
      is_dangerous: true,
      tool_display_name: `Plugin: ${pluginName}`,
      requested_at: new Date().toISOString(),
    };
    let response;
    try {
      response = await this.confirmer.confirm(request);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.auditSink({
        timestamp: new Date().toISOString(),
        event: 'plugin.cap_denied',
        plugin_name: pluginName,
        capability,
      });
      console.error(`[PluginCapabilityGate] confirmer threw: ${msg}`);
      return false;
    }
    if (response.decision === 'deny') {
      this.auditSink({
        timestamp: new Date().toISOString(),
        event: 'plugin.cap_denied',
        plugin_name: pluginName,
        capability,
      });
      return false;
    }
    this.auditSink({
      timestamp: new Date().toISOString(),
      event: 'plugin.cap_granted',
      plugin_name: pluginName,
      capability,
      duration: response.decision,
    });
    // v1.6.7 — 'always' 만 영속. 'once' / 'session' 은 process 종료 시 사라짐.
    if (response.decision === 'always') {
      this.persistAlways(pluginName, capability);
    }
    return true;
  }
}
