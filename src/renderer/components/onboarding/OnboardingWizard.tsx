/**
 * OnboardingWizard — Phase 3 B2 첫 실행 5-step UI.
 *
 * 흐름 (Spec: docs/ia/onboarding.md):
 *   Step 1 — Welcome (👋 + [시작하기])
 *   Step 2 — CLI 감지 (Claude/Codex 각각 ✓ / ✗ + 설치 명령)
 *   Step 3 — 인증 안내 (`claude /login` 또는 `codex login`)
 *   Step 4 — Workspace 선택 (workspace.pickFolder())
 *   Step 5 — 첫 채팅 + 추천 prompt 4개
 *
 * 한국어 톤: 정중 + 간결. 영문 단어는 코드/명령에만.
 *
 * z-index: full-screen overlay (`fixed inset-0 z-50`) — 사이드바/채팅/프리뷰
 * 모두 덮어 sole focus 보장.
 *
 * Skip:
 *   - 우측 상단 [건너뛰기] 모든 step 에서 표시
 *   - DEV 모드에선 Esc 키로도 skip
 *
 * 첫 채팅 위임:
 *   step 5 의 추천 chip 클릭 시 onComplete(prompt) → App.tsx 가
 *   onboarding 완료 + 새 세션 + chat input 자동 채움 (auto-submit X).
 */

import { useCallback, useEffect, useState } from 'react';
import {
  Check,
  X,
  Folder,
  FolderOpen,
  Hand,
  Search,
  Server,
  Sparkles,
  Terminal,
  KeyRound,
  ShieldCheck,
} from 'lucide-react';
import type { CliInfoShape } from '../chat/ChatPanel';
import { PERMISSION_LEVEL_LABELS_KO, type PermissionLevel } from '@/types';
import { useT } from '../../i18n';

/**
 * v0.3.0 — wizard step 3 의 provider selector 옵션.
 * 'auto' 는 model-prefix 기반 routing (default).
 * 'mock' 은 dev/test 옵트인 — 일반 사용자 헷갈림 방지를 위해 라벨에 "(개발용)" 표기.
 */
type DefaultProviderChoice = 'auto' | 'claude' | 'codex' | 'mock';

interface ProviderOption {
  value: DefaultProviderChoice;
  label: string;
  hint: string;
  /** CLI 미감지 시 disable + grayed out + 'CLI 미설치' 뱃지. */
  requiresCli?: 'claude' | 'codex';
}

const PROVIDER_OPTIONS: ReadonlyArray<ProviderOption> = [
  {
    value: 'auto',
    label: '자동 (모델별 선택)',
    hint: '모델 이름에 따라 Claude / Codex 자동 분기',
  },
  {
    value: 'claude',
    label: 'Claude CLI 우선',
    hint: '모든 모델을 Claude CLI 로 보냅니다',
    requiresCli: 'claude',
  },
  {
    value: 'codex',
    label: 'Codex CLI 우선',
    hint: '모든 모델을 Codex CLI 로 보냅니다',
    requiresCli: 'codex',
  },
  {
    value: 'mock',
    label: 'Mock (개발용)',
    hint: '실제 AI 호출 없이 로컬 응답만 반환',
  },
];

/**
 * v0.3.0 — wizard step 4 의 permission preset selector.
 * 라벨은 src/types/permission.ts 의 PERMISSION_LEVEL_LABELS_KO 사용.
 */
const PERMISSION_OPTIONS: ReadonlyArray<{
  value: PermissionLevel;
  hint: string;
}> = [
  {
    value: 'read_only',
    hint: '파일 읽기만 허용. 쓰기/실행은 매번 사용자 승인',
  },
  {
    value: 'workspace_write',
    hint: '권장. 작업 폴더 안에서 자유롭게 쓰기/실행',
  },
  {
    value: 'full_access',
    hint: '폴더 외부 접근 허용. 신중하게 사용',
  },
];

interface CliDetection {
  claude: CliInfoShape | null;
  codex: CliInfoShape | null;
}

