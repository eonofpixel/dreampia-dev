/**
 * EmptyState component unit tests (v1.1.27).
 */

import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, fireEvent, cleanup } from '@testing-library/react';
import { EmptyState } from '../../src/renderer/components/empty/EmptyState';

afterEach(() => {
  cleanup();
});

describe('v1.1.27 — EmptyState', () => {
  it('title 만 — minimum', () => {
    const { getByText, getByTestId } = render(<EmptyState title="채팅 없음" />);
    expect(getByTestId('empty-state')).toBeDefined();
    expect(getByText('채팅 없음')).toBeDefined();
  });

  it('icon + description', () => {
    const { getByText, getByTestId } = render(
      <EmptyState icon="📭" title="검색 결과 없음" description="다른 키워드를 시도해보세요." />
    );
    expect(getByText('📭')).toBeDefined();
    expect(getByText('검색 결과 없음')).toBeDefined();
    expect(getByText('다른 키워드를 시도해보세요.')).toBeDefined();
    void getByTestId;
  });

  it('action — 버튼 click 시 onClick 호출', () => {
    const onClick = vi.fn();
    const { getByTestId } = render(
      <EmptyState
        title="설정된 폴더 없음"
        action={{ label: '폴더 선택', onClick, testId: 'empty-pick-folder' }}
      />
    );
    const btn = getByTestId('empty-pick-folder');
    fireEvent.click(btn);
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('action testId 미지정 — default empty-state-action', () => {
    const { getByTestId } = render(
      <EmptyState title="x" action={{ label: 'go', onClick: () => {} }} />
    );
    expect(getByTestId('empty-state-action')).toBeDefined();
  });

  it('role=status (aria)', () => {
    const { getByTestId } = render(<EmptyState title="x" />);
    expect(getByTestId('empty-state').getAttribute('role')).toBe('status');
  });
});
