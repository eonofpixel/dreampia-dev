/**
 * useCompare — v0.12.0 (I) hook unit tests.
 *
 * Verifies:
 *   1. Initial state: run=null, isRunning=false.
 *   2. start() seeds optimistic placeholder + calls compare API.
 *   3. Stream events (delta / done / complete) update local state.
 *   4. compare_complete sets isRunning=false.
 *   5. cancel() invokes compare.cancel IPC.
 *   6. start() failure path: onError called, isRunning false.
 *   7. reset() clears state.
 */

import { describe, it, expect, vi } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { useCompare } from '../../src/renderer/hooks/useCompare';
import { __mockStore, __emitCompareEvent } from '../setup';

const baseStartArgs = {
  prompt: 'hello',
  session_id: 'sess-1',
  workspace_root: 'C:\\workspace',
  permission_level: 'workspace_write' as const,
  claude_model: 'claude-3-5-sonnet-20241022',
  codex_model: 'gpt-5.5',
};

describe('useCompare', () => {
  it('initial state: run=null, isRunning=false', () => {
    const { result } = renderHook(() => useCompare());
    expect(result.current.run).toBeNull();
    expect(result.current.isRunning).toBe(false);
  });

  it('start() optimistically seeds placeholder + calls compare.run', async () => {
    const { result } = renderHook(() => useCompare());
    let runId: string | null = null;
    await act(async () => {
      runId = await result.current.start(baseStartArgs);
    });
    expect(runId).toBe(__mockStore.compareNextRunId);
    expect(result.current.isRunning).toBe(true);
    expect(result.current.run).not.toBeNull();
    expect(result.current.run?.prompt).toBe('hello');
    expect(result.current.run?.claude.model).toBe('claude-3-5-sonnet-20241022');
    expect(result.current.run?.codex.model).toBe('gpt-5.5');
    expect(result.current.run?.claude.status).toBe('pending');
  });

  it('stream delta + done events update side state', async () => {
    const { result } = renderHook(() => useCompare());
    await act(async () => {
      await result.current.start(baseStartArgs);
    });
    const runId = result.current.run?.id ?? '';
    await act(async () => {
      __emitCompareEvent({
        type: 'compare_side_delta',
        run_id: runId,
        side: 'claude',
        text_delta: 'Claude ',
      });
      __emitCompareEvent({
        type: 'compare_side_delta',
        run_id: runId,
        side: 'claude',
        text_delta: 'response',
      });
      __emitCompareEvent({
        type: 'compare_side_done',
        run_id: runId,
        side: 'claude',
      });
    });
    expect(result.current.run?.claude.text).toBe('Claude response');
    expect(result.current.run?.claude.status).toBe('done');
    // codex untouched.
    expect(result.current.run?.codex.text).toBe('');
    expect(result.current.run?.codex.status).toBe('pending');
  });

  it('compare_complete sets isRunning=false and authoritative run', async () => {
    const { result } = renderHook(() => useCompare());
    await act(async () => {
      await result.current.start(baseStartArgs);
    });
    const runId = result.current.run?.id ?? '';
    const finalRun = {
      id: runId,
      session_id: 'sess-1',
      prompt: 'hello',
      workspace_root: 'C:\\workspace',
      permission_level: 'workspace_write' as const,
      created_at: '2026-05-03T10:00:00.000Z',
      status: 'completed' as const,
      claude: {
        status: 'done' as const,
        model: 'claude-3-5-sonnet-20241022',
        text: 'final claude',
        error: null,
        started_at: '2026-05-03T10:00:00.000Z',
        finished_at: '2026-05-03T10:00:01.000Z',
      },
      codex: {
        status: 'done' as const,
        model: 'gpt-5.5',
        text: 'final codex',
        error: null,
        started_at: '2026-05-03T10:00:00.000Z',
        finished_at: '2026-05-03T10:00:01.500Z',
      },
    };
    await act(async () => {
      __emitCompareEvent({
        type: 'compare_complete',
        run_id: runId,
        run: finalRun,
      });
    });
    await waitFor(() => {
      expect(result.current.isRunning).toBe(false);
    });
    expect(result.current.run?.status).toBe('completed');
    expect(result.current.run?.claude.text).toBe('final claude');
    expect(result.current.run?.codex.text).toBe('final codex');
  });

  it('cancel() invokes compare.cancel IPC for active run', async () => {
    const { result } = renderHook(() => useCompare());
    await act(async () => {
      await result.current.start(baseStartArgs);
    });
    const runId = result.current.run?.id ?? '';
    await act(async () => {
      await result.current.cancel();
    });
    expect(__mockStore.compareCancelled.has(runId)).toBe(true);
  });

  it('start() failure path: onError fires, isRunning=false', async () => {
    const onError = vi.fn();
    const { result } = renderHook(() => useCompare({ onError }));
    __mockStore.compareRunBehavior = 'fail';
    await act(async () => {
      const id = await result.current.start(baseStartArgs);
      expect(id).toBeNull();
    });
    expect(onError).toHaveBeenCalledWith('mock compare fail');
    expect(result.current.isRunning).toBe(false);
  });

  it('reset() clears state', async () => {
    const { result } = renderHook(() => useCompare());
    await act(async () => {
      await result.current.start(baseStartArgs);
    });
    expect(result.current.run).not.toBeNull();
    act(() => {
      result.current.reset();
    });
    expect(result.current.run).toBeNull();
    expect(result.current.isRunning).toBe(false);
  });

  it('events for unrelated run_id are ignored', async () => {
    const { result } = renderHook(() => useCompare());
    await act(async () => {
      await result.current.start(baseStartArgs);
    });
    const beforeText = result.current.run?.claude.text ?? '';
    await act(async () => {
      __emitCompareEvent({
        type: 'compare_side_delta',
        run_id: 'unrelated-run-id-xxxx',
        side: 'claude',
        text_delta: 'should not apply',
      });
    });
    expect(result.current.run?.claude.text).toBe(beforeText);
  });
});