interface PickedWorkspace {
  path: string;
  name: string;
}

/**
 * v0.9.0 — wizard 가 노출하는 MCP 상태 미니 안내.
 *
 * count: 등록된 서버 수.
 * readyCount: status='ready' 인 서버 수.
 * errorCount: status='error' 인 서버 수.
 *
 * 모두 0 이면 "없음" 안내. 1+ 이면 status badge 와 [더 알아보기] 링크.
 */
interface McpMiniStatus {
  count: number;
  readyCount: number;
  errorCount: number;
}

export interface OnboardingWizardProps {
  /**
   * Wizard 완료 처리. firstPrompt 있으면 App.tsx 가 새 세션 + 자동 채움.
   * 없으면 단순 main app 진입.
   */
  onComplete: (firstPrompt?: string) => void | Promise<void>;
  /** [건너뛰기] — 마찬가지로 완료 처리되지만 추천 prompt 스킵. */
  onSkip: () => void | Promise<void>;
  /**
   * v0.9.0 — wizard 의 MCP 미니 안내에서 [더 알아보기] 클릭 시 호출.
   * 미지정 시 링크 자체를 숨김. App.tsx 가 SettingsModal('mcp' tab) 으로 wire up.
   */
  onOpenMcpSettings?: () => void;
}

const TOTAL_STEPS = 5;

const RECOMMENDED_PROMPTS: ReadonlyArray<string> = [
  '이 프로젝트 구조 분석해줘',
  '최근 변경 사항 리뷰',
  '테스트 통과시키기',
  '새 기능 구현 가이드',
];

