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
import { Check, X, Folder, FolderOpen, Sparkles, Terminal, KeyRound } from 'lucide-react';
import type { CliInfoShape } from '../chat/ChatPanel';

interface CliDetection {
  claude: CliInfoShape | null;
  codex: CliInfoShape | null;
}

interface PickedWorkspace {
  path: string;
  name: string;
}

export interface OnboardingWizardProps {
  /**
   * Wizard 완료 처리. firstPrompt 있으면 App.tsx 가 새 세션 + 자동 채움.
   * 없으면 단순 main app 진입.
   */
  onComplete: (firstPrompt?: string) => void | Promise<void>;
  /** [건너뛰기] — 마찬가지로 완료 처리되지만 추천 prompt 스킵. */
  onSkip: () => void | Promise<void>;
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
}: OnboardingWizardProps): React.JSX.Element {
  // 0..4 — Step 1 = index 0, Step 5 = index 4.
  const [step, setStep] = useState(0);
  const [cliStatus, setCliStatus] = useState<CliDetection | null>(null);
  const [cliDetecting, setCliDetecting] = useState(false);
  const [workspace, setWorkspace] = useState<PickedWorkspace | null>(null);
  const [pickingWorkspace, setPickingWorkspace] = useState(false);

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

  const goNext = useCallback((): void => {
    setStep((s) => Math.min(TOTAL_STEPS - 1, s + 1));
  }, []);

  const goPrev = useCallback((): void => {
    setStep((s) => Math.max(0, s - 1));
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
              className={`h-1 flex-1 rounded ${
                i <= step ? 'bg-accent' : 'bg-bg-tertiary'
              }`}
            />
          ))}
        </div>

        {/* Step content */}
        <div className="min-h-[220px]">
          {step === 0 && <WelcomeStep onNext={goNext} />}
          {step === 1 && (
            <CliDetectionStep cliStatus={cliStatus} detecting={cliDetecting} />
          )}
          {step === 2 && <AuthGuideStep cliStatus={cliStatus} />}
          {step === 3 && (
            <WorkspaceStep
              workspace={workspace}
              picking={pickingWorkspace}
              onPick={handlePickWorkspace}
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
            aria-label="이전 단계"
          >
            ← 이전
          </button>

          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={handleSkip}
              className="text-xs text-text-tertiary hover:text-text-primary"
              data-testid="onboarding-skip"
              aria-label="건너뛰기"
            >
              건너뛰기
            </button>

            {step < TOTAL_STEPS - 1 && (
              <button
                type="button"
                onClick={goNext}
                className="rounded-md bg-accent px-4 py-1.5 text-sm font-medium text-white hover:bg-accent-hover"
                data-testid="onboarding-next"
                aria-label="다음 단계"
              >
                다음 →
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
  return (
    <section className="text-center" data-testid="onboarding-step-welcome">
      <div className="text-5xl" aria-hidden="true">
        👋
      </div>
      <h1
        id="onboarding-title"
        className="mt-4 text-xl font-semibold text-text-primary"
      >
        Dreampia-Dev 에 오신 걸 환영합니다
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
        시작하기 →
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
        <p className="text-sm text-text-secondary" data-testid="cli-detecting">
          🔍 CLI 감지 중...
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
              CLI 가 설치되어 있지 않으면 Mock provider 로 진행합니다.
              나중에 설정에서 다시 감지할 수 있습니다.
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
}: {
  cliStatus: CliDetection | null;
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
          <p className="text-text-secondary">
            설치된 CLI 가 없어 Mock provider 로 진행됩니다.
          </p>
          <p className="text-xs text-text-tertiary">
            실제 AI 응답을 받으려면 이전 단계의 설치 명령을 실행한 뒤 앱을 다시
            실행해 주세요.
          </p>
        </div>
      ) : (
        <div className="space-y-3 text-sm">
          <p className="text-text-secondary">
            아래 명령으로 각 CLI 에 로그인해 주세요. 이미 로그인되어 있다면 건너뛰어도
            됩니다.
          </p>
          {claudeDetected && (
            <AuthRow
              name="Claude CLI"
              command="claude /login"
              hint="브라우저로 OAuth 인증이 진행됩니다."
            />
          )}
          {codexDetected && (
            <AuthRow
              name="Codex CLI"
              command="codex login"
              hint="OpenAI 계정으로 로그인하세요."
            />
          )}
        </div>
      )}
    </section>
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
}: {
  workspace: PickedWorkspace | null;
  picking: boolean;
  onPick: () => Promise<PickedWorkspace | null>;
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
        <h2 className="text-base font-semibold text-text-primary">
          Dreampia-Dev 사용 준비 완료
        </h2>
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
