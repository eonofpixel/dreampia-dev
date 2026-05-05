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

describe('v1.1.3 hotfix — respond owner binding (Codex Q9)', () => {
  it('send 가 webContentsId 반환 시 confirm 시점 owner 캡처', async () => {
    const confirmer = new IpcPermissionConfirmer({
      send: () => ({ sent: true, web_contents_id: 42 }),
      timeout_ms: 1_000_000,
    });
    const promise = confirmer.confirm(sampleRequest({ request_id: 'owner-1' }));
    // 같은 webContentsId 의 respond — 수락.
    const matched = confirmer.respond('owner-1', 'once', undefined, 42);
    expect(matched).toBe(true);
    const response = await promise;
    expect(response.decision).toBe('once');
  });

  it('다른 webContents 에서 respond 시 silently drop', async () => {
    const confirmer = new IpcPermissionConfirmer({
      send: () => ({ sent: true, web_contents_id: 10 }),
      timeout_ms: 1_000_000,
    });
    const promise = confirmer.confirm(sampleRequest({ request_id: 'owner-2' }));
    // 다른 webContentsId — 거절.
    const matched = confirmer.respond('owner-2', 'always', undefined, 99);
    expect(matched).toBe(false);
    // pending 에는 그대로 남아있음.
    expect(confirmer.getPendingRequests().length).toBe(1);
    // 정상 owner 로 마무리.
    confirmer.respond('owner-2', 'deny', undefined, 10);
    const response = await promise;
    expect(response.decision).toBe('deny');
  });

  it('senderWebContentsId 미지정 시 모두 수락 (legacy/test 호환)', async () => {
    const confirmer = new IpcPermissionConfirmer({
      send: () => ({ sent: true, web_contents_id: 7 }),
      timeout_ms: 1_000_000,
    });
    const promise = confirmer.confirm(sampleRequest({ request_id: 'legacy-1' }));
    // senderWebContentsId 미지정 — 수락.
    const matched = confirmer.respond('legacy-1', 'once');
    expect(matched).toBe(true);
    await promise;
  });

  it('boolean send (legacy) — sender 미지정 시 수락, sender 명시 시 fail-closed', async () => {
    // v1.1.4 hotfix (Codex Q10): -1 sentinel 정리. legacy boolean send 는
    // owner 미추적 (-1) — production 도달 불가. sender 명시 시 fail-closed.
    const confirmer = new IpcPermissionConfirmer({
      send: () => true, // legacy boolean
      timeout_ms: 1_000_000,
    });
    const promise = confirmer.confirm(sampleRequest({ request_id: 'legacy-bool' }));
    // sender 명시 — fail-closed (production 정합성).
    const droppedMatched = confirmer.respond('legacy-bool', 'once', undefined, 999);
    expect(droppedMatched).toBe(false);
    // pending 그대로 유지.
    expect(confirmer.getPendingRequests().length).toBe(1);
    // sender 미지정 — 수락 (테스트 호환).
    const matched = confirmer.respond('legacy-bool', 'once');
    expect(matched).toBe(true);
    await promise;
  });

  it('getPendingRequests(senderId) 가 같은 webContents 만 반환', async () => {
    let nextSendId = 100;
    const confirmer = new IpcPermissionConfirmer({
      send: () => ({ sent: true, web_contents_id: nextSendId }),
      timeout_ms: 1_000_000,
    });
    nextSendId = 100;
    const p1 = confirmer.confirm(sampleRequest({ request_id: 'list-1' }));
    nextSendId = 200;
    const p2 = confirmer.confirm(sampleRequest({ request_id: 'list-2' }));

    // wcid 100 sender 시각 — list-1 만.
    const filtered100 = confirmer.getPendingRequests(100);
    expect(filtered100.map((r) => r.request_id)).toEqual(['list-1']);
    // wcid 200 sender 시각 — list-2 만.
    const filtered200 = confirmer.getPendingRequests(200);
    expect(filtered200.map((r) => r.request_id)).toEqual(['list-2']);
    // 미지정 시 모두.
    expect(confirmer.getPendingRequests().length).toBe(2);

    // 정리.
    confirmer.respond('list-1', 'deny', undefined, 100);
    confirmer.respond('list-2', 'deny', undefined, 200);
    await Promise.all([p1, p2]);
  });
});
