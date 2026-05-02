/**
 * Targets — Grant target 매칭 / specificity / 만료 / 외부 디렉토리 검사.
 *
 * Spec: docs/permission/grants.md (lines 181-265, 271-291)
 *
 * 주의: Node `path` 모듈에 의존하지 않음.
 * 이 코드는 main + preload + renderer 모두에서 import 될 수 있어 POSIX 스타일
 * 정규화를 inline 으로 수행 (forward slash, lowercase drive letter on Windows).
 */

import type { GrantTarget, PermissionGrant } from '../types/permission';

// ────────────────────────────────────────────────────────────
// ResolvedTarget — tool 호출 시점에서 해석된 실제 target
// ────────────────────────────────────────────────────────────

export interface ResolvedTarget {
  kind: 'path' | 'url' | 'domain' | 'global';
  /** 실제 경로 / URL / 도메인. global 인 경우엔 빈 문자열 가능. */
  value: string;
}

// ────────────────────────────────────────────────────────────
// Path 정규화 (POSIX 스타일, Node 의존 X)
// ────────────────────────────────────────────────────────────

/**
 * 경로 정규화:
 *  1. backslash → forward slash
 *  2. trailing slash 제거 (root 제외)
 *  3. 전체 lowercase (Windows 드라이브 레터 포함, case-insensitive 비교용)
 *  4. 중복 slash 압축
 *
 * 비고: '.' / '..' resolution 은 하지 않음. Grant 시점에 이미 absolute 라고 가정 (INV-6).
 */
function normalizePath(p: string): string {
  let out = p.replace(/\\/g, '/');
  // 중복 slash 압축 (단, 'protocol://' 같은 시퀀스는 path 가 아니므로 무관)
  out = out.replace(/\/+/g, '/');
  // trailing slash 제거 (단, 'C:/' 같은 root 는 'c:' 로 됨 — 하위 비교에서도 일관)
  if (out.length > 1 && out.endsWith('/')) {
    out = out.slice(0, -1);
  }
  return out.toLowerCase();
}

// ────────────────────────────────────────────────────────────
// matchesTarget — kind 별 매칭 분기
// ────────────────────────────────────────────────────────────

/**
 * Grant target 이 resolved target 과 매칭되는지 검사.
 *
 * 규칙 (grants.md 189-228):
 * - global → 무조건 매칭
 * - kind 다름 → false (단 grant 가 global 이면 kind 무관)
 * - path → recursive 면 prefix, 아니면 exact (case-insensitive)
 * - url → exact match
 * - domain → '*.example.com' wildcard 지원
 */
export function matchesTarget(
  grantTarget: GrantTarget,
  resolvedTarget: ResolvedTarget
): boolean {
  // global 은 모든 것 매칭
  if (grantTarget.kind === 'global') {
    return true;
  }

  // kind 가 다르면 매칭 X
  if (grantTarget.kind !== resolvedTarget.kind) {
    return false;
  }

  switch (grantTarget.kind) {
    case 'path':
      return matchesPath(grantTarget, resolvedTarget.value);
    case 'url':
      return grantTarget.url === resolvedTarget.value;
    case 'domain':
      return matchesDomain(grantTarget.domain, resolvedTarget.value);
  }
}

function matchesPath(
  grant: Extract<GrantTarget, { kind: 'path' }>,
  target: string
): boolean {
  const grantPath = normalizePath(grant.path);
  const targetPath = normalizePath(target);

  if (!grant.recursive) {
    return grantPath === targetPath;
  }

  // recursive: target 이 grantPath 자체 또는 하위 경로
  return targetPath === grantPath || targetPath.startsWith(grantPath + '/');
}

function matchesDomain(grantDomain: string, target: string): boolean {
  const g = grantDomain.toLowerCase();
  const t = target.toLowerCase();

  if (g.startsWith('*.')) {
    const suffix = g.slice(2);
    return t === suffix || t.endsWith('.' + suffix);
  }
  return g === t;
}

// ────────────────────────────────────────────────────────────
// mostSpecific — 여러 grant 중 가장 구체적인 것 선택
// ────────────────────────────────────────────────────────────

/**
 * Specificity 점수 (grants.md 244-265):
 *  - target.kind 점수: url=30, path-non-recursive=25, domain-non-wildcard=20,
 *    path-recursive=15, domain-wildcard=10, global=0
 *  - sub-capability (.) 포함 시 +5
 *  - scope: one_time=4, turn=3, session=2, persistent=1
 */
export function specificity(grant: PermissionGrant): number {
  let score = 0;

  switch (grant.target.kind) {
    case 'global':
      score = 0;
      break;
    case 'domain':
      score = grant.target.domain.startsWith('*.') ? 10 : 20;
      break;
    case 'url':
      score = 30;
      break;
    case 'path':
      score = grant.target.recursive ? 15 : 25;
      break;
  }

  if (grant.capability.includes('.')) {
    score += 5;
  }

  const scopeScore = { one_time: 4, turn: 3, session: 2, persistent: 1 } as const;
  score += scopeScore[grant.scope];

  return score;
}

/**
 * 여러 grant 중 specificity 점수가 가장 높은 것 반환.
 * 빈 배열이면 throw — 호출자가 사전 검사해야 함.
 */
export function mostSpecific(grants: readonly PermissionGrant[]): PermissionGrant {
  if (grants.length === 0) {
    throw new Error('mostSpecific() called with empty grants array');
  }
  // reduce 는 초기값 없을 시 첫 요소 사용 — 비어있지 않음을 위에서 보장.
  return grants.reduce((best, current) =>
    specificity(current) > specificity(best) ? current : best
  );
}

// ────────────────────────────────────────────────────────────
// isExpired — grant 만료 / 취소 검사
// ────────────────────────────────────────────────────────────

/**
 * grant 가 만료 / 취소되었는지 검사.
 *
 * 규칙 (grants.md 273-277):
 *  - revoked_at 이 설정되어 있으면 만료
 *  - expires_at 이 설정되어 있고 현재 시각보다 과거면 만료
 *  - 그 외엔 유효
 */
export function isExpired(grant: PermissionGrant, now: Date = new Date()): boolean {
  if (grant.revoked_at) return true;
  if (grant.expires_at && grant.expires_at < now.toISOString()) return true;
  return false;
}

// ────────────────────────────────────────────────────────────
// isOutsideWorkspace — workspace root 외부 경로 검사
// ────────────────────────────────────────────────────────────

/**
 * targetPath 가 workspaceRoot 외부에 있는지 검사.
 *
 * 정규화 후 prefix 비교 (case-insensitive):
 *  - target == root 또는 root 의 하위 → 내부 (false 반환)
 *  - 그 외 → 외부 (true 반환)
 */
export function isOutsideWorkspace(targetPath: string, workspaceRoot: string): boolean {
  const t = normalizePath(targetPath);
  const r = normalizePath(workspaceRoot);
  if (t === r) return false;
  if (t.startsWith(r + '/')) return false;
  return true;
}
