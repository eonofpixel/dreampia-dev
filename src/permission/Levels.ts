/**
 * Levels — 4단계 권한 level 별 capability set 매핑.
 *
 * Spec: docs/permission/levels.md
 *
 * 주의:
 * - Set 사용 (O(1) 조회).
 * - 'LOCAL_WRITE.delete' 는 workspace_write 에 포함 X (별도 confirm 필요, levels.md 165-166).
 * - 'LOCAL_EXECUTE.elevated' 는 full_access 에 포함되지만 매번 confirm 필요 — 그건 tool
 *   orchestrator 의 책임 (levels.md 177).
 * - custom 은 빈 Set — 사용자 grant 가 채움.
 */

import type { Capability } from './Capability';
import type { PermissionLevel } from '../types/permission';

// ────────────────────────────────────────────────────────────
// LEVEL 1: read_only
// ────────────────────────────────────────────────────────────

const READ_ONLY_CAPABILITIES: ReadonlySet<Capability> = new Set<Capability>([
  'LOCAL_READ',
  'NETWORK_LOCAL',
  'NETWORK_AI',
  'SYSTEM_NOTIFICATION',
]);

// ────────────────────────────────────────────────────────────
// LEVEL 2: workspace_write (read_only 모두 + LOCAL_WRITE/EXECUTE 등)
//
// 주의: LOCAL_WRITE.delete 는 별도 confirm 이라 포함 X (spec 명시).
// ────────────────────────────────────────────────────────────

const WORKSPACE_WRITE_CAPABILITIES: ReadonlySet<Capability> = new Set<Capability>([
  ...READ_ONLY_CAPABILITIES,
  'LOCAL_WRITE',
  'LOCAL_WRITE.create',
  'LOCAL_WRITE.modify',
  'LOCAL_WRITE.rename',
  // 'LOCAL_WRITE.delete' 는 별도 confirm
  'LOCAL_EXECUTE',
  'NETWORK_REMOTE',
  'SYSTEM_CLIPBOARD.read',
]);

// ────────────────────────────────────────────────────────────
// LEVEL 3: full_access (workspace_write 모두 + 외부 / elevated / upload 등)
//
// 주의: LOCAL_EXECUTE.elevated 는 set 에 포함되어 있지만 사용 시 매번 confirm.
// 그건 tool orchestrator 책임 (resolver 단에서는 일반 capability).
// ────────────────────────────────────────────────────────────

const FULL_ACCESS_CAPABILITIES: ReadonlySet<Capability> = new Set<Capability>([
  ...WORKSPACE_WRITE_CAPABILITIES,
  'LOCAL_OUTSIDE_CWD',
  'LOCAL_OUTSIDE_CWD.read',
  'LOCAL_OUTSIDE_CWD.write',
  'LOCAL_EXECUTE.elevated',
  'NETWORK_REMOTE.upload',
  'SYSTEM_AUTOMATION',
  'SYSTEM_AUTOMATION.cron',
  'SYSTEM_AUTOMATION.event',
  'SYSTEM_CLIPBOARD.write',
  'SYSTEM_HOTKEY',
]);

// ────────────────────────────────────────────────────────────
// LEVEL 4: custom (빈 Set — 사용자 grant 가 채움)
// ────────────────────────────────────────────────────────────

const CUSTOM_CAPABILITIES: ReadonlySet<Capability> = new Set<Capability>();

// ────────────────────────────────────────────────────────────
// 통합 매핑
// ────────────────────────────────────────────────────────────

export const LEVEL_CAPABILITIES: Record<PermissionLevel, ReadonlySet<Capability>> = {
  read_only: READ_ONLY_CAPABILITIES,
  workspace_write: WORKSPACE_WRITE_CAPABILITIES,
  full_access: FULL_ACCESS_CAPABILITIES,
  custom: CUSTOM_CAPABILITIES,
};
