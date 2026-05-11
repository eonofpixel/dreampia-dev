/**
 * UI primitives — re-export barrel.
 *
 * 단일 import path: `from '@/renderer/components/ui'`
 * 또는 relative `from '../ui'`.
 */

export { Button } from './Button';
export type { ButtonProps, ButtonVariant, ButtonSize } from './Button';

export { Card } from './Card';
export type { CardProps, CardVariant } from './Card';

export { Badge } from './Badge';
export type { BadgeProps, BadgeVariant } from './Badge';

export { TextInput, Textarea } from './Input';
export type { TextInputProps, TextareaProps } from './Input';

export { ModalShell } from './ModalShell';
export type { ModalShellProps, ModalSize } from './ModalShell';
