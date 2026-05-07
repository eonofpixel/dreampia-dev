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

      {/* v1.4.0 follow-up — workspace_id FNV → sha256 backfill 사용자 trigger. */}
      <WorkspaceBackfillSection t={t} />

      {/* v1.7.15 — Telemetry opt-in toggle. */}
      <TelemetrySection t={t} />

      {/* v1.0.11 SEC-3 — Audit log viewer. 별도 IPC 호출이라 위 진단 섹션과
          독립적으로 fetch + error. */}
      <AuditLogSection t={t} />
    </section>
  );
}

// ────────────────────────────────────────────────────────────
// v1.7.15 — Telemetry opt-in section
// ────────────────────────────────────────────────────────────

function TelemetrySection({ t }: SubProps): React.JSX.Element {
  const [enabled, setEnabled] = useState<boolean | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const appApi = typeof window !== 'undefined' ? window.dreampia?.app : undefined;
    if (appApi === undefined || typeof appApi.getTelemetryEnabled !== 'function') {
      setEnabled(false);
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const r = await appApi.getTelemetryEnabled();
        if (!cancelled) {
          setEnabled(r.ok ? r.value : false);
        }
      } catch {
        if (!cancelled) setEnabled(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const handleToggle = useCallback(async (): Promise<void> => {
    if (enabled === null) return;
    const next = !enabled;
    setEnabled(next); // optimistic
    setError(null);
    const appApi = typeof window !== 'undefined' ? window.dreampia?.app : undefined;
    if (appApi === undefined || typeof appApi.setTelemetryEnabled !== 'function') {
      setEnabled(!next);
      setError(t('error.ipc_unavailable'));
      return;
    }
    try {
      const r = await appApi.setTelemetryEnabled(next);
      if (r.ok === false) {
        setEnabled(!next);
        setError(r.error);
      }
    } catch (e) {
      setEnabled(!next);
      setError(e instanceof Error ? e.message : String(e));
    }
  }, [enabled, t]);

  return (
    <section
      className="mt-6 rounded-md border border-border-primary p-4"
      data-testid="settings-telemetry-section"
    >
      <h4 className="mb-1 text-sm font-semibold">{t('settings.diagnose.telemetry.title')}</h4>
      <p className="mb-3 text-xs text-text-secondary">
        {t('settings.diagnose.telemetry.description')}
      </p>
      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={enabled === true}
          disabled={enabled === null}
          onChange={() => {
            void handleToggle();
          }}
          data-testid="settings-telemetry-toggle"
        />
        <span>{t('settings.diagnose.telemetry.toggle_label')}</span>
      </label>
      {error !== null && (
        <p
          className="mt-3 break-words rounded border border-red-600/40 bg-red-900/20 p-2 font-mono text-[11px] text-red-300"
          data-testid="settings-telemetry-error"
        >
          {error}
        </p>
      )}
    </section>
  );
}

// ────────────────────────────────────────────────────────────
// v1.4.0 follow-up — Workspace ID backfill section
// ────────────────────────────────────────────────────────────

function WorkspaceBackfillSection({ t }: SubProps): React.JSX.Element {
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<{
    scanned: number;
    updated: number;
    skipped: number;
    cascade_sessions: number;
    conflicts: number;
  } | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const handleRun = useCallback(async (): Promise<void> => {
    setRunning(true);
    setErr(null);
    const appApi = typeof window !== 'undefined' ? window.dreampia?.app : undefined;
    if (appApi === undefined || typeof appApi.runWorkspaceBackfill !== 'function') {
      setErr(t('error.ipc_unavailable'));
      setRunning(false);
      return;
    }
    try {
      const r = await appApi.runWorkspaceBackfill();
      if (r.ok) {
        setResult(r.value);
      } else {
        setErr(r.error);
      }
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setRunning(false);
    }
  }, [t]);

  return (
    <section
      className="mt-6 rounded-md border border-border-primary p-4"
      data-testid="settings-workspace-backfill"
    >
      <h4 className="mb-1 text-sm font-semibold">
        {t('settings.diagnose.workspace_backfill.title')}
      </h4>
      <p className="mb-3 text-xs text-text-secondary">
        {t('settings.diagnose.workspace_backfill.description')}
      </p>
      <button
        type="button"
        onClick={() => {
          void handleRun();
        }}
        disabled={running}
        className="rounded-md border border-border-primary bg-bg-secondary px-3 py-1.5 text-xs hover:bg-bg-tertiary disabled:cursor-not-allowed disabled:opacity-50"
        data-testid="settings-workspace-backfill-run"
      >
        {running
          ? t('settings.diagnose.workspace_backfill.running')
          : t('settings.diagnose.workspace_backfill.run')}
      </button>
      {result !== null && (
        <ul
          className="mt-3 space-y-1 text-xs text-text-secondary"
          data-testid="settings-workspace-backfill-result"
        >
          <li>
            {t('settings.diagnose.workspace_backfill.stat_scanned')}: {result.scanned}
          </li>
          <li>
            {t('settings.diagnose.workspace_backfill.stat_updated')}: {result.updated}
          </li>
          <li>
            {t('settings.diagnose.workspace_backfill.stat_skipped')}: {result.skipped}
          </li>
          <li>
            {t('settings.diagnose.workspace_backfill.stat_cascade')}: {result.cascade_sessions}
          </li>
          <li>
            {t('settings.diagnose.workspace_backfill.stat_conflicts')}: {result.conflicts}
          </li>
        </ul>
      )}
      {err !== null && (
        <p
          className="mt-3 break-words rounded border border-red-600/40 bg-red-900/20 p-2 font-mono text-[11px] text-red-300"
          data-testid="settings-workspace-backfill-error"
        >
          {err}
        </p>
      )}
    </section>
  );
}

// ────────────────────────────────────────────────────────────
// v1.0.11 SEC-3 — Audit log viewer
//
// 진단 탭 아래쪽에 mount. tool_use.* / permission.* 이벤트 최근 50건.
// IPC: dreampia.audit.recent({ limit: 50 })
// ────────────────────────────────────────────────────────────

interface AuditEntry {
  id: number;
  timestamp: string;
  session_id: string;
  turn_id?: string;
  event: string;
  capability: string;
  target_json: string;
  decision_reason: string;
  /** v1.0.12: 정식 컬럼. v1.0.11 row 는 NULL (ai_model 에 backfill). */
  tool_id?: string;
  ai_model?: string;
  ai_reason?: string;
  outcome?: string;
  error?: string;
}

function AuditLogSection({ t }: SubProps): React.JSX.Element {
  const [entries, setEntries] = useState<AuditEntry[] | null>(null);
  const [auditError, setAuditError] = useState<string | null>(null);
  const [auditLoading, setAuditLoading] = useState(true);

  const reload = useCallback(async (): Promise<void> => {
    setAuditLoading(true);
    setAuditError(null);
    const auditApi = typeof window !== 'undefined' ? window.dreampia?.audit : undefined;
    if (auditApi === undefined || typeof auditApi.recent !== 'function') {
      setAuditError(t('error.ipc_unavailable'));
      setAuditLoading(false);
      return;
    }
    try {
      const result = await auditApi.recent({ limit: 50 });
      if (result.ok) {
        setEntries(result.value);
      } else {
        setAuditError(result.error);
      }
    } catch (err) {
      setAuditError(err instanceof Error ? err.message : String(err));
    } finally {
      setAuditLoading(false);
    }
  }, [t]);

  useEffect(() => {
    void reload();
  }, [reload]);

  return (
    <section
      className="mt-6 rounded-md border border-border-primary bg-bg-secondary p-3"
      data-testid="settings-diagnose-audit"
    >
      <header className="mb-2 flex items-start justify-between gap-3">
        <div className="flex-1">
          <h4 className="text-sm font-semibold">{t('settings.diagnose.audit.title')}</h4>
          <p className="text-xs text-text-tertiary">{t('settings.diagnose.audit.description')}</p>
        </div>
        <button
          type="button"
          onClick={() => {
            void reload();
          }}
          disabled={auditLoading}
          className="rounded-md border border-border-primary bg-bg-tertiary px-2 py-1 text-xs hover:bg-bg-primary disabled:cursor-not-allowed disabled:opacity-50"
          data-testid="settings-diagnose-audit-refresh"
        >
          {t('settings.diagnose.audit.refresh')}
        </button>
      </header>

      {auditLoading ? (
        <p className="text-xs text-text-secondary">{t('settings.diagnose.loading')}</p>
      ) : auditError !== null ? (
        <div
          className="rounded border border-red-400/40 bg-red-500/10 p-2"
          role="alert"
          data-testid="settings-diagnose-audit-error"
        >
          <p className="text-xs font-semibold text-red-400">
            {t('settings.diagnose.audit.error.title')}
          </p>
          <p className="break-words font-mono text-[11px] text-text-secondary">{auditError}</p>
        </div>
      ) : entries !== null && entries.length > 0 ? (
        <AuditTable entries={entries} t={t} />
      ) : (
        <p className="text-xs text-text-tertiary" data-testid="settings-diagnose-audit-empty">
          {t('settings.diagnose.audit.empty')}
        </p>
      )}
    </section>
  );
}

function AuditTable({
  entries,
  t,
}: {
  entries: AuditEntry[];
  t: ReturnType<typeof useT>;
}): React.JSX.Element {
  return (
    <div className="overflow-x-auto">
      <table
        className="w-full border-collapse text-left text-[11px]"
        data-testid="settings-diagnose-audit-table"
      >
        <thead className="text-text-tertiary">
          <tr>
            <th className="border-b border-border-primary py-1 pr-3 font-medium">
              {t('settings.diagnose.audit.column.time')}
            </th>
            <th className="border-b border-border-primary py-1 pr-3 font-medium">
              {t('settings.diagnose.audit.column.event')}
            </th>
            <th className="border-b border-border-primary py-1 pr-3 font-medium">
              {t('settings.diagnose.audit.column.capability')}
            </th>
            <th className="border-b border-border-primary py-1 pr-3 font-medium">
              {t('settings.diagnose.audit.column.outcome')}
            </th>
            <th className="border-b border-border-primary py-1 font-medium">
              {t('settings.diagnose.audit.column.target')}
            </th>
          </tr>
        </thead>
        <tbody>
          {entries.map((e) => (
            <tr
              key={e.id}
              className="border-b border-border-primary/30 last:border-b-0 hover:bg-bg-tertiary/40"
              data-testid={`settings-diagnose-audit-row-${e.id}`}
            >
              <td className="py-1 pr-3 font-mono text-text-secondary">
                {formatAuditTime(e.timestamp)}
              </td>
              <td className="py-1 pr-3 font-mono text-text-primary">
                {e.event}
                {(() => {
                  // v1.0.12: tool_id 정식 컬럼. v1.0.11 row 는 ai_model 에
                  // backfill 돼 있어 fallback.
                  const toolLabel = e.tool_id ?? e.ai_model;
                  return toolLabel !== undefined ? (
                    <span className="ml-1 text-text-tertiary">[{toolLabel}]</span>
                  ) : null;
                })()}
              </td>
              <td className="py-1 pr-3 font-mono text-text-secondary">{e.capability || '—'}</td>
              <td className={`py-1 pr-3 font-mono ${auditOutcomeClass(e)}`}>
                {e.outcome ?? e.decision_reason}
              </td>
              <td className="py-1 font-mono text-text-tertiary">
                <span className="block max-w-[280px] truncate" title={e.target_json}>
                  {e.target_json}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function formatAuditTime(iso: string): string {
  // ISO 8601 → 'HH:MM:SS' (날짜는 audit row 가 많아져도 의미가 작아 시간만).
  const t = iso.indexOf('T');
  if (t < 0) return iso;
  const tail = iso.slice(t + 1);
  const dot = tail.indexOf('.');
  return dot >= 0 ? tail.slice(0, dot) : tail.replace(/Z.*$/, '');
}

function auditOutcomeClass(e: AuditEntry): string {
  if (e.event.startsWith('permission.denied') || e.event === 'tool_use.failed') {
    return 'text-red-400';
  }
  if (e.event === 'tool_use.cancelled' || e.event === 'tool_use.timeout') {
    return 'text-yellow-400';
  }
  if (e.event === 'tool_use.success' || e.event === 'permission.granted') {
    return 'text-emerald-400';
  }
  return 'text-text-secondary';
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
