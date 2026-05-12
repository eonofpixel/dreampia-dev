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
import { Button } from '../ui/Button';
import { ModalShell } from '../ui/ModalShell';
import { Textarea } from '../ui/Input';
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
  const requestId = request?.request_id ?? null;

  // request_id 가 바뀔 때만 reason 초기화 — request 객체 ref 변동에는 반응 X.
  useEffect(() => {
    if (requestId !== null) setReason('');
  }, [requestId]);

  if (request === null) return null;

  // v2.10.0 (.omc/DESIGN.md, modal migration A) — chrome 을 ModalShell + Button
  // primitive 로. role="alertdialog" + Escape/overlay 차단 (사용자가 명시 응답
  // 해야 dismiss). 색은 semantic.danger 토큰 + accent 안 사용 (이 모달은 위험
  // 행위 알림 — accent 의 productive 톤과 어울리지 않음).
  return (
    <ModalShell
      open={true}
      size="md"
      role="alertdialog"
      titleId="permission-danger-modal-title"
      title={
        <span className="flex items-center gap-xxs text-semantic-danger">
          <AlertTriangle aria-hidden="true" className="h-4 w-4 shrink-0" />
          <span>{t('permission.danger.title', { tool: request.tool_display_name })}</span>
        </span>
      }
      onClose={() => onDecide('deny', reason)}
      disableEscape={true}
      disableOverlayClose={true}
      hideCloseButton={true}
      data-testid="permission-danger-modal"
      footer={
        <>
          <Button
            variant="danger"
            onClick={() => onDecide('deny', reason)}
            data-testid="permission-danger-deny"
          >
            {t('permission.card.deny')}
          </Button>
          <Button
            variant="secondary"
            onClick={() => onDecide('once', reason)}
            data-testid="permission-danger-once"
          >
            {t('permission.card.once')}
          </Button>
        </>
      }
    >
      <div data-request-id={request.request_id} className="space-y-sm">
        <p className="text-body-sm text-text-secondary">{t('permission.danger.body')}</p>

        {/* v1.1.2 hotfix (Codex Q8): high-risk capability 는 server-side 에서
            session/always 응답을 once 로 강제 다운그레이드 — 사용자가
            "이번 한 번만" 외 다른 옵션을 선택했다고 착각하지 않도록 명시 고지. */}
        <p
          className="rounded-md border border-semantic-danger/40 bg-semantic-danger/10 px-sm py-xs text-caption text-semantic-danger"
          data-testid="permission-danger-once-only-notice"
        >
          {t('permission.danger.once_only_notice')}
        </p>

        <dl className="space-y-xxs rounded-md border border-semantic-danger/30 bg-semantic-danger/5 p-sm text-caption">
          <div className="flex items-baseline justify-between gap-sm">
            <dt className="flex-shrink-0 text-text-tertiary">{t('permission.card.capability')}</dt>
            <dd className="font-mono text-text-primary">{request.capability}</dd>
          </div>
          <div className="flex items-baseline justify-between gap-sm">
            <dt className="flex-shrink-0 text-text-tertiary">{t('permission.card.target')}</dt>
            <dd className="break-all font-mono text-text-primary">
              {request.target.kind}: {request.target.value || '(global)'}
            </dd>
          </div>
          {request.hint !== undefined && request.hint.length > 0 && (
            <div className="mt-xxs text-semantic-warning">{request.hint}</div>
          )}
        </dl>

        <label className="block text-caption">
          <span className="mb-xxs block text-text-tertiary">
            {t('permission.danger.reason_label')}
          </span>
          <Textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={2}
            maxLength={500}
            placeholder={t('permission.danger.reason_placeholder')}
            data-testid="permission-danger-reason"
          />
        </label>
      </div>
    </ModalShell>
  );
}
