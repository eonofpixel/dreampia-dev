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
import { parsePermissionRequest } from '../tools/permissionRequestSchema';

const DEFAULT_TIMEOUT_MS = 60_000;

interface PendingDeferred {
  request: PermissionRequest;
  resolve: (response: PermissionResponse) => void;
  timeoutHandle: NodeJS.Timeout;
  /**
   * v1.1.3 hotfix (Codex Q9): send 시점에 캡처한 webContentsId. respond 시
   * 같은 webContents 만 수락 — 다른 창 (또는 spoofed sender) 차단.
   */
  webContentsId: number;
}

export interface IpcPermissionConfirmerOptions {
  /**
   * Renderer 로 IPC send 위임. main 의 BrowserWindow 가 이 함수 안에서 send 호출.
   *
   * v1.1.3 hotfix (Codex Q9): 반환값에 추적할 webContentsId 도 포함. respond
   * 시 같은 ID 의 webContents 만 수락. send 실패 시 -1 같은 sentinel 권고 X —
   * 단순 false 반환 (기존 호환).
   */
  send: (channel: string, payload: unknown) => boolean | { sent: boolean; web_contents_id: number };
  /** Auto deny timeout. default 60s. */
  timeout_ms?: number;
}

export class IpcPermissionConfirmer implements PermissionConfirmer {
  private readonly pending = new Map<string, PendingDeferred>();
  private readonly send: IpcPermissionConfirmerOptions['send'];
  private readonly timeoutMs: number;

  constructor(options: IpcPermissionConfirmerOptions) {
    this.send = options.send;
    this.timeoutMs = options.timeout_ms ?? DEFAULT_TIMEOUT_MS;
  }

  /**
   * Queue 가 호출. PermissionRequest 를 renderer 로 송신 + Promise 반환.
   *
   * v2.x (A2 wiring) — IPC boundary 에서 parsePermissionRequest 로 fail-closed
   * validation. malformed request (caller bug or future schema drift) 시 즉시
   * deny — renderer 에 잘못된 shape 가 새지 않음. parse 통과 시 원본 request
   * 그대로 전송 (caller 가 expectations 유지).
   */
  async confirm(request: PermissionRequest): Promise<PermissionResponse> {
    const parsed = parsePermissionRequest(request);
    if (parsed === null) {
      console.error(
        `[IpcPermissionConfirmer] parsePermissionRequest fail — malformed request rejected (id=${request.request_id})`
      );
      return { request_id: request.request_id, decision: 'deny' };
    }
    return new Promise<PermissionResponse>((resolve) => {
      const timeoutHandle = setTimeout(() => {
        if (!this.pending.has(request.request_id)) return;
        this.pending.delete(request.request_id);
        resolve({ request_id: request.request_id, decision: 'deny' });
      }, this.timeoutMs);

      // Renderer 미연결 / send 실패 시 즉시 deny — fail-closed.
      let sent = false;
      let webContentsId = -1;
      try {
        const result = this.send('permission/request', request);
        if (typeof result === 'boolean') {
          sent = result;
        } else {
          sent = result.sent;
          webContentsId = result.web_contents_id;
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error(`[IpcPermissionConfirmer] send threw: ${msg}`);
      }
      if (!sent) {
        clearTimeout(timeoutHandle);
        resolve({ request_id: request.request_id, decision: 'deny' });
        return;
      }

      this.pending.set(request.request_id, {
        request,
        resolve,
        timeoutHandle,
        webContentsId,
      });
    });
  }

  /**
   * Renderer 가 'permission/respond' 호출 시 ipc handler 가 본 메서드로
   * 위임. 매칭되는 pending 이 없으면 (timeout 후 응답 등) silently drop.
   *
   * v1.1.3 hotfix (Codex Q9): senderWebContentsId 가 confirm 시점의
   * webContentsId 와 일치할 때만 수락. 다른 webContents 에서 온 응답은
   * silently drop (audit X — 정상 흐름이 아닌 spoof 시도).
   *
   * v1.1.4 hotfix (Codex Q10): -1 sentinel 정리 — 이전엔 legacy boolean send
   * 호환을 위해 -1 (= 미추적) 이면 모든 sender 수락했음. production main 에는
   * 도달 불가능 (send 가 항상 {sent, web_contents_id} 반환) 이지만 future
   * footgun. 이제: senderWebContentsId 명시 + owner 가 -1 이면 fail-closed
   * (다른 sender 거절). senderWebContentsId 미지정만 호환 유지.
   */
  respond(
    request_id: string,
    decision: PermissionGrantDuration,
    reason?: string,
    senderWebContentsId?: number
  ): boolean {
    const deferred = this.pending.get(request_id);
    if (deferred === undefined) return false;
    if (senderWebContentsId !== undefined) {
      // owner -1 (미추적) + sender 명시 = fail-closed. 정상 production 안 옴.
      if (deferred.webContentsId === -1) {
        console.warn(
          `[IpcPermissionConfirmer] respond from wcid=${senderWebContentsId} ` +
            `but request owner is untracked (-1) — fail-closed drop`
        );
        return false;
      }
      if (deferred.webContentsId !== senderWebContentsId) {
        console.warn(
          `[IpcPermissionConfirmer] respond from wcid=${senderWebContentsId} ` +
            `does not match request owner wcid=${deferred.webContentsId} — dropped`
        );
        return false;
      }
    }
    clearTimeout(deferred.timeoutHandle);
    this.pending.delete(request_id);
    const response: PermissionResponse = { request_id, decision };
    if (reason !== undefined && reason.length > 0) response.reason = reason;
    deferred.resolve(response);
    return true;
  }

  /**
   * 현재 대기 중인 요청 목록 — UI 가 페이지 reload / mount 시 조회.
   *
   * v1.1.3 hotfix (Codex Q9): senderWebContentsId 지정 시 같은 webContents
   * 에서 온 요청만 노출. 미지정 시 모두 (테스트/legacy 호환).
   *
   * v1.1.4 hotfix (Codex Q10): -1 sentinel fail-closed — sender 명시 + owner
   * -1 인 request 는 노출 X.
   */
  getPendingRequests(senderWebContentsId?: number): PermissionRequest[] {
    const all = Array.from(this.pending.values());
    if (senderWebContentsId === undefined) return all.map((d) => d.request);
    return all.filter((d) => d.webContentsId === senderWebContentsId).map((d) => d.request);
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
