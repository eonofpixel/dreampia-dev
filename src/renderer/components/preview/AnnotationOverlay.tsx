/**
 * AnnotationOverlay — PreviewPanel 의 DOM Inspector / Annotation 모드 (v1.2.4 stub).
 *
 * Spec: docs/v1.x-roadmap.md (P2 v1.2.x PreviewPanel — Annotation mode).
 *
 * 본 commit 은 skeleton:
 *   - active toggle 만 — 실제 element pick / bounding box / DOM meta capture 는
 *     v1.2.5 의 Screenshot/DOM dump 와 통합.
 *   - data-annotation-mode 속성으로 toggle 상태 노출.
 *   - 선택된 box 표시는 후속.
 */

import type React from 'react';

export interface AnnotationOverlayProps {
  active: boolean;
  onToggle?: () => void;
}

export function AnnotationOverlay({
  active,
  onToggle,
}: AnnotationOverlayProps): React.JSX.Element {
  return (
    <div
      className="absolute inset-0 pointer-events-none"
      data-annotation-mode={active ? 'on' : 'off'}
      data-testid="annotation-overlay"
      aria-hidden={!active}
    >
      {active && (
        <div
          className="pointer-events-auto absolute top-2 right-2 z-10 flex items-center gap-2 rounded border border-border-primary bg-bg-primary/90 px-2 py-1 text-xs"
          data-testid="annotation-overlay-toolbar"
        >
          <span aria-hidden>📐</span>
          <span>Annotation 모드</span>
          {onToggle !== undefined && (
            <button
              type="button"
              onClick={onToggle}
              className="rounded px-1 hover:bg-bg-tertiary"
              data-testid="annotation-overlay-toggle-off"
              aria-label="Annotation 종료"
            >
              ✕
            </button>
          )}
        </div>
      )}
    </div>
  );
}
