/**
 * Button — design system primitive (.omc/DESIGN.md v1.0 §Components.Button).
 *
 * Variants: primary | secondary | ghost | danger | icon | link
 * Sizes:    sm (32px) | md (36px, default) | icon-md (32x32)
 *
 * 모든 variant 는 token-driven — arbitrary color/radius/shadow 사용 금지.
 * `focus-visible` 는 전역 css (*:focus-visible) 가 처리 — 추가 ring 불필요.
 */

import { forwardRef } from 'react';
import type { ButtonHTMLAttributes, ReactNode } from 'react';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'icon' | 'link';
export type ButtonSize = 'sm' | 'md';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  /** 좌측 아이콘 (lucide). Optional. */
  leadingIcon?: ReactNode;
  /** 우측 아이콘. Optional. */
  trailingIcon?: ReactNode;
}

const baseClasses =
  'inline-flex items-center justify-center gap-xxs rounded-md font-sans transition-colors duration-fast ease-out disabled:opacity-50 disabled:cursor-not-allowed';

const variantClasses: Record<ButtonVariant, string> = {
  primary: 'bg-accent text-white hover:bg-accent-hover active:bg-accent-hover',
  secondary:
    'bg-surface-card text-text-primary border border-hairline hover:bg-surface-strong active:bg-surface-strong',
  ghost: 'bg-transparent text-text-primary hover:bg-surface-strong active:bg-surface-strong',
  danger: 'bg-semantic-danger text-white hover:opacity-90 active:opacity-90',
  icon: 'bg-transparent text-text-secondary hover:bg-surface-strong hover:text-text-primary',
  link: 'bg-transparent text-accent hover:text-accent-hover underline-offset-2 hover:underline p-0 h-auto',
};

const sizeClasses: Record<ButtonSize, string> = {
  sm: 'h-8 px-sm text-button',
  md: 'h-9 px-base text-button',
};

const iconSizeClasses = 'h-8 w-8 p-0';

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'primary', size = 'md', leadingIcon, trailingIcon, className, children, ...rest },
  ref
) {
  const sizing = variant === 'icon' ? iconSizeClasses : variant === 'link' ? '' : sizeClasses[size];

  return (
    <button
      ref={ref}
      type={rest.type ?? 'button'}
      className={[baseClasses, variantClasses[variant], sizing, className ?? ''].join(' ').trim()}
      {...rest}
    >
      {leadingIcon}
      {children}
      {trailingIcon}
    </button>
  );
});
