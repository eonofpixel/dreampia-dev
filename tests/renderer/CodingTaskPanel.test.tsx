import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { CodingTaskPanel } from '../../src/renderer/components/chat/CodingTaskPanel';
import type { CommandRunResult, RepoContextSummary } from '../../src/types/workspace';

const repoContext: RepoContextSummary = {
  root: '/repo',
  generated_at: '2026-01-01T00:00:00.000Z',
  status: 'ready',
  file_count: 42,
  indexed_count: 40,
  truncated: true,
  ignored_patterns: ['node_modules/**', '.git/**'],
  languages: [
    { language: 'TypeScript', files: 24, bytes: 1200 },
    { language: 'Markdown', files: 3, bytes: 200 },
  ],
  key_files: [
    { path: 'README.md', reason: 'project overview' },
    { path: 'src/renderer/App.tsx', reason: 'app entry' },
  ],
  test_files: [{ path: 'tests/renderer/App.test.tsx', reason: 'test candidate' }],
  scripts: [
    { name: 'typecheck', command: 'npm run typecheck' },
    { name: 'lint', command: 'npm run lint' },
    { name: 'test', command: 'npm test' },
  ],
  safe_commands: [
    { name: 'typecheck', command: 'npm run typecheck' },
    { name: 'lint', command: 'npm run lint' },
    { name: 'test', command: 'npm test' },
  ],
  source_roots: ['src', 'tests'],
  git: {
    is_repo: true,
    branch: 'feature/local-loop',
    dirty_count: 2,
    staged_count: 1,
    unstaged_count: 1,
    untracked_count: 0,
    files: [
      { path: 'README.md', status: 'M', staged: true, worktree: false },
      { path: 'src/renderer/App.tsx', status: 'M', staged: false, worktree: true },
    ],
  },
  warnings: ['scan limit reached'],
};

const typecheckResult: CommandRunResult = {
  command: 'npm run typecheck',
  cwd: '/repo',
  status: 'completed',
  exit_code: 0,
  stdout_tail: 'ok',
  stderr_tail: '',
  summary: 'npm run typecheck completed successfully.',
  started_at: '2026-01-01T00:00:00.000Z',
  ended_at: '2026-01-01T00:00:01.000Z',
};

describe('CodingTaskPanel', () => {
  it('shows repo context, safe commands, git handoff, and commit guidance', async () => {
    const user = userEvent.setup();
    const onRunSafeCommand = vi.fn();

    render(
      <CodingTaskPanel
        workspaceName="repo"
        turns={[]}
        isStreaming={false}
        repoContext={repoContext}
        repoContextLoading={false}
        repoContextError={null}
        commandResults={{ 'npm run typecheck': typecheckResult }}
        onRunSafeCommand={onRunSafeCommand}
      />
    );

    expect(screen.getByTestId('repo-context-preview')).toHaveTextContent('README.md');
    expect(screen.getByTestId('repo-context-preview')).toHaveTextContent(
      'tests/renderer/App.test.tsx'
    );
    expect(screen.getByTestId('command-result-summary')).toHaveTextContent('typecheck completed');
    expect(screen.getByTestId('git-handoff-summary')).toHaveTextContent('feature/local-loop');
    expect(screen.getByTestId('commit-candidate')).toHaveTextContent('Lore Commit Protocol');

    await user.click(screen.getByTestId('safe-command-typecheck'));
    expect(onRunSafeCommand).toHaveBeenCalledWith('npm run typecheck');
  });

  it('surfaces recoverable actions when workspace or provider is missing', () => {
    render(
      <CodingTaskPanel
        turns={[]}
        isStreaming={false}
        repoContext={null}
        repoContextLoading={false}
        repoContextError={null}
        commandResults={{}}
        providerRecoverable
        onPickWorkspace={vi.fn()}
        onOpenProviderSettings={vi.fn()}
      />
    );

    expect(screen.getByTestId('coding-task-pick-workspace')).toBeInTheDocument();
    expect(screen.getByTestId('coding-task-provider-settings')).toBeInTheDocument();
  });
});
