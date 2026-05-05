/**
 * Skeleton — 통일된 loading placeholder (v1.1.26).
 *
 * Spec: docs/v1.x-roadmap.md (P1 v1.1.x L/E/E + visual polish).
 *
 * Tailwind animate-pulse + bg-bg-tertiary. 사용처:
 *  - Sidebar sessions list (loading 중)
 *  - 폴더 변경 후 file enumeration (mention popover)
 *  - MCP 연결 대기
 *  - 세션 hydration 중 (turns 가 아직 안 읽힘)
 */

interface SkeletonProps {
  /** 기본 'div'. inline 영역엔 'span'. */
  as?: 'div' | 'span';
  /** Tailwind 추가 className (높이/너비/모서리 등). */
  className?: string;
  /** 접근성. 기본 'aria-hidden=true' — 화면 reader 가 noise 로 안 듣게. */
  ariaLabel?: string;
}

export function Skeleton({
  as = 'div',
  className = '',
  ariaLabel,
}: SkeletonProps): React.JSX.Element {
  const base = 'animate-pulse rounded bg-bg-tertiary/60';
  if (as === 'span') {
    return (
      <span
        className={`inline-block ${base} ${className}`}
        aria-hidden={ariaLabel === undefined}
        {...(ariaLabel !== undefined && { 'aria-label': ariaLabel, role: 'status' })}
        data-testid="skeleton"
      />
    );
  }
  return (
    <div
      className={`${base} ${className}`}
      aria-hidden={ariaLabel === undefined}
      {...(ariaLabel !== undefined && { 'aria-label': ariaLabel, role: 'status' })}
      data-testid="skeleton"
    />
  );
}

/**
 * Sidebar sessions list 의 loading state 용 — 5개 세션 placeholder.
 */
export function SidebarSessionsSkeleton(): React.JSX.Element {
  return (
    <div className="flex flex-col gap-1 px-2 py-1" data-testid="sidebar-sessions-skeleton">
      {Array.from({ length: 5 }, (_, i) => (
        <Skeleton key={i} className="h-6 w-full" />
      ))}
    </div>
  );
}

/**
 * Chat turn 의 loading state 용 — text 라인 2개 placeholder.
 */
export function ChatTurnSkeleton(): React.JSX.Element {
  return (
    <div className="flex flex-col gap-2 p-3" data-testid="chat-turn-skeleton">
      <Skeleton className="h-3 w-3/4" />
      <Skeleton className="h-3 w-1/2" />
    </div>
  );
}
