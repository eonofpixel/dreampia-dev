import {
  AlertTriangle,
  FileSearch,
  GitBranch,
  PlayCircle,
  RefreshCw,
  ShieldCheck,
} from 'lucide-react';
import { useMemo } from 'react';

import type { CommandRunResult, RepoContextSummary, RepoScriptSummary } from '@/types/workspace';
import type { Turn } from '@/types';
import { useT } from '../../i18n';

type TaskState =
  | 'failed_recoverable'
  | 'draft'
  | 'context_ready'
  | 'planned'
  | 'review_ready'
  | 'testing'
  | 'applied';

export interface CodingTaskPanelProps {
  workspaceName?: string;
  turns: ReadonlyArray<Turn>;
  isStreaming: boolean;
  repoContext: RepoContextSummary | null;
  repoContextLoading: boolean;
  repoContextError: string | null;
  commandResults: Record<string, CommandRunResult>;
  onRefreshRepoContext?: () => void;
  onRunSafeCommand?: (command: RepoScriptSummary['command']) => void;
  onPickWorkspace?: () => void;
  providerRecoverable?: boolean;
  onOpenProviderSettings?: () => void;
}

function textFromTurn(turn: Turn | undefined): string {
  if (turn === undefined) return '';
  return turn.content
    .filter((block) => block.type === 'text')
    .map((block) => (block.type === 'text' ? block.text : ''))
    .join('\n');
}

function inferTaskState(args: {
  workspaceName?: string;
  turns: ReadonlyArray<Turn>;
  isStreaming: boolean;
  repoContext: RepoContextSummary | null;
  repoContextError: string | null;
  providerRecoverable: boolean;
  commandResults: Record<string, CommandRunResult>;
}): TaskState {
  if (
    args.workspaceName === undefined ||
    args.providerRecoverable ||
    args.repoContextError !== null
  ) {
    return 'failed_recoverable';
  }
  if (args.turns.length === 0) return args.repoContext === null ? 'draft' : 'context_ready';
  if (Object.keys(args.commandResults).length > 0) return 'testing';
  if (args.isStreaming) return 'planned';
  const lastAssistant = [...args.turns].reverse().find((turn) => turn.role === 'assistant');
  const text = textFromTurn(lastAssistant);
  if (/diff|review|변경 후보|파일에 적용|apply/i.test(text)) return 'review_ready';
  if (/테스트 결과|실행 결과|exit code|completed successfully/i.test(text)) return 'testing';
  return args.repoContext === null ? 'planned' : 'context_ready';
}

function commandTone(result: CommandRunResult | undefined): string {
  if (result === undefined) return 'border-hairline bg-surface-card text-text-secondary';
  if (result.exit_code === 0)
    return 'border-semantic-success/40 bg-semantic-success/10 text-text-primary';
  return 'border-semantic-danger/40 bg-semantic-danger/10 text-text-primary';
}

function shortPathList(items: ReadonlyArray<{ path: string }>, max = 4): string {
  if (items.length === 0) return '-';
  const visible = items.slice(0, max).map((item) => item.path);
  if (items.length > max) visible.push(`+${items.length - max}`);
  return visible.join(', ');
}

