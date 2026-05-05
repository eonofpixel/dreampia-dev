/**
 * ToastContainer — 통일된 toast 표시 영역 (v1.1.16).
 *
 * Spec: docs/v1.x-roadmap.md (P1 v1.1.x L/E/E + visual polish).
 *
 * fixed top-right 위치. ChatPanel / ChatHeader 가리지 않도록 z-index 30
 * (PermissionDangerModal 의 60 보다 낮음 — danger 가 toast 가림).
 *
 * 사용 (App.tsx):
 *   const toasts = useToasts();
 *   <ToastContainer toasts={toasts.list} onDismiss={toasts.dismiss} />
 */

import type { ToastItem, ToastKind } from '../../hooks/useToasts';
import { useT } from '../../i18n';

const KIND_ICON: Record<ToastKind, string> = {
  error: '✖',
  warning: '⚠',
  info: 'ℹ',
  success: '✓',
};

const KIND_CLASS: Record<ToastKind, string> = {
  error: 'border-red-600/50 bg-red-900/15 text-red-200',
  warning: 'border-yellow-600/50 bg-yellow-900/15 text-yellow-200',
  info: 'border-border-primary bg-bg-secondary text-text-primary',
  success: 'border-green-600/50 bg-green-900/15 text-green-200',
};

export interface ToastContainerProps {
  toasts: ReadonlyArray<ToastItem>;
  onDismiss: (id: string) => void;
}

export function ToastContainer({
  toasts,
  onDismiss,
}: ToastContainerProps): React.JSX.Element | null {
  const t = useT();
  if (toasts.length === 0) return null;
  return (
    <div
      className="pointer-events-none fixed top-4 right-4 z-30 flex flex-col gap-2"
      data-testid="toast-container"
      aria-live="polite"
      aria-atomic="false"
    >
      {toasts.map((toast) => (
        <div
          key={toast.id}
          role={toast.kind === 'error' || toast.kind === 'warning' ? 'alert' : 'status'}
          className={`pointer-events-auto w-[360px] max-w-[95vw] rounded-md border px-3 py-2 shadow-lg ${KIND_CLASS[toast.kind]}`}
          data-testid="toast-item"
          data-toast-kind={toast.kind}
        >
          <div className="flex items-start gap-2">
            <span aria-hidden className="text-sm leading-tight">
              {KIND_ICON[toast.kind]}
            </span>
            <div className="flex-1 min-w-0 text-xs">
              <p className="font-medium leading-snug">{toast.message}</p>
              {toast.detail !== undefined && toast.detail.length > 0 && (
                <p className="mt-0.5 break-words text-text-tertiary">{toast.detail}</p>
              )}
              {toast.retry !== undefined && (
                <button
                  type="button"
                  onClick={() => {
                    toast.retry?.();
                    onDismiss(toast.id);
                  }}
                  className="mt-1.5 rounded border border-current px-2 py-0.5 text-[11px] hover:bg-current/10"
                  data-testid="toast-retry"
                >
                  {t('toast.retry')}
                </button>
              )}
            </div>
            <button
              type="button"
              onClick={() => onDismiss(toast.id)}
              className="shrink-0 rounded px-1 text-[12px] leading-none opacity-70 hover:opacity-100"
              aria-label={t('toast.dismiss_aria')}
              data-testid="toast-dismiss"
            >
              ✕
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}
