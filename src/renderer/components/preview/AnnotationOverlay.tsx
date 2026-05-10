/**
 * AnnotationOverlay — PreviewPanel 의 DOM Inspector / Annotation 모드.
 *
 * Spec: docs/v1.x-roadmap.md (P2 v1.2.4 stub → v1.6.0 element pick + bbox).
 *
 * v1.2.4 → v1.6.0 진화:
 *   - active toggle 유지.
 *   - drag-to-mark — 사용자가 overlay 위 영역을 드래그해 bounding box 캡처.
 *   - 캡처된 boxes 시각화 + 마지막 box 의 [전송] 버튼.
 *   - onMark(box) callback — 부모가 chat 으로 전송 / annotation block 생성.
 *
 * 한계 (v1.6.0 partial scope):
 *   - 실제 element pick (DOM `:hover` 인식) 은 webview 내부 script 주입이
 *     필요해 별도 슬롯. 본 commit 은 좌표 기반 bbox 만.
 */

import { Ruler, X } from 'lucide-react';
import { useCallback, useRef, useState } from 'react';
import { useT } from '../../i18n';

export interface AnnotationBox {
  /** Overlay-relative pixel coordinates. */
  x: number;
  y: number;
  w: number;
  h: number;
  /** 캡처 시각 (ISO 8601). */
  captured_at: string;
}

export interface AnnotationOverlayProps {
  active: boolean;
  onToggle?: () => void;
  /** 사용자가 box 를 그릴 때 호출. 부모가 list 에 push 후 [전송] 결정. */
  onMark?: (box: AnnotationBox) => void;
  /** 부모가 외부에서 관리하는 box 목록 (이미 chat 으로 보낸 것 등). */
  boxes?: ReadonlyArray<AnnotationBox>;
}

interface DragState {
  startX: number;
  startY: number;
  curX: number;
  curY: number;
}

export function AnnotationOverlay({
  active,
  onToggle,
  onMark,
  boxes = [],
}: AnnotationOverlayProps): React.JSX.Element {
  const t = useT();
  const overlayRef = useRef<HTMLDivElement | null>(null);
  const [drag, setDrag] = useState<DragState | null>(null);

  const overlayCoords = useCallback(
    (e: { clientX: number; clientY: number }): { x: number; y: number } => {
      const el = overlayRef.current;
      if (el === null) return { x: 0, y: 0 };
      const rect = el.getBoundingClientRect();
      return {
        x: Math.round(e.clientX - rect.left),
        y: Math.round(e.clientY - rect.top),
      };
    },
    []
  );

  // Mouse-event 기반 — pointer events 는 jsdom 에서 지원 spotty.
  const handleMouseDown = useCallback(
    (e: React.MouseEvent<HTMLDivElement>): void => {
      if (!active) return;
      if (e.button !== 0) return;
      const { x, y } = overlayCoords(e);
      setDrag({ startX: x, startY: y, curX: x, curY: y });
    },
    [active, overlayCoords]
  );

  const handleMouseMove = useCallback(
    (e: React.MouseEvent<HTMLDivElement>): void => {
      if (drag === null) return;
      const { x, y } = overlayCoords(e);
      setDrag({ ...drag, curX: x, curY: y });
    },
    [drag, overlayCoords]
  );

  const handleMouseUp = useCallback(
    (e: React.MouseEvent<HTMLDivElement>): void => {
      if (drag === null) return;
      const end = overlayCoords(e);
      const x = Math.min(drag.startX, end.x);
      const y = Math.min(drag.startY, end.y);
      const w = Math.abs(end.x - drag.startX);
      const h = Math.abs(end.y - drag.startY);
      // 너무 작은 box (실수 클릭) 은 무시.
      if (w >= 4 && h >= 4 && onMark !== undefined) {
        onMark({ x, y, w, h, captured_at: new Date().toISOString() });
      }
      setDrag(null);
    },
    [drag, onMark, overlayCoords]
  );

  const dragRect =
    drag !== null
      ? {
          x: Math.min(drag.startX, drag.curX),
          y: Math.min(drag.startY, drag.curY),
          w: Math.abs(drag.curX - drag.startX),
          h: Math.abs(drag.curY - drag.startY),
        }
      : null;

  return (
    <div
      ref={overlayRef}
      role={active ? 'application' : 'presentation'}
      aria-label={active ? t('preview.annotation.overlay_aria') : undefined}
      className={
        active
          ? 'absolute inset-0 cursor-crosshair pointer-events-auto'
          : 'absolute inset-0 pointer-events-none'
      }
      data-annotation-mode={active ? 'on' : 'off'}
      data-testid="annotation-overlay"
      aria-hidden={!active}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
    >
      {/* 기존 boxes (부모가 관리). */}
      {boxes.map((b, i) => (
        <div
          key={`${b.captured_at}-${i}`}
          className="absolute border-2 border-blue-400/70 bg-blue-400/15"
          style={{
            left: `${b.x}px`,
            top: `${b.y}px`,
            width: `${b.w}px`,
            height: `${b.h}px`,
          }}
          data-testid={`annotation-box-${i}`}
        />
      ))}

      {/* drag 중인 활성 box. */}
      {dragRect !== null && dragRect.w >= 1 && dragRect.h >= 1 && (
        <div
          className="absolute border-2 border-yellow-400 bg-yellow-400/20"
          style={{
            left: `${dragRect.x}px`,
            top: `${dragRect.y}px`,
            width: `${dragRect.w}px`,
            height: `${dragRect.h}px`,
            pointerEvents: 'none',
          }}
          data-testid="annotation-drag-box"
        />
      )}

      {active && (
        <div
          role="toolbar"
          aria-label={t('preview.annotation.toolbar_aria')}
          className="pointer-events-auto absolute top-2 right-2 z-10 flex items-center gap-2 rounded border border-border-primary bg-bg-primary/90 px-2 py-1 text-xs"
          data-testid="annotation-overlay-toolbar"
          // toolbar 영역에서는 drag 시작 안 되도록 stopPropagation.
          onMouseDown={(e) => e.stopPropagation()}
        >
          <Ruler aria-hidden="true" className="h-3 w-3" />
          <span>{t('preview.annotation.toolbar_label')}</span>
          {onToggle !== undefined && (
            <button
              type="button"
              onClick={onToggle}
              className="rounded p-0.5 hover:bg-bg-tertiary"
              data-testid="annotation-overlay-toggle-off"
              aria-label={t('preview.annotation.exit_aria')}
            >
              <X aria-hidden="true" className="h-3 w-3" />
            </button>
          )}
        </div>
      )}
    </div>
  );
}
