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
 *  - keyboard   — v0.10.0 단축키 사용자 지정 매핑 (KeyboardSettings)
 *  - onboarding — [온보딩 다시 보기] 버튼
 */

import { useCallback, useEffect, useState } from 'react';
import {
  Server,
  BarChart3,
  Cpu,
  ShieldCheck,
  Palette,
  Keyboard,
  Compass,
  Languages,
  Stethoscope,
  Info,
  KeyRound,
  Sparkles,
} from 'lucide-react';
import { ModalShell } from '../ui/ModalShell';
import { McpSettingsPanel } from './McpSettings';
import { UsageSettingsPanel } from './UsageSettings';
import { KeyboardSettings } from './KeyboardSettings';
import { LanguageSettings } from './LanguageSettings';
import { DiagnoseSettings } from './DiagnoseSettings';
import { AboutPanel } from './AboutPanel';
import { WhatsNewSettings } from './WhatsNewSettings';
import { type PermissionLevel } from '@/types';
import { useT, formatErrorDetail } from '../../i18n';
import { useOptionalToasts } from '../../hooks/useToasts';
import { localizedPermissionLabel } from './permissionLabels';

export type SettingsTabId =
  | 'mcp'
  | 'usage'
  | 'provider'
  | 'direct_api'
  | 'permission'
  | 'theme'
  | 'keyboard'
  | 'language'
  | 'diagnose'
  | 'about'
  | 'whats_new'
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

interface TabSpec {
  id: SettingsTabId;
  /** i18n key — t() 로 resolve. */
  labelKey: string;
  icon: React.ReactNode;
}

const TAB_ORDER: ReadonlyArray<TabSpec> = [
  { id: 'mcp', labelKey: 'settings.tab.mcp', icon: <Server className="h-4 w-4" /> },
  { id: 'usage', labelKey: 'settings.tab.usage', icon: <BarChart3 className="h-4 w-4" /> },
  { id: 'provider', labelKey: 'settings.tab.provider', icon: <Cpu className="h-4 w-4" /> },
  // v1.5.0 — Direct API 탭. provider 다음에 두어 "어떤 provider 쓸지 → 어떻게
  // 인증할지" 동선이 자연스럽게 연결되도록.
  { id: 'direct_api', labelKey: 'settings.tab.direct_api', icon: <KeyRound className="h-4 w-4" /> },
  {
    id: 'permission',
    labelKey: 'settings.tab.permission',
    icon: <ShieldCheck className="h-4 w-4" />,
  },
  { id: 'theme', labelKey: 'settings.tab.theme', icon: <Palette className="h-4 w-4" /> },
  { id: 'keyboard', labelKey: 'settings.tab.keyboard', icon: <Keyboard className="h-4 w-4" /> },
  // v0.11.0 (B2) — 언어 탭. theme 와 keyboard 사이에 두는 게 자연스럽지만 이미
  // keyboard 다음에 onboarding 이 있어 사용자 친숙도 (메뉴 순서 변경 최소화) 를
  // 위해 keyboard ↔ onboarding 사이에 삽입.
  { id: 'language', labelKey: 'settings.tab.language', icon: <Languages className="h-4 w-4" /> },
  // v0.14.0 (A ABI Hardening) — 진단 탭. ABI / DB / 환경 정보 표시. onboarding
  // 위쪽에 두어 "문제 생기면 여기" 동선이 자연스럽도록.
  {
    id: 'diagnose',
    labelKey: 'settings.tab.diagnose',
    icon: <Stethoscope className="h-4 w-4" />,
  },
  // v1.0.0 — 정보 (About) 탭. 앱 이름 / 버전 / 라이선스 / 코드 서명 status /
  // 자동 업데이트 status. diagnose ↔ onboarding 사이에 두어 "정체성 확인 → 설정
  // 처음부터 다시" 동선.
  { id: 'about', labelKey: 'settings.tab.about', icon: <Info className="h-4 w-4" /> },
  // v2.7.x sub-PR — What's new 탭. Code mode 도입 + 이모지 정리 사용자 알림
  // (점수 결정 #5 — CHANGELOG + What's new 패널 채택). about ↔ onboarding
  // 사이에 두어 "정체성 → 변화 → 다시 시작" 동선.
  {
    id: 'whats_new',
    labelKey: 'settings.tab.whats_new',
    icon: <Sparkles className="h-4 w-4" />,
  },
  { id: 'onboarding', labelKey: 'settings.tab.onboarding', icon: <Compass className="h-4 w-4" /> },
];

