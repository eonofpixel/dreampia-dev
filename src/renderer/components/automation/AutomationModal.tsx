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

export interface AutomationModalProps {
  open: boolean;
  onClose: () => void;
}

export function AutomationModal({ open, onClose }: AutomationModalProps): React.JSX.Element | null {
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

  const reload = useCallback(async (): Promise<void> => {
    setLoading(true);
    setError(null);
    const api = typeof window !== 'undefined' ? window.dreampia?.automation : undefined;
    if (api === undefined) {
      setError('IPC 채널이 없어 자동화 정보를 가져올 수 없습니다.');
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
  }, []);

  useEffect(() => {
    if (open) void reload();
  }, [open, reload]);

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
      setError('IPC 채널이 없습니다.');
      return;
    }
    const name = draftName.trim();
    if (name.length === 0) {
      setError('이름을 입력하세요.');
      return;
    }
    try {
      const payload =
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
      const r = await api.register(payload);
      if (!r.ok) {
        setError(typeof r.error === 'string' ? r.error : 'register failed');
        return;
      }
      setDraftName('');
      void reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }, [draftName, draftKind, draftCronExpr, draftCronTz, draftIntervalMs, draftWebhookPath, reload]);

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
      aria-label="자동화"
      data-testid="automation-modal"
    >
      <div className="flex max-h-[90vh] w-[860px] max-w-[95vw] flex-col rounded-lg border border-border-primary bg-bg-primary shadow-xl">
        <div className="flex items-center justify-between border-b border-border-primary p-4">
          <h2 className="text-lg font-semibold">자동화 (Bot Automation)</h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md p-2 hover:bg-bg-tertiary"
            aria-label="닫기"
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
            <h3 className="mb-2 text-sm font-semibold">새 규칙 추가</h3>
            <div className="grid grid-cols-2 gap-2">
              <label className="flex flex-col gap-1 text-xs">
                <span>이름</span>
                <input
                  type="text"
                  value={draftName}
                  onChange={(e) => setDraftName(e.target.value)}
                  placeholder="예: morning-briefing"
                  className="rounded border border-border-primary bg-bg-secondary px-2 py-1 text-xs"
                  data-testid="automation-draft-name"
                />
              </label>
              <label className="flex flex-col gap-1 text-xs">
                <span>종류</span>
                <select
                  value={draftKind}
                  onChange={(e) => setDraftKind(e.target.value as AutomationKindShape)}
                  className="rounded border border-border-primary bg-bg-secondary px-2 py-1 text-xs"
                  data-testid="automation-draft-kind"
                >
                  <option value="cron">cron (일정)</option>
                  <option value="interval">interval (주기)</option>
                  <option value="webhook">webhook (HTTP trigger)</option>
                </select>
              </label>

              {draftKind === 'cron' && (
                <>
                  <label className="flex flex-col gap-1 text-xs">
                    <span>cron 표현식</span>
                    <input
                      type="text"
                      value={draftCronExpr}
                      onChange={(e) => setDraftCronExpr(e.target.value)}
                      placeholder="예: 0 9 * * 1-5"
                      className="rounded border border-border-primary bg-bg-secondary px-2 py-1 font-mono text-xs"
                      data-testid="automation-draft-cron"
                    />
                  </label>
                  <label className="flex flex-col gap-1 text-xs">
                    <span>timezone (선택)</span>
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
                    다음 실행: {draftNextRun ?? '— (표현식 invalid)'}
                  </p>
                </>
              )}

              {draftKind === 'interval' && (
                <label className="col-span-2 flex flex-col gap-1 text-xs">
                  <span>interval (ms)</span>
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
                  <span>webhook path</span>
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
              추가
            </button>
          </section>

          {/* 등록된 rules 목록 */}
          <section
            className="rounded-md border border-border-primary"
            data-testid="automation-rules-list"
          >
            <h3 className="border-b border-border-primary px-3 py-2 text-sm font-semibold">
              등록된 규칙 ({rules.length})
            </h3>
            {loading ? (
              <p className="p-3 text-xs text-text-secondary">불러오는 중…</p>
            ) : rules.length === 0 ? (
              <p
                className="p-3 text-xs text-text-tertiary"
                data-testid="automation-empty"
              >
                등록된 규칙이 없어요. 위에서 새 규칙을 추가해 보세요.
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
                      </div>
                      <div className="mt-1 text-[11px] text-text-tertiary">
                        {r.kind === 'cron' && (
                          <>
                            <span className="font-mono">{r.cron_expr}</span>
                            {r.cron_tz !== undefined && (
                              <span className="ml-2">@ {r.cron_tz}</span>
                            )}
                            {r.next_run !== null && (
                              <span className="ml-2">다음: {r.next_run}</span>
                            )}
                          </>
                        )}
                        {r.kind === 'interval' && (
                          <span>매 {r.interval_ms}ms</span>
                        )}
                        {r.kind === 'webhook' && (
                          <span className="font-mono">POST {r.webhook_path}</span>
                        )}
                      </div>
                    </div>
                    <div className="flex shrink-0 gap-1">
                      <button
                        type="button"
                        onClick={() => {
                          void handleFire(r.name);
                        }}
                        className="rounded border border-border-primary bg-bg-tertiary px-2 py-0.5 text-[10px] hover:bg-bg-primary"
                        title="지금 실행"
                        aria-label={`${r.name} 지금 실행`}
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
                        title="삭제"
                        aria-label={`${r.name} 삭제`}
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
