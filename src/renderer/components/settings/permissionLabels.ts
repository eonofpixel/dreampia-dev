/**
 * permissionLabels — locale-aware Permission level label resolver.
 *
 * v0.11.0 (B2 English i18n). 기존 PERMISSION_LEVEL_LABELS_KO 는 src/types 에
 * 위치한 한국어 전용 표지. v0.11.0 에선 i18n key 를 통해 ko/en 둘 다 지원.
 *
 * 호출 패턴:
 *   import { useT } from '../../i18n';
 *   import { localizedPermissionLabel } from './permissionLabels';
 *   const t = useT();
 *   const label = localizedPermissionLabel(t, level);
 *
 * 키 매핑:
 *   read_only        → 'permission.read_only'
 *   workspace_write  → 'permission.workspace_write'
 *   full_access      → 'permission.full_access'
 *   custom           → 'permission.custom'
 *
 * Spec: ROADMAP.md (v0.11.0 B2 English i18n)
 */

import type { PermissionLevel } from '@/types';

/** Translation function signature compatible with `t` from `../../i18n`. */
type TFn = (key: string, params?: Record<string, string | number>) => string;

const PERMISSION_KEY_MAP: Record<PermissionLevel, string> = {
  read_only: 'permission.read_only',
  workspace_write: 'permission.workspace_write',
  full_access: 'permission.full_access',
  custom: 'permission.custom',
};

/**
 * 현재 locale 에 맞춰 PermissionLevel 의 사람-읽기 라벨을 반환.
 *
 * 누락된 키는 i18n module 의 t() 가 자동으로 한국어 fallback → key string
 * 순서로 처리 (visible "i18n miss" indicator).
 */
export function localizedPermissionLabel(t: TFn, level: PermissionLevel): string {
  return t(PERMISSION_KEY_MAP[level]);
}
