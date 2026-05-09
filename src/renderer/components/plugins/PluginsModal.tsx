/**
 * PluginsModal — Plugin Loader 의 사용자 인터페이스 (v1.1.15).
 *
 * Spec: docs/v1.x-roadmap.md (P1 v1.1.x Plugin Loader).
 *
 * 본 commit 의 minimum:
 *   - main 의 PluginManager 결과 (loaded + issues + rootDir) 를 fetch + 표시.
 *   - 사용자에게 plugin root path 안내 (수동 설치 가이드).
 *   - rescan 버튼.
 *
 * 후속 (v1.1.16+):
 *   - Hook runtime status (active / inactive).
 *   - Capability grant UI (plugin 의 manifest.capabilities 를 사용자가 승인).
 *   - Per-plugin enable/disable toggle.
 */

import { useEffect, useState, useCallback } from 'react';
import { useT } from '../../i18n';
import { InstalledPluginList } from '../marketplace/InstalledPluginList';
import { RevokeModal } from '../marketplace/RevokeModal';
import type { InstalledPluginRecord } from '../../../types/installedPluginRecord';

type ModalTab = 'local' | 'marketplace';

interface PluginManifestShape {
  name: string;
  version: string;
  description?: string;
  hooks?: { pre_turn?: string; post_turn?: string };
  capabilities?: string[];
}

interface PluginListResult {
  loaded: Array<{ dir: string; manifest: PluginManifestShape; trusted: boolean }>;
  issues: Array<{ path: string; reason: string }>;
  rootDir: string;
}

export interface PluginsModalProps {
  open: boolean;
  onClose: () => void;
}

