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
  X,
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
} from 'lucide-react';
import { McpSettingsPanel } from './McpSettings';
import { UsageSettingsPanel } from './UsageSettings';
import { KeyboardSettings } from './KeyboardSettings';
import { LanguageSettings } from './LanguageSettings';
import { DiagnoseSettings } from './DiagnoseSettings';
import { AboutPanel } from './AboutPanel';
import { type PermissionLevel } from '@/types';
import { useT } from '../../i18n';
import { localizedPermissionLabel } from './permissionLabels';

export type SettingsTabId =
  | 'mcp'
  | 'usage'
  | 'provider'
  | 'permission'
  | 'theme'
  | 'keyboard'
  | 'language'
  | 'diagnose'
  | 'about'
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
  { id: 'permission', labelKey: 'settings.tab.permission', icon: <ShieldCheck className="h-4 w-4" /> },
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

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
      role="dialog"
      aria-modal="true"
      aria-label={t('settings.title')}
      data-testid="settings-modal"
    >
      <div className="flex max-h-[90vh] w-[960px] max-w-[95vw] flex-col rounded-lg border border-border-primary bg-bg-primary shadow-xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border-primary p-4">
          <h2 className="text-lg font-semibold">{t('settings.title')}</h2>
          <button
            onClick={onClose}
            className="rounded-md p-2 hover:bg-bg-tertiary"
            aria-label={t('settings.close')}
            data-testid="settings-close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Body — sidebar(left) + content(right) */}
        <div className="flex min-h-[520px] flex-1 overflow-hidden">
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
            {activeTab === 'permission' && <PermissionPanel />}
            {activeTab === 'theme' && <ThemePanel />}
            {activeTab === 'keyboard' && <KeyboardSettings />}
            {activeTab === 'language' && <LanguageSettings />}
            {activeTab === 'diagnose' && <DiagnoseSettings />}
            {activeTab === 'about' && <AboutPanel />}
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
  const t = useT();
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
  const [grants, setGrants] = useState<GrantSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async (): Promise<void> => {
    setLoading(true);
    setError(null);
    const w = typeof window !== 'undefined' ? window : undefined;
    const sessionApi = w?.dreampia?.session;
    const permApi = (w?.dreampia as { permission?: { listGrants: (id: string) => Promise<{ ok: boolean; value?: GrantSummary[]; error?: string }> } } | undefined)?.permission;
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
      const permApi = (w?.dreampia as { permission?: { revokeGrant: (id: string) => Promise<{ ok: boolean }> } } | undefined)?.permission;
      if (permApi === undefined) return;
      try {
        await permApi.revokeGrant(grantId);
      } catch {
        // ignore
      }
      void reload();
    },
    [reload]
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
        <p
          className="text-xs text-text-tertiary"
          data-testid="settings-permission-grants-empty"
        >
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
    const obj = JSON.parse(targetJson) as { target?: { kind?: string; path?: string; url?: string; domain?: string } };
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
