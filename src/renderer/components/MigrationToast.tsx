/**
 * MigrationToast — first-run migration notice for v2.3.0 plugin isolation flip (US-602).
 *
 * Shown once per upgrade. Tracked via `settings.pluginIsolationMigrationToastDismissed`
 * (US-600). Dismiss = persist `true`.
 *
 * Spec: .omc/plans/v2.3.0-plugin-ga.md §4 Phase 6.3, gate G4.
 *
 * v2.4.0: rewritten with Tailwind utilities. Previously used `toast toast--migration`
 * BEM classes that had no stylesheet — toast rendered as plain text at the bottom
 * of the window with no visual chrome.
 */

import { AlertTriangle } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { useT } from '../i18n';

export interface MigrationToastProps {
  /** True if v2.3.0 toast has been previously dismissed (read from settings). */
  dismissed: boolean;
  /** Persist dismissed=true to settings. Caller wires to settings IPC. */
  onDismiss: () => Promise<{ ok: true } | { ok: false; reason: string }>;
}

export function MigrationToast(props: MigrationToastProps): React.JSX.Element | null {
  const t = useT();
  const [visible, setVisible] = useState<boolean>(!props.dismissed);
  const [pending, setPending] = useState<boolean>(false);

  useEffect(() => {
    setVisible(!props.dismissed);
  }, [props.dismissed]);

  const handleDismiss = useCallback(async (): Promise<void> => {
    setPending(true);
    try {
      await props.onDismiss();
    } finally {
      setPending(false);
      setVisible(false);
    }
  }, [props]);

  if (!visible) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className="pointer-events-none fixed bottom-48 left-1/2 z-40 w-[520px] max-w-[95vw] -translate-x-1/2 rounded-lg border border-yellow-700/50 bg-bg-secondary shadow-lg"
      data-testid="migration-toast"
    >
      <div className="flex items-start gap-3 px-4 py-3">
        <AlertTriangle aria-hidden="true" className="h-5 w-5 shrink-0 text-yellow-400" />
        <div className="flex-1 min-w-0 space-y-1">
          <p className="text-sm font-medium text-text-primary">{t('migration_toast.title')}</p>
          <p className="text-xs text-text-tertiary">{t('migration_toast.hint')}</p>
        </div>
        <button
          type="button"
          onClick={handleDismiss}
          disabled={pending}
          aria-label={pending ? t('migration_toast.saving') : t('migration_toast.dismiss')}
          className="pointer-events-auto shrink-0 rounded border border-border-primary bg-bg-tertiary px-3 py-1 text-xs hover:bg-border-primary disabled:opacity-50"
          data-testid="migration-toast-dismiss"
        >
          {pending ? t('migration_toast.saving') : t('migration_toast.dismiss')}
        </button>
      </div>
    </div>
  );
}
