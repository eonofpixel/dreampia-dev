/**
 * RevokeModal — confirm capability revoke for an installed MCP plugin (US-301).
 *
 * UX: anti-fat-finger — user types the plugin id to confirm. Mirrors the
 * v1.1.6 trust modal pattern.
 *
 * Spec: .omc/plans/v2.3.0-plugin-ga.md §4 Phase 3.2, gate G6.
 *
 * v2.4.0: rewritten with Tailwind utilities to match PluginsModal pattern.
 * Previously used `modal modal--revoke` BEM classes with no stylesheet.
 */

import { useEffect, useState } from 'react';

export interface RevokeModalProps {
  open: boolean;
  package_id: string;
  onClose: () => void;
  /**
   * Caller invokes `mcpBridge.requestRevoke(server_id)`. Returns the new
   * grant_epoch on success. Modal closes on success.
   */
  onConfirm: () => Promise<{ ok: true; grant_epoch: number } | { ok: false; reason: string }>;
}

export function RevokeModal(props: RevokeModalProps): React.JSX.Element | null {
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
      role="dialog"
      aria-modal="true"
      aria-labelledby="revoke-modal-title"
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70"
      data-testid="revoke-modal"
    >
      <button
        type="button"
        aria-label="Close revoke modal"
        className="absolute inset-0 cursor-default"
        onClick={props.onClose}
      />
      <div className="relative w-[480px] max-w-[95vw] flex flex-col rounded-lg border border-red-700/60 bg-bg-primary shadow-2xl">
        <header className="border-b border-red-900/40 bg-red-950/30 px-5 py-3">
          <h2 id="revoke-modal-title" className="text-base font-semibold text-red-300">
            Revoke MCP plugin?
          </h2>
        </header>
        <div className="px-5 py-4 space-y-3 text-sm">
          <p className="text-text-primary">
            Revoking{' '}
            <code className="font-mono rounded bg-bg-tertiary px-1.5 py-0.5">
              {props.package_id}
            </code>{' '}
            will:
          </p>
          <ul className="list-disc pl-5 space-y-1 text-xs text-text-secondary">
            <li>Synchronously invalidate all granted capabilities</li>
            <li>Abort any in-flight RPC calls within 100ms</li>
            <li>Drop all event subscriptions for this plugin</li>
          </ul>
          <div className="space-y-1.5">
            <label htmlFor="revoke-confirm-input" className="block text-xs text-text-secondary">
              To confirm, type the plugin id below:{' '}
              <code className="font-mono rounded bg-bg-tertiary px-1 py-0.5 text-[11px]">
                {props.package_id}
              </code>
            </label>
            <input
              id="revoke-confirm-input"
              type="text"
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              placeholder="Type plugin id to confirm"
              aria-label="Plugin id confirmation"
              autoComplete="off"
              autoCorrect="off"
              spellCheck={false}
              className="w-full rounded border border-border-primary bg-bg-secondary px-2.5 py-1.5 font-mono text-xs focus:border-red-600 focus:outline-none"
              data-testid="revoke-modal-input"
            />
          </div>
          {error !== null && (
            <p
              role="alert"
              className="rounded border border-red-600/40 bg-red-900/20 px-3 py-2 text-xs text-red-300"
              data-testid="revoke-modal-error"
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
            data-testid="revoke-modal-cancel"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            disabled={!matches || submitting}
            className="rounded border border-red-700 bg-red-700 px-3 py-1 text-xs font-semibold text-white hover:bg-red-600 disabled:cursor-not-allowed disabled:opacity-40"
            data-testid="revoke-modal-confirm"
          >
            {submitting ? 'Revoking…' : 'Revoke'}
          </button>
        </footer>
      </div>
    </div>
  );
}
