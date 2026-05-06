/**
 * v1.4.8 — Workspace ID backfill prompt modal.
 *
 * 부팅 시 main 의 `app:check-workspace-backfill` 이 legacy FNV row 를
 * 발견하고 settings.workspace_backfill_done !== true 면 본 모달이 mount.
 *
 * 동작:
 *  - [지금 업그레이드] → `app:run-workspace-backfill` 호출 → 결과 표시 → 닫기.
 *  - [나중에]         → 모달만 닫음. 다음 부팅 시 다시 표시 (flag 미설정).
 *  - [다시 묻지 않기] → `app:dismiss-workspace-backfill` → flag set → 닫기.
 *
 * 데이터:
 *  - count = main 이 반환한 legacy_fnv.
 *  - target_conflicts > 0 시 경고 부분 추가 표시.
 */

import { useCallback, useState } from 'react';
import { X } from 'lucide-react';
import { useT } from '../../i18n';

export interface BackfillPromptModalProps {
  open: boolean;
  legacyCount: number;
  targetConflicts: number;
  onDone: () => void;
}

interface RunResult {
  scanned: number;
  updated: number;
  skipped: number;
  cascade_sessions: number;
  conflicts: number;
}

export function BackfillPromptModal({
  open,
  legacyCount,
  targetConflicts,
  onDone,
}: BackfillPromptModalProps): React.JSX.Element | null {
  const t = useT();
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<RunResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleRun = useCallback(async (): Promise<void> => {
    setBusy(true);
    setError(null);
    try {
      const api = window.dreampia?.app;
      if (api === undefined || api.runWorkspaceBackfill === undefined) {
        setError('IPC unavailable');
        return;
      }
      const r = await api.runWorkspaceBackfill();
      if (r.ok) {
        setResult(r.value);
      } else {
        setError(typeof r.error === 'string' ? r.error : 'failed');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }, []);

  const handleDismiss = useCallback(async (): Promise<void> => {
    try {
      const api = window.dreampia?.app;
      if (api?.dismissWorkspaceBackfill !== undefined) {
        await api.dismissWorkspaceBackfill();
      }
    } finally {
      onDone();
    }
  }, [onDone]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
      role="dialog"
      aria-modal="true"
      aria-label={t('workspace_backfill.title')}
      data-testid="workspace-backfill-modal"
    >
      <div className="flex w-[520px] max-w-[95vw] flex-col rounded-lg border border-border-primary bg-bg-primary shadow-xl">
        <div className="flex items-center justify-between border-b border-border-primary p-4">
          <h2 className="text-lg font-semibold">
            {result === null
              ? t('workspace_backfill.title')
              : t('workspace_backfill.done_title')}
          </h2>
          <button
            type="button"
            onClick={onDone}
            className="rounded-md p-2 hover:bg-bg-tertiary"
            aria-label={t('workspace_backfill.close')}
            data-testid="workspace-backfill-close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="space-y-3 p-4 text-sm">
          {result === null ? (
            <>
              <p data-testid="workspace-backfill-body">
                {t('workspace_backfill.body', { count: legacyCount })}
              </p>
              {targetConflicts > 0 && (
                <p
                  className="rounded border border-yellow-600/40 bg-yellow-900/20 p-2 text-[12px] text-yellow-300"
                  data-testid="workspace-backfill-conflict-warning"
                >
                  {t('workspace_backfill.warning_conflicts', { n: targetConflicts })}
                </p>
              )}
              {error !== null && (
                <p
                  className="rounded border border-red-600/40 bg-red-900/20 p-2 text-[12px] text-red-300"
                  data-testid="workspace-backfill-error"
                >
                  {t('workspace_backfill.error', { reason: error })}
                </p>
              )}
            </>
          ) : (
            <p data-testid="workspace-backfill-summary">
              {t('workspace_backfill.done_summary', {
                updated: result.updated,
                skipped: result.skipped,
                conflicts: result.conflicts,
              })}
            </p>
          )}
        </div>

        <div className="flex justify-end gap-2 border-t border-border-primary p-3">
          {result === null ? (
            <>
              <button
                type="button"
                onClick={() => {
                  void handleDismiss();
                }}
                disabled={busy}
                className="rounded-md border border-border-primary bg-bg-secondary px-3 py-1 text-xs hover:bg-bg-tertiary disabled:opacity-50"
                data-testid="workspace-backfill-dismiss"
              >
                {t('workspace_backfill.dismiss')}
              </button>
              <button
                type="button"
                onClick={onDone}
                disabled={busy}
                className="rounded-md border border-border-primary bg-bg-secondary px-3 py-1 text-xs hover:bg-bg-tertiary disabled:opacity-50"
                data-testid="workspace-backfill-later"
              >
                {t('workspace_backfill.later')}
              </button>
              <button
                type="button"
                onClick={() => {
                  void handleRun();
                }}
                disabled={busy}
                className="rounded-md bg-accent px-3 py-1 text-xs font-medium text-white hover:bg-accent-hover disabled:opacity-50"
                data-testid="workspace-backfill-run"
              >
                {busy
                  ? t('workspace_backfill.running')
                  : t('workspace_backfill.run')}
              </button>
            </>
          ) : (
            <button
              type="button"
              onClick={onDone}
              className="rounded-md bg-accent px-3 py-1 text-xs font-medium text-white hover:bg-accent-hover"
              data-testid="workspace-backfill-done"
            >
              {t('workspace_backfill.close')}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
