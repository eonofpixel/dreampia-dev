/**
 * Badge — design system primitive (.omc/DESIGN.md v1.0 §Components.Badge).
 *
 * Variants: neutral | accent | success | warning | danger
 * radius-pill, caption typography.
 */

import type { HTMLAttributes, ReactNode } from 'react';

export type BadgeVariant = 'neutral' | 'accent' | 'success' | 'warning' | 'danger';

export interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  variant?: BadgeVariant;
  /** ALL CAPS + tracked typography (caption-uppercase). 기본 false (caption). */
  uppercase?: boolean;
  children?: ReactNode;
}

const baseClasses = 'inline-flex items-center gap-xxs rounded-pill px-xs py-[2px] font-sans';

const variantClasses: Record<BadgeVariant, string> = {
  neutral: 'bg-surface-strong text-text-primary',
  accent: 'bg-accent text-white',
  success: 'bg-semantic-success/15 text-semantic-success',
  warning: 'bg-semantic-warning/15 text-semantic-warning',
  danger: 'bg-semantic-danger/15 text-semantic-danger',
};

export function Badge({
  variant = 'neutral',
  uppercase = false,
  className,
  children,
  ...rest
}: BadgeProps): React.JSX.Element {
  const typography = uppercase ? 'text-caption-uppercase uppercase' : 'text-caption';
  return (
    <span
      className={[baseClasses, variantClasses[variant], typography, className ?? '']
        .join(' ')
        .trim()}
      {...rest}
    >
      {children}
    </span>
  );
}
