/**
 * Resolver — isAllowed() 5단계 권한 결정 알고리즘.
 *
 * Spec: docs/permission/resolver.md
 *
 * 우선순위 (resolver.md 20-63):
 *  1. findDeny → explicitly_denied
 *  2. checkDangerousPattern → dangerous_pattern
 *  3. plan.active && !isReadOnly → plan_mode_active
 *  4. findActiveGrants 매치 → allowed_by_grant
 *  5. defaultLevelDecides → allowed_by_default_level / requires_user_confirmation
 *
 * 순수 함수 — DB / audit / cache 부수효과 없음. 그건 호출자 책임.
 */

import type { Capability } from './Capability';
import { isParentCapability } from './Capability';
import type { PermissionGrant, PermissionLevel } from '../types/permission';
import type { Session } from '../types/session';
import { LEVEL_CAPABILITIES } from './Levels';
import { checkDangerousPattern, type DangerAction } from './DangerCheck';
import {
  isExpired,
  isOutsideWorkspace,
  matchesTarget,
  mostSpecific,
  type ResolvedTarget,
} from './Targets';

// ────────────────────────────────────────────────────────────
// 결정 결과 타입 (resolver.md 70-91)
// ────────────────────────────────────────────────────────────

export type DecisionReason =
  | 'allowed_by_grant'
  | 'allowed_by_default_level'
  | 'auto_grant'
  | 'explicitly_denied'
  | 'dangerous_pattern'
  | 'plan_mode_active'
  | 'level_does_not_allow'
  | 'requires_user_confirmation';

export interface GrantDecision {
  allowed: boolean;
  reason: DecisionReason;

  /** 매칭된 grant (allowed=true 인 경우). */
  grant?: PermissionGrant;
  /** 차단한 deny grant (explicitly_denied). */
  deny_grant?: PermissionGrant;
  /** dangerous_pattern 또는 사용자 confirmation 시점의 액션. */
  action?: DangerAction | 'ask';
  /** 사용자 표시용 힌트. */
  hint?: string;
}

// ────────────────────────────────────────────────────────────
// isReadOnly (resolver.md 192-200) — Plan 모드에서도 허용되는 capability
// ────────────────────────────────────────────────────────────

export function isReadOnly(capability: Capability): boolean {
  return (
    capability === 'LOCAL_READ' ||
    capability === 'NETWORK_LOCAL' ||
    capability === 'BROWSER_NAVIGATE' ||
    capability === 'BROWSER_DOM_READ' ||
    capability === 'BROWSER_SCREENSHOT' ||
    capability === 'NETWORK_AI' ||
    capability === 'SYSTEM_NOTIFICATION'
  );
}

// ────────────────────────────────────────────────────────────
// findDeny (resolver.md 168-185)
// ────────────────────────────────────────────────────────────

/**
 * 명시적 deny grant 검색.
 *
 * Deny grant 의 capability 필드는 `__deny__:${capability}` 형식.
 * 우리 모델은 deny 도 같은 PermissionGrant 사용 (별도 테이블 X).
 *
 * 비고: deny capability 는 일반 Capability enum 에 없는 문자열이므로
 * grants.capability 를 string 으로 비교 (zod 스키마는 string 통과시킴).
 */
export function findDeny(
  capability: Capability,
  target: ResolvedTarget,
  session: Session
): PermissionGrant | null {
  const denyKey = `__deny__:${capability}`;
  const found = session.permission.grants
    .filter((g) => !isExpired(g))
    .find((g) => g.capability === denyKey && matchesTarget(g.target, target));
  return found ?? null;
}

// ────────────────────────────────────────────────────────────
// findActiveGrants (resolver.md 95-115)
// ────────────────────────────────────────────────────────────

/**
 * Active 한 (만료/취소 X) + capability 매칭 (정확 또는 부모) + target 매칭 grant 모두 반환.
 */
export function findActiveGrants(
  capability: Capability,
  target: ResolvedTarget,
  session: Session
): PermissionGrant[] {
  return session.permission.grants
    .filter((g) => !isExpired(g))
    .filter((g) => {
      // capability 매칭: 정확 일치 OR g.capability 가 부모이고 capability 가 자식
      // g.capability 는 Capability 또는 deny string ('__deny__:...') 일 수 있음.
      if (g.capability === capability) return true;
      // deny grant 는 여기서 제외
      if (g.capability.startsWith('__deny__:')) return false;
      // parent → child
      return isParentCapability(g.capability as Capability, capability);
    })
    .filter((g) => matchesTarget(g.target, target));
}

