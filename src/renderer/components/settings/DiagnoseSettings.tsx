/**
 * DiagnoseSettings — v0.14.0 (A ABI Hardening) Settings 모달의 [진단] 탭.
 *
 * Spec: ROADMAP.md (v0.14.0 A ABI Hardening — 사용자 자가 진단 도구)
 *
 * UX:
 *  - app:diagnose IPC 호출 → 환경 / DB 정보 표시
 *  - 새로고침 버튼: 다시 진단 실행
 *  - DB 로드 실패 시 명확한 에러 + 명령어 안내 (npm run diagnose / dev:rebuild)
 *  - i18n: ko / en
 *
 * 이 패널은 read-only — 어떤 mutation 도 일으키지 않는다 (사용자가 직접 터미널
 * 에서 명령을 실행해 fix). 그게 ABI mismatch 같은 복구를 안전하게 만드는 길.
 */

import { useCallback, useEffect, useState } from 'react';
import { useT } from '../../i18n';

interface DiagnoseShape {
  platform: NodeJS.Platform;
  arch: string;
  node_version: string;
  electron_version: string;
  app_version: string;
  db_loaded: boolean;
  db_ok?: boolean;
  schema_version?: number | null;
  table_count?: number | null;
  integrity_ok?: boolean | null;
  wal_mode?: boolean | null;
  integrity_message?: string;
  db_error?: string;
}

