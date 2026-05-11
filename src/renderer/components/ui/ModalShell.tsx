/**
 * ModalShell — design system primitive (.omc/DESIGN.md v1.0 §Components.ModalShell).
 *
 * 9개 modal 의 공통 chrome 을 추출. backdrop + container + header/body/footer slot.
 *
 * Caller 책임:
 *   - escape / overlay click → onClose handler (window keydown 또는 onClose prop).
 *   - role: 기본 "dialog". danger 류는 caller 가 role="alertdialog" override.
 *   - aria-labelledby: caller 가 header 의 id 와 동일하게 지정 (default id 제공).
 *
 * Size variants (.omc/DESIGN.md):
 *   sm: 420 / md: 560 / lg: 720 / xl: 920
 */

import { useEffect } from 'react';
import type { ReactNode, MouseEvent } from 'react';
import { X } from 'lucide-react';
import { Button } from './Button';

export type ModalSize = 'sm' | 'md' | 'lg' | 'xl';

export interface ModalShellProps {
  open: boolean;
  size?: ModalSize;
  /** 호출자가 헤더 텍스트 또는 커스텀 노드 지정. */
  title: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  onClose: () => void;
  /** "alertdialog" 등으로 override. default "dialog". */
  role?: 'dialog' | 'alertdialog';
  /** caller 의 aria-labelledby 와 동일한 id (default: 'modal-shell-title'). */
  titleId?: string;
  /** Escape 키 무력화. saving 중 닫기 차단 등. */
  disableEscape?: boolean;
  /** overlay click 무력화. */
  disableOverlayClose?: boolean;
  /** 우상단 X 버튼 숨김. */
  hideCloseButton?: boolean;
  /** Modal chrome 에 적용할 추가 className. */
  className?: string;
  /** data-testid (테스트 hook). */
  'data-testid'?: string;
}

const sizeClasses: Record<ModalSize, string> = {
  sm: 'w-[420px]',
  md: 'w-[560px]',
  lg: 'w-[720px]',
  xl: 'w-[920px]',
};

export function ModalShell({
  open,
  size = 'md',
  title,
  children,
  footer,
  onClose,
  role = 'dialog',
  titleId = 'modal-shell-title',
  disableEscape = false,
  disableOverlayClose = false,
  hideCloseButton = false,
  className,
  'data-testid': testId,
}: ModalShellProps): React.JSX.Element | null {
  // Escape → onClose. open + !disableEscape 일 때만 활성.
  useEffect(() => {
    if (!open || disableEscape) return;
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener('keydown', onKey);
    return (): void => {
      window.removeEventListener('keydown', onKey);
    };
  }, [open, disableEscape, onClose]);

  if (!open) return null;

  const handleOverlayClick = (e: MouseEvent<HTMLDivElement>): void => {
    if (disableOverlayClose) return;
    // overlay 본인 클릭만 (자식 클릭 무시)
    if (e.target === e.currentTarget) onClose();
  };

  return (
    // Overlay click → onClose. Keyboard equivalent (Escape) is wired via the
    // window keydown listener in the useEffect above, so a dialog-role overlay
    // intentionally has only an onClick handler on itself.
    // eslint-disable-next-line jsx-a11y/click-events-have-key-events
    <div
      className="fixed inset-0 z-[60] flex items-start justify-center bg-black/60 pt-[8vh] backdrop-blur-[4px]"
      role={role}
      aria-modal="true"
      aria-labelledby={titleId}
      data-testid={testId}
      onClick={handleOverlayClick}
    >
      <div
        className={[
          'flex max-h-[84vh] flex-col rounded-md bg-surface-card shadow-card',
          sizeClasses[size],
          'max-w-[95vw]',
          className ?? '',
        ]
          .join(' ')
          .trim()}
      >
        <header className="flex items-center gap-xs border-b border-hairline px-lg py-base">
          <h2 id={titleId} className="flex-1 text-display-sm text-text-primary">
            {title}
          </h2>
          {hideCloseButton ? null : (
            <Button
              variant="icon"
              onClick={onClose}
              aria-label="Close"
              data-testid="modal-shell-close"
            >
              <X aria-hidden="true" className="h-4 w-4" />
            </Button>
          )}
        </header>
        <div className="flex-1 overflow-auto px-lg py-base text-body-md text-text-secondary">
          {children}
        </div>
        {footer === undefined ? null : (
          <footer className="flex items-center justify-end gap-xs border-t border-hairline px-lg py-base">
            {footer}
          </footer>
        )}
      </div>
    </div>
  );
}
