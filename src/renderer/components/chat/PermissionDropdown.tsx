/**
 * PermissionDropdown — v0.8.0 H Permission Dropdown.
 *
 * Spec: ROADMAP.md (v0.8.0 — Permission per-session)
 *
 * 채팅 헤더에 표시되는 작은 dropdown — 현재 세션의 permission.default_level 을
 * 표시 + 변경. 사용자 클릭 한 번으로 4개 preset 사이에서 전환 가능.
 *
 * UX 결정:
 *  - native <select> 가 OS-native dropdown 을 띄우므로 IME/포커스 충돌 0
 *    (custom dropdown 은 다른 모달과 겹치는 z-index 이슈가 잦다).
 *  - ShieldCheck icon + 한국어 라벨 — 현재 권한이 한 눈에 보이도록.
 *  - title 속성에 짧은 설명 — hover 시 tooltip.
 *  - readOnly=true 면 disabled — IPC 미지원 환경 (preload 깨짐) 에서 silent
 *    no-op 대신 명시적 readonly.
 *  - 변경 시 onChange callback 으로 위임 (App.tsx 가 IPC + local shadow 처리).
 */

import { ShieldCheck } from 'lucide-react';
import {
  PERMISSION_LEVEL_LABELS_KO,
  type PermissionLevel,
} from '@/types';

export interface PermissionDropdownProps {
  /** 현재 세션의 permission.default_level. 변경 시 새 level 로 onChange 호출. */
  level: PermissionLevel;
  /** 사용자가 새 level 을 선택했을 때 호출. async 가능 — caller 가 영속 + shadow. */
  onChange: (next: PermissionLevel) => void;
  /**
   * IPC 미지원 (preload 깨짐) 또는 스트리밍 중 등 변경 불가 시 true.
   * disabled select 처럼 회색 + 클릭 불가.
   */
  disabled?: boolean;
}

// 4 개 preset 모두 표시. 'custom' 도 노출 — 사용자가 grant 를 직접 관리하는
// 모드 진입점. 현재 v0.8.0 에선 selection 만 가능하고 grant 관리 UI 는
// v0.13.0 에서 추가.
const LEVELS: ReadonlyArray<PermissionLevel> = [
  'read_only',
  'workspace_write',
  'full_access',
  'custom',
];

export function PermissionDropdown({
  level,
  onChange,
  disabled = false,
}: PermissionDropdownProps): React.JSX.Element {
  return (
    <label
      className="flex items-center gap-1 rounded bg-bg-tertiary px-1.5 py-0.5 text-[11px] text-text-secondary hover:bg-border-primary"
      title={`현재 권한: ${PERMISSION_LEVEL_LABELS_KO[level]}. 클릭하여 변경.`}
      data-testid="permission-dropdown"
    >
      <ShieldCheck className="h-3 w-3" aria-hidden="true" />
      <span className="sr-only">권한</span>
      <select
        value={level}
        disabled={disabled}
        onChange={(e) => {
          const next = e.target.value as PermissionLevel;
          onChange(next);
        }}
        className="cursor-pointer bg-transparent text-[11px] outline-none disabled:cursor-not-allowed disabled:opacity-50"
        aria-label="세션 권한 레벨"
        data-testid="permission-dropdown-select"
      >
        {LEVELS.map((l) => (
          <option key={l} value={l}>
            {PERMISSION_LEVEL_LABELS_KO[l]}
          </option>
        ))}
      </select>
    </label>
  );
}
