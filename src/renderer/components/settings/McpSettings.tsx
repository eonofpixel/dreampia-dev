/**
 * McpSettings — MCP 서버 등록/관리 모달 (Issue #5, v0.2.0).
 *
 * Spec: docs/tools/mcp-bridge.md
 *
 * 기능:
 *  - 등록된 서버 목록 (status / tools count / last error)
 *  - [+ 서버 추가] → form (id, name, command, args, env, cwd, enabled)
 *  - [재시작] / [제거] / [로그 보기] 버튼
 *
 * UI 결정:
 *  - v0.2.0 ~ v0.7.x — 사이드바의 [설정] 클릭 시 fixed overlay 로 표시 — z-50
 *  - v0.8.0 — SettingsModal 의 'MCP' 탭 panel 로 embed 가능 (`McpSettingsPanel`).
 *    standalone 모달 진입점인 `McpSettings` 도 그대로 유지 — 기존 caller / e2e
 *    회귀 0.
 *  - 단순 form: env / args 는 textarea (each line one entry)
 *  - 생성 시간/추가일은 자동 채움 (new Date().toISOString())
 *
 * v1.7.18 — hardcoded 한국어 전체를 useT() 기반으로 교체. STATUS_LABELS const →
 * `statusLabel(t, s)` helper 로 locale reactive.
 */

import { useCallback, useEffect, useState } from 'react';
import { X, RefreshCw, Trash2, FileText, Plus, AlertCircle, Sparkles } from 'lucide-react';
import {
  useMcp,
  type McpDiscoveryUI,
  type McpServerConfigUI,
  type McpServerStateUI,
  type McpServerStatusUI,
  type SuggestedMcpServerUI,
} from '../../hooks/useMcp';
import { useT } from '../../i18n';

export interface McpSettingsProps {
  open: boolean;
  onClose: () => void;
}

const STATUS_COLORS: Record<McpServerStatusUI, string> = {
  disconnected: 'bg-text-tertiary',
  connecting: 'bg-semantic-warning',
  ready: 'bg-semantic-success',
  error: 'bg-semantic-danger',
  disabled: 'bg-text-tertiary',
};

/** v1.7.18 — locale reactive label. caller 가 useT() 결과를 전달. */
function statusLabel(t: ReturnType<typeof useT>, status: McpServerStatusUI): string {
  switch (status) {
    case 'disconnected':
      return t('mcp.status.disconnected');
    case 'connecting':
      return t('mcp.status.connecting');
    case 'ready':
      return t('mcp.status.ready');
    case 'error':
      return t('mcp.status.error');
    case 'disabled':
      return t('mcp.status.disabled');
  }
}

export function McpSettings({ open, onClose }: McpSettingsProps): React.JSX.Element | null {
  const t = useT();
  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
      role="dialog"
      aria-modal="true"
      aria-label={t('mcp.modal_aria')}
    >
      <div className="flex max-h-[90vh] w-[800px] max-w-[95vw] flex-col rounded-lg border border-hairline bg-canvas shadow-xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-hairline p-4">
          <div>
            <h2 className="text-lg font-semibold">{t('mcp.title')}</h2>
            <p className="text-xs text-text-secondary">{t('mcp.subtitle')}</p>
          </div>
          <button
            onClick={onClose}
            className="rounded-md p-2 hover:bg-surface-strong"
            aria-label={t('mcp.close')}
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <McpSettingsPanel />
      </div>
    </div>
  );
}

/**
 * v0.8.0 — SettingsModal 의 'MCP' 탭 안에 mount 되는 body. McpSettings (모달
 * frame) 와 동일한 hook 흐름을 공유하지만 자체 chrome (header / close) 은
 * 가지지 않는다. 호출자는 panel-only 컴포넌트로 import 해 사용.
 *
 * v0.9.0 — 추천 서버 + Claude/Codex auto-discovery 결과 표시. 사용자가 [추가]
 * 버튼 클릭 시 add form 에 미리 채워진 상태로 열림.
 */
