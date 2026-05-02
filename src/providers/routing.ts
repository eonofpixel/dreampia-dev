/**
 * 모델 → Provider 자동 라우팅.
 *
 * Spec: docs/session/cross-ai-sync.md (호출 라우팅 섹션)
 *
 * 단순 prefix 매칭 — 모델 이름을 보고 어느 provider 에 속하는지 추론.
 * 모르는 모델이면 throw (조용히 default 로 가면 디버깅이 어려워짐).
 */

import type { Provider } from '@/types';

// ────────────────────────────────────────────────────────────
// Prefix 매핑
// ────────────────────────────────────────────────────────────

/**
 * Provider 별 인식 가능한 prefix.
 *
 * 추가 모델은 여기에 등록. 매칭은 toLowerCase() 후 startsWith().
 */
export const MODEL_PREFIXES: Record<Provider, string[]> = {
  claude: ['claude-', 'sonnet-', 'opus-', 'haiku-'],
  codex: ['gpt-', 'o1-', 'o3-', 'codex-'],
};

// ────────────────────────────────────────────────────────────
// inferProvider
// ────────────────────────────────────────────────────────────

/**
 * 모델 이름에서 provider 추론.
 *
 * @throws 알 수 없는 모델 이름인 경우. (default 로 안 가는 이유: silent
 *   misrouting 방지. 새 모델 등록을 강제하기 위함.)
 */
export function inferProvider(model: string): Provider {
  if (typeof model !== 'string' || model.length === 0) {
    throw new Error(`inferProvider: model name must be non-empty string (got: ${model})`);
  }
  const lower = model.toLowerCase();

  for (const prefix of MODEL_PREFIXES.claude) {
    if (lower.startsWith(prefix)) return 'claude';
  }
  for (const prefix of MODEL_PREFIXES.codex) {
    if (lower.startsWith(prefix)) return 'codex';
  }

  throw new Error(
    `inferProvider: cannot infer provider from model name "${model}". ` +
      `Register a prefix in MODEL_PREFIXES (src/providers/routing.ts) to fix.`
  );
}

// ────────────────────────────────────────────────────────────
// 편의 헬퍼
// ────────────────────────────────────────────────────────────

export function isClaudeModel(model: string): boolean {
  try {
    return inferProvider(model) === 'claude';
  } catch {
    return false;
  }
}

export function isCodexModel(model: string): boolean {
  try {
    return inferProvider(model) === 'codex';
  } catch {
    return false;
  }
}
