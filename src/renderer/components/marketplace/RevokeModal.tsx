/**
 * RevokeModal — confirm capability revoke for an installed MCP plugin (US-301).
 *
 * UX: anti-fat-finger — user types the plugin id to confirm. Mirrors the
 * v1.1.6 trust modal pattern.
 *
 * Spec: .omc/plans/v2.3.0-plugin-ga.md §4 Phase 3.2, gate G6.
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
      className="modal modal--revoke"
    >
      <button
        type="button"
        aria-label="Close revoke modal"
        className="modal__backdrop"
        onClick={props.onClose}
      />
      <div className="modal__panel">
        <h2 id="revoke-modal-title">Revoke MCP plugin?</h2>
        <p>
          Revoking <strong>{props.package_id}</strong> will:
        </p>
        <ul>
          <li>Synchronously invalidate all granted capabilities</li>
          <li>Abort any in-flight RPC calls within 100ms</li>
          <li>Drop all event subscriptions for this plugin</li>
        </ul>
        <p>
          To confirm, type the plugin id below:
          <code className="modal__hint">{props.package_id}</code>
        </p>
        <input
          type="text"
          value={typed}
          onChange={(e) => setTyped(e.target.value)}
          placeholder="Type plugin id to confirm"
          aria-label="Plugin id confirmation"
          autoComplete="off"
          autoCorrect="off"
          spellCheck={false}
          className="modal__input"
        />
        {error !== null && (
          <p role="alert" className="modal__error">
            {error}
          </p>
        )}
        <footer className="modal__actions">
          <button type="button" onClick={props.onClose} disabled={submitting}>
            Cancel
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            disabled={!matches || submitting}
            className="modal__action--danger"
          >
            {submitting ? 'Revoking…' : 'Revoke'}
          </button>
        </footer>
      </div>
    </div>
  );
}
