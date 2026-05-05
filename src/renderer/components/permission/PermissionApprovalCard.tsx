/**
 * PermissionApprovalCard — v1.1.0 SEC-2 full inline approval.
 *
 * Spec: docs/v1.x-roadmap.md (SEC-2), Codex 외부 검토 Q6 (5c) inline default.
 *
 * 비-dangerous 요청은 본 card 가 ChatPanel 안에 inline 으로 mount.
 * dangerous 는 PermissionDangerModal 가 center modal 로 escalate.
 *
 * 4가지 결정 (Codex (4b)):
 *  - 이번 한 번만 허용 (once)
 *  - 이 세션 동안 허용 (session)
 *  - 항상 허용 (always — 영구 grant)
 *  - 거부 (deny)
 *
 * timeout 표시: 60초 카운트다운 (요청 시각 기준).
 */

import { useEffect, useState } from 'react';
import { useT } from '../../i18n';
import type {
  PermissionRequestUi,
  PermissionDecisionUi,
} from '../../hooks/usePermissionRequests';

export interface PermissionApprovalCardProps {
  request: PermissionRequestUi;
  onDecide: (decision: PermissionDecisionUi, reason?: string) => void;
}

export function PermissionApprovalCard({
  request,
  onDecide,
}: PermissionApprovalCardProps): React.JSX.Element {
  const t = useT();
  const remainingSec = useTimeoutCountdown(request.requested_at);

  return (
    <div
      className="my-3 rounded-md border border-yellow-700/40 bg-yellow-900/10 p-3"
      role="region"
      aria-label={t('permission.card.aria_label')}
      data-testid="permission-approval-card"
      data-request-id={request.request_id}
    >
      <header className="mb-2 flex items-center justify-between">
        <h4 className="text-sm font-semibold text-yellow-300">
          {t('permission.card.title', { tool: request.tool_display_name })}
        </h4>
        <span
          className="font-mono text-[11px] text-text-tertiary"
          data-testid="permission-approval-countdown"
        >
          {remainingSec}s
        </span>
      </header>

      <dl className="mb-3 space-y-1 text-xs">
        <div className="flex items-baseline justify-between gap-3">
          <dt className="flex-shrink-0 text-text-tertiary">
            {t('permission.card.capability')}
          </dt>
          <dd className="font-mono text-text-secondary">{request.capability}</dd>
        </div>
        <div className="flex items-baseline justify-between gap-3">
          <dt className="flex-shrink-0 text-text-tertiary">
            {t('permission.card.target')}
          </dt>
          <dd className="break-all font-mono text-text-secondary">
            {request.target.kind}: {request.target.value || '(global)'}
          </dd>
        </div>
        {request.hint !== undefined && request.hint.length > 0 && (
          <div className="text-text-tertiary">{request.hint}</div>
        )}
      </dl>

      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => onDecide('once')}
          className="rounded-md border border-border-primary bg-bg-secondary px-3 py-1 text-xs hover:bg-bg-tertiary"
          data-testid="permission-approval-once"
        >
          {t('permission.card.once')}
        </button>
        <button
          type="button"
          onClick={() => onDecide('session')}
          className="rounded-md border border-border-primary bg-bg-secondary px-3 py-1 text-xs hover:bg-bg-tertiary"
          data-testid="permission-approval-session"
        >
          {t('permission.card.session')}
        </button>
        <button
          type="button"
          onClick={() => onDecide('always')}
          className="rounded-md border border-emerald-600/40 bg-emerald-900/20 px-3 py-1 text-xs text-emerald-300 hover:bg-emerald-900/30"
          data-testid="permission-approval-always"
        >
          {t('permission.card.always')}
        </button>
        <div className="flex-1" />
        <button
          type="button"
          onClick={() => onDecide('deny')}
          className="rounded-md border border-red-600/40 bg-red-900/20 px-3 py-1 text-xs text-red-300 hover:bg-red-900/30"
          data-testid="permission-approval-deny"
        >
          {t('permission.card.deny')}
        </button>
      </div>
    </div>
  );
}

function useTimeoutCountdown(requestedAtIso: string): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const handle = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(handle);
  }, []);
  const start = Date.parse(requestedAtIso);
  if (!Number.isFinite(start)) return 60;
  const elapsed = Math.max(0, Math.floor((now - start) / 1000));
  return Math.max(0, 60 - elapsed);
}