export function OnboardingWizard({
  onComplete,
  onSkip,
  onOpenMcpSettings,
}: OnboardingWizardProps): React.JSX.Element {
  const t = useT();
  // 0..4 — Step 1 = index 0, Step 5 = index 4.
  const [step, setStep] = useState(0);
  const [cliStatus, setCliStatus] = useState<CliDetection | null>(null);
  const [cliDetecting, setCliDetecting] = useState(false);
  const [workspace, setWorkspace] = useState<PickedWorkspace | null>(null);
  const [pickingWorkspace, setPickingWorkspace] = useState(false);
  // v0.3.0 — provider / permission preset 선택. 초기값은 settings 에서 fetch
  // 시도 후 fallback. mount 직후 IPC 응답 도착 전까진 'auto' / 'workspace_write'.
  const [providerChoice, setProviderChoice] = useState<DefaultProviderChoice>('auto');
  const [permissionChoice, setPermissionChoice] = useState<PermissionLevel>('workspace_write');
  // v0.9.0 — wizard 의 MCP 미니 안내. 0/0/0 default.
  const [mcpStatus, setMcpStatus] = useState<McpMiniStatus>({
    count: 0,
    readyCount: 0,
    errorCount: 0,
  });

  // ── CLI 감지 — Step 2 진입 시 한 번 실행 ──────────────────
  useEffect(() => {
    if (step !== 1) return;
    if (cliStatus !== null) return; // 이미 감지됨, 다시 호출 X
    const ai = typeof window !== 'undefined' ? window.dreampia?.ai : undefined;
    if (ai === undefined || typeof ai.detectCli !== 'function') {
      // IPC 없으면 미감지 default — Step 3 가 Mock 안내 보여줌.
      setCliStatus({ claude: null, codex: null });
      return;
    }
    let cancelled = false;
    setCliDetecting(true);
    void (async () => {
      try {
        const result = await ai.detectCli();
        if (cancelled) return;
        if (result.ok) {
          setCliStatus({
            claude: result.value.claude,
            codex: result.value.codex,
          });
        } else {
          setCliStatus({ claude: null, codex: null });
        }
      } catch {
        if (!cancelled) setCliStatus({ claude: null, codex: null });
      } finally {
        if (!cancelled) setCliDetecting(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [step, cliStatus]);

  // ── Workspace 로드 — onMount 한 번 (이미 settings 에 있으면 재사용) ──
  useEffect(() => {
    const ws = typeof window !== 'undefined' ? window.dreampia?.workspace : undefined;
    if (ws === undefined || typeof ws.get !== 'function') return;
    let cancelled = false;
    void (async () => {
      try {
        const result = await ws.get();
        if (cancelled || !result.ok || result.value === null) return;
        setWorkspace(result.value);
      } catch {
        // ignore — 사용자가 step 4 에서 picker 호출
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // v0.3.0 — provider / permission 의 현재 settings 값을 onMount 한 번 fetch.
  // wizard 처음 보는 사용자는 default 그대로 두고 next 만 눌러도 OK — IPC 응답
  // 전엔 default 표시. 이미 한 번 wizard 끝낸 사용자 (reset 후 재진입) 는
  // 이전 선택이 그대로 보임.
  useEffect(() => {
    const appApi = typeof window !== 'undefined' ? window.dreampia?.app : undefined;
    if (appApi === undefined) return;
    let cancelled = false;
    void (async () => {
      try {
        if (typeof appApi.getDefaultProvider === 'function') {
          const result = await appApi.getDefaultProvider();
          if (!cancelled && result.ok) setProviderChoice(result.value);
        }
        if (typeof appApi.getDefaultPermissionLevel === 'function') {
          const result = await appApi.getDefaultPermissionLevel();
          if (!cancelled && result.ok) setPermissionChoice(result.value);
        }
      } catch {
        // 안전한 default 유지
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // v0.9.0 — MCP 서버 상태 fetch. step 2 (인증 가이드) 진입 시 표시되므로
  // mount 시 한 번 + step 변경 시 새로 fetch (다른 wizard 진입 후 변경 가능성).
  useEffect(() => {
    if (step !== 2) return;
    const mcpApi = typeof window !== 'undefined' ? window.dreampia?.mcp : undefined;
    if (mcpApi === undefined || typeof mcpApi.list !== 'function') return;
    let cancelled = false;
    void (async () => {
      try {
        const result = await mcpApi.list();
        if (cancelled || !result.ok) return;
        const servers = result.value;
        let readyCount = 0;
        let errorCount = 0;
        for (const s of servers) {
          if (s.status === 'ready') readyCount += 1;
          else if (s.status === 'error') errorCount += 1;
        }
        setMcpStatus({ count: servers.length, readyCount, errorCount });
      } catch {
        // ignore — 0/0/0 유지
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [step]);

  const goNext = useCallback((): void => {
    setStep((s) => Math.min(TOTAL_STEPS - 1, s + 1));
  }, []);

  const goPrev = useCallback((): void => {
    setStep((s) => Math.max(0, s - 1));
  }, []);

  const handleProviderChange = useCallback(async (next: DefaultProviderChoice): Promise<void> => {
    // Optimistic UI — 즉시 UI 업데이트. IPC 실패해도 사용자가 다시 시도 가능.
    setProviderChoice(next);
    const appApi = typeof window !== 'undefined' ? window.dreampia?.app : undefined;
    if (appApi === undefined || typeof appApi.setDefaultProvider !== 'function') return;
    try {
      await appApi.setDefaultProvider(next);
    } catch {
      // ignore — 다음 wizard step 으로 넘어가도 영속 실패는 사용자가 모름.
      // P2: error toast UI 가 추가되면 여기서 알림.
    }
  }, []);

  const handlePermissionChange = useCallback(async (next: PermissionLevel): Promise<void> => {
    setPermissionChoice(next);
    const appApi = typeof window !== 'undefined' ? window.dreampia?.app : undefined;
    if (appApi === undefined || typeof appApi.setDefaultPermissionLevel !== 'function') return;
    try {
      await appApi.setDefaultPermissionLevel(next);
    } catch {
      // ignore (P2: error toast)
    }
  }, []);

  const handlePickWorkspace = useCallback(async (): Promise<PickedWorkspace | null> => {
    const ws = typeof window !== 'undefined' ? window.dreampia?.workspace : undefined;
    if (ws === undefined || typeof ws.pickFolder !== 'function') return null;
    setPickingWorkspace(true);
    try {
      const result = await ws.pickFolder();
      if (result.ok && result.value !== null) {
        setWorkspace(result.value);
        return result.value;
      }
    } catch {
      // ignore — 사용자가 다시 시도 가능
    } finally {
      setPickingWorkspace(false);
    }
    return null;
  }, []);

  const handleSkip = useCallback((): void => {
    void onSkip();
  }, [onSkip]);

  const handleStartChat = useCallback(
    (prompt?: string): void => {
      void onComplete(prompt);
    },
    [onComplete]
  );

  // DEV 모드에서 Esc → skip 단축키 (개발 편의).
  useEffect(() => {
    if (!import.meta.env.DEV) return;
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') {
        handleSkip();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [handleSkip]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-bg-primary/95 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="onboarding-title"
      data-testid="onboarding-wizard"
    >
      <div className="w-full max-w-md rounded-lg border border-border-primary bg-bg-secondary p-8 shadow-lg">
        {/* Progress bar — Step n/5 표시 */}
        <div
          className="mb-6 flex items-center gap-1"
          role="progressbar"
          aria-valuemin={1}
          aria-valuemax={TOTAL_STEPS}
          aria-valuenow={step + 1}
          aria-label={`Step ${step + 1} of ${TOTAL_STEPS}`}
        >
          {Array.from({ length: TOTAL_STEPS }, (_, i) => (
            <div
              key={i}
              className={`h-1 flex-1 rounded ${i <= step ? 'bg-accent' : 'bg-bg-tertiary'}`}
            />
          ))}
        </div>

        {/* Step content */}
        <div className="min-h-[220px]">
          {step === 0 && <WelcomeStep onNext={goNext} />}
          {step === 1 && <CliDetectionStep cliStatus={cliStatus} detecting={cliDetecting} />}
          {step === 2 && (
            <AuthGuideStep
              cliStatus={cliStatus}
              providerChoice={providerChoice}
              onProviderChange={(v) => {
                void handleProviderChange(v);
              }}
              mcpStatus={mcpStatus}
              onOpenMcpSettings={onOpenMcpSettings}
            />
          )}
          {step === 3 && (
            <WorkspaceStep
              workspace={workspace}
              picking={pickingWorkspace}
              onPick={handlePickWorkspace}
              permissionChoice={permissionChoice}
              onPermissionChange={(v) => {
                void handlePermissionChange(v);
              }}
            />
          )}
          {step === 4 && (
            <FirstChatStep
              workspaceName={workspace?.name ?? null}
              onPickPrompt={handleStartChat}
              onStartEmpty={() => handleStartChat()}
            />
          )}
        </div>

        {/* Footer: ← 이전 / 다음 → / 건너뛰기 */}
        <div className="mt-6 flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={goPrev}
            disabled={step === 0}
            className="rounded-md px-3 py-1.5 text-sm text-text-secondary hover:bg-bg-tertiary disabled:cursor-not-allowed disabled:opacity-30"
            data-testid="onboarding-prev"
            aria-label={t('onboarding.prev')}
          >
            {t('onboarding.prev')}
          </button>

          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={handleSkip}
              className="text-xs text-text-tertiary hover:text-text-primary"
              data-testid="onboarding-skip"
              aria-label={t('onboarding.skip')}
            >
              {t('onboarding.skip')}
            </button>

            {step < TOTAL_STEPS - 1 && (
              <button
                type="button"
                onClick={goNext}
                className="rounded-md bg-accent px-4 py-1.5 text-sm font-medium text-white hover:bg-accent-hover"
                data-testid="onboarding-next"
                aria-label={t('onboarding.next')}
              >
                {t('onboarding.next')}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ────────────────────────────────────────────────────────────
// Step 1 — Welcome
// ────────────────────────────────────────────────────────────

function WelcomeStep({ onNext }: { onNext: () => void }): React.JSX.Element {
  const t = useT();
  return (
    <section className="text-center" data-testid="onboarding-step-welcome">
      <div className="flex justify-center text-text-tertiary" aria-hidden="true">
        <Hand className="h-12 w-12" />
      </div>
      <h1 id="onboarding-title" className="mt-4 text-xl font-semibold text-text-primary">
        {t('onboarding.welcome.title')}
      </h1>
      <p className="mt-2 text-sm leading-relaxed text-text-secondary">
        Claude Code 와 OpenAI Codex 를 한 번에 사용하는
        <br />
        오픈소스 AI 코딩 도구입니다.
      </p>
      <button
        type="button"
        onClick={onNext}
        className="mt-6 rounded-md bg-accent px-6 py-2 text-sm font-medium text-white hover:bg-accent-hover"
        data-testid="onboarding-start"
      >
        {t('onboarding.welcome.start')}
      </button>
    </section>
  );
}

// ────────────────────────────────────────────────────────────
// Step 2 — CLI 감지
// ────────────────────────────────────────────────────────────

function CliDetectionStep({
  cliStatus,
  detecting,
}: {
  cliStatus: CliDetection | null;
  detecting: boolean;
}): React.JSX.Element {
  return (
    <section data-testid="onboarding-step-cli">
      <header className="mb-4 flex items-center gap-2">
        <Terminal className="h-5 w-5 text-text-secondary" aria-hidden="true" />
        <h2 className="text-base font-semibold text-text-primary">CLI 감지</h2>
      </header>
      {cliStatus === null || detecting ? (
        <p
          className="flex items-center gap-1.5 text-sm text-text-secondary"
          data-testid="cli-detecting"
        >
          <Search aria-hidden="true" className="h-4 w-4" />
          <span>CLI 감지 중...</span>
        </p>
      ) : (
        <div className="space-y-3 text-sm">
          <CliRow
            name="Claude CLI"
            cli={cliStatus.claude}
            installCommand="npm install -g @anthropic-ai/claude-cli"
          />
          <CliRow
            name="Codex CLI"
            cli={cliStatus.codex}
            installCommand="npm install -g codex-cli"
          />
          {cliStatus.claude === null && cliStatus.codex === null && (
            <p className="mt-3 text-xs text-text-tertiary">
              CLI 가 설치되어 있지 않으면 Mock provider 로 진행합니다. 나중에 설정에서 다시 감지할
              수 있습니다.
            </p>
          )}
        </div>
      )}
    </section>
  );
}

function CliRow({
  name,
  cli,
  installCommand,
}: {
  name: string;
  cli: CliInfoShape | null;
  installCommand: string;
}): React.JSX.Element {
  if (cli !== null) {
    const version = cli.version ?? '?';
    return (
      <div className="flex items-start gap-2" data-testid={`cli-row-${name}`}>
        <Check className="mt-0.5 h-4 w-4 flex-shrink-0 text-green-500" aria-hidden="true" />
        <div className="flex-1">
          <p className="text-text-primary">
            <span className="font-medium">{name}</span>
            <span className="ml-1 text-text-tertiary">감지됨 (v{version})</span>
          </p>
          <p className="mt-0.5 truncate text-xs text-text-tertiary">{cli.path}</p>
        </div>
      </div>
    );
  }
  return (
    <div className="flex items-start gap-2" data-testid={`cli-row-${name}`}>
      <X className="mt-0.5 h-4 w-4 flex-shrink-0 text-text-tertiary" aria-hidden="true" />
      <div className="flex-1">
        <p className="text-text-primary">
          <span className="font-medium">{name}</span>
          <span className="ml-1 text-text-tertiary">미설치</span>
        </p>
        <pre className="mt-1 overflow-x-auto rounded bg-bg-tertiary px-2 py-1 text-xs text-text-secondary">
          {installCommand}
        </pre>
      </div>
    </div>
  );
}

// ────────────────────────────────────────────────────────────
// Step 3 — 인증 안내
// ────────────────────────────────────────────────────────────

function AuthGuideStep({
  cliStatus,
  providerChoice,
  onProviderChange,
  mcpStatus,
  onOpenMcpSettings,
}: {
  cliStatus: CliDetection | null;
  providerChoice: DefaultProviderChoice;
  onProviderChange: (next: DefaultProviderChoice) => void;
  mcpStatus: McpMiniStatus;
  onOpenMcpSettings?: () => void;
}): React.JSX.Element {
  const claudeDetected = cliStatus?.claude !== undefined && cliStatus?.claude !== null;
  const codexDetected = cliStatus?.codex !== undefined && cliStatus?.codex !== null;
  const noneDetected = !claudeDetected && !codexDetected;

  return (
    <section data-testid="onboarding-step-auth">
      <header className="mb-4 flex items-center gap-2">
        <KeyRound className="h-5 w-5 text-text-secondary" aria-hidden="true" />
        <h2 className="text-base font-semibold text-text-primary">인증 확인</h2>
      </header>
      {noneDetected ? (
        <div className="space-y-2 text-sm">
          <p className="text-text-secondary">설치된 CLI 가 없어 Mock provider 로 진행됩니다.</p>
          <p className="text-xs text-text-tertiary">
            실제 AI 응답을 받으려면 이전 단계의 설치 명령을 실행한 뒤 앱을 다시 실행해 주세요.
          </p>
        </div>
      ) : (
        <div className="space-y-3 text-sm">
          <p className="text-text-secondary">
            아래 명령으로 각 CLI 에 로그인해 주세요. 이미 로그인되어 있다면 건너뛰어도 됩니다.
          </p>
          {claudeDetected && (
            <AuthRow
              name="Claude CLI"
              command="claude /login"
              hint="브라우저로 OAuth 인증이 진행됩니다."
            />
          )}
          {codexDetected && (
            <AuthRow name="Codex CLI" command="codex login" hint="OpenAI 계정으로 로그인하세요." />
          )}
        </div>
      )}

      {/* v0.3.0 — 기본 provider 선택 */}
      <div className="mt-5 border-t border-border-primary pt-4" data-testid="provider-selector">
        <p className="mb-2 text-sm font-medium text-text-primary">
          기본 Provider — 어떤 AI 를 우선 사용할까요?
        </p>
        <ul className="space-y-2 text-sm">
          {PROVIDER_OPTIONS.map((opt) => {
            const requiresClaude = opt.requiresCli === 'claude';
            const requiresCodex = opt.requiresCli === 'codex';
            const cliMissing =
              (requiresClaude && !claudeDetected) || (requiresCodex && !codexDetected);
            const disabled = cliMissing;
            const isSelected = providerChoice === opt.value;
            return (
              <li key={opt.value}>
                <label
                  className={`flex items-start gap-2 rounded-md border p-2 ${
                    isSelected
                      ? 'border-accent bg-bg-tertiary'
                      : 'border-border-primary hover:bg-bg-tertiary'
                  } ${disabled ? 'cursor-not-allowed opacity-50' : 'cursor-pointer'}`}
                  data-testid={`provider-option-${opt.value}`}
                >
                  <input
                    type="radio"
                    name="default-provider"
                    value={opt.value}
                    checked={isSelected}
                    onChange={() => {
                      if (!disabled) onProviderChange(opt.value);
                    }}
                    disabled={disabled}
                    className="mt-0.5"
                    aria-label={opt.label}
                  />
                  <div className="flex-1">
                    <p className="text-text-primary">
                      <span className="font-medium">{opt.label}</span>
                      {cliMissing && (
                        <span className="ml-2 rounded bg-bg-tertiary px-1.5 py-0.5 text-[10px] text-text-tertiary">
                          감지 안 됨
                        </span>
                      )}
                    </p>
                    <p className="text-xs text-text-tertiary">{opt.hint}</p>
                  </div>
                </label>
              </li>
            );
          })}
        </ul>
      </div>

      {/* v0.9.0 — MCP 서버 미니 안내 */}
      <McpMiniSection mcpStatus={mcpStatus} onOpenMcpSettings={onOpenMcpSettings} />
    </section>
  );
}

function McpMiniSection({
  mcpStatus,
  onOpenMcpSettings,
}: {
  mcpStatus: McpMiniStatus;
  onOpenMcpSettings?: () => void;
}): React.JSX.Element {
  return (
    <div className="mt-5 border-t border-border-primary pt-4" data-testid="onboarding-mcp-mini">
      <header className="mb-2 flex items-center gap-2">
        <Server className="h-4 w-4 text-text-secondary" aria-hidden="true" />
        <p className="text-sm font-medium text-text-primary">MCP 서버 (선택)</p>
      </header>
      {mcpStatus.count === 0 ? (
        <p className="text-xs text-text-tertiary" data-testid="onboarding-mcp-empty">
          등록된 MCP 서버가 없어요. 나중에 설정에서 추천 서버를 추가할 수 있어요.
        </p>
      ) : (
        <p className="text-xs text-text-secondary" data-testid="onboarding-mcp-summary">
          {mcpStatus.count}개 서버
          {mcpStatus.readyCount > 0 && ` · ${mcpStatus.readyCount}개 준비 완료`}
          {mcpStatus.errorCount > 0 && ` · ${mcpStatus.errorCount}개 오류`}
        </p>
      )}
      {onOpenMcpSettings !== undefined && (
        <button
          type="button"
          onClick={onOpenMcpSettings}
          className="mt-1 text-xs text-accent hover:underline"
          data-testid="onboarding-mcp-open-settings"
        >
          더 알아보기 →
        </button>
      )}
    </div>
  );
}

function AuthRow({
  name,
  command,
  hint,
}: {
  name: string;
  command: string;
  hint: string;
}): React.JSX.Element {
  return (
    <div data-testid={`auth-row-${name}`}>
      <p className="text-text-primary">
        <span className="font-medium">{name}</span>
      </p>
      <pre className="mt-1 overflow-x-auto rounded bg-bg-tertiary px-2 py-1 text-xs text-text-secondary">
        {command}
      </pre>
      <p className="mt-0.5 text-xs text-text-tertiary">{hint}</p>
    </div>
  );
}

// ────────────────────────────────────────────────────────────
// Step 4 — Workspace 선택
// ────────────────────────────────────────────────────────────

function WorkspaceStep({
  workspace,
  picking,
  onPick,
  permissionChoice,
  onPermissionChange,
}: {
  workspace: PickedWorkspace | null;
  picking: boolean;
  onPick: () => Promise<PickedWorkspace | null>;
  permissionChoice: PermissionLevel;
  onPermissionChange: (next: PermissionLevel) => void;
}): React.JSX.Element {
  return (
    <section data-testid="onboarding-step-workspace">
      <header className="mb-4 flex items-center gap-2">
        <Folder className="h-5 w-5 text-text-secondary" aria-hidden="true" />
        <h2 className="text-base font-semibold text-text-primary">작업 폴더 선택</h2>
      </header>
      <p className="mb-4 text-sm text-text-secondary">
        AI 가 읽고 수정할 폴더를 선택하세요. 선택한 폴더 외부 파일은 기본적으로 보호됩니다.
      </p>
      {workspace !== null ? (
        <div
          className="flex items-start gap-2 rounded-md border border-border-primary bg-bg-tertiary p-3 text-sm"
          data-testid="workspace-current"
        >
          <FolderOpen className="mt-0.5 h-4 w-4 flex-shrink-0 text-accent" aria-hidden="true" />
          <div className="min-w-0 flex-1">
            <p className="font-medium text-text-primary">{workspace.name}</p>
            <p className="truncate text-xs text-text-tertiary">{workspace.path}</p>
          </div>
        </div>
      ) : (
        <p className="rounded-md border border-dashed border-border-primary p-3 text-xs text-text-tertiary">
          아직 선택된 폴더가 없습니다.
        </p>
      )}
      <button
        type="button"
        onClick={() => {
          void onPick();
        }}
        disabled={picking}
        className="mt-3 rounded-md border border-border-primary bg-bg-elevated px-3 py-1.5 text-sm text-text-primary hover:bg-bg-tertiary disabled:cursor-not-allowed disabled:opacity-50"
        data-testid="workspace-pick"
      >
        {picking ? '폴더 선택 중...' : workspace !== null ? '다른 폴더 선택' : '폴더 찾아보기'}
      </button>

      {/* v0.3.0 — 기본 권한 preset */}
      <div className="mt-5 border-t border-border-primary pt-4" data-testid="permission-selector">
        <header className="mb-2 flex items-center gap-2">
          <ShieldCheck className="h-4 w-4 text-text-secondary" aria-hidden="true" />
          <p className="text-sm font-medium text-text-primary">AI 가 기본으로 가질 권한</p>
        </header>
        <ul className="space-y-2 text-sm">
          {PERMISSION_OPTIONS.map((opt) => {
            const isSelected = permissionChoice === opt.value;
            return (
              <li key={opt.value}>
                <label
                  className={`flex items-start gap-2 rounded-md border p-2 cursor-pointer ${
                    isSelected
                      ? 'border-accent bg-bg-tertiary'
                      : 'border-border-primary hover:bg-bg-tertiary'
                  }`}
                  data-testid={`permission-option-${opt.value}`}
                >
                  <input
                    type="radio"
                    name="default-permission-level"
                    value={opt.value}
                    checked={isSelected}
                    onChange={() => onPermissionChange(opt.value)}
                    className="mt-0.5"
                    aria-label={PERMISSION_LEVEL_LABELS_KO[opt.value]}
                  />
                  <div className="flex-1">
                    <p className="text-text-primary">
                      <span className="font-medium">{PERMISSION_LEVEL_LABELS_KO[opt.value]}</span>
                      {opt.value === 'workspace_write' && (
                        <span className="ml-2 rounded bg-accent/20 px-1.5 py-0.5 text-[10px] text-accent">
                          권장
                        </span>
                      )}
                    </p>
                    <p className="text-xs text-text-tertiary">{opt.hint}</p>
                  </div>
                </label>
              </li>
            );
          })}
        </ul>
      </div>
    </section>
  );
}

// ────────────────────────────────────────────────────────────
// Step 5 — 첫 채팅
// ────────────────────────────────────────────────────────────

function FirstChatStep({
  workspaceName,
  onPickPrompt,
  onStartEmpty,
}: {
  workspaceName: string | null;
  onPickPrompt: (prompt: string) => void;
  onStartEmpty: () => void;
}): React.JSX.Element {
  return (
    <section data-testid="onboarding-step-firstchat">
      <header className="mb-3 flex items-center gap-2">
        <Sparkles className="h-5 w-5 text-accent" aria-hidden="true" />
        <h2 className="text-base font-semibold text-text-primary">Dreampia-Dev 사용 준비 완료</h2>
      </header>
      <p className="mb-4 text-sm text-text-secondary">
        {workspaceName !== null
          ? `${workspaceName} 작업을 시작합니다. 추천 명령으로 빠르게 시작하거나 직접 입력해 주세요.`
          : '추천 명령으로 빠르게 시작하거나 직접 입력해 주세요.'}
      </p>
      <ul className="space-y-2" data-testid="recommended-prompts">
        {RECOMMENDED_PROMPTS.map((prompt) => (
          <li key={prompt}>
            <button
              type="button"
              onClick={() => onPickPrompt(prompt)}
              className="block w-full rounded-md border border-border-primary bg-bg-elevated px-3 py-2 text-left text-sm text-text-primary hover:border-accent hover:bg-bg-tertiary"
              data-testid={`prompt-${prompt}`}
            >
              <span aria-hidden="true">• </span>
              <span>{prompt}</span>
            </button>
          </li>
        ))}
      </ul>
      <button
        type="button"
        onClick={onStartEmpty}
        className="mt-4 w-full rounded-md bg-accent px-4 py-2 text-sm font-medium text-white hover:bg-accent-hover"
        data-testid="onboarding-finish"
      >
        직접 시작하기
      </button>
    </section>
  );
}
