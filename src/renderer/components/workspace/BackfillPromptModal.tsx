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
import { Trash2 } from 'lucide-react';
import { useT } from '../../i18n';
import { Button } from '../ui/Button';
import { ModalShell } from '../ui/ModalShell';

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

interface ConflictRow {
  legacy_id: string;
  target_id: string;
  root: string;
  session_count: number;
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
  // v1.4.11 — 충돌 row 상세.
  const [conflicts, setConflicts] = useState<ConflictRow[] | null>(null);
  const [conflictsLoading, setConflictsLoading] = useState(false);

  const reloadConflicts = useCallback(async (): Promise<void> => {
    const api = window.dreampia?.app;
    if (api === undefined || api.listBackfillConflicts === undefined) return;
    setConflictsLoading(true);
    try {
      const r = await api.listBackfillConflicts();
      if (r.ok) setConflicts(r.value);
    } finally {
      setConflictsLoading(false);
    }
  }, []);

  const handleDeleteLegacy = useCallback(
    async (row: ConflictRow): Promise<void> => {
      const api = window.dreampia?.app;
      if (api === undefined || api.deleteLegacyWorkspace === undefined) return;
      const confirmed = window.confirm(
        t('workspace_backfill.delete_confirm', {
          root: row.root,
          n: row.session_count,
        })
      );
      if (!confirmed) return;
      const r = await api.deleteLegacyWorkspace(row.legacy_id);
      if (!r.ok) {
        setError(typeof r.error === 'string' ? r.error : 'delete failed');
        return;
      }
      await reloadConflicts();
    },
    [t, reloadConflicts]
  );

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
        // v1.4.11 — backfill 후 충돌이 남아 있으면 row detail 자동 fetch.
        if (r.value.conflicts > 0) {
          await reloadConflicts();
        }
      } else {
        setError(typeof r.error === 'string' ? r.error : 'failed');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }, [reloadConflicts]);

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

  // v2.10.0 (.omc/DESIGN.md, modal migration A) — chrome 을 ModalShell + Button
  // 으로. raw yellow-600/40 + red-600/40 → semantic.{warning,danger} 토큰.
  return (
    <ModalShell
      open={open}
      size="md"
      title={result === null ? t('workspace_backfill.title') : t('workspace_backfill.done_title')}
      titleId="workspace-backfill-modal-title"
      onClose={onDone}
      data-testid="workspace-backfill-modal"
      footer={
        result === null ? (
          <>
            <Button
              variant="secondary"
              onClick={() => {
                void handleDismiss();
              }}
              disabled={busy}
              data-testid="workspace-backfill-dismiss"
            >
              {t('workspace_backfill.dismiss')}
            </Button>
            <Button
              variant="secondary"
              onClick={onDone}
              disabled={busy}
              data-testid="workspace-backfill-later"
            >
              {t('workspace_backfill.later')}
            </Button>
            <Button
              variant="primary"
              onClick={() => {
                void handleRun();
              }}
              disabled={busy}
              data-testid="workspace-backfill-run"
            >
              {busy ? t('workspace_backfill.running') : t('workspace_backfill.run')}
            </Button>
          </>
        ) : (
          <Button variant="primary" onClick={onDone} data-testid="workspace-backfill-done">
            {t('workspace_backfill.close')}
          </Button>
        )
      }
    >
      <div className="space-y-sm">
        {result === null ? (
          <>
            <p data-testid="workspace-backfill-body" className="text-body-sm">
              {t('workspace_backfill.body', { count: legacyCount })}
            </p>
            {targetConflicts > 0 && (
              <p
                className="rounded-md border border-semantic-warning/40 bg-semantic-warning/15 p-xs text-caption text-semantic-warning"
                data-testid="workspace-backfill-conflict-warning"
              >
                {t('workspace_backfill.warning_conflicts', { n: targetConflicts })}
              </p>
            )}
            {error !== null && (
              <p
                className="rounded-md border border-semantic-danger/40 bg-semantic-danger/15 p-xs text-caption text-semantic-danger"
                data-testid="workspace-backfill-error"
              >
                {t('workspace_backfill.error', { reason: error })}
              </p>
            )}
          </>
        ) : (
          <>
            <p data-testid="workspace-backfill-summary" className="text-body-sm">
              {t('workspace_backfill.done_summary', {
                updated: result.updated,
                skipped: result.skipped,
                conflicts: result.conflicts,
              })}
            </p>
            {/* v1.4.11 — 남아있는 충돌 row 들 + [legacy 삭제] action */}
            {result.conflicts > 0 && (
              <div
                className="rounded-md border border-semantic-warning/40 bg-semantic-warning/10 p-xs text-caption"
                data-testid="workspace-backfill-conflicts-section"
              >
                <p className="mb-xs text-semantic-warning">
                  {t('workspace_backfill.conflicts_resolution_intro')}
                </p>
                {conflictsLoading ? (
                  <p className="text-text-secondary">{t('workspace_backfill.conflicts_loading')}</p>
                ) : conflicts === null || conflicts.length === 0 ? (
                  <p
                    className="text-text-tertiary"
                    data-testid="workspace-backfill-conflicts-empty"
                  >
                    {t('workspace_backfill.conflicts_resolved')}
                  </p>
                ) : (
                  <ul
                    className="divide-y divide-hairline"
                    data-testid="workspace-backfill-conflicts-list"
                  >
                    {conflicts.map((row) => (
                      <li
                        key={row.legacy_id}
                        className="flex items-start justify-between gap-xs py-xxs"
                        data-testid={`workspace-backfill-conflict-${row.legacy_id}`}
                      >
                        <div className="min-w-0 flex-1">
                          <div className="truncate font-mono text-caption">{row.root}</div>
                          <div className="text-caption text-text-tertiary">
                            {t('workspace_backfill.conflict_session_count', {
                              n: row.session_count,
                            })}
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => {
                            void handleDeleteLegacy(row);
                          }}
                          className="inline-flex shrink-0 items-center gap-xxs rounded-md border border-semantic-danger/40 bg-semantic-danger/15 px-xs py-[2px] text-caption text-semantic-danger hover:bg-semantic-danger/25"
                          title={t('workspace_backfill.delete_tooltip')}
                          data-testid={`workspace-backfill-delete-${row.legacy_id}`}
                        >
                          <Trash2 className="h-3 w-3" />
                          {t('workspace_backfill.delete_legacy')}
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </ModalShell>
  );
}
