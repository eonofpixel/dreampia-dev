/**
 * DangerCheck — 위험 패턴 자동 차단 + Secret 검출.
 *
 * Spec: docs/permission/danger-patterns.md
 *
 * 두 영역:
 *  1. DANGEROUS_PATTERNS — capability + target string 매칭 시 deny/modal/warn
 *  2. SECRET_PATTERNS — 사용자 입력 텍스트에서 비밀 정보 검출
 *
 * INV-1: deny_silent 는 사용자 grant 로 override 불가 (Resolver 가 보장)
 * INV-4: secret 검출은 high confidence 만 자동 차단
 */

import type { Capability } from './Capability';

// ────────────────────────────────────────────────────────────
// DangerRule — capability + pattern 기반 자동 차단 규칙
// ────────────────────────────────────────────────────────────

export type DangerAction = 'deny_silent' | 'require_modal' | 'warn';

export interface DangerRule {
  capability: Capability;
  pattern: RegExp;
  action: DangerAction;
  /** 사용자 표시용 메시지 (선택). */
  message?: string;
}

/**
 * 위험 패턴 목록 (danger-patterns.md 21-51 verbatim).
 *
 * 사용자가 LEVEL 3 (full_access) 거나 명시적 grant 가 있어도 무조건 차단 / 모달 강제.
 */
