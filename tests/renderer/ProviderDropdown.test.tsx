/**
 * ProviderDropdown — v1.5.2 (ChatHeader provider quick-access).
 *
 * 검증:
 *  - controlled 모드에서 4개 옵션 (auto/claude/codex/mock) 표시
 *  - 사용자 선택 시 onChange 가 새 값으로 호출
 *  - 외부 disabled prop 우선 적용
 *  - 한국어 라벨 (자동/Claude/Codex/Mock) 옵션에 포함
 *  - title attribute 가 현재 라벨 노출
 *  - self-managed 모드에서 IPC 미가용 시 disabled
 *  - self-managed 모드에서 mount 시 getDefaultProvider 호출 + 결과 반영
 *  - self-managed 모드에서 onChange 시 setDefaultProvider 호출
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ProviderDropdown } from '../../src/renderer/components/chat/ProviderDropdown';

describe('ProviderDropdown — controlled mode (v1.5.2)', () => {
  it('renders with current value pre-selected', () => {
    render(
      <ProviderDropdown
        controlled={{ value: 'claude', onChange: () => {} }}
      />
    );
    const select = screen.getByTestId(
      'provider-dropdown-select'
    ) as HTMLSelectElement;
    expect(select.value).toBe('claude');
  });

  it('lists all four providers as options', () => {
    render(
      <ProviderDropdown
        controlled={{ value: 'auto', onChange: () => {} }}
      />
    );
    const select = screen.getByTestId(
      'provider-dropdown-select'
    ) as HTMLSelectElement;
    const values = Array.from(select.options).map((o) => o.value);
    expect(values).toEqual(['auto', 'claude', 'codex', 'mock']);
  });

  it('renders Korean labels in options', () => {
    render(
      <ProviderDropdown
        controlled={{ value: 'auto', onChange: () => {} }}
      />
    );
    const select = screen.getByTestId(
      'provider-dropdown-select'
    ) as HTMLSelectElement;
    const labels = Array.from(select.options).map((o) => o.textContent);
    expect(labels).toContain('자동');
    expect(labels).toContain('Claude');
    expect(labels).toContain('Codex');
    expect(labels).toContain('Mock');
  });

  it('calls onChange with new value when user selects', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(
      <ProviderDropdown controlled={{ value: 'auto', onChange }} />
    );
    const select = screen.getByTestId(
      'provider-dropdown-select'
    ) as HTMLSelectElement;
    await user.selectOptions(select, 'codex');
    expect(onChange).toHaveBeenCalledWith('codex');
  });

  it('disables select when external disabled=true', () => {
    render(
      <ProviderDropdown
        controlled={{ value: 'auto', onChange: () => {} }}
        disabled={true}
      />
    );
    const select = screen.getByTestId(
      'provider-dropdown-select'
    ) as HTMLSelectElement;
    expect(select).toBeDisabled();
  });

  it('exposes current label via title attribute', () => {
    render(
      <ProviderDropdown
        controlled={{ value: 'mock', onChange: () => {} }}
      />
    );
    const root = screen.getByTestId('provider-dropdown');
    expect(root.getAttribute('title')).toContain('Mock');
  });

  it('keeps select enabled in controlled mode without external disabled', () => {
    render(
      <ProviderDropdown
        controlled={{ value: 'auto', onChange: () => {} }}
      />
    );
    const select = screen.getByTestId(
      'provider-dropdown-select'
    ) as HTMLSelectElement;
    expect(select).not.toBeDisabled();
  });
});

describe('ProviderDropdown — self-managed via IPC', () => {
  let getMock: ReturnType<typeof vi.fn>;
  let setMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    getMock = vi.fn(async () => ({ ok: true, value: 'codex' }));
    setMock = vi.fn(async () => ({ ok: true, value: undefined }));
    (window as unknown as { dreampia: unknown }).dreampia = {
      app: {
        getDefaultProvider: getMock,
        setDefaultProvider: setMock,
      },
    };
  });

  afterEach(() => {
    delete (window as unknown as { dreampia?: unknown }).dreampia;
  });

  it('calls getDefaultProvider on mount + reflects loaded value', async () => {
    render(<ProviderDropdown />);
    await waitFor(() => {
      const select = screen.getByTestId(
        'provider-dropdown-select'
      ) as HTMLSelectElement;
      expect(select.value).toBe('codex');
    });
    expect(getMock).toHaveBeenCalledTimes(1);
  });

  it('calls setDefaultProvider on user selection', async () => {
    const user = userEvent.setup();
    render(<ProviderDropdown />);
    await waitFor(() => {
      const select = screen.getByTestId(
        'provider-dropdown-select'
      ) as HTMLSelectElement;
      expect(select.value).toBe('codex');
    });
    const select = screen.getByTestId(
      'provider-dropdown-select'
    ) as HTMLSelectElement;
    await user.selectOptions(select, 'mock');
    expect(setMock).toHaveBeenCalledWith('mock');
    expect(select.value).toBe('mock'); // optimistic
  });

  it('disables select when IPC absent', async () => {
    delete (window as unknown as { dreampia?: unknown }).dreampia;
    render(<ProviderDropdown />);
    await waitFor(() => {
      const select = screen.getByTestId(
        'provider-dropdown-select'
      ) as HTMLSelectElement;
      expect(select).toBeDisabled();
    });
  });
});
