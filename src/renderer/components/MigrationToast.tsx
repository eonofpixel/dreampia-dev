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

const TOAST_TEXT = 'Plugins now run in isolated process. Some plugins may need updates.';

export interface MigrationToastProps {
  /** True if v2.3.0 toast has been previously dismissed (read from settings). */
  dismissed: boolean;
  /** Persist dismissed=true to settings. Caller wires to settings IPC. */
  onDismiss: () => Promise<{ ok: true } | { ok: false; reason: string }>;
}

export function MigrationToast(props: MigrationToastProps): React.JSX.Element | null {
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
      className="pointer-events-none fixed bottom-4 left-1/2 z-40 w-[520px] max-w-[95vw] -translate-x-1/2 rounded-lg border border-yellow-700/50 bg-bg-secondary shadow-lg"
      data-testid="migration-toast"
    >
      <div className="flex items-start gap-3 px-4 py-3">
        <AlertTriangle aria-hidden="true" className="h-5 w-5 shrink-0 text-yellow-400" />
        <div className="flex-1 min-w-0 space-y-1">
          <p className="text-sm font-medium text-text-primary">{TOAST_TEXT}</p>
          <p className="text-xs text-text-tertiary">
            If a plugin no longer works after this update, switch it back to in-process mode in
            settings (you&apos;ll be prompted to confirm).
          </p>
        </div>
        <button
          type="button"
          onClick={handleDismiss}
          disabled={pending}
          className="pointer-events-auto shrink-0 rounded border border-border-primary bg-bg-tertiary px-3 py-1 text-xs hover:bg-border-primary disabled:opacity-50"
          data-testid="migration-toast-dismiss"
        >
          {pending ? 'Saving…' : 'Got it'}
        </button>
      </div>
    </div>
  );
}