export function DiagnoseSettings(): React.JSX.Element {
  const t = useT();
  const [data, setData] = useState<DiagnoseShape | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const runDiagnose = useCallback(async (): Promise<void> => {
    setLoading(true);
    setError(null);
    const appApi = typeof window !== 'undefined' ? window.dreampia?.app : undefined;
    if (appApi === undefined || typeof appApi.diagnose !== 'function') {
      setError(t('error.ipc_unavailable'));
      setLoading(false);
      return;
    }
    try {
      const result = await appApi.diagnose();
      if (result.ok) {
        setData(result.value);
      } else {
        setError(result.error);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    void runDiagnose();
  }, [runDiagnose]);

  return (
    <section className="flex-1 overflow-y-auto p-6" data-testid="settings-diagnose-panel">
      <header className="mb-4 flex items-start justify-between gap-4">
        <div className="flex-1">
          <h3 className="text-base font-semibold">{t('settings.diagnose.title')}</h3>
          <p className="text-xs text-text-secondary">{t('settings.diagnose.description')}</p>
        </div>
        <button
          type="button"
          onClick={() => {
            void runDiagnose();
          }}
          disabled={loading}
          className="rounded-md border border-border-primary bg-bg-secondary px-3 py-1.5 text-xs hover:bg-bg-tertiary disabled:cursor-not-allowed disabled:opacity-50"
          data-testid="settings-diagnose-refresh"
        >
          {t('settings.diagnose.refresh')}
        </button>
      </header>

      {loading ? (
        <p className="text-sm text-text-secondary">{t('settings.diagnose.loading')}</p>
      ) : error !== null ? (
        <DiagnoseErrorBlock t={t} error={error} />
      ) : data !== null ? (
        <DiagnoseDataBlock t={t} data={data} />
      ) : null}
    </section>
  );
}

// ────────────────────────────────────────────────────────────
// Subviews
// ────────────────────────────────────────────────────────────

interface SubProps {
  t: ReturnType<typeof useT>;
}

function DiagnoseErrorBlock({ t, error }: SubProps & { error: string }): React.JSX.Element {
  return (
    <div
      className="rounded-md border border-red-400/40 bg-red-500/10 p-4"
      role="alert"
      data-testid="settings-diagnose-error"
    >
      <h4 className="mb-2 text-sm font-semibold text-red-400">
        {t('settings.diagnose.error.title')}
      </h4>
      <p className="break-words font-mono text-xs text-text-secondary">{error}</p>
      <DiagnoseHints t={t} />
    </div>
  );
}

function DiagnoseDataBlock({ t, data }: SubProps & { data: DiagnoseShape }): React.JSX.Element {
  const dbHint = data.db_loaded === false ? t('settings.diagnose.error.db_load_failed') : undefined;
  return (
    <div className="space-y-5" data-testid="settings-diagnose-data">
      <DiagnoseSection
        title={t('settings.diagnose.section.environment')}
        rows={[
          { key: 'platform', label: t('settings.diagnose.field.platform'), value: data.platform },
          { key: 'arch', label: t('settings.diagnose.field.arch'), value: data.arch },
          {
            key: 'node_version',
            label: t('settings.diagnose.field.node_version'),
            value: data.node_version,
          },
          {
            key: 'electron_version',
            label: t('settings.diagnose.field.electron_version'),
            value: data.electron_version || t('settings.diagnose.value.unknown'),
          },
          {
            key: 'app_version',
            label: t('settings.diagnose.field.app_version'),
            value: data.app_version,
          },
        ]}
      />
      <DiagnoseSection
        title={t('settings.diagnose.section.database')}
        rows={[
          {
            key: 'db_loaded',
            label: t('settings.diagnose.field.db_loaded'),
            value: data.db_loaded
              ? t('settings.diagnose.value.yes')
              : t('settings.diagnose.value.no'),
            ok: data.db_loaded,
          },
          {
            key: 'schema_version',
            label: t('settings.diagnose.field.schema_version'),
            value:
              data.schema_version !== undefined && data.schema_version !== null
                ? String(data.schema_version)
                : t('settings.diagnose.value.unknown'),
          },
          {
            key: 'table_count',
            label: t('settings.diagnose.field.table_count'),
            value:
              data.table_count !== undefined && data.table_count !== null
                ? String(data.table_count)
                : t('settings.diagnose.value.unknown'),
          },
          {
            key: 'integrity',
            label: t('settings.diagnose.field.integrity'),
            value:
              data.integrity_ok === undefined
                ? t('settings.diagnose.value.unknown')
                : data.integrity_ok === true
                  ? t('settings.diagnose.status.ok')
                  : t('settings.diagnose.status.fail'),
            ok: data.integrity_ok ?? null,
          },
          {
            key: 'wal_mode',
            label: t('settings.diagnose.field.wal_mode'),
            value:
              data.wal_mode === undefined || data.wal_mode === null
                ? t('settings.diagnose.value.unknown')
                : data.wal_mode === true
                  ? t('settings.diagnose.value.yes')
                  : t('settings.diagnose.value.no'),
            ok: data.wal_mode ?? null,
          },
        ]}
      />
      {dbHint !== undefined && (
        <p className="text-xs text-red-400" data-testid="settings-diagnose-db-load-failed">
          {dbHint}
        </p>
      )}
      {data.db_error !== undefined && (
        <p className="font-mono text-xs text-red-400" data-testid="settings-diagnose-db-error">
          {data.db_error}
        </p>
      )}
      {data.integrity_message !== undefined && (
        <p
          className="font-mono text-xs text-yellow-400"
          data-testid="settings-diagnose-integrity-message"
        >
          {data.integrity_message}
        </p>
      )}
      <DiagnoseHints t={t} />
    </div>
  );
}

interface RowSpec {
  key: string;
  label: string;
  value: string;
  ok?: boolean | null;
}

function DiagnoseSection({
  title,
  rows,
}: {
  title: string;
  rows: ReadonlyArray<RowSpec>;
}): React.JSX.Element {
  return (
    <section className="rounded-md border border-border-primary bg-bg-secondary p-3">
      <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-text-tertiary">
        {title}
      </h4>
      <dl className="grid grid-cols-1 gap-2 text-xs sm:grid-cols-2">
        {rows.map((r) => {
          const okClass =
            r.ok === true
              ? 'text-emerald-400'
              : r.ok === false
                ? 'text-red-400'
                : 'text-text-secondary';
          return (
            <div key={r.key} className="flex items-center justify-between gap-3">
              <dt className="text-text-tertiary">{r.label}</dt>
              <dd
                className={`truncate font-mono ${okClass}`}
                data-testid={`settings-diagnose-${r.key}`}
              >
                {r.value}
              </dd>
            </div>
          );
        })}
      </dl>
    </section>
  );
}

function DiagnoseHints({ t }: SubProps): React.JSX.Element {
  return (
    <div className="mt-3 rounded-md border border-border-primary bg-bg-tertiary p-3">
      <h4 className="mb-1 text-xs font-semibold">{t('settings.diagnose.hint.heading')}</h4>
      <ul className="ml-4 list-disc space-y-1 text-xs text-text-secondary">
        <li>{t('settings.diagnose.hint.line1')}</li>
        <li>{t('settings.diagnose.hint.line2')}</li>
      </ul>
    </div>
  );
}
