/**
 * PluginCapabilityGate — Plugin manifest.capabilities 사용자 승인 (v1.1.23).
 *
 * Spec: docs/v1.x-roadmap.md (P1 v1.1.x Plugin Loader / Sandbox + capability).
 *
 * 책임:
 *  - Plugin loaded 시 manifest.capabilities 를 검사 → 승인 안 된 capability 면
 *    `IpcPermissionConfirmer` 통해 사용자 1회 승인 요청.
 *  - 승인 결과를 in-memory `Map<pluginName, Set<capability>>` 캐시 (현재 process
 *    동안만). 'always' grant 는 향후 sessions.permission.grants 와 별개로
 *    `~/.dreampia/plugins/<name>/.granted.json` 에 영속 (v1.1.24+ 후속).
 *  - 본 commit MVP: 캐시만 + audit. 영속은 후속.
 */

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
}

export class PluginCapabilityGate {
  private readonly confirmer: PermissionConfirmer | undefined;
  private readonly auditSink: (event: PluginCapabilityAuditEvent) => void;
  /** Plugin name → 승인된 capability set (in-memory, process 생애). */
  private readonly granted = new Map<string, Set<string>>();
  /** Plugin name → 명시적으로 거절된 capability set (재요청 차단). */
  private readonly denied = new Map<string, Set<string>>();

  constructor(options: PluginCapabilityGateOptions = {}) {
    this.confirmer = options.confirmer;
    this.auditSink =
      options.auditSink ??
      ((e): void => {
        if (e.event !== 'plugin.cap_granted') {
          console.warn(
            `[PluginCapabilityGate] ${e.event} ${e.plugin_name}/${e.capability}`
          );
        }
      });
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

  /** Test/shutdown — 모든 grant 제거 (process restart 시뮬레이션). */
  clearAll(): void {
    this.granted.clear();
    this.denied.clear();
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
    return true;
  }
}
