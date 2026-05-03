/**
 * SettingsModal — v0.8.0 통합 설정 패널.
 *
 * Spec: ROADMAP.md (v0.8.0 Settings & Permissions)
 *
 * Codex 권고에 따라 D1 Settings UI 확장 + H Permission Dropdown 을 함께 처리.
 *
 * UI 구조:
 *  - 좌측 sidebar: 7개 탭 (MCP / 사용량 / Provider / 권한 / 테마 / 단축키 / 온보딩)
 *  - 우측 content: 선택된 탭의 panel
 *  - Header: 닫기 버튼 + 모달 제목
 *
 * Backwards compat: 기존 McpSettings / UsageSettings 모달은 그대로 유지.
 * SettingsModal 은 두 컴포넌트의 panel-only 변형 (`McpSettingsPanel` /
 * `UsageSettingsPanel`) 을 mount 해 코드 중복 0.
 *
 * Tabs:
 *  - mcp        — McpSettingsPanel embed
 *  - usage      — UsageSettingsPanel embed
 *  - provider   — radio group + 즉시 영속 (app:set-default-provider)
 *  - permission — default level + capability list (read-only)
 *  - theme      — light/dark/system + 즉시 영속 + data-theme 적용
 *  - keyboard   — placeholder ("v0.10.0 추가 예정")
 *  - onboarding — [온보딩 다시 보기] 버튼
 */

import { useCallback, useEffect, useState } from 'react';
import {
  X,
  Server,
  BarChart3,
  Cpu,
  ShieldCheck,
  Palette,
  Keyboard,
  Compass,
} from 'lucide-react';
import { McpSettingsPanel } from './McpSettings';
import { UsageSettingsPanel } from './UsageSettings';
import {
  PERMISSION_LEVEL_LABELS_KO,
  type PermissionLevel,
} from '@/types';

export type SettingsTabId =
  | 'mcp'
  | 'usage'
  | 'provider'
  | 'permission'
  | 'theme'
  | 'keyboard'
  | 'onboarding';

export interface SettingsModalProps {
  open: boolean;
  onClose: () => void;
  /** 모달이 열릴 때 보일 초기 탭 — 슬래시 명령에 따라 분기 (`/settings` → mcp, `/usage` → usage). */
  initialTab?: SettingsTabId;
  /**
   * Sidebar [온보딩 다시 보기] 와 동일한 동작 — 'onboarding' 탭의 버튼이 호출.
   * 미지정 시 그 버튼은 비활성. App.tsx 가 useOnboarding().reset 을 wire up.
   */
  onReopenOnboarding?: () => void;
}

type DefaultProviderChoice = 'auto' | 'claude' | 'codex' | 'mock';
type ThemeChoice = 'light' | 'dark' | 'system';

const TAB_ORDER: ReadonlyArray<{
  id: SettingsTabId;
  label: string;
  icon: React.ReactNode;
}> = [
  { id: 'mcp', label: 'MCP', icon: <Server className="h-4 w-4" /> },
  { id: 'usage', label: '사용량', icon: <BarChart3 className="h-4 w-4" /> },
  { id: 'provider', label: 'Provider', icon: <Cpu className="h-4 w-4" /> },
  { id: 'permission', label: '권한', icon: <ShieldCheck className="h-4 w-4" /> },
  { id: 'theme', label: '테마', icon: <Palette className="h-4 w-4" /> },
  { id: 'keyboard', label: '단축키', icon: <Keyboard className="h-4 w-4" /> },
  { id: 'onboarding', label: '온보딩', icon: <Compass className="h-4 w-4" /> },
];

