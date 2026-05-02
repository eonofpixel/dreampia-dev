/**
 * useWorkspace — 사용자가 picker 로 선택한 작업 폴더 상태.
 *
 * Phase 2: 새 세션이 만들어질 때 process.cwd() 가 아니라 사용자가 의도한
 * 폴더를 root 로 쓰도록. settings.json 에 main process 가 영속.
 *
 * 흐름:
 *   1) onMount: refresh() — main 의 workspace/get 으로 저장값 로드
 *   2) 사용자가 [폴더 변경] 클릭 → pick() → main 이 OS dialog → 결과 반영
 *
 * 격리: window.dreampia.workspace 미존재 시 (preload 미로드 / 테스트) 안전 fallback.
 *
 * Spec: docs/permission/levels.md (workspace 의 의도된 경로)
 */

import { useCallback, useEffect, useState } from 'react';

export interface WorkspaceInfo {
  path: string;
  name: string;
}

export interface UseWorkspaceApi {
  workspace: WorkspaceInfo | null;
  loading: boolean;
  error: string | null;
  /** OS folder dialog 를 열고 선택값 저장. 취소 시 null. */
  pick: () => Promise<WorkspaceInfo | null>;
  /** 디스크에서 다시 읽어 메모리 state 동기화. */
  refresh: () => Promise<void>;
}

function hasWorkspaceApi(): boolean {
  return (
    typeof window !== 'undefined' &&
    window.dreampia !== undefined &&
    typeof window.dreampia.workspace === 'object' &&
    window.dreampia.workspace !== null
  );
}

export function useWorkspace(): UseWorkspaceApi {
  const [workspace, setWorkspace] = useState<WorkspaceInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async (): Promise<void> => {
    if (!hasWorkspaceApi()) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    const result = await window.dreampia.workspace.get();
    if (result.ok) {
      setWorkspace(result.value);
    } else {
      setError(result.error);
    }
    setLoading(false);
  }, []);

  const pick = useCallback(async (): Promise<WorkspaceInfo | null> => {
    if (!hasWorkspaceApi()) return null;
    setError(null);
    const result = await window.dreampia.workspace.pickFolder();
    if (result.ok) {
      if (result.value !== null) {
        setWorkspace(result.value);
      }
      return result.value;
    }
    setError(result.error);
    return null;
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return { workspace, loading, error, pick, refresh };
}
