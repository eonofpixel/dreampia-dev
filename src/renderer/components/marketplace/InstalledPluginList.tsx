/**
 * InstalledPluginList — marketplace browse UI for v2.3.0 (US-300).
 *
 * Lists every installed MCP server with: name, version, capabilities chip,
 * source URL, verification badge, runs-in-main-process badge for in_process
 * plugins (G6 codex tightening), revoke button.
 *
 * Reads via `window.dreampia.mcp.listInstalled` (preload US-104).
 * Refresh action triggers `requestRefreshRevocations` (signed feed poll).
 *
 * Spec: .omc/plans/v2.3.0-plugin-ga.md §4 Phase 3.1, gate G6.
 *
 * v2.4.0: rewritten with Tailwind utilities to match the rest of the app's
 * design system (PluginsModal Local plugins tab pattern). Previously used
 * BEM-style class names (`installed-plugin-list`, `plugin-row`) that had no
 * stylesheet attached, rendering as raw text dump.
 */

import { useCallback, useEffect, useState } from 'react';
import type {
  InstalledPluginRecord,
  VerificationStatus,
} from '../../../types/installedPluginRecord';

export interface InstalledPluginListProps {
  /** Optional handler when user clicks revoke for a record. Hosts open RevokeModal. */
  onRequestRevoke: (record: InstalledPluginRecord) => void;
  /**
   * v2.4.0 (Task 6) — handler when user clicks "Run in main process" for a record.
   * Hosts open IsolationDowngradeModal (type-in confirm). Only shown when the
   * record's current isolation_mode !== 'in_process'.
   */
  onRequestDowngrade?: (record: InstalledPluginRecord) => void;
}

