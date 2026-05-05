/**
 * IpcPermissionConfirmer — v1.1.0 SEC-2 full contract.
 *
 * 검증 (Codex Q6 (3a)+(6)):
 *  1. confirm() 가 send 호출 + Promise pending.
 *  2. respond() 매칭 시 Promise resolve.
 *  3. timeout (default 60s) 시 'deny' resolve — fail-closed.
 *  4. send 가 false 반환하면 즉시 'deny'.
 *  5. send 가 throw 하면 console.error + 'deny'.
 *  6. respond() 미매칭 시 false 반환.
 *  7. drainAllAsDeny — shutdown 시 모든 pending deny.
 *  8. getPendingRequests — 현재 대기 중 목록.
 */

import { describe, it, expect, vi } from 'vitest';
import { IpcPermissionConfirmer } from '../../src/main/IpcPermissionConfirmer';
import type { PermissionRequest } from '../../src/tools';

function sampleRequest(overrides: Partial<PermissionRequest> = {}): PermissionRequest {
  return {
    request_id: 'req-1',
    session_id: 's1' as PermissionRequest['session_id'],
    turn_id: 't1' as PermissionRequest['turn_id'],
    call_id: 'c1' as PermissionRequest['call_id'],
    tool_id: 'mock.tool',
    capability: 'LOCAL_EXECUTE',
    target: { kind: 'path', value: '/tmp' },
    is_dangerous: false,
    tool_display_name: 'Mock Tool',
    requested_at: new Date().toISOString(),
    ...overrides,
  };
}

describe('IpcPermissionConfirmer', () => {
  it('confirm() 가 send 호출 + Promise pending', async () => {
    const sendSpy = vi.fn().mockReturnValue(true);
    const confirmer = new IpcPermissionConfirmer({ send: sendSpy, timeout_ms: 1_000_000 });
    const request = sampleRequest();
    const promise = confirmer.confirm(request);
    expect(sendSpy).toHaveBeenCalledTimes(1);
    expect(sendSpy).toHaveBeenCalledWith('permission/request', request);
    expect(confirmer.getPendingRequests().length).toBe(1);

    // resolve 시켜 promise 정리.
    confirmer.respond('req-1', 'once');
    const response = await promise;
    expect(response.decision).toBe('once');
  });

  it('respond() 매칭 시 Promise resolve + reason 보존', async () => {
    const confirmer = new IpcPermissionConfirmer({
      send: () => true,
      timeout_ms: 1_000_000,
    });
    const promise = confirmer.confirm(sampleRequest({ request_id: 'r-with-reason' }));
    const matched = confirmer.respond('r-with-reason', 'always', 'because debug');
    expect(matched).toBe(true);
    const response = await promise;
    expect(response.decision).toBe('always');
    expect(response.reason).toBe('because debug');
  });

  it('timeout 시 deny (fail-closed)', async () => {
    vi.useFakeTimers();
    const confirmer = new IpcPermissionConfirmer({
      send: () => true,
      timeout_ms: 100,
    });
    const promise = confirmer.confirm(sampleRequest({ request_id: 'r-timeout' }));
    vi.advanceTimersByTime(150);
    const response = await promise;
    expect(response.decision).toBe('deny');
    expect(confirmer.getPendingRequests().length).toBe(0);
    vi.useRealTimers();
  });

  it('send 가 false 반환하면 즉시 deny', async () => {
    const confirmer = new IpcPermissionConfirmer({
      send: () => false,
      timeout_ms: 1_000_000,
    });
    const response = await confirmer.confirm(sampleRequest({ request_id: 'r-nosend' }));
    expect(response.decision).toBe('deny');
    expect(confirmer.getPendingRequests().length).toBe(0);
  });

  it('send 가 throw 하면 deny + 정리', async () => {
    const confirmer = new IpcPermissionConfirmer({
      send: () => {
        throw new Error('send failed');
      },
      timeout_ms: 1_000_000,
    });
    const response = await confirmer.confirm(sampleRequest({ request_id: 'r-throw' }));
    expect(response.decision).toBe('deny');
  });

  it('respond() 미매칭 시 false', () => {
    const confirmer = new IpcPermissionConfirmer({
      send: () => true,
      timeout_ms: 1_000_000,
    });
    const matched = confirmer.respond('non-existent', 'once');
    expect(matched).toBe(false);
  });

  it('drainAllAsDeny — 모든 pending deny', async () => {
    const confirmer = new IpcPermissionConfirmer({
      send: () => true,
      timeout_ms: 1_000_000,
    });
    const p1 = confirmer.confirm(sampleRequest({ request_id: 'a' }));
    const p2 = confirmer.confirm(sampleRequest({ request_id: 'b' }));
    expect(confirmer.getPendingRequests().length).toBe(2);
    confirmer.drainAllAsDeny('test');
    const r1 = await p1;
    const r2 = await p2;
    expect(r1.decision).toBe('deny');
    expect(r2.decision).toBe('deny');
    expect(confirmer.getPendingRequests().length).toBe(0);
  });

  it('getPendingRequests — 동시 다중 요청 추적', async () => {
    const confirmer = new IpcPermissionConfirmer({
      send: () => true,
      timeout_ms: 1_000_000,
    });
    const p1 = confirmer.confirm(sampleRequest({ request_id: 'multi-1' }));
    const p2 = confirmer.confirm(sampleRequest({ request_id: 'multi-2' }));
    const pending = confirmer.getPendingRequests();
    expect(pending.length).toBe(2);
    const ids = pending.map((r) => r.request_id).sort();
    expect(ids).toEqual(['multi-1', 'multi-2']);
    // 정리.
    confirmer.respond('multi-1', 'deny');
    confirmer.respond('multi-2', 'deny');
    await Promise.all([p1, p2]);
  });
});
