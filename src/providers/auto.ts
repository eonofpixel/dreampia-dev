/**
 * Auto provider selection — 모델 + 설치된 CLI 에 따라 최적 provider 선택.
 *
 * Spec: docs/session/cross-ai-sync.md (P0 — CLI 인증 위임)
 *
 * 우선순위:
 *   1. Model prefix 가 claude → CliProvider(claude)  (CLI 설치 시)
 *   2. Model prefix 가 codex/gpt/o1 → CliProvider(codex)  (CLI 설치 시)
 *   3. 그 외 (모델 매칭 실패 / CLI 미설치) → MockProvider (개발 fallback)
 *
 * MAIN process 전용 — renderer 에서 호출 X (subprocess sandbox 불가).
 */

import { CliProvider } from './cli/CliProvider';
import {
  detectCli,
  type CliDetectionResult,
  type CliInfo,
} from './cli/detect';
import { translateClaudeJsonl } from './cli/translateClaudeJsonl';
import { translateCodexJsonl } from './cli/translateCodexJsonl';
import { MockProvider } from './MockProvider';
import type { StreamingProvider } from './types';

export type ProviderSource = 'claude-cli' | 'codex-cli' | 'mock';

export interface AutoProviderResult {
  provider: StreamingProvider;
  source: ProviderSource;
  detected: CliDetectionResult;
}

/**
 * 모델 이름 + CLI 설치 상태로 best provider 선택.
 *
 * `signal` 은 CliProvider 에 전달되어 mid-stream abort 를 지원한다.
 */
export async function getDefaultProvider(
  model: string,
  signal?: AbortSignal
): Promise<AutoProviderResult> {
  const detected = await detectCli();
  const lower = model.toLowerCase();

  // model prefix 분류 (routing.ts 의 MODEL_PREFIXES 와 맞춤)
  const claudeFamily = ['claude-', 'sonnet-', 'opus-', 'haiku-'].some((p) =>
    lower.startsWith(p)
  );
  const codexFamily = ['gpt-', 'o1-', 'o3-', 'codex-'].some((p) =>
    lower.startsWith(p)
  );

  if (claudeFamily && detected.claude !== null) {
    return {
      provider: makeCliProvider(detected.claude, 'claude', signal),
      source: 'claude-cli',
      detected,
    };
  }
  if (codexFamily && detected.codex !== null) {
    return {
      provider: makeCliProvider(detected.codex, 'codex', signal),
      source: 'codex-cli',
      detected,
    };
  }

  // Fallback — 미설치 / 모르는 모델.
  return {
    provider: new MockProvider({ delayMs: 15 }),
    source: 'mock',
    detected,
  };
}

function makeCliProvider(
  info: CliInfo,
  provider: 'claude' | 'codex',
  signal?: AbortSignal
): CliProvider {
  return new CliProvider({
    binaryPath: info.path,
    provider,
    translate: provider === 'claude' ? translateClaudeJsonl : translateCodexJsonl,
    ...(signal !== undefined && { signal }),
  });
}
