/**
 * useOnboarding test — Phase 3 B2 첫 실행 wizard 상태 hook.
 *
 * window.dreampia.app.{getOnboardingStatus, completeOnboarding} mock 은
 * tests/setup.ts 가 제공. __mockStore.onboardingCompleted 로 시나리오 조작.
 */

import { describe, it, expect, vi } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { useOnboarding } from '../../src/renderer/hooks/useOnboarding';
import { __mockStore } from '../setup';

describe('useOnboarding', () => {
  it('initial state is loading (completed === null)', () => {
    __mockStore.onboardingCompleted = false;
    const { result } = renderHook(() => useOnboarding());
    // 첫 렌더는 loading 상태 (IPC 응답 도착 전)
    expect(result.current.completed).toBeNull();
    expect(result.current.loading).toBe(true);
  });

  it('reflects completed=true when settings has it', async () => {
    __mockStore.onboardingCompleted = true;
    const { result } = renderHook(() => useOnboarding());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.completed).toBe(true);
  });

  it('reflects completed=false on first run (no settings)', async () => {
    __mockStore.onboardingCompleted = false;
    const { result } = renderHook(() => useOnboarding());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.completed).toBe(false);
  });

  it('complete() persists to main and updates state to true', async () => {
    __mockStore.onboardingCompleted = false;
    const { result } = renderHook(() => useOnboarding());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.completed).toBe(false);

    await act(async () => {
      await result.current.complete();
    });

    expect(result.current.completed).toBe(true);
    // setup.ts mock 가 store flag 도 갱신
    expect(__mockStore.onboardingCompleted).toBe(true);
  });

  it('complete() triggers IPC call', async () => {
    __mockStore.onboardingCompleted = false;
    const spy = window.dreampia.app.completeOnboarding as unknown as {
      mock: { calls: unknown[] };
    };
    const before = spy.mock.calls.length;

    const { result } = renderHook(() => useOnboarding());
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await result.current.complete();
    });

    expect(spy.mock.calls.length).toBe(before + 1);
  });

  it('handles ok:false from getOnboardingStatus → falls back to completed=false', async () => {
    const original = window.dreampia.app.getOnboardingStatus;
    window.dreampia.app.getOnboardingStatus = vi.fn(async () => ({
      ok: false as const,
      error: 'boom',
    }));
    try {
      const { result } = renderHook(() => useOnboarding());
      await waitFor(() => expect(result.current.loading).toBe(false));
      expect(result.current.completed).toBe(false);
    } finally {
      window.dreampia.app.getOnboardingStatus = original;
    }
  });

  // ────────────────────────────────────────────────────────────
  // v0.3.0 — reset method
  // ────────────────────────────────────────────────────────────

  describe('reset method (v0.3.0)', () => {
    it('reset() updates completed → false even if it was true', async () => {
      __mockStore.onboardingCompleted = true;
      const { result } = renderHook(() => useOnboarding());
      await waitFor(() => expect(result.current.loading).toBe(false));
      expect(result.current.completed).toBe(true);

      await act(async () => {
        await result.current.reset();
      });

      expect(result.current.completed).toBe(false);
      expect(__mockStore.onboardingCompleted).toBe(false);
    });

    it('reset() triggers IPC call', async () => {
      __mockStore.onboardingCompleted = true;
      const spy = window.dreampia.app.resetOnboarding as unknown as {
        mock: { calls: unknown[] };
      };
      const before = spy.mock.calls.length;

      const { result } = renderHook(() => useOnboarding());
      await waitFor(() => expect(result.current.loading).toBe(false));

      await act(async () => {
        await result.current.reset();
      });

      expect(spy.mock.calls.length).toBe(before + 1);
    });

    it('reset() handles missing IPC method gracefully (in-memory toggle only)', async () => {
      __mockStore.onboardingCompleted = true;
      const original = window.dreampia.app.resetOnboarding;
      const appAny = window.dreampia.app as unknown as Record<string, unknown>;
      appAny['resetOnboarding'] = undefined;
      try {
        const { result } = renderHook(() => useOnboarding());
        await waitFor(() => expect(result.current.loading).toBe(false));

        await act(async () => {
          await result.current.reset();
        });

        // IPC 미존재 → in-memory state 만 false 로 토글.
        expect(result.current.completed).toBe(false);
      } finally {
        appAny['resetOnboarding'] = original;
      }
    });
  });
});
