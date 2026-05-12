/**
 * useRecorder — annotation voice memo MediaRecorder wrapper (v2.10.0 β-4).
 *
 * jsdom has no MediaRecorder / mediaDevices. We stub both via vi.stubGlobal
 * and drive the hook through a small fake recorder that we can manually
 * step through (start → dataavailable → stop / error).
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { useRecorder } from '../../../src/renderer/hooks/useRecorder';

// ────────────────────────────────────────────────────────────
// FakeMediaRecorder — minimal in-memory MediaRecorder shim.
// ────────────────────────────────────────────────────────────

class FakeMediaRecorder {
  static isTypeSupported(_: string): boolean {
    return true;
  }
  state: 'inactive' | 'recording' | 'paused' = 'inactive';
  ondataavailable: ((ev: { data: Blob }) => void) | null = null;
  onstop: (() => void) | null = null;
  onerror: (() => void) | null = null;
  constructor(public stream: MediaStream, public opts?: { mimeType?: string }) {}
  start(_timeslice?: number): void {
    this.state = 'recording';
  }
  stop(): void {
    if (this.state === 'inactive') return;
    this.state = 'inactive';
    this.onstop?.();
  }
  /** Test helper — emit a fake `dataavailable` blob. */
  __emit(size: number): void {
    const blob = new Blob([new Uint8Array(size)], { type: 'audio/webm' });
    this.ondataavailable?.({ data: blob });
  }
  /** Test helper — simulate an internal recorder error. */
  __error(): void {
    this.state = 'inactive';
    this.onerror?.();
  }
}

// Tracks the last instance so tests can drive it.
let lastRecorder: FakeMediaRecorder | null = null;

function installSuccessfulMediaStubs(): void {
  const fakeStream = {
    getTracks: () => [{ stop: vi.fn() }],
  } as unknown as MediaStream;
  vi.stubGlobal('navigator', {
    ...(globalThis.navigator ?? {}),
    mediaDevices: {
      getUserMedia: vi.fn(async () => fakeStream),
    },
  });
  const ctor = function (stream: MediaStream, opts?: { mimeType?: string }): FakeMediaRecorder {
    const inst = new FakeMediaRecorder(stream, opts);
    lastRecorder = inst;
    return inst;
  } as unknown as typeof MediaRecorder;
  (ctor as unknown as { isTypeSupported: (s: string) => boolean }).isTypeSupported = () => true;
  vi.stubGlobal('MediaRecorder', ctor);
}

function installRejectingGetUserMedia(reason = 'NotAllowedError'): void {
  vi.stubGlobal('navigator', {
    ...(globalThis.navigator ?? {}),
    mediaDevices: {
      getUserMedia: vi.fn(async () => {
        throw new Error(reason);
      }),
    },
  });
}

describe('useRecorder (v2.10.0 β-4)', () => {
  beforeEach(() => {
    lastRecorder = null;
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it('start() → state recording, elapsedMs ticks', async () => {
    installSuccessfulMediaStubs();
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const { result } = renderHook(() =>
      useRecorder({ maxDurationMs: 60_000, maxSizeBytes: 5_000_000 })
    );
    expect(result.current.state).toBe('idle');

    await act(async () => {
      await result.current.start();
    });
    expect(result.current.state).toBe('recording');

    await act(async () => {
      vi.advanceTimersByTime(500);
    });
    expect(result.current.elapsedMs).toBeGreaterThanOrEqual(250);
  });

  it('stop() → state stopped + blob populated', async () => {
    installSuccessfulMediaStubs();
    const { result } = renderHook(() =>
      useRecorder({ maxDurationMs: 60_000, maxSizeBytes: 5_000_000 })
    );
    await act(async () => {
      await result.current.start();
    });
    expect(lastRecorder).not.toBeNull();

    await act(async () => {
      lastRecorder!.__emit(1024);
    });
    await act(async () => {
      result.current.stop();
    });

    await waitFor(() => expect(result.current.state).toBe('stopped'));
    expect(result.current.blob).not.toBeNull();
    expect(result.current.blob!.size).toBe(1024);
  });

  it('60s duration cap → auto stop', async () => {
    installSuccessfulMediaStubs();
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const { result } = renderHook(() =>
      useRecorder({ maxDurationMs: 60_000, maxSizeBytes: 5_000_000 })
    );
    await act(async () => {
      await result.current.start();
    });
    // Push elapsed past 60s. Tick fires recorder.stop() → onstop → state.
    await act(async () => {
      vi.advanceTimersByTime(61_000);
    });
    await waitFor(() => expect(result.current.state).toBe('stopped'));
  });

  it('5MB size cap → auto stop + size_limit error', async () => {
    installSuccessfulMediaStubs();
    const { result } = renderHook(() =>
      useRecorder({ maxDurationMs: 60_000, maxSizeBytes: 5_242_880 })
    );
    await act(async () => {
      await result.current.start();
    });
    // Emit a single chunk over the cap → recorder.stop() runs in
    // ondataavailable, onstop fires synchronously, errorMessage set.
    await act(async () => {
      lastRecorder!.__emit(5_242_881);
    });
    await waitFor(() => expect(result.current.state).toBe('stopped'));
    expect(result.current.errorMessage).toBe('preview.annotation.mic.size_limit_reached');
  });

  it('getUserMedia rejection → state error + errorMessage', async () => {
    installRejectingGetUserMedia('NotAllowedError');
    const { result } = renderHook(() =>
      useRecorder({ maxDurationMs: 60_000, maxSizeBytes: 5_242_880 })
    );
    await act(async () => {
      await result.current.start();
    });
    expect(result.current.state).toBe('error');
    expect(result.current.errorMessage).toMatch(/NotAllowed|permission_denied/);
  });

  it('reset() → idle + blob/error cleared', async () => {
    installSuccessfulMediaStubs();
    const { result } = renderHook(() =>
      useRecorder({ maxDurationMs: 60_000, maxSizeBytes: 5_242_880 })
    );
    await act(async () => {
      await result.current.start();
    });
    await act(async () => {
      lastRecorder!.__emit(1024);
    });
    await act(async () => {
      result.current.stop();
    });
    await waitFor(() => expect(result.current.state).toBe('stopped'));

    await act(async () => {
      result.current.reset();
    });
    expect(result.current.state).toBe('idle');
    expect(result.current.blob).toBeNull();
    expect(result.current.errorMessage).toBeNull();
    expect(result.current.elapsedMs).toBe(0);
  });

  it('no mediaDevices → state error (i18n key)', async () => {
    vi.stubGlobal('navigator', {});
    const { result } = renderHook(() =>
      useRecorder({ maxDurationMs: 60_000, maxSizeBytes: 5_242_880 })
    );
    await act(async () => {
      await result.current.start();
    });
    expect(result.current.state).toBe('error');
    expect(result.current.errorMessage).toBe('preview.annotation.mic.permission_denied');
  });
});