export const DANGEROUS_PATTERNS: readonly DangerRule[] = [
  // ── 시스템 파일 ──
  { capability: 'LOCAL_WRITE', pattern: /^C:\\Windows\\System32/i, action: 'deny_silent' },
  { capability: 'LOCAL_WRITE', pattern: /^C:\\ProgramData/i, action: 'require_modal' },
  { capability: 'LOCAL_WRITE', pattern: /\/etc\/(passwd|shadow|sudoers)/, action: 'deny_silent' },

  // ── 사용자 secrets ──
  { capability: 'LOCAL_READ', pattern: /\.ssh\/id_rsa$/, action: 'require_modal' },
  { capability: 'LOCAL_READ', pattern: /\.ssh\/id_(ed25519|ecdsa|dsa)$/, action: 'require_modal' },
  { capability: 'LOCAL_READ', pattern: /\.aws\/credentials$/, action: 'require_modal' },
  { capability: 'LOCAL_READ', pattern: /\.gcp\/.*\.json$/i, action: 'require_modal' },
  { capability: 'LOCAL_READ', pattern: /\.env$/, action: 'warn' },
  { capability: 'LOCAL_READ', pattern: /\.pem$/, action: 'warn' },
  { capability: 'LOCAL_READ', pattern: /\.key$/, action: 'warn' },

  // ── 시스템 명령 ──
  {
    capability: 'LOCAL_EXECUTE',
    pattern: /\b(rm\s+-rf\s+\/(?!\*)|del\s+\/[a-z](?!:))/i,
    action: 'deny_silent',
  },
  { capability: 'LOCAL_EXECUTE', pattern: /\bformat\s+[a-z]:/i, action: 'deny_silent' },
  { capability: 'LOCAL_EXECUTE', pattern: /\bdd\s+if=.+\s+of=\/dev\//, action: 'deny_silent' },
  { capability: 'LOCAL_EXECUTE', pattern: /\bsudo\b/, action: 'require_modal' },
  { capability: 'LOCAL_EXECUTE', pattern: /\brunas\b/i, action: 'require_modal' },
  {
    capability: 'LOCAL_EXECUTE',
    pattern: /\b(reg\s+(delete|add)|regedit)\b/i,
    action: 'require_modal',
  },

  // ── Network 데이터 송신 ──
  {
    capability: 'NETWORK_REMOTE.upload',
    pattern: /pastebin\.com|gist\.github\.com|0x0\.st|ix\.io|hastebin/,
    action: 'require_modal',
  },

  // ── Browser ──
  { capability: 'BROWSER_NAVIGATE', pattern: /^javascript:/i, action: 'deny_silent' },
  { capability: 'BROWSER_NAVIGATE', pattern: /^file:\/\/\/.*\.\.\/.*$/, action: 'warn' },
];

// ────────────────────────────────────────────────────────────
// checkDangerousPattern — capability + target 검사
// ────────────────────────────────────────────────────────────

export interface DangerCheckResult {
  action: DangerAction;
  rule: DangerRule;
}

/**
 * 주어진 capability + target 이 위험 패턴에 매칭되는지 검사.
 * 매칭되면 첫 매치의 { action, rule } 반환, 그렇지 않으면 null.
 *
 * 매칭 조건:
 *  - rule.capability === capability (정확히)
 *  - rule.pattern.test(target) === true
 *
 * 비고: 동일 capability 에 대한 여러 rule 이 있을 수 있음 — 첫 매치만 반환.
 * Resolver 는 결과의 action 으로 deny/modal/warn 결정.
 */
export function checkDangerousPattern(
  capability: Capability,
  target: string
): DangerCheckResult | null {
  for (const rule of DANGEROUS_PATTERNS) {
    if (rule.capability !== capability) continue;
    if (rule.pattern.test(target)) {
      return { action: rule.action, rule };
    }
  }
  return null;
}

// ────────────────────────────────────────────────────────────
// Secret 검출 (사용자 입력 시)
// ────────────────────────────────────────────────────────────

export interface SecretPattern {
  name: string;
  regex: RegExp;
  /** 추가 키워드 필요 (false positive 줄임). 텍스트에 lowercase 포함되어야. */
  requireContext?: string;
  /** true 면 자동 차단 X, 알림만. */
  lowConfidence?: boolean;
}

/**
 * Secret 패턴 목록 (danger-patterns.md 109-131).
 */
export const SECRET_PATTERNS: readonly SecretPattern[] = [
  // ── API keys ──
  { name: 'OpenAI API Key', regex: /\bsk-[A-Za-z0-9-]{20,}\b/ },
  { name: 'Anthropic API Key', regex: /\bsk-ant-[A-Za-z0-9-]{32,}\b/ },
  { name: 'Google API Key', regex: /\bAIza[A-Za-z0-9_-]{35}\b/ },
  { name: 'GitHub PAT', regex: /\bghp_[A-Za-z0-9]{36}\b/ },
  { name: 'GitHub OAuth', regex: /\bgho_[A-Za-z0-9]{36}\b/ },
  { name: 'AWS Access Key', regex: /\b(AKIA|ASIA)[A-Z0-9]{16}\b/ },
  { name: 'AWS Secret', regex: /\b[A-Za-z0-9/+=]{40}\b/, requireContext: 'aws' },
  { name: 'Slack Token', regex: /\bxox[abp]-[A-Za-z0-9-]{20,}\b/ },
  { name: 'Stripe Key', regex: /\b(sk_live_|pk_live_|rk_live_)[A-Za-z0-9]{20,}\b/ },

  // ── 한국어 환경 ──
  { name: '주민번호', regex: /\b\d{6}-[1-4]\d{6}\b/ },
  { name: '한국 휴대전화', regex: /\b01[0-9]-?\d{3,4}-?\d{4}\b/ },

  // ── 카드 ──
  { name: 'Visa', regex: /\b4\d{3}[\s-]?\d{4}[\s-]?\d{4}[\s-]?\d{4}\b/ },
  { name: 'MasterCard', regex: /\b5[1-5]\d{2}[\s-]?\d{4}[\s-]?\d{4}[\s-]?\d{4}\b/ },

  // ── 비밀번호 같은 (low confidence) ──
  {
    name: '비밀번호 후보',
    regex: /password\s*[:=]\s*['"]?[^\s'"]{6,}/i,
    lowConfidence: true,
  },
];

export interface SecretMatch {
  pattern_name: string;
  /** 마스킹 처리된 매치 텍스트 (전체 노출 X). */
  matched_text: string;
  position: number;
  confidence: 'low' | 'high';
}

/**
 * 텍스트에서 비밀 패턴을 찾아 SecretMatch 배열 반환.
 *
 * 규칙 (danger-patterns.md 144-165):
 *  - 각 패턴별 첫 매치만 반환 (다중 매치 X)
 *  - requireContext 가 있으면 텍스트 lowercase 에 키워드 포함되어야
 *  - lowConfidence 면 confidence='low' (자동 차단 X, 알림만)
 *  - matched_text 는 maskSecret 로 마스킹
 */
export function checkUserInputForSecrets(text: string): SecretMatch[] {
  const matches: SecretMatch[] = [];
  const lowerText = text.toLowerCase();

  for (const pattern of SECRET_PATTERNS) {
    const m = text.match(pattern.regex);
    if (!m || m.index === undefined) continue;

    // Context 검증 (있는 경우)
    if (pattern.requireContext && !lowerText.includes(pattern.requireContext)) {
      continue;
    }

    matches.push({
      pattern_name: pattern.name,
      matched_text: maskSecret(m[0]),
      position: m.index,
      confidence: pattern.lowConfidence ? 'low' : 'high',
    });
  }

  return matches;
}

/**
 * Secret 마스킹: 8자 이하면 '****', 그 이상이면 처음 4 + '****' + 끝 4.
 */
export function maskSecret(secret: string): string {
  if (secret.length <= 8) return '****';
  return secret.slice(0, 4) + '****' + secret.slice(-4);
}
