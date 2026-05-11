/**
 * Card — design system primitive (.omc/DESIGN.md v1.0 §Components.Card).
 *
 * Variants:
 *   default   = surface-card + hairline border + radius-lg + space-lg padding
 *   elevated  = default + soft shadow on hover
 *   featured  = canvas-soft + 1px accent + radius-lg + space-xl padding
 *
 * inline html element 는 div — 다른 tag 가 필요하면 `as` prop 통해 override.
 */

import { forwardRef } from 'react';
import type { HTMLAttributes, ReactNode } from 'react';

export type CardVariant = 'default' | 'elevated' | 'featured';

export interface CardProps extends HTMLAttributes<HTMLDivElement> {
  variant?: CardVariant;
  children?: ReactNode;
}

const baseClasses = 'rounded-lg transition-shadow duration-fast ease-out';

const variantClasses: Record<CardVariant, string> = {
  default: 'bg-surface-card border border-hairline p-lg',
  elevated: 'bg-surface-card border border-hairline p-lg hover:shadow-soft',
  featured: 'bg-canvas-soft border border-accent p-xl',
};

export const Card = forwardRef<HTMLDivElement, CardProps>(function Card(
  { variant = 'default', className, children, ...rest },
  ref
) {
  return (
    <div
      ref={ref}
      className={[baseClasses, variantClasses[variant], className ?? ''].join(' ').trim()}
      {...rest}
    >
      {children}
    </div>
  );
});
