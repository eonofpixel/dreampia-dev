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

import { app } from 'electron';
import type { PermissionLevel } from '@/types';
import { CliProvider } from './cli/CliProvider';
import { detectCli, type CliDetectionResult, type CliInfo } from './cli/detect';
import { translateClaudeJsonl } from './cli/translateClaudeJsonl';
import { translateCodexJsonl } from './cli/translateCodexJsonl';
import { getCliCommandOverride } from './cli/vcr';
import { shouldRequireFixture } from './cli/vcrLoader';
import { existsSync } from 'node:fs';
import { AnthropicProvider } from './api/AnthropicProvider';
import { OpenAIProvider } from './api/OpenAIProvider';
import { MockProvider } from './MockProvider';
import { readSettings } from '../main/settings';
import type { StreamingProvider } from './types';

export type ProviderSource = 'claude-cli' | 'codex-cli' | 'mock';

export interface AutoProviderResult {
  provider: StreamingProvider;
  source: ProviderSource;
  detected: CliDetectionResult;
}

/**
 * v0.3.0 — 사용자가 wizard / 설정에서 선택한 default_provider override.
 *
 *   undefined / 'auto' → 종전 동작 (model prefix 기반 routing)
 *   'claude' / 'codex' → CLI 가 감지된 경우 강제 사용 (model prefix 무시)
 *   'mock'             → MockProvider 강제 (단 shouldAllowMockFallback() 통과 시).
 *
 * Production 에서 'mock' 을 강제하려는 사용자가 있을 수 있어 fail-closed 가
 * 깨지진 않게 — packaged 빌드는 여전히 DREAMPIA_ALLOW_MOCK_PROVIDER 가
 * 필요하다 (preview 디버깅용 옵션).
 */
export type DefaultProviderOverride = 'auto' | 'claude' | 'codex' | 'mock';

/**
 * 모델 이름 + CLI 설치 상태로 best provider 선택.
 *
 * `signal` 은 CliProvider 에 전달되어 mid-stream abort 를 지원한다.
 * `cwd` 는 CLI subprocess 작업 디렉토리다. Renderer/main IPC 의
 * workspace_root 를 여기까지 명시적으로 전달해 process.cwd() 의 우연성에
 * 기대지 않는다.
 * `permissionLevel` 은 session.permission.default_level 을 그대로 받아 CLI
 * 의 sandbox / tool-policy 옵션으로 매핑된다. 미지정 시 'workspace_write'.
 * `userDefaultProvider` (v0.3.0) — 사용자가 wizard 에서 선택한 override.
 * 'auto' 또는 undefined 면 model-prefix 기반 routing 으로 fallback.
 *
 * Spec: docs/permission/provider-mapping.md
 */
