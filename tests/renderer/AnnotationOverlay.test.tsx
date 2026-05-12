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

describe('v1.6.0 — AnnotationOverlay drag-to-mark (region mode)', () => {
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

  // v2.10.0 β-2 — 기존 drag-to-mark 테스트는 region 모드 회귀 검증.
  // mode='region' 명시 (기본 'pick' 에선 drag 무시되도록 변경됨).
  it('드래그 → onMark 호출 with bbox (region mode)', () => {
    const onMark = vi.fn();
    const { getByTestId } = render(
      <AnnotationOverlay active={true} mode="region" onMark={onMark} />
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
      <AnnotationOverlay active={true} mode="region" onMark={onMark} />
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
      <AnnotationOverlay active={true} mode="region" onMark={onMark} />
    );
    const overlay = getByTestId('annotation-overlay');
    fireEvent.mouseDown(overlay, { button: 0, clientX: 50, clientY: 50 });
    fireEvent.mouseUp(overlay, { clientX: 51, clientY: 51 });
    expect(onMark).not.toHaveBeenCalled();
  });

  it('active=false 일 때 드래그 무시', () => {
    const onMark = vi.fn();
    const { getByTestId } = render(
      <AnnotationOverlay active={false} mode="region" onMark={onMark} />
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
      <AnnotationOverlay active={true} mode="region" onMark={onMark} onToggle={onToggle} />
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

// ────────────────────────────────────────────────────────────
// v2.10.0 β-2 (F-021 + F-033) — Annotation pick / segmented control
// ────────────────────────────────────────────────────────────
describe('v2.10.0 β-2 — Annotation pick mode + segmented control', () => {
  it("default mode='pick' — data-annotation-pick-mode 'pick'", () => {
    const { getByTestId } = render(<AnnotationOverlay active={true} />);
    const overlay = getByTestId('annotation-overlay');
    expect(overlay.getAttribute('data-annotation-pick-mode')).toBe('pick');
  });

  it("mode='pick' — drag 무시 (onMark 호출 X)", () => {
    const onMark = vi.fn();
    const { getByTestId } = render(
      <AnnotationOverlay active={true} mode="pick" onMark={onMark} />
    );
    const overlay = getByTestId('annotation-overlay');
    fireEvent.mouseDown(overlay, { button: 0, clientX: 10, clientY: 10 });
    fireEvent.mouseMove(overlay, { clientX: 80, clientY: 60 });
    fireEvent.mouseUp(overlay, { clientX: 80, clientY: 60 });
    expect(onMark).not.toHaveBeenCalled();
  });

  it('segmented control — onModeChange 호출 + radiogroup a11y', () => {
    const onModeChange = vi.fn();
    const { getByTestId, getByRole } = render(
      <AnnotationOverlay active={true} mode="pick" onModeChange={onModeChange} />
    );
    const group = getByRole('radiogroup');
    expect(group).toBeDefined();

    const pickRadio = getByTestId('annotation-mode-pick');
    const regionRadio = getByTestId('annotation-mode-region');
    expect(pickRadio.getAttribute('role')).toBe('radio');
    expect(regionRadio.getAttribute('role')).toBe('radio');
    expect(pickRadio.getAttribute('aria-checked')).toBe('true');
    expect(regionRadio.getAttribute('aria-checked')).toBe('false');

    fireEvent.click(regionRadio);
    expect(onModeChange).toHaveBeenCalledWith('region');
  });

  it('segmented control — region 활성 시 aria-checked 가 그쪽으로', () => {
    const { getByTestId } = render(
      <AnnotationOverlay active={true} mode="region" onModeChange={() => {}} />
    );
    expect(getByTestId('annotation-mode-pick').getAttribute('aria-checked')).toBe('false');
    expect(getByTestId('annotation-mode-region').getAttribute('aria-checked')).toBe('true');
  });

  it('hoverRect prop 주어지면 dashed outline 렌더', () => {
    const { getByTestId } = render(
      <AnnotationOverlay
        active={true}
        mode="pick"
        hoverRect={{ x: 5, y: 10, w: 100, h: 40 }}
      />
    );
    const outline = getByTestId('annotation-hover-outline');
    expect(outline).toBeDefined();
    expect(outline.style.left).toBe('5px');
    expect(outline.style.top).toBe('10px');
    expect(outline.style.width).toBe('100px');
    expect(outline.style.height).toBe('40px');
  });

  it('hoverRect null — outline 미렌더', () => {
    const { queryByTestId } = render(
      <AnnotationOverlay active={true} mode="pick" hoverRect={null} />
    );
    expect(queryByTestId('annotation-hover-outline')).toBeNull();
  });

  it("mode='region' 일 때 hoverRect 가 있어도 outline 렌더 X", () => {
    const { queryByTestId } = render(
      <AnnotationOverlay
        active={true}
        mode="region"
        hoverRect={{ x: 5, y: 10, w: 100, h: 40 }}
      />
    );
    expect(queryByTestId('annotation-hover-outline')).toBeNull();
  });

  it('onModeChange 미지정 — segmented control 숨김', () => {
    const { queryByTestId } = render(<AnnotationOverlay active={true} mode="pick" />);
    expect(queryByTestId('annotation-mode-segment')).toBeNull();
  });
});

// ────────────────────────────────────────────────────────────
// v2.10.0 β-3 (F-033 meta card) — Hover meta side card
// ────────────────────────────────────────────────────────────
describe('v2.10.0 β-3 — Annotation hover meta card', () => {
  const baseHoverRect = { x: 30, y: 40, w: 120, h: 60 };

  it('hoverMeta 주어지면 카드 렌더 + tag/classes/dimensions 텍스트 확인', () => {
    const { getByTestId } = render(
      <AnnotationOverlay
        active={true}
        mode="pick"
        hoverRect={baseHoverRect}
        hoverMeta={{
          tag: 'h3',
          dimensions: '120x60',
          classes: ['section-title', 'primary'],
          color: 'rgb(26, 28, 31)',
          bg_color: 'rgb(255, 255, 255)',
          font: 'Pretendard 16px',
        }}
      />
    );
    const card = getByTestId('annotation-hover-meta-card');
    expect(card).toBeDefined();
    // aria-hidden 으로 SR spam 회피.
    expect(card.getAttribute('aria-hidden')).toBe('true');
    // pointer-events: none — overlay 가 hover 를 받도록.
    expect(card.style.pointerEvents).toBe('none');

    // tag.classes 제목 표시.
    expect(getByTestId('annotation-hover-meta-title').textContent).toBe(
      '<h3.section-title.primary>'
    );
    // 색상 / 글꼴 / 크기 라인.
    expect(getByTestId('annotation-hover-meta-color').textContent).toContain('rgb(26, 28, 31)');
    expect(getByTestId('annotation-hover-meta-bg-color').textContent).toContain(
      'rgb(255, 255, 255)'
    );
    expect(getByTestId('annotation-hover-meta-font').textContent).toContain('Pretendard 16px');
    expect(getByTestId('annotation-hover-meta-dimensions').textContent).toContain('120x60');
  });

  it("hoverMeta.id 있으면 #id 라인 표시, 없으면 omit", () => {
    const { getByTestId, queryByTestId, rerender } = render(
      <AnnotationOverlay
        active={true}
        mode="pick"
        hoverRect={baseHoverRect}
        hoverMeta={{ tag: 'div', dimensions: '10x10', id: 'main-header' }}
      />
    );
    expect(getByTestId('annotation-hover-meta-id').textContent).toBe('#main-header');

    rerender(
      <AnnotationOverlay
        active={true}
        mode="pick"
        hoverRect={baseHoverRect}
        hoverMeta={{ tag: 'div', dimensions: '10x10' }}
      />
    );
    expect(queryByTestId('annotation-hover-meta-id')).toBeNull();
  });

  it('rgba(0,0,0,0) bg_color 는 "투명" 라벨로 변환', () => {
    const { getByTestId } = render(
      <AnnotationOverlay
        active={true}
        mode="pick"
        hoverRect={baseHoverRect}
        hoverMeta={{
          tag: 'span',
          dimensions: '40x20',
          bg_color: 'rgba(0, 0, 0, 0)',
        }}
      />
    );
    // default locale ko → "투명"
    expect(getByTestId('annotation-hover-meta-bg-color').textContent).toContain('투명');
  });

  it("mode='region' 일 때 hoverMeta 가 있어도 카드 미렌더", () => {
    const { queryByTestId } = render(
      <AnnotationOverlay
        active={true}
        mode="region"
        hoverRect={baseHoverRect}
        hoverMeta={{ tag: 'div', dimensions: '10x10' }}
      />
    );
    expect(queryByTestId('annotation-hover-meta-card')).toBeNull();
  });

  it('active=false 일 때 hoverMeta 가 있어도 카드 미렌더', () => {
    const { queryByTestId } = render(
      <AnnotationOverlay
        active={false}
        mode="pick"
        hoverRect={baseHoverRect}
        hoverMeta={{ tag: 'div', dimensions: '10x10' }}
      />
    );
    expect(queryByTestId('annotation-hover-meta-card')).toBeNull();
  });

  it('hoverRect 만 있고 hoverMeta 가 null 이면 카드 미렌더 (outline 만)', () => {
    const { queryByTestId, getByTestId } = render(
      <AnnotationOverlay
        active={true}
        mode="pick"
        hoverRect={baseHoverRect}
        hoverMeta={null}
      />
    );
    expect(queryByTestId('annotation-hover-meta-card')).toBeNull();
    // outline 은 그대로 렌더.
    expect(getByTestId('annotation-hover-outline')).toBeDefined();
  });
});

// ────────────────────────────────────────────────────────────
// v2.10.0 β-4 (F-021 inline panel + voice memo) — InlinePanel
// ────────────────────────────────────────────────────────────
describe('v2.10.0 β-4 — Annotation inline panel', () => {
  const draftBox = {
    x: 30,
    y: 40,
    w: 120,
    h: 60,
    captured_at: '2026-05-12T00:00:00.000Z',
  };

  it('pendingBox + onPanelSave wire → panel renders + textarea exists', () => {
    const { getByTestId } = render(
      <AnnotationOverlay
        active={true}
        pendingBox={draftBox}
        onPanelSave={() => {}}
        onPanelCancel={() => {}}
      />
    );
    expect(getByTestId('annotation-inline-panel')).toBeDefined();
    expect(getByTestId('annotation-inline-panel-textarea')).toBeDefined();
    expect(getByTestId('annotation-inline-panel-save')).toBeDefined();
    expect(getByTestId('annotation-inline-panel-cancel')).toBeDefined();
  });

  it('pendingBox=null → panel 미렌더', () => {
    const { queryByTestId } = render(
      <AnnotationOverlay active={true} pendingBox={null} onPanelSave={() => {}} />
    );
    expect(queryByTestId('annotation-inline-panel')).toBeNull();
  });

  it('save click → onPanelSave 호출 with comment + bbox', () => {
    const onSave = vi.fn();
    const { getByTestId } = render(
      <AnnotationOverlay
        active={true}
        pendingBox={draftBox}
        onPanelSave={onSave}
        onPanelCancel={() => {}}
      />
    );
    const ta = getByTestId('annotation-inline-panel-textarea') as HTMLTextAreaElement;
    fireEvent.change(ta, { target: { value: '여기 잘못됨' } });
    fireEvent.click(getByTestId('annotation-inline-panel-save'));

    expect(onSave).toHaveBeenCalledTimes(1);
    const final = onSave.mock.calls[0]![0] as {
      comment: string;
      x: number;
      y: number;
      captured_at: string;
    };
    expect(final.comment).toBe('여기 잘못됨');
    expect(final.x).toBe(30);
    expect(final.y).toBe(40);
    expect(final.captured_at).toBe(draftBox.captured_at);
  });

  it('cancel click → onPanelCancel 호출, onPanelSave 미호출', () => {
    const onSave = vi.fn();
    const onCancel = vi.fn();
    const { getByTestId } = render(
      <AnnotationOverlay
        active={true}
        pendingBox={draftBox}
        onPanelSave={onSave}
        onPanelCancel={onCancel}
      />
    );
    fireEvent.click(getByTestId('annotation-inline-panel-cancel'));
    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(onSave).not.toHaveBeenCalled();
  });

  it('Esc on textarea → onPanelCancel', () => {
    const onCancel = vi.fn();
    const { getByTestId } = render(
      <AnnotationOverlay
        active={true}
        pendingBox={draftBox}
        onPanelSave={() => {}}
        onPanelCancel={onCancel}
      />
    );
    fireEvent.keyDown(getByTestId('annotation-inline-panel-textarea'), { key: 'Escape' });
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it('saveAudio 미지정 — mic 버튼 disabled', () => {
    const { getByTestId } = render(
      <AnnotationOverlay
        active={true}
        pendingBox={draftBox}
        onPanelSave={() => {}}
        onPanelCancel={() => {}}
      />
    );
    const mic = getByTestId('annotation-inline-panel-mic') as HTMLButtonElement;
    expect(mic.disabled).toBe(true);
  });

  it('active=false → panel 미렌더 (pendingBox 있어도)', () => {
    const { queryByTestId } = render(
      <AnnotationOverlay
        active={false}
        pendingBox={draftBox}
        onPanelSave={() => {}}
        onPanelCancel={() => {}}
      />
    );
    expect(queryByTestId('annotation-inline-panel')).toBeNull();
  });
});
