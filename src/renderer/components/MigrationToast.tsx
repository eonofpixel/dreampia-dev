/**
 * MigrationToast — first-run migration notice for v2.3.0 plugin isolation flip (US-602).
 *
 * Shown once per upgrade. Tracked via `settings.pluginIsolationMigrationToastDismissed`
 * (US-600). Dismiss = persist `true`.
 *
 * Spec: .omc/plans/v2.3.0-plugin-ga.md §4 Phase 6.3, gate G4.
 */

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
    <div role="status" aria-live="polite" className="toast toast--migration">
      <div className="toast__body">
        <p className="toast__text">{TOAST_TEXT}</p>
        <p className="toast__hint">
          If a plugin no longer works after this update, switch it back to in-process mode in
          settings (you&apos;ll be prompted to confirm).
        </p>
      </div>
      <button type="button" onClick={handleDismiss} disabled={pending} className="toast__dismiss">
        {pending ? 'Saving…' : 'Got it'}
      </button>
    </div>
  );
}