export function McpSettingsPanel(): React.JSX.Element {
  const t = useT();
  const { servers, loading, error, refresh, add, remove, restart, getLogs, discover } = useMcp();
  const [showAddForm, setShowAddForm] = useState(false);
  /** add form 의 초기값 — suggested server / discovered server 를 템플릿으로 제공. */
  const [addFormInitial, setAddFormInitial] = useState<McpServerConfigUI | null>(null);
  const [discovery, setDiscovery] = useState<McpDiscoveryUI | null>(null);
  const [logsForServer, setLogsForServer] = useState<{
    id: string;
    lines: string[];
  } | null>(null);

  // discovery 는 mount 시 한 번 — 서버 add/remove 후엔 따로 refresh.
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const result = await discover();
      if (!cancelled) {
        setDiscovery(result);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [discover, servers.length]);

  const handleViewLogs = useCallback(
    async (id: string): Promise<void> => {
      const lines = await getLogs(id);
      setLogsForServer({ id, lines });
    },
    [getLogs]
  );

  const openAddForm = useCallback((initial: McpServerConfigUI | null): void => {
    setAddFormInitial(initial);
    setShowAddForm(true);
  }, []);

  const handleAddSuggested = useCallback(
    (s: SuggestedMcpServerUI): void => {
      openAddForm({
        id: s.id,
        name: s.name,
        command: s.command,
        args: [...s.args],
        env: {},
        enabled: true,
        added_at: new Date().toISOString(),
      });
    },
    [openAddForm]
  );

  const handleAddDiscovered = useCallback(
    (config: McpServerConfigUI): void => {
      openAddForm(config);
    },
    [openAddForm]
  );

  return (
    <>
      {/* Body */}
      <div className="flex-1 overflow-y-auto p-4">
        {error !== null && (
          <div className="mb-3 flex items-start gap-2 rounded-md border border-semantic-danger/40 bg-semantic-danger/10 p-3 text-sm text-semantic-danger">
            <AlertCircle className="mt-0.5 h-4 w-4 flex-shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {/* v0.9.0 — 추천 + 자동 탐지 결과 */}
        {discovery !== null && (
          <McpDiscoverySection
            discovery={discovery}
            onAddSuggested={handleAddSuggested}
            onAddDiscovered={handleAddDiscovered}
          />
        )}

        {loading ? (
          <p className="text-sm text-text-secondary" data-testid="mcp-loading">
            {t('mcp.loading')}
          </p>
        ) : servers.length === 0 ? (
          <div className="py-8 text-center text-sm text-text-secondary" data-testid="mcp-empty">
            {t('mcp.empty')}
          </div>
        ) : (
          <ul className="space-y-2" data-testid="mcp-server-list">
            {servers.map((server) => (
              <McpServerRow
                key={server.config.id}
                server={server}
                onRestart={() => {
                  void restart(server.config.id);
                }}
                onRemove={() => {
                  void remove(server.config.id);
                }}
                onViewLogs={() => {
                  void handleViewLogs(server.config.id);
                }}
              />
            ))}
          </ul>
        )}
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between border-t border-hairline p-3">
        <button
          onClick={() => {
            void refresh();
          }}
          className="flex items-center gap-2 rounded-md px-3 py-1.5 text-sm hover:bg-surface-strong"
        >
          <RefreshCw className="h-3.5 w-3.5" />
          {t('mcp.refresh')}
        </button>
        <button
          onClick={() => {
            openAddForm(null);
          }}
          className="flex items-center gap-2 rounded-md bg-surface-strong px-3 py-1.5 text-sm font-medium hover:bg-surface-card"
          data-testid="mcp-add-button"
        >
          <Plus className="h-3.5 w-3.5" />
          {t('mcp.add_server')}
        </button>
      </div>

      {showAddForm && (
        <McpAddForm
          initial={addFormInitial}
          onClose={() => {
            setShowAddForm(false);
            setAddFormInitial(null);
          }}
          onSubmit={async (config) => {
            const success = await add(config);
            if (success) {
              setShowAddForm(false);
              setAddFormInitial(null);
            }
            return success;
          }}
        />
      )}

      {logsForServer !== null && (
        <McpLogsModal
          id={logsForServer.id}
          lines={logsForServer.lines}
          onClose={() => {
            setLogsForServer(null);
          }}
        />
      )}
    </>
  );
}

// ────────────────────────────────────────────────────────────
// 추천 + 자동 탐지 section (v0.9.0)
// ────────────────────────────────────────────────────────────

interface McpDiscoverySectionProps {
  discovery: McpDiscoveryUI;
  onAddSuggested: (s: SuggestedMcpServerUI) => void;
  onAddDiscovered: (config: McpServerConfigUI) => void;
}

function McpDiscoverySection({
  discovery,
  onAddSuggested,
  onAddDiscovered,
}: McpDiscoverySectionProps): React.JSX.Element | null {
  const t = useT();
  const hasDiscovered = discovery.from_claude.length + discovery.from_codex.length > 0;
  const hasSuggested = discovery.suggested.length > 0;
  if (!hasDiscovered && !hasSuggested) return null;

  return (
    <section className="mb-4 space-y-3" data-testid="mcp-discovery-section">
      {hasDiscovered && (
        <div>
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-text-tertiary">
            {t('mcp.discovery.from_cli_title')}
          </h3>
          <ul className="space-y-1.5">
            {discovery.from_claude.map((c) => (
              <DiscoveredRow
                key={`claude-${c.id}`}
                source="Claude"
                config={c}
                onAdd={() => onAddDiscovered(c)}
              />
            ))}
            {discovery.from_codex.map((c) => (
              <DiscoveredRow
                key={`codex-${c.id}`}
                source="Codex"
                config={c}
                onAdd={() => onAddDiscovered(c)}
              />
            ))}
          </ul>
        </div>
      )}

      {hasSuggested && (
        <div>
          <h3 className="mb-2 flex items-center gap-1 text-xs font-semibold uppercase tracking-wide text-text-tertiary">
            <Sparkles className="h-3 w-3" aria-hidden="true" />
            {t('mcp.discovery.suggested_title')}
          </h3>
          <ul className="space-y-1.5">
            {discovery.suggested.map((s) => (
              <SuggestedRow
                key={`suggested-${s.id}`}
                suggested={s}
                onAdd={() => onAddSuggested(s)}
              />
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}

interface DiscoveredRowProps {
  source: 'Claude' | 'Codex';
  config: McpServerConfigUI;
  onAdd: () => void;
}

function DiscoveredRow({ source, config, onAdd }: DiscoveredRowProps): React.JSX.Element {
  const t = useT();
  return (
    <li
      className="flex items-start justify-between gap-3 rounded-md border border-hairline bg-surface-card p-2.5"
      data-testid={`discovered-${config.id}`}
    >
      <div className="min-w-0 flex-1">
        <p className="text-sm">
          <span className="font-medium">{config.name}</span>
          <span className="ml-2 rounded bg-surface-strong px-1.5 py-0.5 text-[10px] text-text-tertiary">
            {source} CLI
          </span>
        </p>
        <p className="mt-0.5 truncate text-xs text-text-tertiary">
          <code className="font-mono">
            {config.command} {config.args.join(' ')}
          </code>
        </p>
      </div>
      <button
        type="button"
        onClick={onAdd}
        className="flex flex-shrink-0 items-center gap-1 rounded-md border border-hairline bg-canvas-soft px-2.5 py-1 text-xs hover:bg-surface-strong"
        data-testid={`discovered-add-${config.id}`}
      >
        <Plus className="h-3 w-3" />
        {t('mcp.add')}
      </button>
    </li>
  );
}

interface SuggestedRowProps {
  suggested: SuggestedMcpServerUI;
  onAdd: () => void;
}

function SuggestedRow({ suggested, onAdd }: SuggestedRowProps): React.JSX.Element {
  const t = useT();
  return (
    <li
      className="flex items-start justify-between gap-3 rounded-md border border-hairline bg-surface-card p-2.5"
      data-testid={`suggested-${suggested.id}`}
    >
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium">{suggested.name}</p>
        <p className="mt-0.5 text-xs text-text-secondary">{suggested.description}</p>
        <p className="mt-0.5 text-[10px] text-text-tertiary">{suggested.install_hint}</p>
      </div>
      <button
        type="button"
        onClick={onAdd}
        className="flex flex-shrink-0 items-center gap-1 rounded-md border border-hairline bg-canvas-soft px-2.5 py-1 text-xs hover:bg-surface-strong"
        data-testid={`suggested-add-${suggested.id}`}
      >
        <Plus className="h-3 w-3" />
        {t('mcp.add')}
      </button>
    </li>
  );
}

// ────────────────────────────────────────────────────────────
// 서버 행
// ────────────────────────────────────────────────────────────

interface McpServerRowProps {
  server: McpServerStateUI;
  onRestart: () => void;
  onRemove: () => void;
  onViewLogs: () => void;
}

function McpServerRow({
  server,
  onRestart,
  onRemove,
  onViewLogs,
}: McpServerRowProps): React.JSX.Element {
  const t = useT();
  const sLabel = statusLabel(t, server.status);
  return (
    <li className="rounded-md border border-hairline p-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span
              className={`inline-block h-2 w-2 rounded-full ${STATUS_COLORS[server.status]}`}
              aria-label={sLabel}
            />
            <span className="font-medium">{server.config.name}</span>
            <span className="text-xs text-text-tertiary">@{server.config.id}</span>
            <span className="text-xs text-text-secondary">{sLabel}</span>
          </div>
          <div className="mt-1 truncate text-xs text-text-secondary">
            <code className="font-mono">
              {server.config.command} {server.config.args.join(' ')}
            </code>
          </div>
          <div className="mt-1 text-xs text-text-secondary">
            {t('mcp.tools_count', { n: server.tools.length })}
            {server.pid !== undefined ? ` · PID ${server.pid}` : ''}
          </div>
          {server.last_error !== undefined && (
            <p className="mt-1 text-xs text-semantic-danger">
              {t('mcp.row_error', { e: server.last_error })}
            </p>
          )}
        </div>
        <div className="flex flex-shrink-0 gap-1">
          <button
            onClick={onViewLogs}
            className="rounded-md p-1.5 hover:bg-surface-strong"
            aria-label={t('mcp.row.view_logs')}
            title={t('mcp.row.view_logs')}
          >
            <FileText className="h-3.5 w-3.5" />
          </button>
          <button
            onClick={onRestart}
            className="rounded-md p-1.5 hover:bg-surface-strong"
            aria-label={t('mcp.row.restart')}
            title={t('mcp.row.restart')}
          >
            <RefreshCw className="h-3.5 w-3.5" />
          </button>
          <button
            onClick={onRemove}
            className="rounded-md p-1.5 text-semantic-danger hover:bg-semantic-danger/10"
            aria-label={t('mcp.row.remove')}
            title={t('mcp.row.remove')}
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
    </li>
  );
}

// ────────────────────────────────────────────────────────────
// 서버 추가 form
// ────────────────────────────────────────────────────────────

interface McpAddFormProps {
  onClose: () => void;
  onSubmit: (config: McpServerConfigUI) => Promise<boolean>;
  /** v0.9.0 — 초기 값 (suggested / discovered server 클릭 시 사용). */
  initial?: McpServerConfigUI | null;
}

function McpAddForm({ onClose, onSubmit, initial }: McpAddFormProps): React.JSX.Element {
  const t = useT();
  const [id, setId] = useState(initial?.id ?? '');
  const [name, setName] = useState(initial?.name ?? '');
  const [command, setCommand] = useState(initial?.command ?? '');
  const [argsText, setArgsText] = useState(initial?.args.join('\n') ?? ''); // 줄바꿈 separated
  const [envText, setEnvText] = useState(
    initial !== undefined && initial !== null
      ? Object.entries(initial.env)
          .map(([k, v]) => `${k}=${v}`)
          .join('\n')
      : ''
  ); // KEY=VALUE per line
  const [cwd, setCwd] = useState(initial?.cwd ?? '');
  const [enabled, setEnabled] = useState(initial?.enabled ?? true);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const handleSubmit = useCallback(
    async (evt: React.FormEvent<HTMLFormElement>): Promise<void> => {
      evt.preventDefault();
      setFormError(null);

      const trimmedId = id.trim();
      if (!/^[a-zA-Z0-9_-]+$/.test(trimmedId)) {
        setFormError(t('mcp.add_form.err_invalid_id'));
        return;
      }
      if (name.trim().length === 0) {
        setFormError(t('mcp.add_form.err_name_required'));
        return;
      }
      if (command.trim().length === 0) {
        setFormError(t('mcp.add_form.err_command_required'));
        return;
      }

      const args = argsText
        .split('\n')
        .map((s) => s.trim())
        .filter((s) => s.length > 0);

      const env: Record<string, string> = {};
      for (const rawLine of envText.split('\n')) {
        const line = rawLine.trim();
        if (line.length === 0) continue;
        const eq = line.indexOf('=');
        if (eq <= 0) {
          setFormError(t('mcp.add_form.err_env_format', { line: line.slice(0, 30) }));
          return;
        }
        const key = line.slice(0, eq).trim();
        const val = line.slice(eq + 1);
        env[key] = val;
      }

      const config: McpServerConfigUI = {
        id: trimmedId,
        name: name.trim(),
        command: command.trim(),
        args,
        env,
        enabled,
        added_at: new Date().toISOString(),
      };
      if (cwd.trim().length > 0) {
        config.cwd = cwd.trim();
      }

      setSubmitting(true);
      const success = await onSubmit(config);
      setSubmitting(false);
      if (!success) {
        setFormError(t('mcp.add_form.err_submit_failed'));
      }
    },
    [id, name, command, argsText, envText, cwd, enabled, onSubmit, t]
  );

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60"
      role="dialog"
      aria-modal="true"
      aria-label={t('mcp.add_form_aria')}
    >
      <form
        onSubmit={(e) => {
          void handleSubmit(e);
        }}
        className="flex max-h-[90vh] w-[600px] max-w-[95vw] flex-col rounded-lg border border-hairline bg-canvas shadow-xl"
      >
        <div className="flex items-center justify-between border-b border-hairline p-4">
          <h3 className="text-base font-semibold">{t('mcp.add_form_title')}</h3>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md p-2 hover:bg-surface-strong"
            aria-label={t('mcp.close')}
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex-1 space-y-3 overflow-y-auto p-4">
          {formError !== null && (
            <div className="rounded-md border border-semantic-danger/40 bg-semantic-danger/10 p-2 text-xs text-semantic-danger">
              {formError}
            </div>
          )}

          <Field label={t('mcp.field.id')} hint={t('mcp.hint.id')}>
            <input
              value={id}
              onChange={(e) => {
                setId(e.target.value);
              }}
              className="w-full rounded-md border border-hairline bg-canvas-soft px-2 py-1 text-sm font-mono"
              required
            />
          </Field>

          <Field label={t('mcp.field.name')} hint={t('mcp.hint.name')}>
            <input
              value={name}
              onChange={(e) => {
                setName(e.target.value);
              }}
              className="w-full rounded-md border border-hairline bg-canvas-soft px-2 py-1 text-sm"
              required
            />
          </Field>

          <Field label={t('mcp.field.command')} hint={t('mcp.hint.command')}>
            <input
              value={command}
              onChange={(e) => {
                setCommand(e.target.value);
              }}
              className="w-full rounded-md border border-hairline bg-canvas-soft px-2 py-1 text-sm font-mono"
              required
            />
          </Field>

          <Field label={t('mcp.field.args')} hint={t('mcp.hint.args')}>
            <textarea
              value={argsText}
              onChange={(e) => {
                setArgsText(e.target.value);
              }}
              className="h-20 w-full resize-y rounded-md border border-hairline bg-canvas-soft px-2 py-1 text-sm font-mono"
            />
          </Field>

          <Field label={t('mcp.field.env')} hint={t('mcp.hint.env')}>
            <textarea
              value={envText}
              onChange={(e) => {
                setEnvText(e.target.value);
              }}
              className="h-20 w-full resize-y rounded-md border border-hairline bg-canvas-soft px-2 py-1 text-sm font-mono"
            />
          </Field>

          <Field label={t('mcp.field.cwd')} hint={t('mcp.hint.cwd')}>
            <input
              value={cwd}
              onChange={(e) => {
                setCwd(e.target.value);
              }}
              className="w-full rounded-md border border-hairline bg-canvas-soft px-2 py-1 text-sm font-mono"
            />
          </Field>

          <label className="flex cursor-pointer items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={enabled}
              onChange={(e) => {
                setEnabled(e.target.checked);
              }}
            />
            <span>{t('mcp.field.enabled_label')}</span>
          </label>
        </div>

        <div className="flex justify-end gap-2 border-t border-hairline p-3">
          <button
            type="button"
            onClick={onClose}
            className="rounded-md px-3 py-1.5 text-sm hover:bg-surface-strong"
          >
            {t('mcp.cancel')}
          </button>
          <button
            type="submit"
            disabled={submitting}
            className="rounded-md bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {submitting ? t('mcp.adding') : t('mcp.add')}
          </button>
        </div>
      </form>
    </div>
  );
}

// ────────────────────────────────────────────────────────────
// 로그 모달
// ────────────────────────────────────────────────────────────

interface McpLogsModalProps {
  id: string;
  lines: string[];
  onClose: () => void;
}

function McpLogsModal({ id, lines, onClose }: McpLogsModalProps): React.JSX.Element {
  const t = useT();
  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60"
      role="dialog"
      aria-modal="true"
      aria-label={t('mcp.logs.aria', { id })}
    >
      <div className="flex max-h-[80vh] w-[700px] max-w-[95vw] flex-col rounded-lg border border-hairline bg-canvas shadow-xl">
        <div className="flex items-center justify-between border-b border-hairline p-3">
          <h3 className="text-base font-semibold">{t('mcp.logs.title', { id })}</h3>
          <button
            onClick={onClose}
            className="rounded-md p-2 hover:bg-surface-strong"
            aria-label={t('mcp.close')}
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto bg-canvas-soft p-3">
          {lines.length === 0 ? (
            <p className="text-sm text-text-secondary">{t('mcp.logs.empty')}</p>
          ) : (
            <pre className="whitespace-pre-wrap font-mono text-xs text-text-primary">
              {lines.join('\n')}
            </pre>
          )}
        </div>
      </div>
    </div>
  );
}

// ────────────────────────────────────────────────────────────
// 폼 헬퍼
// ────────────────────────────────────────────────────────────

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}): React.JSX.Element {
  return (
    <label className="block">
      <span className="mb-0.5 flex items-center gap-2 text-xs font-medium text-text-secondary">
        {label}
      </span>
      {children}
      {hint !== undefined && <p className="mt-0.5 text-[10px] text-text-tertiary">{hint}</p>}
    </label>
  );
}
