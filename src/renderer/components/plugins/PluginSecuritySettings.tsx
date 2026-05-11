/**
 * PluginSecuritySettings — v2.4.0 plugin/MCP security knob panel.
 *
 * Exposes the three security settings introduced in v2.3.0/v2.4.0:
 *   - mcpVerificationMode (strict / warn / off) — install-time signature policy
 *   - pluginIsolationMode (utility_process / in_process / auto) — sandbox default
 *   - mcpRevocationFeedPublisher (issuer + subject_pattern) — feed identity policy
 *
 * Embedded in PluginsModal as a collapsible "Security" section (rather than a
 * full Settings tab) so the security context stays adjacent to the plugin
 * surface that consumes it.
 *
 * Spec: settings.ts AppSettings v2.4.0 fields.
 */

import { AlertTriangle, CheckCircle2 } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';

type VerificationMode = 'strict' | 'warn' | 'off';
type IsolationMode = 'utility_process' | 'in_process' | 'auto';
interface FeedPublisher {
  issuer: string;
  subject_pattern: string;
}

interface SecurityState {
  mcpVerificationMode: VerificationMode;
  pluginIsolationMode: IsolationMode;
  mcpRevocationFeedPublisher: FeedPublisher | null;
}

export function PluginSecuritySettings(): React.JSX.Element {
  const [state, setState] = useState<SecurityState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState<boolean>(false);
  const [issuerInput, setIssuerInput] = useState<string>('');
  const [subjectInput, setSubjectInput] = useState<string>('');

  const fetchState = useCallback(async (): Promise<void> => {
    const api = typeof window !== 'undefined' ? window.dreampia?.plugin : undefined;
    if (api?.getSecurity === undefined) {
      setError('IPC bridge unavailable');
      return;
    }
    try {
      const result = await api.getSecurity();
      if (result.ok) {
        setState(result.value);
        setIssuerInput(result.value.mcpRevocationFeedPublisher?.issuer ?? '');
        setSubjectInput(result.value.mcpRevocationFeedPublisher?.subject_pattern ?? '');
      } else {
        setError(result.error);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }, []);

  useEffect(() => {
    void fetchState();
  }, [fetchState]);

  const updateVerificationMode = async (mode: VerificationMode): Promise<void> => {
    const api = window.dreampia?.plugin;
    if (api?.setMcpVerificationMode === undefined) return;
    setSaving(true);
    setError(null);
    try {
      const result = await api.setMcpVerificationMode(mode);
      if (!result.ok) setError(result.error);
      else await fetchState();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  };

  const updateIsolationMode = async (mode: IsolationMode): Promise<void> => {
    const api = window.dreampia?.plugin;
    if (api?.setPluginIsolationMode === undefined) return;
    setSaving(true);
    setError(null);
    try {
      const result = await api.setPluginIsolationMode(mode);
      if (!result.ok) setError(result.error);
      else await fetchState();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  };

  const updatePublisher = async (next: FeedPublisher | null): Promise<void> => {
    const api = window.dreampia?.plugin;
    if (api?.setMcpRevocationFeedPublisher === undefined) return;
    setSaving(true);
    setError(null);
    try {
      const result = await api.setMcpRevocationFeedPublisher(next);
      if (!result.ok) setError(result.error);
      else await fetchState();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  };

  if (state === null) {
    return (
      <p className="text-xs text-text-tertiary" data-testid="plugin-security-loading">
        Loading security settings…
      </p>
    );
  }

  return (
    <section
      className="space-y-3 rounded border border-border-primary bg-bg-secondary px-4 py-3"
      data-testid="plugin-security-settings"
    >
      <header className="flex items-center justify-between">
        <h3 className="text-xs font-semibold text-text-secondary">Security</h3>
        {error !== null && (
          <span
            role="alert"
            className="text-[11px] text-red-400"
            data-testid="plugin-security-error"
          >
            {error}
          </span>
        )}
      </header>

      {/* MCP verification mode */}
      <div className="space-y-1">
        <span className="block text-[11px] text-text-secondary" id="verification-mode-label">
          Install-time signature policy
        </span>
        <div className="flex gap-1.5" role="radiogroup" aria-labelledby="verification-mode-label">
          {(['strict', 'warn', 'off'] as const).map((m) => (
            <button
              key={m}
              type="button"
              role="radio"
              aria-checked={state.mcpVerificationMode === m}
              onClick={() => void updateVerificationMode(m)}
              disabled={saving}
              data-testid={`verification-mode-${m}`}
              className={
                state.mcpVerificationMode === m
                  ? 'rounded border border-blue-500/60 bg-blue-900/30 px-2.5 py-1 text-[11px] text-blue-300'
                  : 'rounded border border-border-primary bg-bg-tertiary px-2.5 py-1 text-[11px] text-text-tertiary hover:bg-border-primary'
              }
            >
              {m}
            </button>
          ))}
        </div>
        <p className="text-[10px] text-text-tertiary">
          strict = reject unsigned/mismatch; warn = allow with red badge; off = skip verify (debug
          builds only)
        </p>
      </div>

      {/* Plugin isolation mode */}
      <div className="space-y-1">
        <span className="block text-[11px] text-text-secondary" id="isolation-mode-label">
          Default plugin isolation
        </span>
        <div className="flex gap-1.5" role="radiogroup" aria-labelledby="isolation-mode-label">
          {(['utility_process', 'auto', 'in_process'] as const).map((m) => (
            <button
              key={m}
              type="button"
              role="radio"
              aria-checked={state.pluginIsolationMode === m}
              onClick={() => void updateIsolationMode(m)}
              disabled={saving}
              data-testid={`isolation-mode-${m}`}
              className={
                state.pluginIsolationMode === m
                  ? 'rounded border border-blue-500/60 bg-blue-900/30 px-2.5 py-1 text-[11px] text-blue-300'
                  : 'rounded border border-border-primary bg-bg-tertiary px-2.5 py-1 text-[11px] text-text-tertiary hover:bg-border-primary'
              }
            >
              {m}
            </button>
          ))}
        </div>
        <p className="text-[10px] text-text-tertiary">
          utility_process = sandboxed (recommended); auto = sandboxed with consent fallback;
          in_process = full main-process access (legacy/native modules)
        </p>
      </div>

      {/* Feed publisher identity */}
      <div className="space-y-1">
        <span className="block text-[11px] text-text-secondary">
          Revocation feed publisher identity
        </span>
        <div className="flex flex-col gap-1.5">
          <input
            type="text"
            value={issuerInput}
            onChange={(e) => setIssuerInput(e.target.value)}
            placeholder="https://token.actions.githubusercontent.com"
            aria-label="Feed publisher issuer URL"
            disabled={saving}
            className="rounded border border-border-primary bg-bg-tertiary px-2 py-1 font-mono text-[11px]"
            data-testid="feed-publisher-issuer"
          />
          <input
            type="text"
            value={subjectInput}
            onChange={(e) => setSubjectInput(e.target.value)}
            placeholder="repo:owner/feed-repo:ref:refs/heads/main"
            aria-label="Feed publisher subject pattern"
            disabled={saving}
            className="rounded border border-border-primary bg-bg-tertiary px-2 py-1 font-mono text-[11px]"
            data-testid="feed-publisher-subject"
          />
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() =>
                void updatePublisher({
                  issuer: issuerInput.trim(),
                  subject_pattern: subjectInput.trim(),
                })
              }
              disabled={
                saving || issuerInput.trim().length === 0 || subjectInput.trim().length === 0
              }
              className="rounded border border-border-primary bg-bg-tertiary px-2 py-0.5 text-[11px] hover:bg-border-primary disabled:opacity-50"
              data-testid="feed-publisher-save"
            >
              Save
            </button>
            {state.mcpRevocationFeedPublisher !== null && (
              <button
                type="button"
                onClick={() => void updatePublisher(null)}
                disabled={saving}
                className="rounded border border-yellow-700/40 bg-yellow-900/20 px-2 py-0.5 text-[11px] text-yellow-300 hover:bg-yellow-900/40 disabled:opacity-50"
                data-testid="feed-publisher-clear"
              >
                Clear (use permissive default)
              </button>
            )}
            <span
              className={
                state.mcpRevocationFeedPublisher === null
                  ? 'inline-flex items-center gap-1 text-[10px] text-yellow-400/80'
                  : 'inline-flex items-center gap-1 text-[10px] text-emerald-400/80'
              }
              data-testid="feed-publisher-status"
            >
              {state.mcpRevocationFeedPublisher === null ? (
                <>
                  <AlertTriangle aria-hidden="true" className="h-3 w-3" />
                  <span>permissive default (any verified publisher)</span>
                </>
              ) : (
                <>
                  <CheckCircle2 aria-hidden="true" className="h-3 w-3" />
                  <span>enforced</span>
                </>
              )}
            </span>
          </div>
        </div>
        <p className="text-[10px] text-text-tertiary">
          npm-style glob: <code>*</code> = single segment, <code>**</code> = multi-segment. Empty =
          permissive (any verified publisher accepted).
        </p>
      </div>
    </section>
  );
}
