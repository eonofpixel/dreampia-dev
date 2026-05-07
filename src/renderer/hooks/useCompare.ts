/**
 * useCompare — v0.12.0 (I) Cross-AI Verify/Compare 의 renderer-side state.
 *
 * Spec: ROADMAP.md (v0.12.0 I)
 *
 * 역할
 * ────
 *   - main 의 compare/* IPC 를 호출해 양쪽 (claude/codex) 동시 streaming 시작
 *   - compare/stream-event 를 구독해 양쪽 textaccumulator + status 갱신
 *   - cancel / accept (응답 채택 — caller 가 chat 에 inject) 보조
 *
 *   IPC 가 누락된 환경 (preload 깨짐 / non-Electron 테스트) 에서도 hook 자체는
 *   crash 없이 fallback 한다 — start 가 onError 를 한 번 호출하고 no-op.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import type { PermissionLevel } from '@/types';

// ────────────────────────────────────────────────────────────
// Public types — preload shape 와 sync. 별도 정의해 sandbox-safe 유지.
// ────────────────────────────────────────────────────────────

export type CompareSide = 'claude' | 'codex';

export type CompareSideStatus = 'pending' | 'streaming' | 'done' | 'error' | 'skipped';

export type CompareRunStatus = 'running' | 'completed' | 'failed';

export interface CompareSideResult {
  status: CompareSideStatus;
  model: string | null;
  text: string;
  error: string | null;
  started_at: string | null;
  finished_at: string | null;
}

export interface CompareRun {
  id: string;
  session_id: string;
  prompt: string;
  workspace_root: string;
  permission_level: PermissionLevel;
  created_at: string;
  status: CompareRunStatus;
  claude: CompareSideResult;
  codex: CompareSideResult;
}

export type CompareEvent =
  | { type: 'compare_start'; run_id: string }
  | {
      type: 'compare_side_delta';
      run_id: string;
      side: CompareSide;
      text_delta: string;
    }
  | { type: 'compare_side_done'; run_id: string; side: CompareSide }
  | {
      type: 'compare_side_error';
      run_id: string;
      side: CompareSide;
      error: string;
    }
  | { type: 'compare_complete'; run_id: string; run: CompareRun };

export interface UseCompareArgs {
  onError?: (msg: string) => void;
}

export interface CompareStartArgs {
  prompt: string;
  session_id: string;
  workspace_root: string;
  permission_level: PermissionLevel;
  claude_model: string;
  codex_model: string;
}

export interface UseCompareReturn {
  /** 현재 진행 중이거나 마지막에 완료된 run 의 in-memory state. null 이면 아직 시작 안함. */
  run: CompareRun | null;
  /** 진행 중인지 여부. compare_complete 이전엔 true. */
  isRunning: boolean;
  /**
   * compare 시작. resolved 시점에 run_id 가 담긴다 (또는 null — 시작 실패).
   * stream events 는 hook 내부에서 자동 구독.
   */
  start: (args: CompareStartArgs) => Promise<string | null>;
  /** mid-stream cancel. 현재 active run 이 있을 때만 동작. */
  cancel: () => Promise<void>;
  /** UI 가 모달을 닫을 때 호출 — 다음 start 가 fresh state 로 시작하도록. */
  reset: () => void;
}

// ────────────────────────────────────────────────────────────
// Helpers
// ────────────────────────────────────────────────────────────

function makeInitialSide(model: string | null): CompareSideResult {
  return {
    status: 'pending',
    model,
    text: '',
    error: null,
    started_at: null,
    finished_at: null,
  };
}

function applyEvent(prev: CompareRun | null, event: CompareEvent): CompareRun | null {
  if (event.type === 'compare_start') {
    // compare_start 는 start 응답에서 prepop 된 prev 를 그대로 유지하고
    // run_id 만 sync (이미 동일할 수 있음).
    if (prev === null) return prev;
    return { ...prev, id: event.run_id };
  }
  if (prev === null) return prev;
  if (prev.id !== event.run_id) return prev;
  if (event.type === 'compare_side_delta') {
    const side = prev[event.side];
    const next: CompareSideResult = {
      ...side,
      status: side.status === 'pending' ? 'streaming' : side.status,
      text: side.text + event.text_delta,
    };
    return { ...prev, [event.side]: next };
  }
  if (event.type === 'compare_side_done') {
    const side = prev[event.side];
    const next: CompareSideResult = {
      ...side,
      status: 'done',
      finished_at: side.finished_at ?? new Date().toISOString(),
    };
    return { ...prev, [event.side]: next };
  }
  if (event.type === 'compare_side_error') {
    const side = prev[event.side];
    const next: CompareSideResult = {
      ...side,
      status: 'error',
      error: event.error,
      finished_at: side.finished_at ?? new Date().toISOString(),
    };
    return { ...prev, [event.side]: next };
  }
  if (event.type === 'compare_complete') {
    // compare_complete 는 main 의 final row 를 그대로 받아 정확한 status /
    // text 로 sync. live accumulator 와 row 가 다를 수 있어 (e.g. side error 후
    // partial text 가 살짝 적게 들어오는 케이스) authoritative 로 채택.
    return event.run;
  }
  return prev;
}