export async function getDefaultProvider(
  model: string,
  signal?: AbortSignal,
  cwd?: string,
  permissionLevel?: PermissionLevel,
  userDefaultProvider?: DefaultProviderOverride
): Promise<AutoProviderResult> {
  // ★ v1.1.5 (Codex Q10): CLI command override — DREAMPIA_TEST 보다 먼저.
  // drive harness 가 fake CLI replay 를 위해 사용. test-only IPC 회피.
  //   DREAMPIA_CLI_COMMAND=node DREAMPIA_CLI_PREARGS="tests/fixtures/fake-claude-cli.js"
  // model prefix 로 provider 결정 (claude / codex). detected 는 빈 결과.
  const cliOverride = getCliCommandOverride();
  if (cliOverride !== null) {
    // v1.1.4-hotfix-1 (SEC audit gap): replay 모드 prod gating. fake CLI 가
    // fixture 없을 때 exit 5 로 die 하지만, 사용자/CI 에는 generic 에러로 보임.
    // spawn 전에 명확히 fail-fast — fixture path 가 set 되어있으면 file 존재
    // 강제, 미설정이면 cliOverride 가 fake-cli 일 때만 경고 (다른 binary
    // override 는 fixture 무관).
    if (shouldRequireFixture()) {
      const fixturePath = process.env.DREAMPIA_VCR_FIXTURE;
      if (fixturePath !== undefined && fixturePath.length > 0 && !existsSync(fixturePath)) {
        throw new Error(
          `VCR replay mode (DREAMPIA_VCR_MODE=replay): fixture not found at ${fixturePath}. ` +
            `Use DREAMPIA_VCR_MODE=record to capture, or set DREAMPIA_VCR_FIXTURE to a valid path.`
        );
      }
    }
    const lower = model.toLowerCase();
    const codexFamily = ['gpt-', 'o1-', 'o3-', 'codex-'].some((p) => lower.startsWith(p));
    const provider: 'claude' | 'codex' = codexFamily ? 'codex' : 'claude';
    const timeoutMs = parseTimeoutMsEnv();
    return {
      provider: new CliProvider({
        binaryPath: cliOverride.command,
        provider,
        translate: provider === 'claude' ? translateClaudeJsonl : translateCodexJsonl,
        ...(signal !== undefined && { signal }),
        ...(cwd !== undefined && { cwd }),
        ...(permissionLevel !== undefined && { permissionLevel }),
        ...(timeoutMs !== undefined && { timeout_ms: timeoutMs }),
        preArgs: cliOverride.pre_args,
      }),
      source: provider === 'claude' ? 'claude-cli' : 'codex-cli',
      detected: { claude: null, codex: null },
    };
  }

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

  // v1.5.1: Direct API key 가 settings 에 있으면 우선 사용 (CLI detect 보다
  // 먼저). 사용자가 explicit 으로 입력한 key 라 의도 명확.
  // userDefaultProvider === 'claude'/'codex' 명시도 호환 — 그 경우 vendor 매칭.
  // test 환경 (app.getPath mock 미적용) 에서 readSettings 가 throw 할 수 있음.
  let settings: ReturnType<typeof readSettings>;
  try {
    settings = readSettings();
  } catch {
    settings = {};
  }
  const lower = model.toLowerCase();
  const claudeFamily = ['claude-', 'sonnet-', 'opus-', 'haiku-'].some((p) => lower.startsWith(p));
  const codexFamily = ['gpt-', 'o1-', 'o3-', 'codex-'].some((p) => lower.startsWith(p));
  if (
    typeof settings.api_key_anthropic === 'string' &&
    settings.api_key_anthropic.length > 0 &&
    (claudeFamily || userDefaultProvider === 'claude')
  ) {
    return {
      provider: new AnthropicProvider({
        apiKey: settings.api_key_anthropic,
        ...(signal !== undefined && { signal }),
      }),
      source: 'claude-cli', // UI 호환 — 'direct-api' 는 후속 enum 추가.
      detected: { claude: null, codex: null },
    };
  }
  if (
    typeof settings.api_key_openai === 'string' &&
    settings.api_key_openai.length > 0 &&
    (codexFamily || userDefaultProvider === 'codex')
  ) {
    return {
      provider: new OpenAIProvider({
        apiKey: settings.api_key_openai,
        ...(signal !== undefined && { signal }),
      }),
      source: 'codex-cli',
      detected: { claude: null, codex: null },
    };
  }

  const detected = await detectCli();

  // v0.3.0 — 사용자 명시 선택은 model-prefix routing 보다 우선.
  // 'auto' 는 종전 동작이므로 분기 X.
  if (userDefaultProvider === 'claude' && detected.claude !== null) {
    return {
      provider: makeCliProvider(detected.claude, 'claude', signal, cwd, permissionLevel),
      source: 'claude-cli',
      detected,
    };
  }
  if (userDefaultProvider === 'codex' && detected.codex !== null) {
    return {
      provider: makeCliProvider(detected.codex, 'codex', signal, cwd, permissionLevel),
      source: 'codex-cli',
      detected,
    };
  }
  if (userDefaultProvider === 'mock' && shouldAllowMockFallback()) {
    return {
      provider: new MockProvider({ delayMs: 15 }),
      source: 'mock',
      detected,
    };
  }
  // 사용자가 명시했지만 그 CLI 가 감지 안 된 경우 → 종전 routing 으로 fallback
  // 하여 silent 실패 대신 가능한 다른 provider 를 시도. mock 의 경우는
  // production 에서 fail-closed 가 보장되어야 하므로 fallback 통과 시켜 둔다.

  // v1.5.1: claudeFamily / codexFamily 는 위에서 이미 계산됨.
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
  // 명시적 opt-in — dev/CI/E2E 가 mock 활성화. preview build 디버깅에도 유용.
  if (process.env.DREAMPIA_ALLOW_MOCK_PROVIDER === '1') return true;
  // app.isPackaged 가 Electron 의 canonical production marker.
  // packaged build (NSIS/DMG/AppImage) 에서만 true → 그 경우엔 fail-closed.
  // unpackaged 실행 (npm run dev, e2e 의 dist/main/index.js, vitest) 에선
  // false → mock 허용.
  //
  // 왜 NODE_ENV 가 아닌가: Codex audit 발견 — packaged Electron 은 NODE_ENV 가
  // 빈 문자열인 경우가 많아 `!== 'production'` 이 true 가 되며 mock 이
  // 새어나갔다. Mock 에 fallback 하면 사용자는 가짜 응답을 받게 되어 매우 위험.
  if (app.isPackaged) return false;
  return true;
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
  const timeoutMs = parseTimeoutMsEnv();
  return new CliProvider({
    binaryPath: info.path,
    provider,
    translate: provider === 'claude' ? translateClaudeJsonl : translateCodexJsonl,
    ...(signal !== undefined && { signal }),
    ...(cwd !== undefined && { cwd }),
    ...(permissionLevel !== undefined && { permissionLevel }),
    ...(timeoutMs !== undefined && { timeout_ms: timeoutMs }),
  });
}

/**
 * v1.9.0 (A3) — `DREAMPIA_CLI_TIMEOUT_MS` env 파싱.
 *
 * - 미설정 / 빈 문자열 / parse 실패 / `<= 0` → `undefined` (timeout 없음, opt-in)
 * - 양수 정수 → 그대로 ms 로 적용
 *
 * Spec: docs/adr/0001-cli-provider-timeout.md
 *
 * Future: settings.json `cli_timeout_ms` 가 env 보다 우선하도록 확장.
 */
function parseTimeoutMsEnv(): number | undefined {
  const raw = process.env.DREAMPIA_CLI_TIMEOUT_MS;
  if (raw === undefined || raw.length === 0) return undefined;
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) return undefined;
  return Math.floor(n);
}