// ────────────────────────────────────────────────────────────
// defaultLevelDecides (resolver.md 122-160)
// ────────────────────────────────────────────────────────────

/**
 * Level 의 기본 capability set 으로 결정.
 *
 * 규칙:
 *  - level 의 set 이 capability 정확히 포함하거나, 부모 capability 포함 → allowed
 *  - workspace_write + LOCAL_* + target 이 workspace 외부 → level_does_not_allow
 *  - 그 외 → requires_user_confirmation
 *
 * 비고: workspaceRoot 는 Session 에 직접 없으므로 호출자가 별도 전달.
 * TODO(PM-9 후속): Session.workspace.root 를 활용하도록 통합 — 현재는 optional 4번째 인자로 받음.
 */
export function defaultLevelDecides(
  capability: Capability,
  target: ResolvedTarget,
  level: PermissionLevel,
  workspaceRoot?: string
): GrantDecision {
  const allowedSet = LEVEL_CAPABILITIES[level];

  // Sub-capability 도 부모 통해 허용
  const allowed =
    allowedSet.has(capability) ||
    Array.from(allowedSet).some((parent) => isParentCapability(parent, capability));

  if (allowed) {
    // workspace_write level 은 추가 검증: LOCAL_* 가 workspace 외부면 거부
    if (
      level === 'workspace_write' &&
      capability.startsWith('LOCAL_') &&
      target.kind === 'path' &&
      workspaceRoot &&
      isOutsideWorkspace(target.value, workspaceRoot)
    ) {
      return {
        allowed: false,
        reason: 'level_does_not_allow',
        hint: '작업 디렉토리 외부 접근은 추가 권한 필요',
      };
    }

    return {
      allowed: true,
      reason: 'allowed_by_default_level',
    };
  }

  return {
    allowed: false,
    reason: 'requires_user_confirmation',
    action: 'ask',
    hint: `현재 level (${level}) 은 ${capability} 미포함. 권한 요청 필요.`,
  };
}

// ────────────────────────────────────────────────────────────
// isAllowed — 5단계 메인 알고리즘
// ────────────────────────────────────────────────────────────

/**
 * capability + target 이 session 의 권한 정책상 허용되는지 결정.
 *
 * 5단계 우선순위 (resolver.md 20-63 verbatim):
 *  1. 명시적 deny → explicitly_denied
 *  2. 위험 패턴 → dangerous_pattern
 *  3. Plan 모드 + write/execute → plan_mode_active
 *  4. Active grant 매치 → allowed_by_grant
 *  5. Default level → allowed_by_default_level | requires_user_confirmation
 *
 * INV-3: Plan 모드 활성 시 write/execute 거부 (level 무관)
 * INV-4: dangerous_pattern 은 모든 level / grant 우선
 * INV-5: explicitly_denied > everything else
 *
 * @param capability 검사할 권한
 * @param target 해석된 target (path/url/domain/global)
 * @param session 현재 세션 상태 (grants 포함)
 * @param workspaceRoot 선택. workspace_write level 의 LOCAL_* 외부 검사용.
 *                     생략 시 외부 검사 skip.
 */
export function isAllowed(
  capability: Capability,
  target: ResolvedTarget,
  session: Session,
  workspaceRoot?: string
): GrantDecision {
  // ── 1. 명시적 deny (highest priority) ──
  const denied = findDeny(capability, target, session);
  if (denied) {
    return {
      allowed: false,
      reason: 'explicitly_denied',
      deny_grant: denied,
    };
  }

  // ── 2. 위험 패턴 ──
  const danger = checkDangerousPattern(capability, target.value);
  if (danger) {
    return {
      allowed: false,
      reason: 'dangerous_pattern',
      action: danger.action,
      hint: danger.rule.message,
    };
  }

  // ── 3. Plan 모드 ──
  if (session.plan.active && !isReadOnly(capability)) {
    return {
      allowed: false,
      reason: 'plan_mode_active',
      hint: 'Plan 모드에서는 read-only capability 만 허용됩니다.',
    };
  }

  // ── 4. Active grant 매치 ──
  const matches = findActiveGrants(capability, target, session);
  if (matches.length > 0) {
    const grant = mostSpecific(matches);
    return {
      allowed: true,
      reason: 'allowed_by_grant',
      grant,
    };
  }

  // ── 5. Default level ──
  return defaultLevelDecides(
    capability,
    target,
    session.permission.default_level,
    workspaceRoot
  );
}
