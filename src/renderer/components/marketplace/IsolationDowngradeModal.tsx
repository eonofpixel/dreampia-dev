/**
 * IsolationDowngradeModal — confirm utility_process → in_process downgrade (US-301).
 *
 * Required by G6 codex tightening: native-module plugins that need main-process
 * API can opt into in_process. This is a security-sensitive action because it
 * grants the plugin direct main-process access. UX:
 *   - Prominent warning text
 *   - Plugin id type-in confirmation (anti-fat-finger)
 *   - On confirm: write `plugins.<id>.isolationDowngradeConsent = ISO 8601`
 *   - Audit log entry on confirm
 *
 * Spec: .omc/plans/v2.3.0-plugin-ga.md §4 Phase 3.2 (US-301), gate G6.
 *
 * v2.4.0: rewritten with Tailwind utilities to match PluginsModal pattern.
 * Previously used `modal modal--isolation-downgrade modal--danger` BEM classes
 * with no stylesheet attached, which rendered as unstyled markup.
 */

import { AlertTriangle } from 'lucide-react';
import { useEffect, useState } from 'react';

export interface IsolationDowngradeModalProps {
  open: boolean;
  package_id: string;
  onClose: () => void;
  /**
   * Caller wires this to a settings update + audit emission:
   *   - settings.plugins[id].isolationMode = 'in_process'
   *   - settings.plugins[id].isolationDowngradeConsent = new Date().toISOString()
   *   - audit log entry with reason 'user_consent_in_process_downgrade'
   * Returns ok:true on success.
   */
  onConfirm: () => Promise<{ ok: true } | { ok: false; reason: string }>;
}

export function IsolationDowngradeModal(
  props: IsolationDowngradeModalProps
): React.JSX.Element | null {
  const [typed, setTyped] = useState<string>('');
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (props.open) {
      setTyped('');
      setError(null);
      setSubmitting(false);
    }
  }, [props.open]);

  if (!props.open) return null;

  const matches = typed === props.package_id;

  const handleConfirm = async (): Promise<void> => {
    if (!matches) return;
    setSubmitting(true);
    setError(null);
    try {
      const result = await props.onConfirm();
      if (result.ok) {
        props.onClose();
      } else {
        setError(result.reason);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70"
      role="dialog"
      aria-modal="true"
      aria-labelledby="downgrade-modal-title"
      data-testid="isolation-downgrade-modal"
    >
      <button
        type="button"
        aria-label="Close downgrade modal"
        className="absolute inset-0 cursor-default"
        onClick={props.onClose}
      />
      <div className="relative w-[520px] max-w-[95vw] flex flex-col rounded-lg border border-red-700/60 bg-bg-primary shadow-2xl">
        <header className="border-b border-red-900/40 bg-red-950/30 px-5 py-3">
          <h2
            id="downgrade-modal-title"
            className="flex items-center gap-1.5 text-base font-semibold text-red-300"
          >
            <AlertTriangle aria-hidden="true" className="h-4 w-4 shrink-0" />
            <span>Run plugin in main process?</span>
          </h2>
        </header>
        <div className="px-5 py-4 space-y-3 text-sm">
          <p className="text-text-primary">
            <code className="font-mono rounded bg-bg-tertiary px-1.5 py-0.5">
              {props.package_id}
            </code>{' '}
            will run with full main-process access. Only enable this for plugins you trust
            completely.
          </p>
          <ul className="list-disc pl-5 space-y-1 text-xs text-text-secondary">
            <li>The plugin can read and write any file your app can access.</li>
            <li>The plugin can call native modules and Electron APIs directly.</li>
            <li>If the plugin crashes, it can take down the entire app.</li>
            <li>Process isolation no longer protects against malicious plugin code.</li>
          </ul>
          <div className="space-y-1.5">
            <label htmlFor="downgrade-confirm-input" className="block text-xs text-text-secondary">
              To confirm, type the plugin id below:{' '}
              <code className="font-mono rounded bg-bg-tertiary px-1 py-0.5 text-[11px]">
                {props.package_id}
              </code>
            </label>
            <input
              id="downgrade-confirm-input"
              type="text"
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              placeholder="Type plugin id to confirm downgrade"
              aria-label="Plugin id confirmation"
              autoComplete="off"
              autoCorrect="off"
              spellCheck={false}
              className="w-full rounded border border-border-primary bg-bg-secondary px-2.5 py-1.5 font-mono text-xs focus:border-red-600 focus:outline-none"
              data-testid="isolation-downgrade-input"
            />
          </div>
          {error !== null && (
            <p
              role="alert"
              className="rounded border border-red-600/40 bg-red-900/20 px-3 py-2 text-xs text-red-300"
              data-testid="isolation-downgrade-error"
            >
              {error}
            </p>
          )}
        </div>
        <footer className="flex items-center justify-end gap-2 border-t border-border-primary bg-bg-secondary px-5 py-3">
          <button
            type="button"
            onClick={props.onClose}
            disabled={submitting}
            className="rounded border border-border-primary bg-bg-tertiary px-3 py-1 text-xs hover:bg-border-primary disabled:opacity-50"
            data-testid="isolation-downgrade-cancel"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            disabled={!matches || submitting}
            className="rounded border border-red-700 bg-red-700 px-3 py-1 text-xs font-semibold text-white hover:bg-red-600 disabled:cursor-not-allowed disabled:opacity-40"
            data-testid="isolation-downgrade-confirm"
          >
            {submitting ? 'Saving…' : 'Run in main process'}
          </button>
        </footer>
      </div>
    </div>
  );
}
