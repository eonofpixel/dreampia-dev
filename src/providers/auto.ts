/**
 * Auto provider selection — 모델 + 설치된 CLI 에 따라 최적 provider 선택.
 *
 * Spec: docs/session/cross-ai-sync.md (P0 — CLI 인증 위임)
 *
 * 우선순위:
 *   1. Model prefix 가 claude → CliProvider(claude)  (CLI 설치 시)
 *   2. Model prefix 가 codex/gpt/o1 → CliProvider(codex)  (CLI 설치 시)
 *   3. 그 외 (모델 매칭 실패 / CLI 미설치)
 *      - test/dev explicitly allowed → MockProvider
 *      - production → fail closed (never fake a successful AI response)
 *
 * MAIN process 전용 — renderer 에서 호출 X (subprocess sandbox 불가).
 */

import type { PermissionLevel } from '@/types';
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
 * `cwd` 는 CLI subprocess 작업 디렉토리다. Renderer/main IPC 의
 * workspace_root 를 여기까지 명시적으로 전달해 process.cwd() 의 우연성에
 * 기대지 않는다.
 * `permissionLevel` 은 session.permission.default_level 을 그대로 받아 CLI
 * 의 sandbox / tool-policy 옵션으로 매핑된다. 미지정 시 'workspace_write'.
 * Spec: docs/permission/provider-mapping.md
 */
export async function getDefaultProvider(
  model: string,
  signal?: AbortSignal,
  cwd?: string,
  permissionLevel?: PermissionLevel
): Promise<AutoProviderResult> {
  // ★ E2E test 환경 (DREAMPIA_TEST=1) 에선 CLI 감지/사용 강제 disable.
  // 이유: 실제 CLI 가 설치돼 있으면 인증 안 된 상태로 stream 실패하여
  // assistant turn 이 'failed' 상태로 끝남 (실제 e2e 실행 중 발견).
  // Mock provider 로 강제 fallback 하여 deterministic 검증.
  if (process.env.DREAMPIA_TEST === '1') {
    return {
      provider: new MockProvider({ delayMs: 15, testToolTrigger: true }),
      source: 'mock',
      detected: { claude: null, codex: null },
    };
  }

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
      provider: makeCliProvider(detected.claude, 'claude', signal, cwd, permissionLevel),
      source: 'claude-cli',
      detected,
    };
  }
  if (codexFamily && detected.codex !== null) {
    return {
      provider: makeCliProvider(detected.codex, 'codex', signal, cwd, permissionLevel),
      source: 'codex-cli',
      detected,
    };
  }

  // Development fallback only. Production must not silently pretend that a
  // real AI provider completed the request.
  if (shouldAllowMockFallback()) {
    return {
      provider: new MockProvider({ delayMs: 15 }),
      source: 'mock',
      detected,
    };
  }

  throw new Error(buildNoProviderMessage(model, detected));
}

function shouldAllowMockFallback(): boolean {
  if (process.env.DREAMPIA_ALLOW_MOCK_PROVIDER === '1') return true;
  return process.env.NODE_ENV !== 'production';
}

function buildNoProviderMessage(model: string, detected: CliDetectionResult): string {
  const available = [
    detected.claude !== null ? `Claude CLI (${detected.claude.path})` : null,
    detected.codex !== null ? `Codex CLI (${detected.codex.path})` : null,
  ].filter((v): v is string => v !== null);
  const availableText = available.length > 0 ? available.join(', ') : 'none';
  return `No production provider available for model "${model}". Detected CLI providers: ${availableText}.`;
}

function makeCliProvider(
  info: CliInfo,
  provider: 'claude' | 'codex',
  signal?: AbortSignal,
  cwd?: string,
  permissionLevel?: PermissionLevel
): CliProvider {
  return new CliProvider({
    binaryPath: info.path,
    provider,
    translate: provider === 'claude' ? translateClaudeJsonl : translateCodexJsonl,
    ...(signal !== undefined && { signal }),
    ...(cwd !== undefined && { cwd }),
    ...(permissionLevel !== undefined && { permissionLevel }),
  });
}
