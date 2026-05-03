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
 *  - 사이드바의 [설정] 클릭 시 fixed overlay 로 표시 — z-50
 *  - 단순 form: env / args 는 textarea (each line one entry)
 *  - 생성 시간/추가일은 자동 채움 (new Date().toISOString())
 *
 * 한국어 우선 — Spec: docs/design/principles.md
 */

import { useCallback, useState } from 'react';
import { X, RefreshCw, Trash2, FileText, Plus, AlertCircle } from 'lucide-react';
import {
  useMcp,
  type McpServerConfigUI,
  type McpServerStateUI,
  type McpServerStatusUI,
} from '../../hooks/useMcp';

export interface McpSettingsProps {
  open: boolean;
  onClose: () => void;
}

const STATUS_LABELS: Record<McpServerStatusUI, string> = {
  disconnected: '미연결',
  connecting: '연결 중',
  ready: '준비 완료',
  error: '오류',
  disabled: '비활성',
};

const STATUS_COLORS: Record<McpServerStatusUI, string> = {
  disconnected: 'bg-gray-500',
  connecting: 'bg-yellow-500',
  ready: 'bg-green-500',
  error: 'bg-red-500',
  disabled: 'bg-gray-400',
};

export function McpSettings({ open, onClose }: McpSettingsProps): React.JSX.Element | null {
  const { servers, loading, error, refresh, add, remove, restart, getLogs } = useMcp();
  const [showAddForm, setShowAddForm] = useState(false);
  const [logsForServer, setLogsForServer] = useState<{
    id: string;
    lines: string[];
  } | null>(null);

  const handleViewLogs = useCallback(
    async (id: string): Promise<void> => {
      const lines = await getLogs(id);
      setLogsForServer({ id, lines });
    },
    [getLogs]
  );

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
      role="dialog"
      aria-modal="true"
      aria-label="MCP 서버 설정"
    >
      <div className="flex max-h-[90vh] w-[800px] max-w-[95vw] flex-col rounded-lg border border-border-primary bg-bg-primary shadow-xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border-primary p-4">
          <div>
            <h2 className="text-lg font-semibold">MCP 서버</h2>
            <p className="text-xs text-text-secondary">
              Model Context Protocol 서버를 등록하면 AI 가 외부 도구를 호출할 수 있어요.
            </p>
          </div>
          <button
            onClick={onClose}
            className="rounded-md p-2 hover:bg-bg-tertiary"
            aria-label="닫기"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-4">
          {error !== null && (
            <div className="mb-3 flex items-start gap-2 rounded-md border border-red-500/40 bg-red-500/10 p-3 text-sm text-red-300">
              <AlertCircle className="mt-0.5 h-4 w-4 flex-shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {loading ? (
            <p className="text-sm text-text-secondary">불러오는 중...</p>
          ) : servers.length === 0 ? (
            <div className="py-8 text-center text-sm text-text-secondary">
              등록된 MCP 서버가 없어요. 우측 하단 [+ 서버 추가] 버튼으로 시작해보세요.
            </div>
          ) : (
            <ul className="space-y-2">
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
        <div className="flex items-center justify-between border-t border-border-primary p-3">
          <button
            onClick={() => {
              void refresh();
            }}
            className="flex items-center gap-2 rounded-md px-3 py-1.5 text-sm hover:bg-bg-tertiary"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            새로고침
          </button>
          <button
            onClick={() => {
              setShowAddForm(true);
            }}
            className="flex items-center gap-2 rounded-md bg-bg-tertiary px-3 py-1.5 text-sm font-medium hover:bg-bg-quaternary"
          >
            <Plus className="h-3.5 w-3.5" />
            서버 추가
          </button>
        </div>
      </div>

      {showAddForm && (
        <McpAddForm
          onClose={() => {
            setShowAddForm(false);
          }}
          onSubmit={async (config) => {
            const success = await add(config);
            if (success) {
              setShowAddForm(false);
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
    </div>
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
  return (
    <li className="rounded-md border border-border-primary p-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span
              className={`inline-block h-2 w-2 rounded-full ${STATUS_COLORS[server.status]}`}
              aria-label={STATUS_LABELS[server.status]}
            />
            <span className="font-medium">{server.config.name}</span>
            <span className="text-xs text-text-tertiary">@{server.config.id}</span>
            <span className="text-xs text-text-secondary">
              {STATUS_LABELS[server.status]}
            </span>
          </div>
          <div className="mt-1 truncate text-xs text-text-secondary">
            <code className="font-mono">
              {server.config.command} {server.config.args.join(' ')}
            </code>
          </div>
          <div className="mt-1 text-xs text-text-secondary">
            도구 {server.tools.length}개
            {server.pid !== undefined ? ` · PID ${server.pid}` : ''}
          </div>
          {server.last_error !== undefined && (
            <p className="mt-1 text-xs text-red-400">에러: {server.last_error}</p>
          )}
        </div>
        <div className="flex flex-shrink-0 gap-1">
          <button
            onClick={onViewLogs}
            className="rounded-md p-1.5 hover:bg-bg-tertiary"
            aria-label="로그 보기"
            title="로그 보기"
          >
            <FileText className="h-3.5 w-3.5" />
          </button>
          <button
            onClick={onRestart}
            className="rounded-md p-1.5 hover:bg-bg-tertiary"
            aria-label="재시작"
            title="재시작"
          >
            <RefreshCw className="h-3.5 w-3.5" />
          </button>
          <button
            onClick={onRemove}
            className="rounded-md p-1.5 text-red-400 hover:bg-red-500/10"
            aria-label="제거"
            title="제거"
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
}

function McpAddForm({ onClose, onSubmit }: McpAddFormProps): React.JSX.Element {
  const [id, setId] = useState('');
  const [name, setName] = useState('');
  const [command, setCommand] = useState('');
  const [argsText, setArgsText] = useState(''); // 줄바꿈 separated
  const [envText, setEnvText] = useState(''); // KEY=VALUE per line
  const [cwd, setCwd] = useState('');
  const [enabled, setEnabled] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const handleSubmit = useCallback(
    async (evt: React.FormEvent<HTMLFormElement>): Promise<void> => {
      evt.preventDefault();
      setFormError(null);

      const trimmedId = id.trim();
      if (!/^[a-zA-Z0-9_-]+$/.test(trimmedId)) {
        setFormError('id 는 영문/숫자/하이픈/언더스코어만 사용할 수 있어요.');
        return;
      }
      if (name.trim().length === 0) {
        setFormError('이름을 입력해주세요.');
        return;
      }
      if (command.trim().length === 0) {
        setFormError('실행 명령을 입력해주세요.');
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
          setFormError(`환경 변수 형식 오류: '${line.slice(0, 30)}' (KEY=VALUE 형식 필요)`);
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
        setFormError('서버 추가에 실패했어요. (이미 존재하거나 spawn 실패)');
      }
    },
    [id, name, command, argsText, envText, cwd, enabled, onSubmit]
  );

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60"
      role="dialog"
      aria-modal="true"
      aria-label="MCP 서버 추가"
    >
      <form
        onSubmit={(e) => {
          void handleSubmit(e);
        }}
        className="flex max-h-[90vh] w-[600px] max-w-[95vw] flex-col rounded-lg border border-border-primary bg-bg-primary shadow-xl"
      >
        <div className="flex items-center justify-between border-b border-border-primary p-4">
          <h3 className="text-base font-semibold">새 MCP 서버</h3>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md p-2 hover:bg-bg-tertiary"
            aria-label="닫기"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex-1 space-y-3 overflow-y-auto p-4">
          {formError !== null && (
            <div className="rounded-md border border-red-500/40 bg-red-500/10 p-2 text-xs text-red-300">
              {formError}
            </div>
          )}

          <Field label="ID" hint="영문/숫자/하이픈/언더스코어 (예: github-mcp)">
            <input
              value={id}
              onChange={(e) => {
                setId(e.target.value);
              }}
              className="w-full rounded-md border border-border-primary bg-bg-secondary px-2 py-1 text-sm font-mono"
              required
            />
          </Field>

          <Field label="이름" hint="목록에 표시되는 표시명">
            <input
              value={name}
              onChange={(e) => {
                setName(e.target.value);
              }}
              className="w-full rounded-md border border-border-primary bg-bg-secondary px-2 py-1 text-sm"
              required
            />
          </Field>

          <Field label="실행 명령" hint="예: npx, node, python">
            <input
              value={command}
              onChange={(e) => {
                setCommand(e.target.value);
              }}
              className="w-full rounded-md border border-border-primary bg-bg-secondary px-2 py-1 text-sm font-mono"
              required
            />
          </Field>

          <Field label="인자 (줄바꿈 구분)" hint="예: -y / @modelcontextprotocol/server-github">
            <textarea
              value={argsText}
              onChange={(e) => {
                setArgsText(e.target.value);
              }}
              className="h-20 w-full resize-y rounded-md border border-border-primary bg-bg-secondary px-2 py-1 text-sm font-mono"
            />
          </Field>

          <Field label="환경 변수 (KEY=VALUE per line)" hint="예: GITHUB_TOKEN=...">
            <textarea
              value={envText}
              onChange={(e) => {
                setEnvText(e.target.value);
              }}
              className="h-20 w-full resize-y rounded-md border border-border-primary bg-bg-secondary px-2 py-1 text-sm font-mono"
            />
          </Field>

          <Field label="작업 디렉토리 (선택)" hint="비우면 process.cwd() 사용">
            <input
              value={cwd}
              onChange={(e) => {
                setCwd(e.target.value);
              }}
              className="w-full rounded-md border border-border-primary bg-bg-secondary px-2 py-1 text-sm font-mono"
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
            <span>저장 후 즉시 실행</span>
          </label>
        </div>

        <div className="flex justify-end gap-2 border-t border-border-primary p-3">
          <button
            type="button"
            onClick={onClose}
            className="rounded-md px-3 py-1.5 text-sm hover:bg-bg-tertiary"
          >
            취소
          </button>
          <button
            type="submit"
            disabled={submitting}
            className="rounded-md bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {submitting ? '추가 중...' : '추가'}
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
  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60"
      role="dialog"
      aria-modal="true"
      aria-label={`${id} 로그`}
    >
      <div className="flex max-h-[80vh] w-[700px] max-w-[95vw] flex-col rounded-lg border border-border-primary bg-bg-primary shadow-xl">
        <div className="flex items-center justify-between border-b border-border-primary p-3">
          <h3 className="text-base font-semibold">로그 — {id}</h3>
          <button
            onClick={onClose}
            className="rounded-md p-2 hover:bg-bg-tertiary"
            aria-label="닫기"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto bg-bg-secondary p-3">
          {lines.length === 0 ? (
            <p className="text-sm text-text-secondary">로그가 없어요.</p>
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
