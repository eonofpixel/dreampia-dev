/**
 * PermissionDropdown — v0.8.0 H Permission Dropdown UI 테스트.
 *
 * 검증:
 *  - 현재 level 이 select 의 default value 로 표시
 *  - 4개 preset (read_only / workspace_write / full_access / custom) 모두 옵션
 *  - 변경 시 onChange 가 새 level 로 호출
 *  - disabled=true 일 때 select disabled
 *  - title attribute 가 사용자 친화적 한국어 라벨 포함
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { PermissionDropdown } from '../../src/renderer/components/chat/PermissionDropdown';

describe('PermissionDropdown (v0.8.0)', () => {
  it('renders with current level pre-selected', () => {
    render(<PermissionDropdown level="workspace_write" onChange={() => {}} />);
    const select = screen.getByTestId(
      'permission-dropdown-select'
    ) as HTMLSelectElement;
    expect(select.value).toBe('workspace_write');
  });

  it('lists all four presets as options', () => {
    render(<PermissionDropdown level="read_only" onChange={() => {}} />);
    const select = screen.getByTestId(
      'permission-dropdown-select'
    ) as HTMLSelectElement;
    const values = Array.from(select.options).map((o) => o.value);
    expect(values).toEqual([
      'read_only',
      'workspace_write',
      'full_access',
      'custom',
    ]);
  });

  it('renders Korean labels in options', () => {
    render(<PermissionDropdown level="read_only" onChange={() => {}} />);
    const select = screen.getByTestId(
      'permission-dropdown-select'
    ) as HTMLSelectElement;
    const labels = Array.from(select.options).map((o) => o.textContent);
    expect(labels).toContain('읽기 전용');
    expect(labels).toContain('워크스페이스 쓰기');
    expect(labels).toContain('전체 접근');
    expect(labels).toContain('사용자 지정');
  });

  it('calls onChange with new level when user selects', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<PermissionDropdown level="read_only" onChange={onChange} />);
    const select = screen.getByTestId(
      'permission-dropdown-select'
    ) as HTMLSelectElement;
    await user.selectOptions(select, 'full_access');
    expect(onChange).toHaveBeenCalledWith('full_access');
  });

  it('disables select when disabled=true', () => {
    render(
      <PermissionDropdown
        level="workspace_write"
        onChange={() => {}}
        disabled={true}
      />
    );
    const select = screen.getByTestId(
      'permission-dropdown-select'
    ) as HTMLSelectElement;
    expect(select).toBeDisabled();
  });

  it('exposes Korean label via title attribute', () => {
    render(<PermissionDropdown level="full_access" onChange={() => {}} />);
    const root = screen.getByTestId('permission-dropdown');
    expect(root.getAttribute('title')).toContain('전체 접근');
  });
});
