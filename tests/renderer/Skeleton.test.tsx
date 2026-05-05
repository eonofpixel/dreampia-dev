/**
 * Skeleton component unit tests (v1.1.26).
 */

import { describe, it, expect, afterEach } from 'vitest';
import { render, cleanup } from '@testing-library/react';
import {
  Skeleton,
  SidebarSessionsSkeleton,
  ChatTurnSkeleton,
} from '../../src/renderer/components/skeleton/Skeleton';

afterEach(() => {
  cleanup();
});

describe('v1.1.26 — Skeleton', () => {
  it('default — div + animate-pulse + aria-hidden', () => {
    const { getByTestId } = render(<Skeleton className="h-4 w-12" />);
    const el = getByTestId('skeleton');
    expect(el.tagName).toBe('DIV');
    expect(el.className).toMatch(/animate-pulse/);
    expect(el.getAttribute('aria-hidden')).toBe('true');
  });

  it("as='span' — inline 영역", () => {
    const { getByTestId } = render(<Skeleton as="span" className="h-3 w-8" />);
    const el = getByTestId('skeleton');
    expect(el.tagName).toBe('SPAN');
  });

  it('ariaLabel 지정 시 role=status + aria-label', () => {
    const { getByTestId } = render(<Skeleton ariaLabel="세션 로딩 중" />);
    const el = getByTestId('skeleton');
    expect(el.getAttribute('role')).toBe('status');
    expect(el.getAttribute('aria-label')).toBe('세션 로딩 중');
    expect(el.getAttribute('aria-hidden')).toBe('false');
  });

  it('SidebarSessionsSkeleton — 5개 placeholder', () => {
    const { getByTestId, getAllByTestId } = render(<SidebarSessionsSkeleton />);
    expect(getByTestId('sidebar-sessions-skeleton')).toBeDefined();
    expect(getAllByTestId('skeleton').length).toBe(5);
  });

  it('ChatTurnSkeleton — 2 라인', () => {
    const { getByTestId, getAllByTestId } = render(<ChatTurnSkeleton />);
    expect(getByTestId('chat-turn-skeleton')).toBeDefined();
    expect(getAllByTestId('skeleton').length).toBe(2);
  });
});
