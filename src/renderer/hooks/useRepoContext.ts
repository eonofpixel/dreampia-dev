import { useCallback, useEffect, useState } from 'react';

import type { CommandRunResult, RepoContextSummary, RepoScriptSummary } from '@/types/workspace';

export interface UseRepoContextApi {
  summary: RepoContextSummary | null;
  loading: boolean;
  error: string | null;
  commandResults: Record<string, CommandRunResult>;
  refresh: () => Promise<void>;
  runCommand: (command: RepoScriptSummary['command']) => Promise<void>;
}

const SAFE_COMMANDS = new Set(['npm run typecheck', 'npm run lint', 'npm test']);

function hasWorkspaceApi(): boolean {
  return (
    typeof window !== 'undefined' &&
    window.dreampia !== undefined &&
    typeof window.dreampia.workspace === 'object' &&
    window.dreampia.workspace !== null
  );
}

export function useRepoContext(
  workspaceRoot: string | undefined,
  ignorePatterns: ReadonlyArray<string> | undefined
): UseRepoContextApi {
  const [summary, setSummary] = useState<RepoContextSummary | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [commandResults, setCommandResults] = useState<Record<string, CommandRunResult>>({});

  const refresh = useCallback(async (): Promise<void> => {
    if (workspaceRoot === undefined || !hasWorkspaceApi()) {
      setSummary(null);
      setLoading(false);
      setError(null);
      return;
    }
    const inspect = window.dreampia.workspace.inspect;
    if (typeof inspect !== 'function') {
      setSummary(null);
      setLoading(false);
      setError('workspace.inspect unavailable');
      return;
    }
    setLoading(true);
    setError(null);
    const result = await inspect({
      workspace_root: workspaceRoot,
      ignore_patterns: ignorePatterns === undefined ? undefined : [...ignorePatterns],
      max_files: 5000,
    });
    if (result.ok) {
      setSummary(result.value);
    } else {
      setSummary(null);
      setError(result.error);
    }
    setLoading(false);
  }, [ignorePatterns, workspaceRoot]);

  const runCommand = useCallback(
    async (command: RepoScriptSummary['command']): Promise<void> => {
      if (workspaceRoot === undefined || !hasWorkspaceApi()) {
        setError('workspace unavailable');
        return;
      }
      if (!SAFE_COMMANDS.has(command)) {
        setError(`unsafe command rejected: ${command}`);
        return;
      }
      const runner = window.dreampia.workspace.runSafeCommand;
      if (typeof runner !== 'function') {
        setError('workspace.runSafeCommand unavailable');
        return;
      }
      setError(null);
      const result = await runner({
        workspace_root: workspaceRoot,
        command: command as 'npm run typecheck' | 'npm run lint' | 'npm test',
      });
      if (result.ok) {
        setCommandResults((prev) => ({ ...prev, [command]: result.value }));
        return;
      }
      setError(result.error);
    },
    [workspaceRoot]
  );

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return { summary, loading, error, commandResults, refresh, runCommand };
}
