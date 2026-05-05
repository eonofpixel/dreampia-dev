/**
 * IpcPermissionConfirmer — main-side bridge for v1.1.0 SEC-2 full.
 *
 * Spec: docs/v1.x-roadmap.md (SEC-2), Codex 외부 검토 Q6 ((3a)+(4b)+(5c)+(6)).
 *
 * 책임:
 *  - Queue 의 PermissionConfirmer 인터페이스 구현.
 *  - confirm(request) 호출 시:
 *    1. 'permission/request' 를 renderer 로 send.
 *    2. response 를 in-memory Map<request_id, deferred> 에 등록.
 *    3. 60초 timeout — auto deny (fail-closed).
 *    4. Renderer 가 'permission/respond' invoke 시 deferred resolve.
 *
 * 전송:
 *  - Renderer ← main: webContents.send('permission/request', PermissionRequest)
 *  - Main ← renderer: ipcMain.handle('permission/respond', (id, decision, reason?))
 *
 * Codex 권고: Tools 모듈 (Queue) 가 Electron 직접 의존 X — 본 모듈이 main
 * 의 BrowserWindow / ipcMain 의 thin wrapper.
 */

import type {
  PermissionConfirmer,
  PermissionRequest,
  PermissionResponse,
  PermissionGrantDuration,
} from '@/tools';

const DEFAULT_TIMEOUT_MS = 60_000;

interface PendingDeferred {
  request: PermissionRequest;
  resolve: (response: PermissionResponse) => void;
  timeoutHandle: NodeJS.Timeout;
}

export interface IpcPermissionConfirmerOptions {
  /** Renderer 로 IPC send 위임. main 의 BrowserWindow 가 이 함수 안에서 send 호출. */
  send: (channel: string, payload: unknown) => boolean;
  /** Auto deny timeout. default 60s. */
  timeout_ms?: number;
}

export class IpcPermissionConfirmer implements PermissionConfirmer {
  private readonly pending = new Map<string, PendingDeferred>();
  private readonly send: (channel: string, payload: unknown) => boolean;
  private readonly timeoutMs: number;

  constructor(options: IpcPermissionConfirmerOptions) {
    this.send = options.send;
    this.timeoutMs = options.timeout_ms ?? DEFAULT_TIMEOUT_MS;
  }

  /**
   * Queue 가 호출. PermissionRequest 를 renderer 로 송신 + Promise 반환.
   */
  async confirm(request: PermissionRequest): Promise<PermissionResponse> {
    return new Promise<PermissionResponse>((resolve) => {
      const timeoutHandle = setTimeout(() => {
        if (!this.pending.has(request.request_id)) return;
        this.pending.delete(request.request_id);
        resolve({ request_id: request.request_id, decision: 'deny' });
      }, this.timeoutMs);

      this.pending.set(request.request_id, { request, resolve, timeoutHandle });

      // Renderer 미연결 / send 실패 시 즉시 deny — fail-closed.
      let sent = false;
      try {
        sent = this.send('permission/request', request);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error(`[IpcPermissionConfirmer] send threw: ${msg}`);
      }
      if (!sent) {
        clearTimeout(timeoutHandle);
        this.pending.delete(request.request_id);
        resolve({ request_id: request.request_id, decision: 'deny' });
      }
    });
  }

  /**
   * Renderer 가 'permission/respond' 호출 시 ipc handler 가 본 메서드로
   * 위임. 매칭되는 pending 이 없으면 (timeout 후 응답 등) silently drop.
   */
  respond(
    request_id: string,
    decision: PermissionGrantDuration,
    reason?: string
  ): boolean {
    const deferred = this.pending.get(request_id);
    if (deferred === undefined) return false;
    clearTimeout(deferred.timeoutHandle);
    this.pending.delete(request_id);
    const response: PermissionResponse = { request_id, decision };
    if (reason !== undefined && reason.length > 0) response.reason = reason;
    deferred.resolve(response);
    return true;
  }

  /**
   * 현재 대기 중인 요청 목록 — UI 가 페이지 reload / mount 시 조회.
   */
  getPendingRequests(): PermissionRequest[] {
    return Array.from(this.pending.values()).map((d) => d.request);
  }

  /**
   * Test / shutdown helper — 모든 pending 을 deny 로 즉시 종료.
   */
  drainAllAsDeny(reason: string = 'shutdown'): void {
    for (const [id, deferred] of this.pending.entries()) {
      clearTimeout(deferred.timeoutHandle);
      const response: PermissionResponse = {
        request_id: id,
        decision: 'deny',
        reason,
      };
      deferred.resolve(response);
    }
    this.pending.clear();
  }
}
