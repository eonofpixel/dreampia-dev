/**
 * CostLimitModal — v1.0.12 (COST-2) hard limit 차단 알림.
 *
 * Spec: docs/v1.x-roadmap.md (COST-2), Codex 외부 검토.
 *
 * UX:
 *  - main IPC 의 ai/start-stream 이 COST_LIMIT_EXCEEDED 로 차단하면 App 이
 *    error JSON 파싱 후 본 모달 mount.
 *  - 사용자에게 한도 / 현재 사용량 / 다음 reset 일시 명확히 노출.
 *  - 옵션: [한도 늘리기] (Settings > 사용량) / [닫기].
 *  - "계속 진행" 버튼 X — Codex 결정 (4a): hard limit 은 차단, soft override
 *    필요하면 별도 명시 설정으로 분리.
 */

import { useT } from '../../i18n';
import { Button } from '../ui/Button';
import { ModalShell } from '../ui/ModalShell';

export type CostLimitBlockReason = 'limit_exceeded' | 'unknown_model_under_limit';

export interface CostLimitModalProps {
  open: boolean;
  onClose: () => void;
  /** "한도 늘리기" 클릭 — Settings > 사용량 탭 직접 open. */
  onOpenSettings?: () => void;
  reason: CostLimitBlockReason;
  /** 사용자 USD 한도 (설정값). undefined 면 표시 X. */
  limitUsd?: number;
  /** 영속된 MTD 합계. limit_exceeded 시 표시. */
  mtdTotalUsd?: number;
  /** MTD + reserved + 이번 turn estimate 합. */
  projectedTotalUsd?: number;
  /** main 이 보낸 raw hint (debug / fallback). */
  hint?: string;
}

export function CostLimitModal({
  open,
  onClose,
  onOpenSettings,
  reason,
  limitUsd,
  mtdTotalUsd,
  projectedTotalUsd,
  hint,
}: CostLimitModalProps): React.JSX.Element | null {
  const t = useT();
  if (!open) return null;

  const titleKey =
    reason === 'unknown_model_under_limit' ? 'cost.modal.unknown_title' : 'cost.modal.limit_title';
  const bodyKey =
    reason === 'unknown_model_under_limit' ? 'cost.modal.unknown_body' : 'cost.modal.limit_body';

  // v2.10.0 (.omc/DESIGN.md, modal migration A) — chrome 을 ModalShell + Button
  // 으로. role="alertdialog" 유지 (cost block 도 critical action). raw red-400
  // / emerald-400 / red-* → semantic tokens.
  return (
    <ModalShell
      open={open}
      size="md"
      role="alertdialog"
      title={
        <span className="text-semantic-danger" data-testid="cost-limit-modal-title">
          {t(titleKey)}
        </span>
      }
      titleId="cost-limit-modal-title"
      onClose={onClose}
      hideCloseButton={true}
      data-testid="cost-limit-modal"
      footer={
        <>
          {onOpenSettings !== undefined && (
            <Button
              variant="secondary"
              onClick={onOpenSettings}
              data-testid="cost-limit-modal-open-settings"
            >
              {t('cost.modal.open_settings')}
            </Button>
          )}
          <Button variant="primary" onClick={onClose} data-testid="cost-limit-modal-close">
            {t('cost.modal.close')}
          </Button>
        </>
      }
    >
      <div className="space-y-sm">
        <p className="text-body-sm text-text-secondary">{t(bodyKey)}</p>

        {/* 사용자가 자기 상태를 빠르게 파악할 표 */}
        <dl
          className="space-y-xxs rounded-md border border-hairline bg-canvas-soft p-sm text-caption"
          data-testid="cost-limit-modal-stats"
        >
          {limitUsd !== undefined && (
            <div className="flex items-center justify-between">
              <dt className="text-text-tertiary">{t('cost.modal.limit')}</dt>
              <dd className="font-mono">${limitUsd.toFixed(2)}</dd>
            </div>
          )}
          {mtdTotalUsd !== undefined && (
            <div className="flex items-center justify-between">
              <dt className="text-text-tertiary">{t('cost.modal.mtd')}</dt>
              <dd className="font-mono">${mtdTotalUsd.toFixed(4)}</dd>
            </div>
          )}
          {projectedTotalUsd !== undefined && (
            <div className="flex items-center justify-between">
              <dt className="text-text-tertiary">{t('cost.modal.projected')}</dt>
              <dd className="font-mono text-semantic-danger">${projectedTotalUsd.toFixed(4)}</dd>
            </div>
          )}
          <div className="flex items-center justify-between">
            <dt className="text-text-tertiary">{t('cost.modal.reset')}</dt>
            <dd className="font-mono text-semantic-success">{t('cost.modal.reset_value')}</dd>
          </div>
        </dl>

        {hint !== undefined && hint.length > 0 && (
          <p
            className="break-words font-mono text-caption text-text-tertiary"
            data-testid="cost-limit-modal-hint"
          >
            {hint}
          </p>
        )}
      </div>
    </ModalShell>
  );
}

/**
 * v1.0.12 (COST-2): main 이 보낸 stream error string 을 파싱.
 *
 * main 이 차단 시 JSON.stringify 한 payload 를 Result.error 로 보냄. 그 외
 * (네트워크 / spawn 실패 등) 에러는 plain string. 본 함수가 둘을 구분.
 *
 * @returns parsed COST_LIMIT_EXCEEDED payload 또는 null (다른 종류 에러).
 */
export interface ParsedCostLimitError {
  reason: CostLimitBlockReason;
  message: string;
  limit_usd?: number;
  mtd_total_usd?: number;
  projected_total_usd?: number;
}

export function parseCostLimitError(raw: string): ParsedCostLimitError | null {
  if (!raw.includes('COST_LIMIT_EXCEEDED')) return null;
  try {
    const obj = JSON.parse(raw) as {
      code?: string;
      message?: string;
      details?: {
        reason?: string;
        limit_usd?: number;
        mtd_total_usd?: number;
        projected_total_usd?: number;
      };
    };
    if (obj.code !== 'COST_LIMIT_EXCEEDED') return null;
    const reason = obj.details?.reason;
    if (reason !== 'limit_exceeded' && reason !== 'unknown_model_under_limit') {
      return null;
    }
    const out: ParsedCostLimitError = {
      reason,
      message: obj.message ?? '',
    };
    if (typeof obj.details?.limit_usd === 'number') out.limit_usd = obj.details.limit_usd;
    if (typeof obj.details?.mtd_total_usd === 'number')
      out.mtd_total_usd = obj.details.mtd_total_usd;
    if (typeof obj.details?.projected_total_usd === 'number')
      out.projected_total_usd = obj.details.projected_total_usd;
    return out;
  } catch {
    return null;
  }
}
