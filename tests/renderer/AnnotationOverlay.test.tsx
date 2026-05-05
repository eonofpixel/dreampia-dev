/**
 * AnnotationOverlay component unit tests (v1.2.4).
 */

import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, fireEvent, cleanup } from '@testing-library/react';
import { AnnotationOverlay } from '../../src/renderer/components/preview/AnnotationOverlay';

afterEach(() => {
  cleanup();
});

describe('v1.2.4 — AnnotationOverlay', () => {
  it("active=false → toolbar 숨김 + data-annotation-mode='off'", () => {
    const { getByTestId, queryByTestId } = render(
      <AnnotationOverlay active={false} />
    );
    const overlay = getByTestId('annotation-overlay');
    expect(overlay.getAttribute('data-annotation-mode')).toBe('off');
    expect(queryByTestId('annotation-overlay-toolbar')).toBeNull();
  });

  it("active=true → toolbar 표시 + data-annotation-mode='on'", () => {
    const { getByTestId } = render(<AnnotationOverlay active={true} />);
    expect(getByTestId('annotation-overlay').getAttribute('data-annotation-mode')).toBe('on');
    expect(getByTestId('annotation-overlay-toolbar')).toBeDefined();
  });

  it('onToggle button click 호출', () => {
    const fn = vi.fn();
    const { getByTestId } = render(
      <AnnotationOverlay active={true} onToggle={fn} />
    );
    fireEvent.click(getByTestId('annotation-overlay-toggle-off'));
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('onToggle 미지정 — 버튼 미표시', () => {
    const { queryByTestId } = render(<AnnotationOverlay active={true} />);
    expect(queryByTestId('annotation-overlay-toggle-off')).toBeNull();
  });
});