// ────────────────────────────────────────────────────────────
// Hook
// ────────────────────────────────────────────────────────────

export function useCompare(args: UseCompareArgs = {}): UseCompareReturn {
  const [run, setRun] = useState<CompareRun | null>(null);
  const [isRunning, setIsRunning] = useState(false);
  const activeRunIdRef = useRef<string | null>(null);

  const onErrorRef = useRef(args.onError);
  onErrorRef.current = args.onError;

  // Subscribe to compare/stream-event once on mount. Filter by activeRunIdRef.
  useEffect(() => {
    const compareApi = typeof window !== 'undefined' ? window.dreampia?.compare : undefined;
    if (compareApi === undefined || typeof compareApi.onStreamEvent !== 'function') {
      return undefined;
    }
    const unsubscribe = compareApi.onStreamEvent((event) => {
      // 이벤트 run_id 가 현재 active 가 아니면 무시 (다른 hook 인스턴스의 run).
      if (activeRunIdRef.current === null || event.run_id !== activeRunIdRef.current) {
        // compare_start 는 첫 이벤트이므로 active 가 set 되어 있어야 한다.
        // 만약 race 로 activeRunIdRef 가 아직 set 되지 않은 상태에서 첫 이벤트가
        // 도달하면, 같은 run 이라고 간주해 적용.
        if (event.type === 'compare_start' && activeRunIdRef.current === null) {
          activeRunIdRef.current = event.run_id;
        } else {
          return;
        }
      }
      setRun((prev) => applyEvent(prev, event as CompareEvent));
      if (event.type === 'compare_complete') {
        setIsRunning(false);
      }
    });
    return unsubscribe;
  }, []);

  const start = useCallback(async (input: CompareStartArgs): Promise<string | null> => {
    const compareApi = typeof window !== 'undefined' ? window.dreampia?.compare : undefined;
    if (compareApi === undefined || typeof compareApi.run !== 'function') {
      onErrorRef.current?.('compare API unavailable');
      return null;
    }
    // Optimistic init — UI 는 즉시 'pending' 양쪽 표시.
    const placeholder: CompareRun = {
      id: '',
      session_id: input.session_id,
      prompt: input.prompt,
      workspace_root: input.workspace_root,
      permission_level: input.permission_level,
      created_at: new Date().toISOString(),
      status: 'running',
      claude: makeInitialSide(input.claude_model),
      codex: makeInitialSide(input.codex_model),
    };
    setRun(placeholder);
    setIsRunning(true);
    try {
      const result = await compareApi.run({
        session_id: input.session_id,
        prompt: input.prompt,
        workspace_root: input.workspace_root,
        permission_level: input.permission_level,
        claude_model: input.claude_model,
        codex_model: input.codex_model,
      });
      if (!result.ok) {
        onErrorRef.current?.(result.error);
        setIsRunning(false);
        return null;
      }
      activeRunIdRef.current = result.value.run_id;
      // run.id 갱신 — placeholder 의 빈 id 를 실제 run_id 로.
      setRun((prev) => (prev === null ? prev : { ...prev, id: result.value.run_id }));
      return result.value.run_id;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      onErrorRef.current?.(msg);
      setIsRunning(false);
      return null;
    }
  }, []);

  const cancel = useCallback(async (): Promise<void> => {
    const compareApi = typeof window !== 'undefined' ? window.dreampia?.compare : undefined;
    const runId = activeRunIdRef.current;
    if (compareApi === undefined || typeof compareApi.cancel !== 'function') return;
    if (runId === null) return;
    try {
      await compareApi.cancel(runId);
    } catch {
      // ignore — cancel best-effort
    }
  }, []);

  const reset = useCallback((): void => {
    activeRunIdRef.current = null;
    setRun(null);
    setIsRunning(false);
  }, []);

  return { run, isRunning, start, cancel, reset };
}