export function SettingsModal({
  open,
  onClose,
  initialTab = 'mcp',
  onReopenOnboarding,
}: SettingsModalProps): React.JSX.Element | null {
  const [activeTab, setActiveTab] = useState<SettingsTabId>(initialTab);

  // initialTab prop 이 바뀔 때 (예: 슬래시 명령으로 모달이 다시 열림) 동기화.
  useEffect(() => {
    if (open) {
      setActiveTab(initialTab);
    }
  }, [open, initialTab]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
      role="dialog"
      aria-modal="true"
      aria-label="설정"
      data-testid="settings-modal"
    >
      <div className="flex max-h-[90vh] w-[960px] max-w-[95vw] flex-col rounded-lg border border-border-primary bg-bg-primary shadow-xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border-primary p-4">
          <h2 className="text-lg font-semibold">설정</h2>
          <button
            onClick={onClose}
            className="rounded-md p-2 hover:bg-bg-tertiary"
            aria-label="닫기"
            data-testid="settings-close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Body — sidebar(left) + content(right) */}
        <div className="flex min-h-[520px] flex-1 overflow-hidden">
          <nav
            aria-label="설정 카테고리"
            className="w-[180px] flex-shrink-0 border-r border-border-primary bg-bg-secondary p-2"
          >
            <ul className="space-y-1">
              {TAB_ORDER.map((tab) => {
                const active = activeTab === tab.id;
                return (
                  <li key={tab.id}>
                    <button
                      onClick={() => {
                        setActiveTab(tab.id);
                      }}
                      data-active={active}
                      data-testid={`settings-tab-${tab.id}`}
                      className="flex w-full items-center gap-2 rounded-md px-3 py-1.5 text-left text-sm hover:bg-bg-tertiary data-[active=true]:bg-bg-tertiary data-[active=true]:font-medium"
                      aria-current={active ? 'true' : undefined}
                    >
                      <span className="flex-shrink-0">{tab.icon}</span>
                      <span>{tab.label}</span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </nav>

          {/* Content panel — flex-col 로 panel 자체가 자체 footer 가질 수 있게. */}
          <div
            className="flex flex-1 flex-col overflow-hidden"
            data-testid={`settings-panel-${activeTab}`}
          >
            {activeTab === 'mcp' && <McpSettingsPanel />}
            {activeTab === 'usage' && <UsageSettingsPanel />}
            {activeTab === 'provider' && <ProviderPanel />}
            {activeTab === 'permission' && <PermissionPanel />}
            {activeTab === 'theme' && <ThemePanel />}
            {activeTab === 'keyboard' && <KeyboardPanel />}
            {activeTab === 'onboarding' && (
              <OnboardingPanel onReopenOnboarding={onReopenOnboarding} />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ────────────────────────────────────────────────────────────
// Provider panel — settings.default_provider 변경
// ────────────────────────────────────────────────────────────

interface ProviderOption {
  value: DefaultProviderChoice;
  label: string;
  hint: string;
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
  },
  {
    value: 'codex',
    label: 'Codex CLI 우선',
    hint: '모든 모델을 Codex CLI 로 보냅니다',
  },
  {
    value: 'mock',
    label: 'Mock (개발용)',
    hint: '실제 AI 호출 없이 로컬 응답만 반환',
  },
];

function ProviderPanel(): React.JSX.Element {
  const [choice, setChoice] = useState<DefaultProviderChoice>('auto');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const appApi = typeof window !== 'undefined' ? window.dreampia?.app : undefined;
    if (appApi === undefined || typeof appApi.getDefaultProvider !== 'function') {
      setLoading(false);
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const result = await appApi.getDefaultProvider();
        if (!cancelled && result.ok) setChoice(result.value);
      } catch {
        // safe default 유지
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const handleChange = useCallback(async (next: DefaultProviderChoice): Promise<void> => {
    setChoice(next);
    const appApi = typeof window !== 'undefined' ? window.dreampia?.app : undefined;
    if (appApi === undefined || typeof appApi.setDefaultProvider !== 'function') return;
    try {
      await appApi.setDefaultProvider(next);
    } catch {
      // ignore — 다음 fetch 에서 stale 가능성 작음
    }
  }, []);

  return (
    <section className="flex-1 overflow-y-auto p-6" data-testid="settings-provider-panel">
      <header className="mb-4">
        <h3 className="text-base font-semibold">기본 Provider</h3>
        <p className="text-xs text-text-secondary">
          어떤 AI 를 우선 사용할지 선택하세요. 변경 즉시 새 메시지부터 적용됩니다.
        </p>
      </header>
      {loading ? (
        <p className="text-sm text-text-secondary">불러오는 중...</p>
      ) : (
        <ul className="space-y-2">
          {PROVIDER_OPTIONS.map((opt) => {
            const active = choice === opt.value;
            return (
              <li key={opt.value}>
                <label
                  className={`flex cursor-pointer items-start gap-2 rounded-md border p-3 ${
                    active
                      ? 'border-accent bg-bg-tertiary'
                      : 'border-border-primary hover:bg-bg-tertiary'
                  }`}
                  data-testid={`settings-provider-${opt.value}`}
                >
                  <input
                    type="radio"
                    name="settings-default-provider"
                    value={opt.value}
                    checked={active}
                    onChange={() => {
                      void handleChange(opt.value);
                    }}
                    className="mt-0.5"
                    aria-label={opt.label}
                  />
                  <div className="flex-1">
                    <p className="font-medium">{opt.label}</p>
                    <p className="text-xs text-text-tertiary">{opt.hint}</p>
                  </div>
                </label>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

// ────────────────────────────────────────────────────────────
// Permission panel — settings.default_permission_level + capability 표시
// ────────────────────────────────────────────────────────────

const PERMISSION_HINTS: Record<PermissionLevel, string> = {
  read_only: '파일 읽기만 허용. 쓰기/실행은 매번 사용자 승인',
  workspace_write: '권장. 작업 폴더 안에서 자유롭게 쓰기/실행',
  full_access: '폴더 외부 접근 + 외부 업로드 허용. 신중하게 사용',
  custom: '사용자 grant 로 직접 구성 (v0.13.0 에서 UI 추가 예정)',
};

const PERMISSION_LEVEL_ORDER: ReadonlyArray<PermissionLevel> = [
  'read_only',
  'workspace_write',
  'full_access',
  'custom',
];

function PermissionPanel(): React.JSX.Element {
  const [level, setLevel] = useState<PermissionLevel>('workspace_write');
  const [capabilities, setCapabilities] = useState<
    Record<PermissionLevel, string[]> | null
  >(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const appApi = typeof window !== 'undefined' ? window.dreampia?.app : undefined;
    if (appApi === undefined) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        if (typeof appApi.getDefaultPermissionLevel === 'function') {
          const r = await appApi.getDefaultPermissionLevel();
          if (!cancelled && r.ok) setLevel(r.value);
        }
        if (typeof appApi.getPermissionCapabilities === 'function') {
          const r = await appApi.getPermissionCapabilities();
          if (!cancelled && r.ok) setCapabilities(r.value);
        }
      } catch {
        // safe default 유지
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const handleChange = useCallback(async (next: PermissionLevel): Promise<void> => {
    setLevel(next);
    const appApi = typeof window !== 'undefined' ? window.dreampia?.app : undefined;
    if (appApi === undefined || typeof appApi.setDefaultPermissionLevel !== 'function') return;
    try {
      await appApi.setDefaultPermissionLevel(next);
    } catch {
      // ignore
    }
  }, []);

  const currentCapabilities = capabilities?.[level] ?? [];

  return (
    <section className="flex-1 overflow-y-auto p-6" data-testid="settings-permission-panel">
      <header className="mb-4">
        <h3 className="text-base font-semibold">기본 권한</h3>
        <p className="text-xs text-text-secondary">
          새로 만드는 세션이 기본으로 가질 권한 레벨입니다. 세션별 권한은 채팅 헤더에서 변경할
          수 있어요.
        </p>
      </header>
      {loading ? (
        <p className="text-sm text-text-secondary">불러오는 중...</p>
      ) : (
        <>
          <ul className="mb-5 space-y-2">
            {PERMISSION_LEVEL_ORDER.map((opt) => {
              const active = level === opt;
              return (
                <li key={opt}>
                  <label
                    className={`flex cursor-pointer items-start gap-2 rounded-md border p-3 ${
                      active
                        ? 'border-accent bg-bg-tertiary'
                        : 'border-border-primary hover:bg-bg-tertiary'
                    }`}
                    data-testid={`settings-permission-${opt}`}
                  >
                    <input
                      type="radio"
                      name="settings-default-permission"
                      value={opt}
                      checked={active}
                      onChange={() => {
                        void handleChange(opt);
                      }}
                      className="mt-0.5"
                      aria-label={PERMISSION_LEVEL_LABELS_KO[opt]}
                    />
                    <div className="flex-1">
                      <p className="font-medium">
                        {PERMISSION_LEVEL_LABELS_KO[opt]}
                        {opt === 'workspace_write' && (
                          <span className="ml-2 rounded bg-accent/20 px-1.5 py-0.5 text-[10px] text-accent">
                            권장
                          </span>
                        )}
                      </p>
                      <p className="text-xs text-text-tertiary">{PERMISSION_HINTS[opt]}</p>
                    </div>
                  </label>
                </li>
              );
            })}
          </ul>

          <section
            aria-label="포함된 권한"
            className="rounded-md border border-border-primary bg-bg-secondary p-3"
            data-testid="settings-permission-capabilities"
          >
            <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-text-tertiary">
              {PERMISSION_LEVEL_LABELS_KO[level]} 에 포함된 권한
            </h4>
            {currentCapabilities.length === 0 ? (
              <p className="text-xs text-text-tertiary">
                {level === 'custom'
                  ? '사용자 grant 로 직접 구성됩니다 (v0.13.0 UI 예정).'
                  : '포함된 권한이 없습니다.'}
              </p>
            ) : (
              <ul className="grid grid-cols-1 gap-1 text-xs sm:grid-cols-2">
                {currentCapabilities.map((cap) => (
                  <li
                    key={cap}
                    className="rounded bg-bg-tertiary px-2 py-1 font-mono text-text-secondary"
                  >
                    {cap}
                  </li>
                ))}
              </ul>
            )}
          </section>
        </>
      )}
    </section>
  );
}

// ────────────────────────────────────────────────────────────
// Theme panel — light / dark / system + data-theme 적용
// ────────────────────────────────────────────────────────────

const THEME_OPTIONS: ReadonlyArray<{ value: ThemeChoice; label: string; hint: string }> = [
  { value: 'system', label: '시스템', hint: 'OS 의 기본 모드 (라이트/다크) 를 따라가요' },
  { value: 'light', label: '라이트', hint: '항상 밝은 테마' },
  { value: 'dark', label: '다크', hint: '항상 어두운 테마' },
];

/**
 * v0.8.0 — document.documentElement 에 `data-theme` 속성을 적용.
 * 'system' 인 경우 prefers-color-scheme 매칭. CSS 토큰은 기존
 * tailwind/CSS 변수 시스템 (bg-primary 등) 이 data-theme="dark|light"
 * 에 따라 분기되도록 정의돼 있다고 가정 — 추가 분기는 v0.9.0 에서.
 */
export function applyTheme(choice: ThemeChoice): void {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  if (choice === 'system') {
    // prefers-color-scheme 매칭. media query 가 미지원이면 'light' 로 fallback.
    const prefersDark =
      typeof window !== 'undefined' &&
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(prefers-color-scheme: dark)').matches;
    root.setAttribute('data-theme', prefersDark ? 'dark' : 'light');
  } else {
    root.setAttribute('data-theme', choice);
  }
}

function ThemePanel(): React.JSX.Element {
  const [choice, setChoice] = useState<ThemeChoice>('system');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const appApi = typeof window !== 'undefined' ? window.dreampia?.app : undefined;
    if (appApi === undefined || typeof appApi.getTheme !== 'function') {
      setLoading(false);
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const r = await appApi.getTheme();
        if (!cancelled && r.ok) {
          setChoice(r.value);
          applyTheme(r.value);
        }
      } catch {
        // safe default
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const handleChange = useCallback(async (next: ThemeChoice): Promise<void> => {
    setChoice(next);
    applyTheme(next);
    const appApi = typeof window !== 'undefined' ? window.dreampia?.app : undefined;
    if (appApi === undefined || typeof appApi.setTheme !== 'function') return;
    try {
      await appApi.setTheme(next);
    } catch {
      // ignore
    }
  }, []);

  return (
    <section className="flex-1 overflow-y-auto p-6" data-testid="settings-theme-panel">
      <header className="mb-4">
        <h3 className="text-base font-semibold">테마</h3>
        <p className="text-xs text-text-secondary">
          UI 색상 모드를 선택하세요. 시스템 모드를 사용하면 OS 의 다크/라이트 변경에 자동
          반응합니다.
        </p>
      </header>
      {loading ? (
        <p className="text-sm text-text-secondary">불러오는 중...</p>
      ) : (
        <ul className="space-y-2">
          {THEME_OPTIONS.map((opt) => {
            const active = choice === opt.value;
            return (
              <li key={opt.value}>
                <label
                  className={`flex cursor-pointer items-start gap-2 rounded-md border p-3 ${
                    active
                      ? 'border-accent bg-bg-tertiary'
                      : 'border-border-primary hover:bg-bg-tertiary'
                  }`}
                  data-testid={`settings-theme-${opt.value}`}
                >
                  <input
                    type="radio"
                    name="settings-theme"
                    value={opt.value}
                    checked={active}
                    onChange={() => {
                      void handleChange(opt.value);
                    }}
                    className="mt-0.5"
                    aria-label={opt.label}
                  />
                  <div className="flex-1">
                    <p className="font-medium">{opt.label}</p>
                    <p className="text-xs text-text-tertiary">{opt.hint}</p>
                  </div>
                </label>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

// ────────────────────────────────────────────────────────────
// Keyboard panel — placeholder + 매핑 미리 보기
// ────────────────────────────────────────────────────────────

const KEY_PREVIEW: ReadonlyArray<{ keys: string; description: string }> = [
  { keys: 'Ctrl+Enter', description: '메시지 전송' },
  { keys: 'Ctrl+,', description: '설정 열기' },
  { keys: 'Ctrl+K', description: '슬래시 명령 도움말' },
  { keys: '@', description: '파일/세션 멘션' },
  { keys: 'Esc', description: '입력/모달 취소' },
];

function KeyboardPanel(): React.JSX.Element {
  return (
    <section className="flex-1 overflow-y-auto p-6" data-testid="settings-keyboard-panel">
      <header className="mb-4">
        <h3 className="text-base font-semibold">단축키</h3>
        <p className="text-xs text-text-secondary">v0.10.0 에서 추가됩니다.</p>
      </header>
      <div className="rounded-md border border-dashed border-border-primary bg-bg-secondary p-3 text-sm text-text-tertiary">
        <p className="mb-2">
          현재 사용 가능한 단축키 (사용자 지정은 v0.10.0 에서 지원 예정):
        </p>
        <ul className="space-y-1.5">
          {KEY_PREVIEW.map((entry) => (
            <li key={entry.keys} className="flex items-center justify-between gap-2">
              <span>{entry.description}</span>
              <kbd className="rounded bg-bg-tertiary px-2 py-0.5 font-mono text-xs text-text-secondary">
                {entry.keys}
              </kbd>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

// ────────────────────────────────────────────────────────────
// Onboarding panel — [온보딩 다시 보기] 버튼
// ────────────────────────────────────────────────────────────

interface OnboardingPanelProps {
  onReopenOnboarding?: () => void;
}

function OnboardingPanel({ onReopenOnboarding }: OnboardingPanelProps): React.JSX.Element {
  return (
    <section className="flex-1 overflow-y-auto p-6" data-testid="settings-onboarding-panel">
      <header className="mb-4">
        <h3 className="text-base font-semibold">온보딩</h3>
        <p className="text-xs text-text-secondary">
          첫 실행 시 보던 5단계 안내를 다시 진행할 수 있어요. 기존 세션과 설정은 유지됩니다.
        </p>
      </header>
      <button
        type="button"
        onClick={onReopenOnboarding}
        disabled={onReopenOnboarding === undefined}
        className="rounded-md border border-border-primary bg-bg-secondary px-4 py-2 text-sm hover:bg-bg-tertiary disabled:cursor-not-allowed disabled:opacity-50"
        data-testid="settings-reopen-onboarding"
      >
        온보딩 다시 보기
      </button>
    </section>
  );
}
