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
 */

import { useCallback, useEffect, useState } from 'react';
import type {
  InstalledPluginRecord,
  VerificationStatus,
} from '../../../types/installedPluginRecord';

export interface InstalledPluginListProps {
  /** Optional handler when user clicks revoke for a record. Hosts open RevokeModal. */
  onRequestRevoke: (record: InstalledPluginRecord) => void;
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

  if (loading)
    return <div className="installed-plugin-list loading">Loading installed plugins…</div>;
  if (error !== null)
    return (
      <div className="installed-plugin-list error" role="alert">
        Error: {error}
      </div>
    );

  if (records.length === 0) {
    return (
      <div className="installed-plugin-list empty">
        <p>No MCP plugins installed.</p>
        <button type="button" onClick={handleRefreshRevocations} disabled={refreshing}>
          {refreshing ? 'Checking…' : 'Check for plugin updates'}
        </button>
      </div>
    );
  }

  return (
    <div className="installed-plugin-list">
      <header className="installed-plugin-list__header">
        <h2>Installed MCP Plugins ({records.length})</h2>
        <button type="button" onClick={handleRefreshRevocations} disabled={refreshing}>
          {refreshing ? 'Checking…' : 'Check for plugin updates'}
        </button>
      </header>
      <ul className="installed-plugin-list__items">
        {records.map((rec) => (
          <li key={rec.package_id} className="installed-plugin-list__item">
            <PluginRow record={rec} onRevoke={() => props.onRequestRevoke(rec)} />
          </li>
        ))}
      </ul>
    </div>
  );
}

interface PluginRowProps {
  record: InstalledPluginRecord;
  onRevoke: () => void;
}

function PluginRow(props: PluginRowProps): React.JSX.Element {
  const { record, onRevoke } = props;
  return (
    <article className="plugin-row">
      <header className="plugin-row__header">
        <h3 className="plugin-row__name">{record.package_id}</h3>
        <span className="plugin-row__version">v{record.version}</span>
      </header>
      <div className="plugin-row__badges">
        <VerificationBadge status={record.verification_status} />
        {record.isolation_mode === 'in_process' && (
          <span
            className="badge badge--warning"
            title="Runs in main process — full main-process access"
          >
            runs in main process
          </span>
        )}
        {record.revocation_status === 'revoked' && (
          <span
            className="badge badge--danger"
            title="This plugin has been revoked by the publisher"
          >
            revoked
          </span>
        )}
      </div>
      <dl className="plugin-row__meta">
        <dt>Publisher</dt>
        <dd className="plugin-row__publisher">{record.publisher_id}</dd>
        <dt>Installed</dt>
        <dd>{record.installed_at}</dd>
        <dt>Last verified</dt>
        <dd>{record.last_verified_at ?? '—'}</dd>
        <dt>Last revocation check</dt>
        <dd>{record.last_revocation_check_at ?? '—'}</dd>
      </dl>
      <footer className="plugin-row__actions">
        <button type="button" className="plugin-row__revoke" onClick={onRevoke}>
          Revoke
        </button>
      </footer>
    </article>
  );
}

function VerificationBadge(props: { status: VerificationStatus }): React.JSX.Element {
  const { status } = props;
  const labels: Record<VerificationStatus, { label: string; cls: string; title: string }> = {
    verified: {
      label: 'verified',
      cls: 'badge--success',
      title: 'Sigstore identity policy passed',
    },
    unverified: { label: 'unverified', cls: 'badge--neutral', title: 'No verification performed' },
    identity_mismatch: {
      label: 'identity mismatch',
      cls: 'badge--danger',
      title: 'Cert claims do not match manifest signing.identity',
    },
    signature_invalid: {
      label: 'signature invalid',
      cls: 'badge--danger',
      title: 'Sigstore signature verify failed',
    },
    revoked: {
      label: 'revoked',
      cls: 'badge--danger',
      title: 'Publisher has revoked this plugin',
    },
  };
  const m = labels[status];
  return (
    <span className={`badge ${m.cls}`} title={m.title}>
      {m.label}
    </span>
  );
}
