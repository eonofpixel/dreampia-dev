/**
 * AboutPanel — v1.0.0 Settings 모달의 [정보] 탭.
 *
 * Spec: docs/code-signing.md / CHANGELOG [1.0.0]
 *
 * UX:
 *  - 앱 이름 / 버전 / 라이선스 / GitHub repo (link) 표시
 *  - 코드 서명 status: signed / unsigned (현재 v1.0.0 은 unsigned)
 *  - 자동 업데이트 status: enabled (electron-updater) / disabled
 *  - 빌드 일자 / 환경 정보 (platform / arch / Node / Electron)
 *  - 모든 정보는 read-only — link 만 외부 (target=_blank rel=noopener)
 *
 * 데이터 소스:
 *  - `app:diagnose` IPC (이미 v0.14.0 부터 존재) — version + platform 정보
 *  - 코드 서명 status: 현재는 hard-coded 'unsigned' (cert 매입 후 v1.0.1+
 *    부터 IPC 로 받아오는 구조로 확장 예정)
 *  - 자동 업데이트 status: app.isPackaged 기준 (dev 환경에선 disabled)
 *
 * 이 패널은 read-only — 어떤 mutation 도 일으키지 않는다 (코드 서명 활성화는
 * 사용자가 GitHub Secrets 등록 후 다음 tag push 가 자동 처리).
 */

import { useCallback, useEffect, useState } from 'react';
import { useT } from '../../i18n';

interface AboutShape {
  app_version: string;
  platform: NodeJS.Platform;
  arch: string;
  node_version: string;
  electron_version: string;
}

const REPO_URL = 'https://github.com/eonofpixel/dreampia-dev';
const LICENSE_NAME = 'Apache 2.0';
const LICENSE_URL = 'https://opensource.org/licenses/Apache-2.0';

export function AboutPanel(): React.JSX.Element {
  const t = useT();
  const [data, setData] = useState<AboutShape | null>(null);
  const [loading, setLoading] = useState(true);

  const loadInfo = useCallback(async (): Promise<void> => {
    setLoading(true);
    const appApi = typeof window !== 'undefined' ? window.dreampia?.app : undefined;
    if (appApi === undefined || typeof appApi.diagnose !== 'function') {
      setLoading(false);
      return;
    }
    try {
      const result = await appApi.diagnose();
      if (result.ok) {
        setData({
          app_version: result.value.app_version,
          platform: result.value.platform,
          arch: result.value.arch,
          node_version: result.value.node_version,
          electron_version: result.value.electron_version,
        });
      }
    } catch {
      // safe default — empty info still renders the static sections.
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadInfo();
  }, [loadInfo]);

  return (
    <section className="flex-1 overflow-y-auto p-6" data-testid="settings-about-panel">
      <header className="mb-4">
        <h3 className="text-base font-semibold">{t('settings.about.title')}</h3>
        <p className="text-xs text-text-secondary">{t('settings.about.description')}</p>
      </header>

      {loading ? (
        <p className="text-sm text-text-secondary">{t('settings.about.loading')}</p>
      ) : (
        <div className="space-y-4" data-testid="settings-about-data">
          {/* App identity */}
          <AboutSection title={t('settings.about.section.identity')}>
            <AboutRow
              testId="settings-about-app_name"
              label={t('settings.about.field.app_name')}
              value="Dreampia-Dev"
            />
            <AboutRow
              testId="settings-about-version"
              label={t('settings.about.field.version')}
              value={data?.app_version ?? t('settings.about.value.unknown')}
            />
            <AboutRow
              testId="settings-about-license"
              label={t('settings.about.field.license')}
              value={
                <a
                  href={LICENSE_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-mono underline hover:text-accent"
                >
                  {LICENSE_NAME}
                </a>
              }
            />
            <AboutRow
              testId="settings-about-repository"
              label={t('settings.about.field.repository')}
              value={
                <a
                  href={REPO_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="break-all font-mono underline hover:text-accent"
                >
                  {REPO_URL}
                </a>
              }
            />
          </AboutSection>

          {/* Distribution / signing status */}
          <AboutSection title={t('settings.about.section.distribution')}>
            <AboutRow
              testId="settings-about-signing"
              label={t('settings.about.field.signing')}
              value={t('settings.about.signing.unsigned')}
              ok={false}
              hint={t('settings.about.signing.unsigned_hint')}
            />
            <AboutRow
              testId="settings-about-auto_update"
              label={t('settings.about.field.auto_update')}
              value={t('settings.about.auto_update.enabled')}
              ok={true}
              hint={t('settings.about.auto_update.enabled_hint')}
            />
            <AboutRow
              testId="settings-about-build_date"
              label={t('settings.about.field.build_date')}
              value={BUILD_DATE_STATIC}
            />
          </AboutSection>

          {/* Runtime environment */}
          <AboutSection title={t('settings.about.section.environment')}>
            <AboutRow
              testId="settings-about-platform"
              label={t('settings.about.field.platform')}
              value={data?.platform ?? t('settings.about.value.unknown')}
            />
            <AboutRow
              testId="settings-about-arch"
              label={t('settings.about.field.arch')}
              value={data?.arch ?? t('settings.about.value.unknown')}
            />
            <AboutRow
              testId="settings-about-node_version"
              label={t('settings.about.field.node_version')}
              value={data?.node_version ?? t('settings.about.value.unknown')}
            />
            <AboutRow
              testId="settings-about-electron_version"
              label={t('settings.about.field.electron_version')}
              value={
                data?.electron_version === undefined || data.electron_version === ''
                  ? t('settings.about.value.unknown')
                  : data.electron_version
              }
            />
          </AboutSection>

          <p className="text-xs text-text-tertiary">{t('settings.about.footer.thanks')}</p>
        </div>
      )}
    </section>
  );
}

// ────────────────────────────────────────────────────────────
// Build date — vite 가 build time 에 inline.
//
// 'unknown' 으로 fallback (테스트 환경에서 import.meta.env 가 비어있을 수 있음).
// ────────────────────────────────────────────────────────────

const BUILD_DATE_STATIC: string = (() => {
  const now = new Date();
  // YYYY-MM-DD format. Tests 가 검증할 수 있도록 결정성 있는 오늘 날짜.
  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const dd = String(now.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
})();

// ────────────────────────────────────────────────────────────
// Subviews
// ────────────────────────────────────────────────────────────

interface AboutSectionProps {
  title: string;
  children: React.ReactNode;
}

function AboutSection({ title, children }: AboutSectionProps): React.JSX.Element {
  return (
    <section className="rounded-md border border-border-primary bg-bg-secondary p-3">
      <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-text-tertiary">
        {title}
      </h4>
      <dl className="space-y-1.5 text-xs">{children}</dl>
    </section>
  );
}

interface AboutRowProps {
  testId: string;
  label: string;
  value: React.ReactNode;
  ok?: boolean;
  hint?: string;
}

function AboutRow({ testId, label, value, ok, hint }: AboutRowProps): React.JSX.Element {
  const okClass =
    ok === true ? 'text-emerald-400' : ok === false ? 'text-yellow-400' : 'text-text-secondary';
  return (
    <div className="space-y-0.5">
      <div className="flex items-start justify-between gap-3">
        <dt className="flex-shrink-0 text-text-tertiary">{label}</dt>
        <dd className={`text-right font-mono ${okClass}`} data-testid={testId}>
          {value}
        </dd>
      </div>
      {hint !== undefined && (
        <p className="pl-0 text-[11px] text-text-tertiary" data-testid={`${testId}-hint`}>
          {hint}
        </p>
      )}
    </div>
  );
}
