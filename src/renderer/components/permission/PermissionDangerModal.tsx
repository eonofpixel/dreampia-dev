/**
 * PermissionDangerModal — v1.1.0 SEC-2 full center modal escalation.
 *
 * Spec: docs/v1.x-roadmap.md (SEC-2), Codex 외부 검토 Q6 (5c).
 *
 * dangerous_pattern action='require_modal' 또는 외부 쓰기 / 삭제 / 업로드
 * 같은 high-risk capability 의 요청은 inline 카드 대신 center modal 로
 * 사용자가 명시적으로 dismiss 못 하도록 차단. accept / deny 명시 응답 필수.
 */

import { AlertTriangle } from 'lucide-react';
import { useState, useEffect } from 'react';
import { useT } from '../../i18n';
import type { PermissionRequestUi, PermissionDecisionUi } from '../../hooks/usePermissionRequests';

export interface PermissionDangerModalProps {
  request: PermissionRequestUi | null;
  onDecide: (decision: PermissionDecisionUi, reason?: string) => void;
}

export function PermissionDangerModal({
  request,
  onDecide,
}: PermissionDangerModalProps): React.JSX.Element | null {
  const t = useT();
  const [reason, setReason] = useState('');

  // request 가 바뀔 때마다 reason 초기화.
  useEffect(() => {
    if (request !== null) setReason('');
  }, [request?.request_id]);

  if (request === null) return null;

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60"
      role="alertdialog"
      aria-modal="true"
      aria-label={t('permission.danger.aria_label')}
      data-testid="permission-danger-modal"
      data-request-id={request.request_id}
    >
      <div className="w-[520px] max-w-[95vw] rounded-lg border border-red-600/60 bg-bg-primary p-5 shadow-xl">
        <h3
          className="mb-2 flex items-center gap-1.5 text-base font-semibold text-red-300"
          data-testid="permission-danger-modal-title"
        >
          <AlertTriangle aria-hidden="true" className="h-4 w-4 shrink-0" />
          <span>{t('permission.danger.title', { tool: request.tool_display_name })}</span>
        </h3>

        <p className="mb-3 text-sm text-text-secondary">{t('permission.danger.body')}</p>

        {/* v1.1.2 hotfix (Codex Q8): high-risk capability 는 server-side 에서
            session/always 응답을 once 로 강제 다운그레이드 — 사용자가
            "이번 한 번만" 외 다른 옵션을 선택했다고 착각하지 않도록 명시 고지. */}
        <p
          className="mb-3 rounded-md border border-red-600/40 bg-red-900/15 px-3 py-2 text-xs text-red-200"
          data-testid="permission-danger-once-only-notice"
        >
          {t('permission.danger.once_only_notice')}
        </p>

        <dl className="mb-3 space-y-1 rounded-md border border-red-600/30 bg-red-900/10 p-3 text-xs">
          <div className="flex items-baseline justify-between gap-3">
            <dt className="flex-shrink-0 text-text-tertiary">{t('permission.card.capability')}</dt>
            <dd className="font-mono text-text-primary">{request.capability}</dd>
          </div>
          <div className="flex items-baseline justify-between gap-3">
            <dt className="flex-shrink-0 text-text-tertiary">{t('permission.card.target')}</dt>
            <dd className="break-all font-mono text-text-primary">
              {request.target.kind}: {request.target.value || '(global)'}
            </dd>
          </div>
          {request.hint !== undefined && request.hint.length > 0 && (
            <div className="mt-1 text-yellow-300/80">{request.hint}</div>
          )}
        </dl>

        <label className="mb-3 block text-xs">
          <span className="mb-1 block text-text-tertiary">
            {t('permission.danger.reason_label')}
          </span>
          <textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={2}
            maxLength={500}
            className="w-full resize-none rounded-md border border-border-primary bg-bg-secondary px-2 py-1 text-xs"
            placeholder={t('permission.danger.reason_placeholder')}
            data-testid="permission-danger-reason"
          />
        </label>

        <div className="flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={() => onDecide('deny', reason)}
            className="rounded-md border border-red-600/40 bg-red-900/20 px-3 py-1.5 text-sm text-red-300 hover:bg-red-900/30"
            data-testid="permission-danger-deny"
          >
            {t('permission.card.deny')}
          </button>
          <button
            type="button"
            onClick={() => onDecide('once', reason)}
            className="rounded-md border border-border-primary bg-bg-secondary px-3 py-1.5 text-sm hover:bg-bg-tertiary"
            data-testid="permission-danger-once"
          >
            {t('permission.card.once')}
          </button>
        </div>
      </div>
    </div>
  );
}