export function SettingsModal({
  open,
  onClose,
  initialTab = 'mcp',
  onReopenOnboarding,
}: SettingsModalProps): React.JSX.Element | null {
  const t = useT();
  const [activeTab, setActiveTab] = useState<SettingsTabId>(initialTab);

  // initialTab prop 이 바뀔 때 (예: 슬래시 명령으로 모달이 다시 열림) 동기화.
  useEffect(() => {
    if (open) {
      setActiveTab(initialTab);
    }
  }, [open, initialTab]);

  // v2.10.0 (.omc/DESIGN.md, modal migration B) — chrome 을 ModalShell 로.
  // size=xl (~920px, 기존 960px 와 근사). close 는 ModalShell 기본. body 의
  // sidebar(left) + content(right) 은 children 안에 그대로.
  return (
    <ModalShell
      open={open}
      size="xl"
      title={t('settings.title')}
      titleId="settings-modal-title"
      onClose={onClose}
      data-testid="settings-modal"
    >
      {/* Body — sidebar(left) + content(right) */}
      <div className="-mx-lg -my-base flex min-h-[520px] overflow-hidden">
        <nav
          aria-label={t('settings.aria.categories')}
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
                    <span>{t(tab.labelKey)}</span>
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
          {activeTab === 'direct_api' && <DirectApiPanel />}
          {activeTab === 'permission' && <PermissionPanel />}
          {activeTab === 'theme' && <ThemePanel />}
          {activeTab === 'keyboard' && <KeyboardSettings />}
          {activeTab === 'language' && <LanguageSettings />}
          {activeTab === 'diagnose' && <DiagnoseSettings />}
          {activeTab === 'about' && <AboutPanel />}
          {activeTab === 'whats_new' && <WhatsNewSettings />}
          {activeTab === 'onboarding' && (
            <OnboardingPanel onReopenOnboarding={onReopenOnboarding} />
          )}
        </div>
      </div>
    </ModalShell>
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
  const t = useT();
  const toasts = useOptionalToasts();
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

  const handleChange = useCallback(
    async (next: DefaultProviderChoice): Promise<void> => {
      const prev = choice;
      setChoice(next); // optimistic
      const appApi = typeof window !== 'undefined' ? window.dreampia?.app : undefined;
      if (appApi === undefined || typeof appApi.setDefaultProvider !== 'function') {
        // IPC 미가용 — UI 만 바뀌고 영속 X. 사용자에게 명확히 알림.
        toasts?.warning(t('settings.provider.error.no_ipc'));
        return;
      }
      try {
        const r = await appApi.setDefaultProvider(next);
        if (r.ok === false) {
          setChoice(prev); // revert
          toasts?.error(t('settings.provider.error.save_failed'), {
            detail: formatErrorDetail(t, r.error),
          });
        }
      } catch (err) {
        setChoice(prev);
        toasts?.error(t('settings.provider.error.save_failed'), {
          detail: formatErrorDetail(t, err),
        });
      }
    },
    [choice, toasts, t]
  );

  return (
    <section className="flex-1 overflow-y-auto p-6" data-testid="settings-provider-panel">
      <header className="mb-4">
        <h3 className="text-base font-semibold">{t('settings.provider.title')}</h3>
        <p className="text-xs text-text-secondary">{t('settings.provider.description')}</p>
      </header>
      {loading ? (
        <p className="text-sm text-text-secondary">{t('settings.loading')}</p>
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
// v1.5.0 — Direct API panel
//
// settings.api_key_anthropic / settings.api_key_openai 의 입력 + 영속 UI.
// 보안 동선:
//  - GET 은 raw key 반환 X (preload `getDirectApiKeys`). presence + 마지막 4글자
//    preview 만 표시. 실 값은 사용자가 다시 입력해야만 변경 가능 → 복사 누설
//    리스크 차단.
//  - SET 은 plain string. 빈 문자열을 보내면 해당 provider key 삭제.
// ────────────────────────────────────────────────────────────

interface DirectApiKeyState {
  anthropic: { present: boolean; preview: string | null };
  openai: { present: boolean; preview: string | null };
}

const EMPTY_KEY_STATE: DirectApiKeyState = {
  anthropic: { present: false, preview: null },
  openai: { present: false, preview: null },
};

function DirectApiPanel(): React.JSX.Element {
  const t = useT();
  const [state, setState] = useState<DirectApiKeyState>(EMPTY_KEY_STATE);
  const [loading, setLoading] = useState(true);
  const [anthropicInput, setAnthropicInput] = useState('');
  const [openaiInput, setOpenaiInput] = useState('');
  const [saving, setSaving] = useState<'anthropic' | 'openai' | null>(null);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async (): Promise<void> => {
    setLoading(true);
    const appApi = typeof window !== 'undefined' ? window.dreampia?.app : undefined;
    if (appApi === undefined || typeof appApi.getDirectApiKeys !== 'function') {
      setLoading(false);
      return;
    }
    try {
      const r = await appApi.getDirectApiKeys();
      if (r.ok) {
        setState(r.value);
      }
    } catch {
      // safe default 유지
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  const handleSave = useCallback(
    async (provider: 'anthropic' | 'openai', key: string): Promise<void> => {
      setError(null);
      setSaving(provider);
      const appApi = typeof window !== 'undefined' ? window.dreampia?.app : undefined;
      if (appApi === undefined || typeof appApi.setDirectApiKey !== 'function') {
        setError(t('settings.direct_api.error.no_ipc'));
        setSaving(null);
        return;
      }
      try {
        const r = await appApi.setDirectApiKey(provider, key);
        if (!r.ok) {
          setError(r.error);
        } else {
          // 입력 필드 비우기 → 다음 표시는 preview 로만.
          if (provider === 'anthropic') setAnthropicInput('');
          else setOpenaiInput('');
          await reload();
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      } finally {
        setSaving(null);
      }
    },
    [reload, t]
  );

  const renderRow = (
    provider: 'anthropic' | 'openai',
    label: string,
    placeholder: string,
    current: { present: boolean; preview: string | null },
    inputValue: string,
    setInputValue: (v: string) => void
  ): React.JSX.Element => {
    const inputId = `settings-direct-api-${provider}-input`;
    const trimmed = inputValue.trim();
    const isSaving = saving === provider;
    return (
      <div
        className="rounded-md border border-border-primary p-3"
        data-testid={`settings-direct-api-${provider}`}
      >
        <div className="mb-2 flex items-center justify-between">
          <label htmlFor={inputId} className="text-sm font-medium">
            {label}
          </label>
          <span
            className={
              current.present
                ? 'rounded bg-accent/20 px-1.5 py-0.5 font-mono text-[11px] text-accent'
                : 'text-[11px] text-text-tertiary'
            }
            data-testid={`settings-direct-api-${provider}-status`}
          >
            {current.present
              ? `${t('settings.direct_api.set')} (…${current.preview ?? ''})`
              : t('settings.direct_api.unset')}
          </span>
        </div>
        <div className="flex gap-2">
          <input
            id={inputId}
            type="password"
            placeholder={placeholder}
            value={inputValue}
            onChange={(e) => {
              setInputValue(e.target.value);
            }}
            className="flex-1 rounded-md border border-border-primary bg-bg-secondary px-2 py-1 font-mono text-xs text-text-primary placeholder:text-text-tertiary focus:border-accent focus:outline-none"
            data-testid={`settings-direct-api-${provider}-field`}
            disabled={isSaving}
            autoComplete="off"
            spellCheck={false}
          />
          <button
            type="button"
            onClick={() => {
              void handleSave(provider, trimmed);
            }}
            disabled={isSaving || trimmed.length === 0}
            className="rounded-md border border-border-primary bg-bg-tertiary px-3 py-1 text-xs hover:bg-bg-primary disabled:cursor-not-allowed disabled:opacity-50"
            data-testid={`settings-direct-api-${provider}-save`}
          >
            {t('settings.direct_api.save')}
          </button>
          {current.present && (
            <button
              type="button"
              onClick={() => {
                void handleSave(provider, '');
              }}
              disabled={isSaving}
              className="rounded-md border border-red-600/40 bg-red-900/20 px-3 py-1 text-xs text-red-300 hover:bg-red-900/30 disabled:cursor-not-allowed disabled:opacity-50"
              data-testid={`settings-direct-api-${provider}-clear`}
            >
              {t('settings.direct_api.clear')}
            </button>
          )}
        </div>
      </div>
    );
  };

  return (
    <section className="flex-1 overflow-y-auto p-6" data-testid="settings-direct-api-panel">
      <header className="mb-4">
        <h3 className="text-base font-semibold">{t('settings.direct_api.title')}</h3>
        <p className="text-xs text-text-secondary">{t('settings.direct_api.description')}</p>
      </header>

      <div
        className="mb-4 rounded-md border border-amber-600/40 bg-amber-100 p-3 text-xs text-amber-900 dark:bg-amber-900/20 dark:text-amber-200"
        data-testid="settings-direct-api-warning"
      >
        {t('settings.direct_api.security_warning')}
      </div>

      {loading ? (
        <p className="text-sm text-text-secondary">{t('settings.loading')}</p>
      ) : (
        <div className="space-y-3">
          {renderRow(
            'anthropic',
            t('settings.direct_api.anthropic.label'),
            t('settings.direct_api.anthropic.placeholder'),
            state.anthropic,
            anthropicInput,
            setAnthropicInput
          )}
          {renderRow(
            'openai',
            t('settings.direct_api.openai.label'),
            t('settings.direct_api.openai.placeholder'),
            state.openai,
            openaiInput,
            setOpenaiInput
          )}
          {error !== null && (
            <p
              className="break-words font-mono text-[11px] text-red-400"
              data-testid="settings-direct-api-error"
            >
              {error}
            </p>
          )}
        </div>
      )}
    </section>
  );
}

// ────────────────────────────────────────────────────────────
// Permission panel — settings.default_permission_level + capability 표시
// ────────────────────────────────────────────────────────────

const PERMISSION_HINT_KEY: Record<PermissionLevel, string> = {
  read_only: 'settings.permission.hint.read_only',
  workspace_write: 'settings.permission.hint.workspace_write',
  full_access: 'settings.permission.hint.full_access',
  custom: 'settings.permission.hint.custom',
};

const PERMISSION_LEVEL_ORDER: ReadonlyArray<PermissionLevel> = [
  'read_only',
  'workspace_write',
  'full_access',
  'custom',
];

// ────────────────────────────────────────────────────────────
// v1.1.0 SEC-2 full — Active permission grants block.
//
// Settings > 권한 panel 안에 mount. 현재 active session 의 grant 목록 +
// 즉시 revoke 버튼. v1.0.10 의 deferred banner 를 대체.
// ────────────────────────────────────────────────────────────

interface GrantSummary {
  id: string;
  capability: string;
  target_json: string;
  granted_at: string;
  granted_by: string;
  scope: string;
  expires_at: string | null;
  reason: string | null;
}

function PermissionGrantsBlock(): React.JSX.Element {
  const t = useT();
  const toasts = useOptionalToasts();
  const [grants, setGrants] = useState<GrantSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async (): Promise<void> => {
    setLoading(true);
    setError(null);
    const w = typeof window !== 'undefined' ? window : undefined;
    const sessionApi = w?.dreampia?.session;
    const permApi = (
      w?.dreampia as
        | {
            permission?: {
              listGrants: (
                id: string
              ) => Promise<{ ok: boolean; value?: GrantSummary[]; error?: string }>;
            };
          }
        | undefined
    )?.permission;
    if (sessionApi === undefined || permApi === undefined) {
      setLoading(false);
      return;
    }
    try {
      const sessions = await sessionApi.list();
      if (!sessions.ok || sessions.value.length === 0) {
        setGrants([]);
        return;
      }
      const sessionId = sessions.value[0]!.id;
      const r = await permApi.listGrants(sessionId);
      if (r.ok && Array.isArray(r.value)) {
        setGrants(r.value);
      } else if (!r.ok) {
        setError(r.error ?? 'unknown');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  const handleRevoke = useCallback(
    async (grantId: string): Promise<void> => {
      const w = typeof window !== 'undefined' ? window : undefined;
      const permApi = (
        w?.dreampia as
          | {
              permission?: {
                revokeGrant: (id: string) => Promise<{ ok: boolean; error?: unknown }>;
              };
            }
          | undefined
      )?.permission;
      if (permApi === undefined) {
        toasts?.warning(t('settings.permission.grants.error.no_ipc'));
        return;
      }
      try {
        const r = await permApi.revokeGrant(grantId);
        if (r.ok === false) {
          toasts?.error(t('settings.permission.grants.error.revoke_failed'), {
            detail: formatErrorDetail(t, r.error),
          });
        }
      } catch (err) {
        toasts?.error(t('settings.permission.grants.error.revoke_failed'), {
          detail: formatErrorDetail(t, err),
        });
      }
      void reload();
    },
    [reload, toasts, t]
  );

  return (
    <section
      className="mb-4 rounded-md border border-border-primary bg-bg-secondary p-3"
      data-testid="settings-permission-grants"
    >
      <header className="mb-2 flex items-start justify-between gap-3">
        <div className="flex-1">
          <h4 className="text-sm font-semibold">{t('settings.permission.grants.title')}</h4>
          <p className="text-xs text-text-tertiary">
            {t('settings.permission.grants.description')}
          </p>
        </div>
        <button
          type="button"
          onClick={() => {
            void reload();
          }}
          disabled={loading}
          className="rounded-md border border-border-primary bg-bg-tertiary px-2 py-1 text-xs hover:bg-bg-primary disabled:cursor-not-allowed disabled:opacity-50"
          data-testid="settings-permission-grants-refresh"
        >
          {t('settings.permission.grants.refresh')}
        </button>
      </header>

      {error !== null && (
        <p
          className="mb-2 break-words font-mono text-[11px] text-red-400"
          data-testid="settings-permission-grants-error"
        >
          {error}
        </p>
      )}

      {loading ? (
        <p className="text-xs text-text-secondary">{t('settings.loading')}</p>
      ) : grants.length === 0 ? (
        <p className="text-xs text-text-tertiary" data-testid="settings-permission-grants-empty">
          {t('settings.permission.grants.empty')}
        </p>
      ) : (
        <table
          className="w-full border-collapse text-left text-[11px]"
          data-testid="settings-permission-grants-table"
        >
          <thead className="text-text-tertiary">
            <tr>
              <th className="border-b border-border-primary py-1 pr-3 font-medium">
                {t('settings.permission.grants.col.capability')}
              </th>
              <th className="border-b border-border-primary py-1 pr-3 font-medium">
                {t('settings.permission.grants.col.target')}
              </th>
              <th className="border-b border-border-primary py-1 pr-3 font-medium">
                {t('settings.permission.grants.col.scope')}
              </th>
              <th className="border-b border-border-primary py-1 pr-3 font-medium">
                {t('settings.permission.grants.col.granted_at')}
              </th>
              <th className="border-b border-border-primary py-1 font-medium" />
            </tr>
          </thead>
          <tbody>
            {grants.map((g) => (
              <tr
                key={g.id || `${g.capability}-${g.granted_at}`}
                className="border-b border-border-primary/30 last:border-b-0"
                data-testid={`settings-permission-grant-row-${g.id}`}
              >
                <td className="py-1 pr-3 font-mono text-text-primary">{g.capability}</td>
                <td className="max-w-[180px] truncate py-1 pr-3 font-mono text-text-secondary">
                  <span title={g.target_json}>{shortTarget(g.target_json)}</span>
                </td>
                <td className="py-1 pr-3 font-mono text-text-secondary">{g.scope}</td>
                <td className="py-1 pr-3 font-mono text-text-tertiary">
                  {g.granted_at.slice(11, 19)}
                </td>
                <td className="py-1 text-right">
                  <button
                    type="button"
                    onClick={() => {
                      void handleRevoke(g.id);
                    }}
                    disabled={g.id === ''}
                    className="rounded-md border border-red-600/40 bg-red-900/20 px-2 py-0.5 text-[10px] text-red-300 hover:bg-red-900/30 disabled:cursor-not-allowed disabled:opacity-50"
                    data-testid={`settings-permission-grant-revoke-${g.id}`}
                  >
                    {t('settings.permission.grants.revoke')}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}

function shortTarget(targetJson: string): string {
  try {
    const obj = JSON.parse(targetJson) as {
      target?: { kind?: string; path?: string; url?: string; domain?: string };
    };
    const t = obj.target;
    if (t === undefined) return targetJson;
    if (t.kind === 'path' && t.path !== undefined) return `path:${t.path}`;
    if (t.kind === 'url' && t.url !== undefined) return `url:${t.url}`;
    if (t.kind === 'domain' && t.domain !== undefined) return `domain:${t.domain}`;
    if (t.kind === 'global') return 'global';
    return targetJson;
  } catch {
    return targetJson;
  }
}

function PermissionPanel(): React.JSX.Element {
  const t = useT();
  const toasts = useOptionalToasts();
  const [level, setLevel] = useState<PermissionLevel>('workspace_write');
  const [capabilities, setCapabilities] = useState<Record<PermissionLevel, string[]> | null>(null);
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

  const handleChange = useCallback(
    async (next: PermissionLevel): Promise<void> => {
      const prev = level;
      setLevel(next); // optimistic
      const appApi = typeof window !== 'undefined' ? window.dreampia?.app : undefined;
      if (appApi === undefined || typeof appApi.setDefaultPermissionLevel !== 'function') {
        toasts?.warning(t('settings.permission.error.no_ipc'));
        return;
      }
      try {
        const r = await appApi.setDefaultPermissionLevel(next);
        if (r.ok === false) {
          setLevel(prev);
          toasts?.error(t('settings.permission.error.save_failed'), {
            detail: formatErrorDetail(t, r.error),
          });
        }
      } catch (err) {
        setLevel(prev);
        toasts?.error(t('settings.permission.error.save_failed'), {
          detail: formatErrorDetail(t, err),
        });
      }
    },
    [level, toasts, t]
  );

  const currentCapabilities = capabilities?.[level] ?? [];

  return (
    <section className="flex-1 overflow-y-auto p-6" data-testid="settings-permission-panel">
      <header className="mb-4">
        <h3 className="text-base font-semibold">{t('settings.permission.title')}</h3>
        <p className="text-xs text-text-secondary">{t('settings.permission.description')}</p>
      </header>
      {/*
       * v1.1.0 (SEC-2 full) — v1.0.10 의 deferred banner 제거 + 실제 grant
       * 관리 UI. 사용자가 권한 승인 요청 시 'always' 로 답하면 본 panel 의
       * grant list 에 노출됨. 즉시 revoke 가능.
       *
       * 정직성 banner 는 더 이상 거짓말이 아님 — 실제로 동작하므로 제거.
       */}
      <PermissionGrantsBlock />

      {loading ? (
        <p className="text-sm text-text-secondary">{t('settings.loading')}</p>
      ) : (
        <>
          <ul className="mb-5 space-y-2">
            {PERMISSION_LEVEL_ORDER.map((opt) => {
              const active = level === opt;
              const label = localizedPermissionLabel(t, opt);
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
                      aria-label={label}
                    />
                    <div className="flex-1">
                      <p className="font-medium">
                        {label}
                        {opt === 'workspace_write' && (
                          <span className="ml-2 rounded bg-accent/20 px-1.5 py-0.5 text-[10px] text-accent">
                            {t('settings.permission.recommended_badge')}
                          </span>
                        )}
                      </p>
                      <p className="text-xs text-text-tertiary">{t(PERMISSION_HINT_KEY[opt])}</p>
                    </div>
                  </label>
                </li>
              );
            })}
          </ul>

          <section
            aria-label={t('settings.permission.included_aria')}
            className="rounded-md border border-border-primary bg-bg-secondary p-3"
            data-testid="settings-permission-capabilities"
          >
            <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-text-tertiary">
              {t('settings.permission.included_heading', {
                label: localizedPermissionLabel(t, level),
              })}
            </h4>
            {currentCapabilities.length === 0 ? (
              <p className="text-xs text-text-tertiary">
                {level === 'custom'
                  ? t('settings.permission.empty_custom')
                  : t('settings.permission.empty_other')}
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

interface ThemeOption {
  value: ThemeChoice;
  /** i18n keys — `t()` 로 resolve. */
  labelKey: string;
  hintKey: string;
}

const THEME_OPTIONS: ReadonlyArray<ThemeOption> = [
  { value: 'system', labelKey: 'settings.theme.system', hintKey: 'settings.theme.system_hint' },
  { value: 'light', labelKey: 'settings.theme.light', hintKey: 'settings.theme.light_hint' },
  { value: 'dark', labelKey: 'settings.theme.dark', hintKey: 'settings.theme.dark_hint' },
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
  const t = useT();
  const toasts = useOptionalToasts();
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

  const handleChange = useCallback(
    async (next: ThemeChoice): Promise<void> => {
      const prev = choice;
      setChoice(next);
      applyTheme(next);
      const appApi = typeof window !== 'undefined' ? window.dreampia?.app : undefined;
      if (appApi === undefined || typeof appApi.setTheme !== 'function') {
        toasts?.warning(t('settings.theme.error.no_ipc'));
        return;
      }
      try {
        const r = await appApi.setTheme(next);
        if (r.ok === false) {
          setChoice(prev);
          applyTheme(prev);
          toasts?.error(t('settings.theme.error.save_failed'), {
            detail: formatErrorDetail(t, r.error),
          });
        }
      } catch (err) {
        setChoice(prev);
        applyTheme(prev);
        toasts?.error(t('settings.theme.error.save_failed'), {
          detail: formatErrorDetail(t, err),
        });
      }
    },
    [choice, toasts, t]
  );

  return (
    <section className="flex-1 overflow-y-auto p-6" data-testid="settings-theme-panel">
      <header className="mb-4">
        <h3 className="text-base font-semibold">{t('settings.theme.title')}</h3>
        <p className="text-xs text-text-secondary">{t('settings.theme.description')}</p>
      </header>
      {loading ? (
        <p className="text-sm text-text-secondary">{t('settings.loading')}</p>
      ) : (
        <ul className="space-y-2">
          {THEME_OPTIONS.map((opt) => {
            const active = choice === opt.value;
            const label = t(opt.labelKey);
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
                    aria-label={label}
                  />
                  <div className="flex-1">
                    <p className="font-medium">{label}</p>
                    <p className="text-xs text-text-tertiary">{t(opt.hintKey)}</p>
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
// Keyboard panel — KeyboardSettings 컴포넌트로 분리 (v0.10.0).
// ────────────────────────────────────────────────────────────
//
// 본 모달의 [단축키] 탭이 mount 하는 KeyboardSettings 는 사용자 지정 매핑을
// IPC 로 영속하고 SHORTCUT_DEFS 를 기반으로 편집/리셋 UI 를 제공한다.

// ────────────────────────────────────────────────────────────
// Onboarding panel — [온보딩 다시 보기] 버튼
// ────────────────────────────────────────────────────────────

interface OnboardingPanelProps {
  onReopenOnboarding?: () => void;
}

function OnboardingPanel({ onReopenOnboarding }: OnboardingPanelProps): React.JSX.Element {
  const t = useT();
  return (
    <section className="flex-1 overflow-y-auto p-6" data-testid="settings-onboarding-panel">
      <header className="mb-4">
        <h3 className="text-base font-semibold">{t('settings.onboarding.title')}</h3>
        <p className="text-xs text-text-secondary">{t('settings.onboarding.description')}</p>
      </header>
      <button
        type="button"
        onClick={onReopenOnboarding}
        disabled={onReopenOnboarding === undefined}
        className="rounded-md border border-border-primary bg-bg-secondary px-4 py-2 text-sm hover:bg-bg-tertiary disabled:cursor-not-allowed disabled:opacity-50"
        data-testid="settings-reopen-onboarding"
      >
        {t('settings.onboarding.reopen')}
      </button>
    </section>
  );
}
