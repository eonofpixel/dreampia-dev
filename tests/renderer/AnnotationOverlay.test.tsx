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

describe('v1.6.0 — AnnotationOverlay drag-to-mark', () => {
  /**
   * jsdom 의 getBoundingClientRect 는 본 컴포넌트의 absolute inset-0 div 에
   * 대해 0,0,0,0 을 반환할 수 있어 mock 한다. PointerEvent client coords 는
   * overlay-relative 로 변환되므로 rect 가 (0,0) 기준이면 그대로 사용 가능.
   */
  function withPointer(
    fn: (overlay: HTMLElement) => void
  ): (overlay: HTMLElement) => void {
    return fn;
  }

  it('드래그 → onMark 호출 with bbox', () => {
    const onMark = vi.fn();
    const { getByTestId } = render(
      <AnnotationOverlay active={true} onMark={onMark} />
    );
    const overlay = getByTestId('annotation-overlay');
    withPointer((el) => {
      fireEvent.mouseDown(el, { button: 0, clientX: 10, clientY: 20 });
      fireEvent.mouseMove(el, { clientX: 80, clientY: 60 });
      fireEvent.mouseUp(el, { clientX: 80, clientY: 60 });
    })(overlay);
    expect(onMark).toHaveBeenCalledTimes(1);
    const arg = onMark.mock.calls[0]![0] as {
      x: number;
      y: number;
      w: number;
      h: number;
      captured_at: string;
    };
    expect(arg.x).toBe(10);
    expect(arg.y).toBe(20);
    expect(arg.w).toBe(70);
    expect(arg.h).toBe(40);
    expect(arg.captured_at).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it('역방향 드래그 (오른쪽 → 왼쪽) → bbox 의 x,y 가 작은 좌표', () => {
    const onMark = vi.fn();
    const { getByTestId } = render(
      <AnnotationOverlay active={true} onMark={onMark} />
    );
    const overlay = getByTestId('annotation-overlay');
    fireEvent.mouseDown(overlay, { button: 0, clientX: 100, clientY: 80 });
    fireEvent.mouseUp(overlay, { clientX: 30, clientY: 20 });
    expect(onMark).toHaveBeenCalledTimes(1);
    const arg = onMark.mock.calls[0]![0] as { x: number; y: number; w: number; h: number };
    expect(arg.x).toBe(30);
    expect(arg.y).toBe(20);
    expect(arg.w).toBe(70);
    expect(arg.h).toBe(60);
  });

  it('너무 작은 드래그 (4px 미만) → onMark 호출 X (실수 클릭 방지)', () => {
    const onMark = vi.fn();
    const { getByTestId } = render(
      <AnnotationOverlay active={true} onMark={onMark} />
    );
    const overlay = getByTestId('annotation-overlay');
    fireEvent.mouseDown(overlay, { button: 0, clientX: 50, clientY: 50 });
    fireEvent.mouseUp(overlay, { clientX: 51, clientY: 51 });
    expect(onMark).not.toHaveBeenCalled();
  });

  it('active=false 일 때 드래그 무시', () => {
    const onMark = vi.fn();
    const { getByTestId } = render(
      <AnnotationOverlay active={false} onMark={onMark} />
    );
    const overlay = getByTestId('annotation-overlay');
    fireEvent.mouseDown(overlay, { button: 0, clientX: 10, clientY: 10 });
    fireEvent.mouseUp(overlay, { clientX: 100, clientY: 100 });
    expect(onMark).not.toHaveBeenCalled();
  });

  it('boxes prop 으로 기존 box 시각화', () => {
    const boxes = [
      { x: 10, y: 20, w: 100, h: 50, captured_at: '2026-05-06T00:00:00.000Z' },
      { x: 200, y: 30, w: 60, h: 40, captured_at: '2026-05-06T00:01:00.000Z' },
    ];
    const { getByTestId } = render(
      <AnnotationOverlay active={true} boxes={boxes} />
    );
    expect(getByTestId('annotation-box-0')).toBeDefined();
    expect(getByTestId('annotation-box-1')).toBeDefined();
  });

  it('toolbar 클릭은 drag 시작 X (stopPropagation)', () => {
    const onMark = vi.fn();
    const onToggle = vi.fn();
    const { getByTestId } = render(
      <AnnotationOverlay active={true} onMark={onMark} onToggle={onToggle} />
    );
    const toolbar = getByTestId('annotation-overlay-toolbar');
    fireEvent.mouseDown(toolbar, { button: 0, clientX: 100, clientY: 5 });
    // overlay 자체에 mouseDown 안 갔으니 drag state 도 없음. 후속 mouseUp
    // 이 와도 onMark 호출 X.
    const overlay = getByTestId('annotation-overlay');
    fireEvent.mouseUp(overlay, { clientX: 200, clientY: 100 });
    expect(onMark).not.toHaveBeenCalled();
  });
});
