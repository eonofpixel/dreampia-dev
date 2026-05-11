/**
 * Input / Textarea — design system primitive (.omc/DESIGN.md v1.0 §Components.Input).
 *
 * canvas-soft background, 1px hairline, radius-md, body-md typography.
 * focus-visible 는 전역 css 가 처리 — accent ring 자동 적용.
 */

import { forwardRef } from 'react';
import type { InputHTMLAttributes, TextareaHTMLAttributes } from 'react';

const baseInputClasses =
  'w-full rounded-md bg-canvas-soft text-text-primary placeholder:text-text-tertiary border border-hairline focus-visible:border-accent transition-colors duration-fast ease-out disabled:opacity-50 disabled:cursor-not-allowed';

export type TextInputProps = InputHTMLAttributes<HTMLInputElement>;

export const TextInput = forwardRef<HTMLInputElement, TextInputProps>(function TextInput(
  { className, type = 'text', ...rest },
  ref
) {
  return (
    <input
      ref={ref}
      type={type}
      className={[baseInputClasses, 'h-10 px-sm text-body-md', className ?? ''].join(' ').trim()}
      {...rest}
    />
  );
});

export type TextareaProps = TextareaHTMLAttributes<HTMLTextAreaElement>;

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(function Textarea(
  { className, rows = 3, ...rest },
  ref
) {
  return (
    <textarea
      ref={ref}
      rows={rows}
      className={[baseInputClasses, 'px-sm py-xs text-body-md resize-y', className ?? '']
        .join(' ')
        .trim()}
      {...rest}
    />
  );
});