export function InstalledPluginList(props: InstalledPluginListProps): React.JSX.Element {
  const [records, setRecords] = useState<InstalledPluginRecord[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState<boolean>(false);

  const fetchList = useCallback(async (): Promise<void> => {
    const api = typeof window !== 'undefined' ? window.dreampia?.mcp : undefined;
    if (api === undefined || api.listInstalled === undefined) {
      setError('IPC bridge unavailable');
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const result = await api.listInstalled();
      if (result.ok) {
        setRecords(result.value);
      } else {
        setError(result.error);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchList();
  }, [fetchList]);

  const handleRefreshRevocations = useCallback(async (): Promise<void> => {
    const api = typeof window !== 'undefined' ? window.dreampia?.mcp : undefined;
    if (api === undefined || api.requestRefreshRevocations === undefined) return;
    setRefreshing(true);
    try {
      await api.requestRefreshRevocations();
      await fetchList();
    } finally {
      setRefreshing(false);
    }
  }, [fetchList]);

  if (loading) {
    return (
      <p className="text-xs text-text-tertiary" data-testid="installed-plugin-list-loading">
        Loading installed plugins…
      </p>
    );
  }
  if (error !== null) {
    return (
      <p
        className="rounded border border-red-600/40 bg-red-900/15 px-3 py-2 text-xs text-red-300"
        role="alert"
        data-testid="installed-plugin-list-error"
      >
        {error}
      </p>
    );
  }

  if (records.length === 0) {
    return (
      <div className="space-y-3" data-testid="installed-plugin-list-empty">
        <p className="rounded border border-border-primary bg-bg-secondary px-3 py-2 text-xs text-text-tertiary">
          No MCP plugins installed yet. Install a plugin from the registry, or refresh the
          revocation feed below.
        </p>
        <button
          type="button"
          onClick={handleRefreshRevocations}
          disabled={refreshing}
          className="rounded border border-border-primary bg-bg-secondary px-3 py-1 text-xs hover:bg-bg-tertiary disabled:opacity-50"
          data-testid="installed-plugin-list-refresh"
        >
          {refreshing ? 'Checking…' : 'Check for plugin updates'}
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-3" data-testid="installed-plugin-list">
      <header className="flex items-baseline justify-between gap-2">
        <h3 className="text-xs font-semibold text-text-secondary">
          Installed MCP Plugins ({records.length})
        </h3>
        <button
          type="button"
          onClick={handleRefreshRevocations}
          disabled={refreshing}
          className="rounded border border-border-primary bg-bg-secondary px-2 py-0.5 text-[11px] hover:bg-bg-tertiary disabled:opacity-50"
          data-testid="installed-plugin-list-refresh"
        >
          {refreshing ? 'Checking…' : 'Check for plugin updates'}
        </button>
      </header>
      <ul className="space-y-2">
        {records.map((rec) => (
          <li
            key={rec.package_id}
            className="rounded border border-border-primary bg-bg-secondary px-3 py-2"
            data-testid="installed-plugin-row"
            data-package-id={rec.package_id}
          >
            <PluginRow
              record={rec}
              onRevoke={() => props.onRequestRevoke(rec)}
              onRequestDowngrade={
                props.onRequestDowngrade !== undefined && rec.isolation_mode !== 'in_process'
                  ? () => props.onRequestDowngrade?.(rec)
                  : undefined
              }
            />
          </li>
        ))}
      </ul>
    </div>
  );
}

interface PluginRowProps {
  record: InstalledPluginRecord;
  onRevoke: () => void;
  /** When defined, render a "Run in main process" button next to revoke. */
  onRequestDowngrade?: () => void;
}

function PluginRow(props: PluginRowProps): React.JSX.Element {
  const { record, onRevoke, onRequestDowngrade } = props;
  return (
    <article>
      <div className="flex items-baseline justify-between gap-2">
        <div className="flex items-baseline gap-2 min-w-0">
          <span className="font-mono text-sm font-semibold truncate">{record.package_id}</span>
          <span className="font-mono text-[11px] text-text-tertiary shrink-0">
            v{record.version}
          </span>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          <VerificationBadge status={record.verification_status} />
          {record.isolation_mode === 'in_process' && (
            <span
              className="rounded bg-yellow-900/30 px-1.5 py-0.5 text-[11px] text-yellow-400"
              title="Runs in main process — full main-process access"
              data-testid="badge-isolation-in-process"
            >
              in main process
            </span>
          )}
          {record.revocation_status === 'revoked' && (
            <span
              className="rounded bg-red-900/30 px-1.5 py-0.5 text-[11px] text-red-400"
              title="This plugin has been revoked by the publisher"
              data-testid="badge-revoked"
            >
              revoked
            </span>
          )}
          {record.revocation_status === 'unknown' && (
            <span
              className="rounded bg-bg-tertiary px-1.5 py-0.5 text-[11px] text-text-tertiary"
              title="Revocation feed not yet checked"
              data-testid="badge-revocation-unknown"
            >
              revocation: unknown
            </span>
          )}
        </div>
      </div>
      <dl className="mt-2 grid grid-cols-[max-content_1fr] gap-x-3 gap-y-0.5 text-[11px] text-text-tertiary">
        <dt className="font-medium">Publisher</dt>
        <dd className="font-mono break-all">{record.publisher_id}</dd>
        <dt className="font-medium">Installed</dt>
        <dd className="font-mono">{record.installed_at}</dd>
        <dt className="font-medium">Last verified</dt>
        <dd className="font-mono">{record.last_verified_at ?? '—'}</dd>
        <dt className="font-medium">Last revocation check</dt>
        <dd className="font-mono">{record.last_revocation_check_at ?? '—'}</dd>
      </dl>
      <footer className="mt-2 flex items-center justify-end gap-2">
        {onRequestDowngrade !== undefined && (
          <button
            type="button"
            className="rounded border border-yellow-700/50 bg-yellow-900/20 px-2 py-0.5 text-[11px] text-yellow-300 hover:bg-yellow-900/40"
            onClick={onRequestDowngrade}
            title="Run this plugin in the main process (full main-process access — security-sensitive)"
            data-testid="plugin-row-downgrade"
            data-package-id={record.package_id}
          >
            Run in main process
          </button>
        )}
        <button
          type="button"
          className="rounded border border-red-700/50 bg-red-900/20 px-2 py-0.5 text-[11px] text-red-300 hover:bg-red-900/40"
          onClick={onRevoke}
          data-testid="plugin-row-revoke"
          data-package-id={record.package_id}
        >
          Revoke
        </button>
      </footer>
    </article>
  );
}

function VerificationBadge(props: { status: VerificationStatus }): React.JSX.Element {
  const { status } = props;
  const styles: Record<VerificationStatus, { label: string; cls: string; title: string }> = {
    verified: {
      label: 'verified',
      cls: 'bg-emerald-900/30 text-emerald-400',
      title: 'Sigstore identity policy passed',
    },
    unverified: {
      label: 'unverified',
      cls: 'bg-bg-tertiary text-text-tertiary',
      title: 'No verification performed',
    },
    identity_mismatch: {
      label: 'identity mismatch',
      cls: 'bg-red-900/30 text-red-400',
      title: 'Cert claims do not match manifest signing.identity',
    },
    signature_invalid: {
      label: 'signature invalid',
      cls: 'bg-red-900/30 text-red-400',
      title: 'Sigstore signature verify failed',
    },
    revoked: {
      label: 'verify: revoked',
      cls: 'bg-red-900/30 text-red-400',
      title: 'Publisher has revoked this plugin',
    },
  };
  const m = styles[status];
  return (
    <span
      className={`rounded px-1.5 py-0.5 text-[11px] ${m.cls}`}
      title={m.title}
      data-testid={`badge-verification-${status}`}
    >
      {m.label}
    </span>
  );
}
