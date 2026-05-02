/**
 * Capability — 30+ 세분화된 권한 enum + parent-child 관계.
 *
 * Spec: docs/permission/capabilities.md
 *
 * 모든 capability 는 정확히 이 enum 안에 있어야 함 (typo 방지: INV-1).
 * Sub-capability 는 부모 prefix + '.' + name 형식 (INV-2).
 *
 * 주의: 이 모듈은 main + preload + renderer 모두에서 import 가능해야 하므로
 * Node 전용 API (path, fs 등) 의존성 금지.
 */

import { z } from 'zod';

// ────────────────────────────────────────────────────────────
// Capability 전체 목록 (capabilities.md 의 union type 과 일치)
//
// 부모 capability (LOCAL_WRITE, LOCAL_OUTSIDE_CWD, NETWORK_REMOTE,
// SYSTEM_CLIPBOARD, SYSTEM_AUTOMATION) 도 포함 — LEVEL_CAPABILITIES /
// grant 에서 부모 단독 사용 가능해야 하기 때문.
// ────────────────────────────────────────────────────────────

export const ALL_CAPABILITIES = [
  // ── Local FS ──
  'LOCAL_READ',
  'LOCAL_READ.binary',
  'LOCAL_WRITE',
  'LOCAL_WRITE.create',
  'LOCAL_WRITE.modify',
  'LOCAL_WRITE.delete',
  'LOCAL_WRITE.rename',
  'LOCAL_OUTSIDE_CWD',
  'LOCAL_OUTSIDE_CWD.read',
  'LOCAL_OUTSIDE_CWD.write',

  // ── Execute ──
  'LOCAL_EXECUTE',
  'LOCAL_EXECUTE.background',
  'LOCAL_EXECUTE.elevated',

  // ── Network ──
  'NETWORK_LOCAL',
  'NETWORK_LAN',
  'NETWORK_REMOTE',
  'NETWORK_REMOTE.upload',
  'NETWORK_AI',
  'NETWORK_MCP',

  // ── Browser ──
  'BROWSER_NAVIGATE',
  'BROWSER_INTERACT',
  'BROWSER_DOWNLOAD',
  'BROWSER_SCREENSHOT',
  'BROWSER_DOM_READ',
  'BROWSER_COOKIE_READ',

  // ── System ──
  // SYSTEM_CLIPBOARD / SYSTEM_AUTOMATION 부모는 capabilities.md union 에는
  // 없지만 levels.md 에서 사용됨 — parent-child 일관성 위해 포함.
  'SYSTEM_CLIPBOARD',
  'SYSTEM_CLIPBOARD.read',
  'SYSTEM_CLIPBOARD.write',
  'SYSTEM_NOTIFICATION',
  'SYSTEM_TRAY',
  'SYSTEM_AUTOMATION',
  'SYSTEM_AUTOMATION.cron',
  'SYSTEM_AUTOMATION.event',
  'SYSTEM_HOTKEY',

  // ── Provider 통합 ──
  'PROVIDER_CLAUDE_CALL',
  'PROVIDER_CODEX_CALL',
  'PROVIDER_TOKEN_READ',

  // ── 플러그인 ──
  'PLUGIN_INSTALL',
  'PLUGIN_EXECUTE',
  'PLUGIN_NETWORK',
] as const;

export type Capability = (typeof ALL_CAPABILITIES)[number];

// Zod enum (런타임 검증)
export const CapabilitySchema = z.enum(ALL_CAPABILITIES);

// ────────────────────────────────────────────────────────────
// Parent-child 관계
// ────────────────────────────────────────────────────────────

/**
 * `child` 가 `parent` 의 sub-capability 인지 검사.
 *
 * 규칙: child 는 parent + '.' 로 시작해야 함.
 * 동일 capability 는 parent 가 아님 (false 반환).
 *
 * @example
 *   isParentCapability('LOCAL_WRITE', 'LOCAL_WRITE.modify')  // true
 *   isParentCapability('LOCAL_WRITE', 'LOCAL_WRITE')         // false (동일)
 *   isParentCapability('LOCAL_WRITE', 'LOCAL_READ')          // false
 */
export function isParentCapability(parent: Capability, child: Capability): boolean {
  return child.startsWith(`${parent}.`);
}
