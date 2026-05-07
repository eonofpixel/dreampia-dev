/**
 * EmptyState — 통일된 빈 상태 placeholder (v1.1.27).
 *
 * Spec: docs/v1.x-roadmap.md (P1 v1.1.x L/E/E + visual polish).
 *
 * 사용:
 *  - 채팅이 0 일 때 Sidebar.
 *  - 검색 결과 0 일 때 Sidebar.
 *  - Plugin 0 일 때 PluginsModal — 이미 자체 처리, optional 통일.
 *  - 기타 list 영역.
 *
 * 디자인 원칙:
 *  - icon (선택) + title + description.
 *  - center align + 여유 padding.
 *  - 액션 버튼 (CTA) 옵션.
 */

interface EmptyStateProps {
  /** 큰 emoji 또는 lucide icon. 미지정 시 표시 X. */
  icon?: React.ReactNode;
  title: string;
  description?: string;
  /** Optional CTA 버튼. */
  action?: {
    label: string;
    onClick: () => void;
    /** testid for e2e — 미지정 시 'empty-state-action'. */
    testId?: string;
  };
  /** root 컨테이너 className 보강. */
  className?: string;
}

export function EmptyState({
  icon,
  title,
  description,
  action,
  className = '',
}: EmptyStateProps): React.JSX.Element {
  return (
    <div
      className={`flex flex-col items-center justify-center gap-2 px-6 py-10 text-center ${className}`}
      data-testid="empty-state"
      role="status"
    >
      {icon !== undefined && (
        <div className="text-2xl text-text-tertiary opacity-70" aria-hidden>
          {icon}
        </div>
      )}
      <p className="text-sm font-semibold text-text-secondary">{title}</p>
      {description !== undefined && (
        <p className="max-w-[320px] text-xs leading-relaxed text-text-tertiary">{description}</p>
      )}
      {action !== undefined && (
        <button
          type="button"
          onClick={action.onClick}
          className="mt-2 rounded border border-border-primary bg-bg-secondary px-3 py-1 text-xs hover:bg-bg-tertiary"
          data-testid={action.testId ?? 'empty-state-action'}
        >
          {action.label}
        </button>
      )}
    </div>
  );
}