export function PluginsModal({ open, onClose }: PluginsModalProps): React.JSX.Element | null {
  const t = useT();
  const [data, setData] = useState<PluginListResult | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  // v2.4.0 — tab between local plugins (existing) and MCP marketplace (new).
  const [activeTab, setActiveTab] = useState<ModalTab>('local');
  // v2.4.0 — revoke modal target. null = closed.
  const [revokeTarget, setRevokeTarget] = useState<InstalledPluginRecord | null>(null);
  // v2.4.0 — counter to force InstalledPluginList refetch after revoke.
  const [marketplaceVersion, setMarketplaceVersion] = useState<number>(0);

  const fetchList = useCallback(
    async (rescan: boolean = false): Promise<void> => {
      const api = typeof window !== 'undefined' ? window.dreampia?.plugin : undefined;
      if (api === undefined) {
        setError(t('plugins.error.ipc_unavailable'));
        return;
      }
      setLoading(true);
      setError(null);
      try {
        const result = rescan ? await api.rescan() : await api.list();
        if (result.ok) {
          setData(result.value);
        } else {
          setError(result.error);
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      } finally {
        setLoading(false);
      }
    },
    [t]
  );

  useEffect(() => {
    if (open) void fetchList(false);
  }, [open, fetchList]);

  // v1.1.6 (D1) — trust-on-install toggle. 사용자가 plugin 의 manifest +
  // capabilities 를 검토 후 trust 부여. untrusted plugin 의 hook 은 host 가
  // 실행 path 에서 제외.
  const handleToggleTrust = useCallback(
    async (name: string, nextTrusted: boolean): Promise<void> => {
      const api = typeof window !== 'undefined' ? window.dreampia?.plugin : undefined;
      if (api?.trust === undefined) {
        setError(t('plugins.error.ipc_unavailable'));
        return;
      }
      try {
        const result = await api.trust(name, nextTrusted);
        if (!result.ok) {
          setError(result.error);
          return;
        }
        await fetchList(false);
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      }
    },
    [t, fetchList]
  );

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
      role="dialog"
      aria-modal="true"
      aria-label={t('plugins.modal.aria_label')}
      data-testid="plugins-modal"
    >
      <div className="w-[640px] max-w-[95vw] max-h-[80vh] flex flex-col rounded-lg border border-border-primary bg-bg-primary shadow-xl">
        <header className="flex items-center justify-between border-b border-border-primary px-5 py-3">
          <h2 className="text-base font-semibold">{t('plugins.modal.title')}</h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded px-2 py-1 text-sm hover:bg-bg-tertiary"
            aria-label={t('common.close')}
            data-testid="plugins-modal-close"
          >
            ✕
          </button>
        </header>
        {/* v2.4.0 — tab strip: Local plugins ↔ MCP Marketplace */}
        <div
          role="tablist"
          aria-label="Plugin sections"
          className="flex border-b border-border-primary px-5"
          data-testid="plugins-modal-tabs"
        >
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'local'}
            onClick={() => setActiveTab('local')}
            className={
              activeTab === 'local'
                ? 'border-b-2 border-blue-400 px-3 py-2 text-xs font-semibold text-blue-300'
                : 'border-b-2 border-transparent px-3 py-2 text-xs text-text-tertiary hover:text-text-secondary'
            }
            data-testid="plugins-tab-local"
          >
            Local plugins
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'marketplace'}
            onClick={() => setActiveTab('marketplace')}
            className={
              activeTab === 'marketplace'
                ? 'border-b-2 border-blue-400 px-3 py-2 text-xs font-semibold text-blue-300'
                : 'border-b-2 border-transparent px-3 py-2 text-xs text-text-tertiary hover:text-text-secondary'
            }
            data-testid="plugins-tab-marketplace"
          >
            MCP Marketplace
          </button>
        </div>
        {activeTab === 'marketplace' && (
          <div
            className="flex-1 overflow-y-auto px-5 py-4 text-sm"
            data-testid="plugins-modal-marketplace-pane"
          >
            <InstalledPluginList
              key={marketplaceVersion}
              onRequestRevoke={(record) => setRevokeTarget(record)}
            />
          </div>
        )}
        {activeTab === 'local' && (
          <div className="flex-1 overflow-y-auto px-5 py-4 text-sm">
            {error !== null && (
              <p className="mb-3 rounded border border-red-600/40 bg-red-900/15 px-3 py-2 text-xs text-red-300">
                {error}
              </p>
            )}
            {data === null && !loading && (
              <p className="text-text-tertiary">{t('plugins.modal.empty_initial')}</p>
            )}
            {loading && (
              <p className="text-text-tertiary" data-testid="plugins-modal-loading">
                {t('plugins.modal.loading')}
              </p>
            )}
            {data !== null && (
              <>
                <p className="mb-3 text-xs text-text-tertiary">
                  {t('plugins.modal.root_dir_label')}{' '}
                  <code className="rounded bg-bg-tertiary px-1.5 py-0.5">{data.rootDir}</code>
                </p>
                {data.loaded.length === 0 && data.issues.length === 0 && (
                  <p
                    className="rounded border border-border-primary bg-bg-secondary px-3 py-2 text-xs text-text-tertiary"
                    data-testid="plugins-modal-empty"
                  >
                    {t('plugins.modal.empty_no_plugins')}
                  </p>
                )}
                {data.loaded.length > 0 && (
                  <section className="mb-4">
                    <h3 className="mb-2 text-xs font-semibold text-text-secondary">
                      {t('plugins.modal.loaded_section', { count: data.loaded.length })}
                    </h3>
                    <ul className="space-y-2">
                      {data.loaded.map((p) => (
                        <li
                          key={p.dir}
                          className="rounded border border-border-primary bg-bg-secondary px-3 py-2"
                          data-testid="plugins-modal-loaded-item"
                        >
                          <div className="flex items-baseline justify-between gap-2">
                            <div className="flex items-baseline gap-2">
                              <span className="font-mono text-sm font-semibold">
                                {p.manifest.name}
                              </span>
                              <span className="font-mono text-[11px] text-text-tertiary">
                                v{p.manifest.version}
                              </span>
                              <span
                                className={
                                  p.trusted
                                    ? 'rounded bg-emerald-900/30 px-1.5 py-0.5 text-[11px] text-emerald-400'
                                    : 'rounded bg-yellow-900/30 px-1.5 py-0.5 text-[11px] text-yellow-400'
                                }
                                data-testid="plugin-trust-badge"
                                data-trusted={p.trusted ? 'true' : 'false'}
                              >
                                {p.trusted
                                  ? t('plugins.modal.trust_badge_trusted')
                                  : t('plugins.modal.trust_badge_untrusted')}
                              </span>
                            </div>
                            <button
                              type="button"
                              onClick={() => void handleToggleTrust(p.manifest.name, !p.trusted)}
                              className="rounded border border-border-primary bg-bg-tertiary px-2 py-0.5 text-[11px] hover:bg-border-primary"
                              data-testid="plugin-trust-toggle"
                              data-plugin-name={p.manifest.name}
                            >
                              {p.trusted
                                ? t('plugins.modal.untrust_button')
                                : t('plugins.modal.trust_button')}
                            </button>
                          </div>
                          {p.manifest.description !== undefined && (
                            <p className="mt-1 text-xs text-text-tertiary">
                              {p.manifest.description}
                            </p>
                          )}
                          {p.manifest.hooks !== undefined &&
                            (p.manifest.hooks.pre_turn !== undefined ||
                              p.manifest.hooks.post_turn !== undefined) && (
                              <p className="mt-1 text-[11px] text-text-tertiary">
                                {t('plugins.modal.hooks_label')}{' '}
                                {[
                                  p.manifest.hooks.pre_turn !== undefined ? 'pre_turn' : null,
                                  p.manifest.hooks.post_turn !== undefined ? 'post_turn' : null,
                                ]
                                  .filter((x) => x !== null)
                                  .join(', ')}
                              </p>
                            )}
                          {p.manifest.capabilities !== undefined &&
                            p.manifest.capabilities.length > 0 && (
                              <p className="mt-1 text-[11px] text-yellow-400/80">
                                {t('plugins.modal.capabilities_label')}{' '}
                                <code className="rounded bg-bg-tertiary px-1 py-0.5">
                                  {p.manifest.capabilities.join(', ')}
                                </code>
                              </p>
                            )}
                        </li>
                      ))}
                    </ul>
                  </section>
                )}
                {data.issues.length > 0 && (
                  <section>
                    <h3 className="mb-2 text-xs font-semibold text-yellow-400">
                      {t('plugins.modal.issues_section', { count: data.issues.length })}
                    </h3>
                    <ul className="space-y-2">
                      {data.issues.map((iss, i) => (
                        <li
                          key={`${iss.path}-${i}`}
                          className="rounded border border-yellow-600/40 bg-yellow-900/10 px-3 py-2 text-xs"
                          data-testid="plugins-modal-issue-item"
                        >
                          <div className="font-mono">{iss.path}</div>
                          <div className="text-text-tertiary">{iss.reason}</div>
                        </li>
                      ))}
                    </ul>
                  </section>
                )}
              </>
            )}
          </div>
        )}
        {activeTab === 'local' && (
          <footer className="flex items-center justify-between border-t border-border-primary px-5 py-3 text-xs">
            <span className="text-text-tertiary">{t('plugins.modal.footer_hint')}</span>
            <button
              type="button"
              onClick={() => void fetchList(true)}
              className="rounded border border-border-primary bg-bg-secondary px-3 py-1 hover:bg-bg-tertiary"
              disabled={loading}
              data-testid="plugins-modal-rescan"
            >
              {t('plugins.modal.rescan')}
            </button>
          </footer>
        )}
      </div>
      {/* v2.4.0 — RevokeModal mounted at root of PluginsModal so it overlays
          when a row's "Revoke" button fires. onConfirm wires through
          mcp.requestRevoke IPC; on success increments marketplaceVersion to
          force InstalledPluginList refetch. */}
      <RevokeModal
        open={revokeTarget !== null}
        package_id={revokeTarget?.package_id ?? ''}
        onClose={() => setRevokeTarget(null)}
        onConfirm={async () => {
          const api = typeof window !== 'undefined' ? window.dreampia?.mcp : undefined;
          if (revokeTarget === null || api === undefined || api.requestRevoke === undefined) {
            return { ok: false, reason: 'IPC bridge unavailable' };
          }
          try {
            const result = await api.requestRevoke(revokeTarget.package_id);
            if (result.ok) {
              setMarketplaceVersion((v) => v + 1);
              return { ok: true, grant_epoch: result.value.grant_epoch };
            }
            return { ok: false, reason: result.error };
          } catch (err) {
            return { ok: false, reason: err instanceof Error ? err.message : String(err) };
          }
        }}
      />
    </div>
  );
}