export function CodingTaskPanel({
  workspaceName,
  turns,
  isStreaming,
  repoContext,
  repoContextLoading,
  repoContextError,
  commandResults,
  onRefreshRepoContext,
  onRunSafeCommand,
  onPickWorkspace,
  providerRecoverable = false,
  onOpenProviderSettings,
}: CodingTaskPanelProps): React.JSX.Element {
  const t = useT();
  const state = useMemo(
    () =>
      inferTaskState({
        workspaceName,
        turns,
        isStreaming,
        repoContext,
        repoContextError,
        providerRecoverable,
        commandResults,
      }),
    [
      commandResults,
      isStreaming,
      providerRecoverable,
      repoContext,
      repoContextError,
      turns,
      workspaceName,
    ]
  );

  const safeCommands = repoContext?.safe_commands ?? [];
  const git = repoContext?.git;
  const hasRecovery = state === 'failed_recoverable';

  return (
    <section
      className="border-b border-hairline bg-canvas-soft/75 px-md py-sm"
      data-testid="coding-task-panel"
      aria-label={t('chat.task_panel.aria_label')}
    >
      <div className="mx-auto grid max-w-6xl gap-sm lg:grid-cols-[1.1fr_1fr_1fr]">
        <article className="min-w-0 rounded-md border border-hairline bg-surface-card p-sm">
          <div className="flex items-start justify-between gap-xs">
            <div className="min-w-0">
              <p className="flex items-center gap-xxs text-caption-uppercase uppercase text-text-secondary">
                <FileSearch aria-hidden="true" className="h-3.5 w-3.5 text-accent" />
                {t('chat.task_panel.context_title')}
              </p>
              <p
                className="mt-xxs text-body-sm text-text-primary"
                data-testid="repo-context-status"
              >
                {repoContextLoading
                  ? t('chat.task_panel.context_indexing')
                  : repoContext === null
                    ? t('chat.task_panel.context_empty')
                    : t('chat.task_panel.context_ready', {
                        count: repoContext.file_count,
                        indexed: repoContext.indexed_count,
                      })}
              </p>
            </div>
            {onRefreshRepoContext !== undefined && (
              <button
                type="button"
                onClick={onRefreshRepoContext}
                className="rounded-md p-1 text-text-tertiary hover:bg-surface-strong hover:text-text-primary"
                title={t('chat.task_panel.refresh')}
                aria-label={t('chat.task_panel.refresh')}
                data-testid="repo-context-refresh"
              >
                <RefreshCw aria-hidden="true" className="h-4 w-4" />
              </button>
            )}
          </div>
          {repoContextError !== null && (
            <p className="mt-xs text-body-sm text-semantic-danger" data-testid="repo-context-error">
              {repoContextError}
            </p>
          )}
          {repoContext !== null && (
            <div
              className="mt-xs space-y-xxs text-body-sm text-text-secondary"
              data-testid="repo-context-preview"
            >
              <p>
                {t('chat.task_panel.languages')}:{' '}
                {repoContext.languages
                  .slice(0, 3)
                  .map((item) => `${item.language} ${item.files}`)
                  .join(', ') || '-'}
              </p>
              <p>
                {t('chat.task_panel.context_files')}: {shortPathList(repoContext.key_files)}
              </p>
              <p>
                {t('chat.task_panel.test_files')}: {shortPathList(repoContext.test_files)}
              </p>
              {repoContext.warnings.length > 0 && (
                <p className="text-text-secondary">{repoContext.warnings.join(' · ')}</p>
              )}
            </div>
          )}
        </article>

        <article className="min-w-0 rounded-md border border-hairline bg-surface-card p-sm">
          <p className="flex items-center gap-xxs text-caption-uppercase uppercase text-text-secondary">
            <PlayCircle aria-hidden="true" className="h-3.5 w-3.5 text-accent" />
            {t('chat.task_panel.task_title')}
          </p>
          <ol className="mt-xs grid grid-cols-2 gap-xxs text-[11px] text-text-secondary">
            {(['context_ready', 'planned', 'review_ready', 'testing'] as const).map((step) => {
              const active = state === step || state === 'applied';
              return (
                <li
                  key={step}
                  className={`rounded border px-xs py-xxs ${
                    active ? 'border-accent/50 bg-accent-soft text-text-primary' : 'border-hairline'
                  }`}
                  data-testid={`coding-task-state-${step}`}
                >
                  {t(`chat.task_panel.state.${step}`)}
                </li>
              );
            })}
          </ol>
          {hasRecovery && (
            <div className="mt-xs rounded-md border border-yellow-600/30 bg-yellow-900/10 p-xs text-body-sm text-text-secondary">
              <p className="flex items-center gap-xxs text-text-primary">
                <AlertTriangle aria-hidden="true" className="h-3.5 w-3.5 text-yellow-300" />
                {t('chat.task_panel.recovery_title')}
              </p>
              <div className="mt-xxs flex flex-wrap gap-xxs">
                {workspaceName === undefined && onPickWorkspace !== undefined && (
                  <button
                    type="button"
                    onClick={onPickWorkspace}
                    className="rounded-md border border-hairline bg-surface-card px-xs py-xxs text-text-primary hover:bg-surface-strong"
                    data-testid="coding-task-pick-workspace"
                  >
                    {t('chat.task_panel.pick_workspace')}
                  </button>
                )}
                {providerRecoverable && onOpenProviderSettings !== undefined && (
                  <button
                    type="button"
                    onClick={onOpenProviderSettings}
                    className="rounded-md border border-hairline bg-surface-card px-xs py-xxs text-text-primary hover:bg-surface-strong"
                    data-testid="coding-task-provider-settings"
                  >
                    {t('chat.task_panel.provider_settings')}
                  </button>
                )}
              </div>
            </div>
          )}
          <p className="mt-xs flex items-center gap-xxs text-body-sm text-text-secondary">
            <ShieldCheck aria-hidden="true" className="h-3.5 w-3.5 text-semantic-success" />
            {t('chat.task_panel.risk_note')}
          </p>
        </article>

        <article className="min-w-0 rounded-md border border-hairline bg-surface-card p-sm">
          <p className="flex items-center gap-xxs text-caption-uppercase uppercase text-text-secondary">
            <GitBranch aria-hidden="true" className="h-3.5 w-3.5 text-accent" />
            {t('chat.task_panel.handoff_title')}
          </p>
          <div className="mt-xs space-y-xs text-body-sm">
            {safeCommands.length === 0 ? (
              <p className="text-text-secondary">{t('chat.task_panel.no_safe_commands')}</p>
            ) : (
              <div className="flex flex-wrap gap-xxs" data-testid="safe-command-list">
                {safeCommands.map((command) => {
                  const result = commandResults[command.command];
                  return (
                    <button
                      key={command.command}
                      type="button"
                      onClick={() => onRunSafeCommand?.(command.command)}
                      disabled={onRunSafeCommand === undefined}
                      className={`rounded-md border px-xs py-xxs text-left hover:bg-surface-strong disabled:cursor-not-allowed ${commandTone(result)}`}
                      data-testid={`safe-command-${command.name}`}
                    >
                      <span className="block font-medium">{command.command}</span>
                      <span className="block text-[11px] opacity-80">
                        {result === undefined
                          ? t('chat.task_panel.command_ready')
                          : t('chat.task_panel.command_exit', {
                              code: result.exit_code ?? 'timeout',
                            })}
                      </span>
                    </button>
                  );
                })}
              </div>
            )}
            {Object.values(commandResults).length > 0 && (
              <p
                className="rounded-md border border-hairline bg-canvas-soft p-xs text-text-secondary"
                data-testid="command-result-summary"
              >
                {Object.values(commandResults).at(-1)?.summary}
              </p>
            )}
            <p className="text-text-secondary" data-testid="git-handoff-summary">
              {git?.is_repo
                ? t('chat.task_panel.git_summary', {
                    branch: git.branch ?? '-',
                    dirty: git.dirty_count,
                    staged: git.staged_count,
                    unstaged: git.unstaged_count,
                  })
                : t('chat.task_panel.git_unavailable')}
            </p>
            {git !== undefined && git.files.length > 0 && (
              <p className="text-text-secondary">
                {t('chat.task_panel.git_files')}: {shortPathList(git.files, 3)}
              </p>
            )}
            <p
              className="rounded-md border border-hairline bg-canvas-soft p-xs text-[11px] text-text-secondary"
              data-testid="commit-candidate"
            >
              {t('chat.task_panel.commit_candidate')}
            </p>
          </div>
        </article>
      </div>
    </section>
  );
}
