/**
 * AutomationModal — Sidebar [자동화] 클릭 시 mount (v1.7.4).
 *
 * Spec: docs/v1.x-roadmap.md (v1.7.4 — Sidebar [자동화] panel 활성화).
 *
 * MVP 기능:
 *  - 등록된 rules 목록 표시 (kind / cron expr / next_run / webhook path).
 *  - 새 rule 등록 form — name + kind + kind-specific fields.
 *  - cron expression 의 [다음 실행] 즉시 미리보기 (getNextRun IPC).
 *  - rule fire (수동 trigger).
 *  - rule unregister.
 *
 * 후속:
 *  - 실 handler 등록 (LLM 호출 / shell 명령 / IPC 트리거 등).
 *  - audit log 표시.
 *  - rule 영속 (현재는 process 생애 in-memory 만).
 */

import { useCallback, useEffect, useState } from 'react';
import { X, Plus, Play, Trash2 } from 'lucide-react';
import type {
  AutomationKindShape,
  AutomationRuleSummaryShape,
} from '@/main/preload';
import { useT } from '../../i18n';

export interface AutomationModalProps {
  open: boolean;
  onClose: () => void;
}

export function AutomationModal({ open, onClose }: AutomationModalProps): React.JSX.Element | null {
  const t = useT();
  const [rules, setRules] = useState<AutomationRuleSummaryShape[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // 새 rule form 상태.
  const [draftName, setDraftName] = useState('');
  const [draftKind, setDraftKind] = useState<AutomationKindShape>('cron');
  const [draftCronExpr, setDraftCronExpr] = useState('0 9 * * 1-5');
  const [draftCronTz, setDraftCronTz] = useState('');
  const [draftIntervalMs, setDraftIntervalMs] = useState('60000');
  const [draftWebhookPath, setDraftWebhookPath] = useState('/hooks/');
  const [draftNextRun, setDraftNextRun] = useState<string | null>(null);
  // v1.7.25 — handler picker 상태.
  const [availableHandlers, setAvailableHandlers] = useState<string[]>([]);
  const [draftHandlerName, setDraftHandlerName] = useState('');
  const [draftHandlerConfig, setDraftHandlerConfig] = useState('');

  const handleToggleEnabled = async (name: string, currentEnabled: boolean): Promise<void> => {
    const api = typeof window !== 'undefined' ? window.dreampia?.automation : undefined;
    if (api === undefined || api.setEnabled === undefined) return;
    const r = await api.setEnabled(name, !currentEnabled);
    if (r.ok) void reload();
  };

  const reload = useCallback(async (): Promise<void> => {
    setLoading(true);
    setError(null);
    const api = typeof window !== 'undefined' ? window.dreampia?.automation : undefined;
    if (api === undefined) {
      setError(t('automation.error_no_ipc'));
      setLoading(false);
      return;
    }
    try {
      const r = await api.list();
      if (r.ok) setRules(r.value);
      else setError(typeof r.error === 'string' ? r.error : 'unknown');
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    if (open) void reload();
  }, [open, reload]);

  // v1.7.25 — Modal open 시 handler 목록 로드.
  useEffect(() => {
    if (!open) return;
    const api = typeof window !== 'undefined' ? window.dreampia?.automation : undefined;
    if (api === undefined || api.listHandlers === undefined) return;
    void (async () => {
      try {
        const r = await api.listHandlers();
        if (r.ok) setAvailableHandlers(r.value);
      } catch {
        // silent — handler picker 가 비어 있어도 noop-log 로 fallback.
      }
    })();
  }, [open]);

  // cron expression 변경 시 next_run 미리보기 IPC.
  useEffect(() => {
    if (draftKind !== 'cron') {
      setDraftNextRun(null);
      return;
    }
    const api = typeof window !== 'undefined' ? window.dreampia?.automation : undefined;
    if (api === undefined) return;
    let cancelled = false;
    const t = setTimeout(() => {
      void (async () => {
        try {
          const r = await api.getNextRun(draftCronExpr, draftCronTz || undefined);
          if (cancelled) return;
          setDraftNextRun(r.ok ? r.value.next_run : null);
        } catch {
          if (!cancelled) setDraftNextRun(null);
        }
      })();
    }, 200);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [draftKind, draftCronExpr, draftCronTz]);

  const handleAdd = useCallback(async (): Promise<void> => {
    setError(null);
    const api = typeof window !== 'undefined' ? window.dreampia?.automation : undefined;
    if (api === undefined) {
      setError(t('automation.error_no_ipc'));
      return;
    }
    const name = draftName.trim();
    if (name.length === 0) {
      setError(t('automation.error_name_required'));
      return;
    }
    // v1.7.25 — handler_config 의 JSON 검증 + handler_name 통합.
    let handlerConfigParsed: Record<string, unknown> | undefined;
    const trimmedConfig = draftHandlerConfig.trim();
    if (trimmedConfig.length > 0) {
      try {
        const parsed: unknown = JSON.parse(trimmedConfig);
        if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
          setError(t('automation.error_handler_config_invalid_json'));
          return;
        }
        handlerConfigParsed = parsed as Record<string, unknown>;
      } catch {
        setError(t('automation.error_handler_config_invalid_json'));
        return;
      }
    }
    const handlerNameToUse =
      draftHandlerName.length > 0 ? draftHandlerName : undefined;

    try {
      const base =
        draftKind === 'interval'
          ? { name, kind: draftKind, interval_ms: parseInt(draftIntervalMs, 10) }
          : draftKind === 'cron'
            ? {
                name,
                kind: draftKind,
                cron_expr: draftCronExpr,
                ...(draftCronTz.length > 0 && { cron_tz: draftCronTz }),
              }
            : { name, kind: draftKind, webhook_path: draftWebhookPath };
      const payload = {
        ...base,
        ...(handlerNameToUse !== undefined && { handler_name: handlerNameToUse }),
        ...(handlerConfigParsed !== undefined && { handler_config: handlerConfigParsed }),
      };
      const r = await api.register(payload);
      if (!r.ok) {
        setError(typeof r.error === 'string' ? r.error : 'register failed');
        return;
      }
      setDraftName('');
      setDraftHandlerConfig('');
      void reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }, [
    draftName,
    draftKind,
    draftCronExpr,
    draftCronTz,
    draftIntervalMs,
    draftWebhookPath,
    draftHandlerName,
    draftHandlerConfig,
    reload,
    t,
  ]);

  const handleUnregister = useCallback(
    async (name: string): Promise<void> => {
      const api = typeof window !== 'undefined' ? window.dreampia?.automation : undefined;
      if (api === undefined) return;
      await api.unregister(name);
      void reload();
    },
    [reload]
  );

  const handleFire = useCallback(async (name: string): Promise<void> => {
    const api = typeof window !== 'undefined' ? window.dreampia?.automation : undefined;
    if (api === undefined) return;
    await api.fire(name);
  }, []);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
      role="dialog"
      aria-modal="true"
      aria-label={t('automation.modal_aria')}
      data-testid="automation-modal"
    >
      <div className="flex max-h-[90vh] w-[860px] max-w-[95vw] flex-col rounded-lg border border-border-primary bg-bg-primary shadow-xl">
        <div className="flex items-center justify-between border-b border-border-primary p-4">
          <h2 className="text-lg font-semibold">{t('automation.title')}</h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md p-2 hover:bg-bg-tertiary"
            aria-label={t('automation.close')}
            data-testid="automation-close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex-1 space-y-4 overflow-y-auto p-4">
          {error !== null && (
            <p
              className="break-words rounded border border-red-600/40 bg-red-900/20 p-2 font-mono text-[11px] text-red-300"
              data-testid="automation-error"
            >
              {error}
            </p>
          )}

          {/* 새 rule 등록 form */}
          <section
            className="rounded-md border border-border-primary p-3"
            data-testid="automation-new-rule"
          >
            <h3 className="mb-2 text-sm font-semibold">{t('automation.new_rule_title')}</h3>
            <div className="grid grid-cols-2 gap-2">
              <label className="flex flex-col gap-1 text-xs">
                <span>{t('automation.field_name')}</span>
                <input
                  type="text"
                  value={draftName}
                  onChange={(e) => setDraftName(e.target.value)}
                  placeholder={t('automation.field_name_placeholder')}
                  className="rounded border border-border-primary bg-bg-secondary px-2 py-1 text-xs"
                  data-testid="automation-draft-name"
                />
              </label>
              <label className="flex flex-col gap-1 text-xs">
                <span>{t('automation.field_kind')}</span>
                <select
                  value={draftKind}
                  onChange={(e) => setDraftKind(e.target.value as AutomationKindShape)}
                  className="rounded border border-border-primary bg-bg-secondary px-2 py-1 text-xs"
                  data-testid="automation-draft-kind"
                >
                  <option value="cron">{t('automation.kind_cron')}</option>
                  <option value="interval">{t('automation.kind_interval')}</option>
                  <option value="webhook">{t('automation.kind_webhook')}</option>
                </select>
              </label>

              {draftKind === 'cron' && (
                <>
                  <label className="flex flex-col gap-1 text-xs">
                    <span>{t('automation.field_cron_expr')}</span>
                    <input
                      type="text"
                      value={draftCronExpr}
                      onChange={(e) => setDraftCronExpr(e.target.value)}
                      placeholder={t('automation.field_cron_expr_placeholder')}
                      className="rounded border border-border-primary bg-bg-secondary px-2 py-1 font-mono text-xs"
                      data-testid="automation-draft-cron"
                    />
                  </label>
                  <label className="flex flex-col gap-1 text-xs">
                    <span>{t('automation.field_tz')}</span>
                    <input
                      type="text"
                      value={draftCronTz}
                      onChange={(e) => setDraftCronTz(e.target.value)}
                      placeholder="Asia/Seoul"
                      className="rounded border border-border-primary bg-bg-secondary px-2 py-1 text-xs"
                      data-testid="automation-draft-tz"
                    />
                  </label>
                  <p
                    className="col-span-2 text-[11px] text-text-tertiary"
                    data-testid="automation-draft-next-run"
                  >
                    {t('automation.next_run_label')}:{' '}
                    {draftNextRun ?? t('automation.next_run_invalid')}
                  </p>
                </>
              )}

              {draftKind === 'interval' && (
                <label className="col-span-2 flex flex-col gap-1 text-xs">
                  <span>{t('automation.field_interval_ms')}</span>
                  <input
                    type="number"
                    value={draftIntervalMs}
                    onChange={(e) => setDraftIntervalMs(e.target.value)}
                    min="1000"
                    className="rounded border border-border-primary bg-bg-secondary px-2 py-1 text-xs"
                    data-testid="automation-draft-interval"
                  />
                </label>
              )}

              {draftKind === 'webhook' && (
                <label className="col-span-2 flex flex-col gap-1 text-xs">
                  <span>{t('automation.field_webhook_path')}</span>
                  <input
                    type="text"
                    value={draftWebhookPath}
                    onChange={(e) => setDraftWebhookPath(e.target.value)}
                    placeholder="/hooks/abc"
                    className="rounded border border-border-primary bg-bg-secondary px-2 py-1 font-mono text-xs"
                    data-testid="automation-draft-webhook"
                  />
                </label>
              )}

              {/* v1.7.25 — Handler picker + JSON config */}
              <label className="col-span-2 flex flex-col gap-1 text-xs">
                <span>{t('automation.field_handler')}</span>
                <select
                  value={draftHandlerName}
                  onChange={(e) => setDraftHandlerName(e.target.value)}
                  className="rounded border border-border-primary bg-bg-secondary px-2 py-1 text-xs"
                  data-testid="automation-draft-handler"
                >
                  <option value="">{t('automation.handler_default_label')}</option>
                  {availableHandlers.map((h) => (
                    <option key={h} value={h}>
                      {h}
                    </option>
                  ))}
                </select>
              </label>
              <label className="col-span-2 flex flex-col gap-1 text-xs">
                <span>{t('automation.field_handler_config')}</span>
                <textarea
                  value={draftHandlerConfig}
                  onChange={(e) => setDraftHandlerConfig(e.target.value)}
                  placeholder={t('automation.field_handler_config_placeholder')}
                  rows={3}
                  className="rounded border border-border-primary bg-bg-secondary px-2 py-1 font-mono text-[11px]"
                  data-testid="automation-draft-handler-config"
                />
              </label>
            </div>

            <button
              type="button"
              onClick={() => {
                void handleAdd();
              }}
              className="mt-3 inline-flex items-center gap-1 rounded-md bg-accent px-3 py-1 text-xs font-medium text-white hover:bg-accent-hover"
              data-testid="automation-add"
            >
              <Plus className="h-3 w-3" />
              {t('automation.add')}
            </button>
          </section>

          {/* 등록된 rules 목록 */}
          <section
            className="rounded-md border border-border-primary"
            data-testid="automation-rules-list"
          >
            <h3 className="border-b border-border-primary px-3 py-2 text-sm font-semibold">
              {t('automation.list_title', { n: rules.length })}
            </h3>
            {loading ? (
              <p className="p-3 text-xs text-text-secondary">{t('automation.loading')}</p>
            ) : rules.length === 0 ? (
              <p
                className="p-3 text-xs text-text-tertiary"
                data-testid="automation-empty"
              >
                {t('automation.empty')}
              </p>
            ) : (
              <ul className="divide-y divide-border-primary">
                {rules.map((r) => (
                  <li
                    key={r.name}
                    className="flex items-start justify-between gap-3 px-3 py-2 text-xs"
                    data-testid={`automation-rule-${r.name}`}
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-mono font-medium">{r.name}</span>
                        <span className="rounded bg-bg-tertiary px-1.5 py-0.5 text-[10px] text-text-secondary">
                          {r.kind}
                        </span>
                        {r.handler_name !== undefined && (
                          <span
                            className="rounded bg-blue-900/20 px-1.5 py-0.5 font-mono text-[10px] text-blue-300"
                            data-testid={`automation-rule-${r.name}-handler`}
                          >
                            {t('automation.handler_label')}: {r.handler_name}
                          </span>
                        )}
                      </div>
                      <div className="mt-1 text-[11px] text-text-tertiary">
                        {r.kind === 'cron' && (
                          <>
                            <span className="font-mono">{r.cron_expr}</span>
                            {r.cron_tz !== undefined && (
                              <span className="ml-2">@ {r.cron_tz}</span>
                            )}
                            {r.next_run !== null && (
                              <span className="ml-2">
                                {t('automation.next_label')}: {r.next_run}
                              </span>
                            )}
                          </>
                        )}
                        {r.kind === 'interval' && (
                          <span>
                            {t('automation.every', { ms: r.interval_ms ?? 0 })}
                          </span>
                        )}
                        {r.kind === 'webhook' && (
                          <span className="font-mono">POST {r.webhook_path}</span>
                        )}
                      </div>
                    </div>
                    <div className="flex shrink-0 items-center gap-1">
                      <label
                        className="flex cursor-pointer items-center gap-1 text-[10px] text-text-secondary"
                        title={t('automation.toggle_tooltip')}
                        data-testid={`automation-toggle-${r.name}`}
                      >
                        <input
                          type="checkbox"
                          checked={r.enabled !== false}
                          onChange={() => {
                            void handleToggleEnabled(r.name, r.enabled !== false);
                          }}
                          className="h-3 w-3 cursor-pointer"
                          aria-label={t('automation.toggle_tooltip')}
                        />
                        {r.enabled !== false
                          ? t('automation.enabled_label')
                          : t('automation.disabled_label')}
                      </label>
                      <button
                        type="button"
                        onClick={() => {
                          void handleFire(r.name);
                        }}
                        className="rounded border border-border-primary bg-bg-tertiary px-2 py-0.5 text-[10px] hover:bg-bg-primary"
                        title={t('automation.fire_tooltip')}
                        aria-label={t('automation.fire_aria', { name: r.name })}
                        data-testid={`automation-fire-${r.name}`}
                      >
                        <Play className="h-3 w-3" />
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          void handleUnregister(r.name);
                        }}
                        className="rounded border border-red-600/40 bg-red-900/20 px-2 py-0.5 text-[10px] text-red-300 hover:bg-red-900/30"
                        title={t('automation.remove_tooltip')}
                        aria-label={t('automation.remove_aria', { name: r.name })}
                        data-testid={`automation-remove-${r.name}`}
                      >
                        <Trash2 className="h-3 w-3" />
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
