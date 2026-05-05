/**
 * usePermissionRequests — v1.1.0 SEC-2 full.
 *
 * Spec: docs/v1.x-roadmap.md (SEC-2), Codex 외부 검토 Q6.
 *
 * Renderer 가 main 의 IpcPermissionConfirmer 와 brokering. mount 시 이미 진행
 * 중인 요청 (e.g. 페이지 reload 후) 은 listPending 으로 복원.
 *
 * Codex 권고 (5c): inline ChatPanel approval card 가 기본, danger flag 시
 * center modal 로 escalate.
 */

import { useCallback, useEffect, useRef, useState } from 'react';

export interface PermissionRequestUi {
  request_id: string;
  session_id: string;
  turn_id: string;
  call_id: string;
  tool_id: string;
  capability: string;
  target: { kind: 'path' | 'url' | 'domain' | 'global'; value: string };
  hint?: string;
  is_dangerous: boolean;
  tool_display_name: string;
  requested_at: string;
}

export type PermissionDecisionUi = 'once' | 'session' | 'always' | 'deny';

export interface UsePermissionRequestsReturn {
  requests: ReadonlyArray<PermissionRequestUi>;
  /**
   * 현재 활성 (가장 오래된 pending). 사용자 attention 한 곳만. dangerous 는
   * 가장 위로 (center modal). 그 외엔 inline.
   */
  current: PermissionRequestUi | null;
  respond: (
    request_id: string,
    decision: PermissionDecisionUi,
    reason?: string
  ) => Promise<void>;
}

interface PermissionApi {
  onRequest: (listener: (req: PermissionRequestUi) => void) => () => void;
  respond: (
    request_id: string,
    decision: PermissionDecisionUi,
    reason?: string
  ) => Promise<{ ok: boolean }>;
  listPending: () => Promise<{ ok: boolean; value?: PermissionRequestUi[] }>;
}

function getApi(): PermissionApi | null {
  if (typeof window === 'undefined') return null;
  const w = window as unknown as { dreampia?: { permission?: PermissionApi } };
  const p = w.dreampia?.permission;
  if (p === undefined) return null;
  return p;
}

export function usePermissionRequests(): UsePermissionRequestsReturn {
  const [requests, setRequests] = useState<PermissionRequestUi[]>([]);
  const apiRef = useRef<PermissionApi | null>(null);

  // Mount: subscribe + initial pending refresh.
  useEffect(() => {
    apiRef.current = getApi();
    const api = apiRef.current;
    if (api === null) return undefined;

    let cancelled = false;
    void (async () => {
      try {
        const r = await api.listPending();
        if (!cancelled && r.ok && Array.isArray(r.value)) {
          setRequests(r.value);
        }
      } catch {
        // ignore — 초기 fetch 실패는 IPC 가 다음 onRequest 로 복구.
      }
    })();

    const unsub = api.onRequest((req) => {
      setRequests((prev) => {
        // 중복 (request_id 같음) 방지.
        if (prev.some((r) => r.request_id === req.request_id)) return prev;
        return [...prev, req];
      });
    });

    return () => {
      cancelled = true;
      unsub();
    };
  }, []);

  const respond = useCallback(
    async (
      request_id: string,
      decision: PermissionDecisionUi,
      reason?: string
    ): Promise<void> => {
      const api = apiRef.current;
      if (api === null) return;
      // Optimistic local removal — main 의 응답을 기다리지 않고 UI 정리.
      setRequests((prev) => prev.filter((r) => r.request_id !== request_id));
      try {
        await api.respond(request_id, decision, reason);
      } catch {
        // ignore — main 측 timeout / fail-closed 가 처리.
      }
    },
    []
  );

  // current: dangerous 우선 → 그 외엔 가장 오래된.
  const dangerous = requests.find((r) => r.is_dangerous);
  const current = dangerous ?? requests[0] ?? null;

  return { requests, current, respond };
}
