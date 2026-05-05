/**
 * useToasts unit tests (v1.1.16).
 *
 * 검증:
 *  - push 가 ToastItem 추가, ID 반환.
 *  - kind 별 default TTL.
 *  - 4 종 helper (error/warning/info/success).
 *  - dismiss 가 해당 항목 제거.
 *  - clear 가 모두 제거.
 *  - cap 5 — 6번째 push 시 oldest drop.
 *  - ttl_ms=0 → 자동 dismiss X.
 *  - 자동 dismiss timer (fake timers).
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useToasts } from '../../src/renderer/hooks/useToasts';

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('v1.1.16 — useToasts', () => {
  it('push 가 toast 추가 + ID 반환', () => {
    const { result } = renderHook(() => useToasts());
    let id = '';
    act(() => {
      id = result.current.push('info', 'hello');
    });
    expect(id).toMatch(/^t/);
    expect(result.current.list.length).toBe(1);
    expect(result.current.list[0]?.message).toBe('hello');
    expect(result.current.list[0]?.kind).toBe('info');
  });

  it('error helper 가 kind=error 생성', () => {
    const { result } = renderHook(() => useToasts());
    act(() => {
      result.current.error('err msg', { detail: 'stack trace' });
    });
    expect(result.current.list[0]?.kind).toBe('error');
    expect(result.current.list[0]?.detail).toBe('stack trace');
  });

  it('warning / info / success helpers', () => {
    const { result } = renderHook(() => useToasts());
    act(() => {
      result.current.warning('w');
      result.current.info('i');
      result.current.success('s');
    });
    const kinds = result.current.list.map((t) => t.kind);
    expect(kinds).toEqual(['warning', 'info', 'success']);
  });

  it('dismiss 가 해당 항목만 제거', () => {
    const { result } = renderHook(() => useToasts());
    let idA = '';
    let idB = '';
    act(() => {
      idA = result.current.error('A');
      idB = result.current.error('B');
    });
    expect(result.current.list.length).toBe(2);
    act(() => {
      result.current.dismiss(idA);
    });
    expect(result.current.list.length).toBe(1);
    expect(result.current.list[0]?.id).toBe(idB);
  });

  it('clear 가 모두 제거', () => {
    const { result } = renderHook(() => useToasts());
    act(() => {
      result.current.error('x');
      result.current.warning('y');
    });
    act(() => {
      result.current.clear();
    });
    expect(result.current.list.length).toBe(0);
  });

  it('cap 5 — 6번째 push 시 oldest drop', () => {
    const { result } = renderHook(() => useToasts());
    act(() => {
      for (let i = 0; i < 6; i += 1) {
        result.current.info(`m${i}`);
      }
    });
    expect(result.current.list.length).toBe(5);
    expect(result.current.list[0]?.message).toBe('m1');
    expect(result.current.list[4]?.message).toBe('m5');
  });

  it('자동 dismiss — error 8s 후 사라짐', () => {
    const { result } = renderHook(() => useToasts());
    act(() => {
      result.current.error('auto');
    });
    expect(result.current.list.length).toBe(1);
    act(() => {
      vi.advanceTimersByTime(8_000);
    });
    expect(result.current.list.length).toBe(0);
  });

  it('자동 dismiss — info 4s 후 사라짐', () => {
    const { result } = renderHook(() => useToasts());
    act(() => {
      result.current.info('auto');
    });
    act(() => {
      vi.advanceTimersByTime(4_000);
    });
    expect(result.current.list.length).toBe(0);
  });

  it('ttl_ms=0 → 자동 dismiss X (수동 dismiss 만)', () => {
    const { result } = renderHook(() => useToasts());
    act(() => {
      result.current.error('persistent', { ttl_ms: 0 });
    });
    act(() => {
      vi.advanceTimersByTime(60_000);
    });
    expect(result.current.list.length).toBe(1);
  });

  it('retry callback 보존', () => {
    const { result } = renderHook(() => useToasts());
    const retry = vi.fn();
    act(() => {
      result.current.error('failed', { retry });
    });
    expect(result.current.list[0]?.retry).toBe(retry);
  });
});
