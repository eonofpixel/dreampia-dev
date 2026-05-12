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
import { Button } from '../ui/Button';
import { ModalShell } from '../ui/ModalShell';
import { InstalledPluginList } from '../marketplace/InstalledPluginList';
import { RevokeModal } from '../marketplace/RevokeModal';
import { IsolationDowngradeModal } from '../marketplace/IsolationDowngradeModal';
import { PluginSecuritySettings } from './PluginSecuritySettings';
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
  // v2.4.0 (Task 6) — isolation downgrade modal target. null = closed.
  const [downgradeTarget, setDowngradeTarget] = useState<InstalledPluginRecord | null>(null);
  // v2.4.0 — counter to force InstalledPluginList refetch after revoke / downgrade.
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

  // v2.10.0 (.omc/DESIGN.md, modal migration B) — chrome 을 ModalShell + Button
  // 으로. tab strip + body + footer 는 children 안에 layout. RevokeModal +
  // IsolationDowngradeModal 는 PluginsModal 의 sibling 으로 (ModalShell 바깥)
  // mount — 별도 overlay 가 nested 되어도 z-index 충돌 없도록.
  return (
    <>
      <ModalShell
        open={open}
        size="lg"
        title={t('plugins.modal.title')}
        titleId="plugins-modal-title"
        onClose={onClose}
        data-testid="plugins-modal"
        footer={
          activeTab === 'local' ? (
            <div className="flex w-full items-center justify-between">
              <span className="text-caption text-text-tertiary">
                {t('plugins.modal.footer_hint')}
              </span>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => void fetchList(true)}
                disabled={loading}
                data-testid="plugins-modal-rescan"
              >
                {t('plugins.modal.rescan')}
              </Button>
            </div>
          ) : undefined
        }
      >
        {/* v2.4.0 — tab strip: Local plugins ↔ MCP Marketplace */}
        <div
          role="tablist"
          aria-label="Plugin sections"
          className="-mx-lg mb-base flex border-b border-hairline px-lg"
          data-testid="plugins-modal-tabs"
        >
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'local'}
            onClick={() => setActiveTab('local')}
            className={
              activeTab === 'local'
                ? 'border-b-2 border-accent px-sm py-xs text-caption font-semibold text-accent'
                : 'border-b-2 border-transparent px-sm py-xs text-caption text-text-tertiary hover:text-text-secondary'
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
                ? 'border-b-2 border-accent px-sm py-xs text-caption font-semibold text-accent'
                : 'border-b-2 border-transparent px-sm py-xs text-caption text-text-tertiary hover:text-text-secondary'
            }
            data-testid="plugins-tab-marketplace"
          >
            MCP Marketplace
          </button>
        </div>
        {activeTab === 'marketplace' && (
          <div className="space-y-base text-body-sm" data-testid="plugins-modal-marketplace-pane">
            <PluginSecuritySettings />
            <InstalledPluginList
              key={marketplaceVersion}
              onRequestRevoke={(record) => setRevokeTarget(record)}
              onRequestDowngrade={(record) => setDowngradeTarget(record)}
            />
          </div>
        )}
        {activeTab === 'local' && (
          <div className="text-body-sm">
            {error !== null && (
              <p className="mb-sm rounded-md border border-semantic-danger/40 bg-semantic-danger/10 px-sm py-xs text-caption text-semantic-danger">
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
                <p className="mb-sm text-caption text-text-tertiary">
                  {t('plugins.modal.root_dir_label')}{' '}
                  <code className="rounded-sm bg-surface-strong px-xxs py-[1px]">
                    {data.rootDir}
                  </code>
                </p>
                {data.loaded.length === 0 && data.issues.length === 0 && (
                  <p
                    className="rounded-md border border-hairline bg-canvas-soft px-sm py-xs text-caption text-text-tertiary"
                    data-testid="plugins-modal-empty"
                  >
                    {t('plugins.modal.empty_no_plugins')}
                  </p>
                )}
                {data.loaded.length > 0 && (
                  <section className="mb-base">
                    <h3 className="mb-xs text-caption font-semibold text-text-secondary">
                      {t('plugins.modal.loaded_section', { count: data.loaded.length })}
                    </h3>
                    <ul className="space-y-xs">
                      {data.loaded.map((p) => (
                        <li
                          key={p.dir}
                          className="rounded-md border border-hairline bg-canvas-soft px-sm py-xs"
                          data-testid="plugins-modal-loaded-item"
                        >
                          <div className="flex items-baseline justify-between gap-xs">
                            <div className="flex items-baseline gap-xs">
                              <span className="font-mono text-body-sm font-semibold">
                                {p.manifest.name}
                              </span>
                              <span className="font-mono text-caption text-text-tertiary">
                                v{p.manifest.version}
                              </span>
                              <span
                                className={
                                  p.trusted
                                    ? 'rounded-pill bg-semantic-success/15 px-xs py-[1px] text-caption text-semantic-success'
                                    : 'rounded-pill bg-semantic-warning/15 px-xs py-[1px] text-caption text-semantic-warning'
                                }
                                data-testid="plugin-trust-badge"
                                data-trusted={p.trusted ? 'true' : 'false'}
                              >
                                {p.trusted
                                  ? t('plugins.modal.trust_badge_trusted')
                                  : t('plugins.modal.trust_badge_untrusted')}
                              </span>
                            </div>
                            <Button
                              variant="secondary"
                              size="sm"
                              onClick={() => void handleToggleTrust(p.manifest.name, !p.trusted)}
                              data-testid="plugin-trust-toggle"
                              data-plugin-name={p.manifest.name}
                            >
                              {p.trusted
                                ? t('plugins.modal.untrust_button')
                                : t('plugins.modal.trust_button')}
                            </Button>
                          </div>
                          {p.manifest.description !== undefined && (
                            <p className="mt-xxs text-caption text-text-tertiary">
                              {p.manifest.description}
                            </p>
                          )}
                          {p.manifest.hooks !== undefined &&
                            (p.manifest.hooks.pre_turn !== undefined ||
                              p.manifest.hooks.post_turn !== undefined) && (
                              <p className="mt-xxs text-caption text-text-tertiary">
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
                              <p className="mt-xxs text-caption text-semantic-warning">
                                {t('plugins.modal.capabilities_label')}{' '}
                                <code className="rounded-sm bg-surface-strong px-xxs py-[1px]">
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
                    <h3 className="mb-xs text-caption font-semibold text-semantic-warning">
                      {t('plugins.modal.issues_section', { count: data.issues.length })}
                    </h3>
                    <ul className="space-y-xs">
                      {data.issues.map((iss, i) => (
                        <li
                          key={`${iss.path}-${i}`}
                          className="rounded-md border border-semantic-warning/40 bg-semantic-warning/10 px-sm py-xs text-caption"
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
      </ModalShell>
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
      {/* v2.4.0 (Task 6, G6) — IsolationDowngradeModal mounted at root so the
          marketplace row's "Run in main process" button can open it. onConfirm
          calls plugin.requestDowngrade which writes settings.plugins[id].isolationMode
          + isolationDowngradeConsent + emits audit. On success bumps marketplaceVersion
          so InstalledPluginList refetches and the row's badge updates. */}
      <IsolationDowngradeModal
        open={downgradeTarget !== null}
        package_id={downgradeTarget?.package_id ?? ''}
        onClose={() => setDowngradeTarget(null)}
        onConfirm={async () => {
          const api = typeof window !== 'undefined' ? window.dreampia?.plugin : undefined;
          if (downgradeTarget === null || api === undefined || api.requestDowngrade === undefined) {
            return { ok: false, reason: 'IPC bridge unavailable' };
          }
          try {
            const result = await api.requestDowngrade(downgradeTarget.package_id);
            if (result.ok) {
              setMarketplaceVersion((v) => v + 1);
              return { ok: true };
            }
            return { ok: false, reason: result.error };
          } catch (err) {
            return { ok: false, reason: err instanceof Error ? err.message : String(err) };
          }
        }}
      />
    </>
  );
}
