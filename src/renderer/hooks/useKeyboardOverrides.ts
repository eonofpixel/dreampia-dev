/**
 * useKeyboardOverrides — v0.10.0 (G F-025).
 *
 * Settings 모달의 [단축키] 패널이 영속한 사용자 지정 매핑을 IPC 로 fetch +
 * App.tsx 가 useKeyboardShortcuts 에 forward. 모달이 매핑을 갱신하면 onSet
 * 으로 즉시 in-memory state 도 갱신해 다음 keydown 부터 반영.
 *
 * IPC 미존재 (preload 깨짐 / 옛 빌드) 시 빈 object — 모든 단축키가 default 로
 * fallback. 사용자에게 visible error 는 표시하지 않음 (graceful degrade).
 *
 * Spec: ROADMAP.md (v0.10.0 Keyboard Command Layer)
 */

import { useCallback, useEffect, useState } from 'react';

export interface UseKeyboardOverridesResult {
  /** Action → combo override. 빈 object 면 모두 default. */
  overrides: Record<string, string>;
  /** IPC 응답 대기 중. fetch 직후엔 false. */
  loading: boolean;
  /** 모든 override 를 한 번에 영속 + state 갱신. 빈 object 면 default 복원. */
  save: (next: Record<string, string>) => Promise<boolean>;
  /** 모든 override 제거 (default 복원). */
  reset: () => Promise<boolean>;
}

export function useKeyboardOverrides(): UseKeyboardOverridesResult {
  const [overrides, setOverrides] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const appApi = typeof window !== 'undefined' ? window.dreampia?.app : undefined;
    if (appApi === undefined || typeof appApi.getKeyboardShortcuts !== 'function') {
      setLoading(false);
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const result = await appApi.getKeyboardShortcuts();
        if (cancelled) return;
        if (result.ok) setOverrides(result.value);
      } catch {
        // safe default 유지 (빈 object → 모두 default)
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const save = useCallback(async (next: Record<string, string>): Promise<boolean> => {
    // Optimistic local update — UI 가 즉시 반응.
    setOverrides({ ...next });
    const appApi = typeof window !== 'undefined' ? window.dreampia?.app : undefined;
    if (appApi === undefined || typeof appApi.setKeyboardShortcuts !== 'function') {
      return false;
    }
    try {
      const result = await appApi.setKeyboardShortcuts(next);
      return result.ok;
    } catch {
      return false;
    }
  }, []);

  const reset = useCallback(async (): Promise<boolean> => {
    return save({});
  }, [save]);

  return { overrides, loading, save, reset };
}
