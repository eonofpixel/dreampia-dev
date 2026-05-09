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
 */

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
      role="dialog"
      aria-modal="true"
      aria-labelledby="downgrade-modal-title"
      className="modal modal--isolation-downgrade modal--danger"
    >
      <button
        type="button"
        aria-label="Close downgrade modal"
        className="modal__backdrop"
        onClick={props.onClose}
      />
      <div className="modal__panel">
        <h2 id="downgrade-modal-title">Run plugin in main process?</h2>
        <p className="modal__warning">
          <strong>{props.package_id}</strong> will run with full main-process access. Only enable
          this for plugins you trust completely.
        </p>
        <ul className="modal__warning-list">
          <li>The plugin can read and write any file your app can access.</li>
          <li>The plugin can call native modules and Electron APIs directly.</li>
          <li>If the plugin crashes, it can take down the entire app.</li>
          <li>Process isolation no longer protects against malicious plugin code.</li>
        </ul>
        <p>
          To confirm, type the plugin id below:
          <code className="modal__hint">{props.package_id}</code>
        </p>
        <input
          type="text"
          value={typed}
          onChange={(e) => setTyped(e.target.value)}
          placeholder="Type plugin id to confirm downgrade"
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
            {submitting ? 'Saving…' : 'Run in main process'}
          </button>
        </footer>
      </div>
    </div>
  );
}
