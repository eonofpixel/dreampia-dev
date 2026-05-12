/**
 * AnnotationOverlay — PreviewPanel 의 DOM Inspector / Annotation 모드.
 *
 * Spec: docs/v1.x-roadmap.md (P2 v1.2.4 stub → v1.6.0 element pick + bbox),
 *       docs/ux/patterns/F-021-annotation.md, F-033-dom-inspector.md.
 *
 * v1.2.4 → v1.6.0 → v2.10.0 β-2 진화:
 *   - active toggle 유지.
 *   - **region mode** (기존 drag-to-mark) — 사용자가 overlay 위 영역을 드래그.
 *   - **pick mode** (β-2 신규) — webview 안 DOM element 호버/클릭. 실제 hover/pick
 *     은 main process 가 webview 에 inject 한 inspector script 가 처리하고,
 *     본 overlay 는 부모가 forward 한 `hoverRect` 를 dashed outline 으로 그린다
 *     (webview 안 overlay 와 별개로 placeholder 위 시각 cue).
 *   - 두 모드는 segmented control (radiogroup) 로 토글. default='pick'.
 *   - onMark callback — region 모드는 좌표, pick 모드는 selector + page_url 까지 포함.
 */

import { Mic, MicOff, MousePointer2, Ruler, X } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useT } from '../../i18n';
import { useRecorder } from '../../hooks/useRecorder';

export interface AnnotationBox {
  /** Overlay-relative pixel coordinates. */
  x: number;
  y: number;
  w: number;
  h: number;
  /** 캡처 시각 (ISO 8601). */
  captured_at: string;
  /** v2.10.0 β-2 — pick 모드일 때만 set. region 모드는 undefined. */
  selector?: string;
  /** v2.10.0 β-2 — pick 모드의 page url (location.href). */
  page_url?: string;
  /**
   * v2.10.0 β-4 (F-021 inline panel) — 사용자가 inline panel 의 textarea 에
   * 입력한 메모. 패널의 [저장] 클릭 시점에만 값이 채워진다 (취소 → onMark
   * 호출 자체가 없음). 빈 string 가능 — 음성만 첨부한 경우.
   */
  comment?: string;
  /**
   * v2.10.0 β-4 — `annotation/save-audio` IPC 결과의 file URI. 사용자가
   * 음성 녹음 + [저장] 한 경우에만 set. 음성 미녹음 시 undefined.
   */
  comment_audio_uri?: string;
  /**
   * v2.10.0 β-4 — 녹음 길이 (ms). file URI 와 함께 chip footer 등 표시용.
   */
  comment_audio_duration_ms?: number;
}

/** v2.10.0 β-2 — Annotation 의 두 모드. */
export type AnnotationMode = 'pick' | 'region';

/**
 * v2.10.0 β-3 (F-033 meta card) — hover 메타 카드 표시용 element 정보.
 * BrowserManager 의 InspectorEvent 와 동일 shape 의 subset. classes 는
 * 5개 cap, font 는 "family size" 형식.
 */
export interface AnnotationHoverMeta {
  tag: string;
  dimensions: string;
  id?: string;
  classes?: string[];
  color?: string;
  bg_color?: string;
  font?: string;
}

export interface AnnotationOverlayProps {
  active: boolean;
  onToggle?: () => void;
  /** 사용자가 box 를 그릴 때 호출. 부모가 list 에 push 후 [전송] 결정. */
  onMark?: (box: AnnotationBox) => void;
  /** 부모가 외부에서 관리하는 box 목록 (이미 chat 으로 보낸 것 등). */
  boxes?: ReadonlyArray<AnnotationBox>;
  /**
   * v2.10.0 β-2 — 현재 모드. 부모가 제어 (uncontrolled 형태도 segmented
   * control 토글로 호출만 발생 — 부모가 state 보관). default 'pick'.
   */
  mode?: AnnotationMode;
  /** v2.10.0 β-2 — segmented control 클릭 시 호출. */
  onModeChange?: (mode: AnnotationMode) => void;
  /**
   * v2.10.0 β-2 — pick 모드에서 webview hover bbox (overlay-relative). 부모가
   * inspector-event 'hover' 받아 좌표 변환 후 set. 값이 있으면 dashed accent
   * outline 렌더. webview 안 overlay 가 이미 그리지만 placeholder 위 fallback
   * 시각 cue 로 사용자가 어디를 가리키는지 명확하게.
   */
  hoverRect?: { x: number; y: number; w: number; h: number } | null;
  /**
   * v2.10.0 β-3 (F-033 meta card) — pick 모드 + hover 시점의 computed-style
   * meta. 부모가 inspector-event 'hover' payload 에서 추출해 전달. 값이 있으면
   * 카드가 hoverRect 옆에 absolute 로 렌더. region 모드 / 비활성 시 미렌더.
   */
  hoverMeta?: AnnotationHoverMeta | null;
  /**
   * v2.10.0 β-4 (F-021 inline panel) — 부모가 음성 녹음 blob 을 main 의
   * `annotation/save-audio` IPC 로 보낼 때 사용. blob + duration_ms 를
   * 받아 file URI 를 반환 (실패 시 null). InlinePanel 의 [저장] 시점에
   * blob 이 있을 때만 호출. 미지정 시 음성 녹음 UI 자체가 disabled.
   */
  saveAudio?: (
    blob: Blob,
    durationMs: number
  ) => Promise<{ uri: string; duration_ms: number } | null>;
  /**
   * v2.10.0 β-4 — 음성 저장 실패 시 부모가 toast 띄울 때 사용. i18n key 를
   * 받아 부모가 t() + addToast 호출. 미지정 시 silent fail (console.warn 만).
   */
  onMicError?: (i18nKey: string) => void;
  /**
   * v2.10.0 β-4 (F-021 inline panel) — 부모가 보유한 draft mark.
   * onMark 직후 부모가 본 prop 으로 다시 흘려보내면 inline panel 이 mark
   * 옆에 mount 된다 (textarea autofocus). null 이면 panel 미렌더.
   *
   * Controlled 패턴: panel 의 [저장] / [취소] / Esc 시 부모가 onPanelSave /
   * onPanelCancel 콜백 후 본 prop 을 null 로 reset.
   */
  pendingBox?: AnnotationBox | null;
  /** v2.10.0 β-4 — [저장] 클릭 시 호출. comment + audio uri/duration 포함. */
  onPanelSave?: (
    final: AnnotationBox & {
      comment: string;
      comment_audio_uri?: string;
      comment_audio_duration_ms?: number;
    }
  ) => void;
  /** v2.10.0 β-4 — [취소] / Esc 시 호출. 부모가 pendingBox 를 null 로 reset. */
  onPanelCancel?: () => void;
}

interface DragState {
  startX: number;
  startY: number;
  curX: number;
  curY: number;
}

/**
 * v2.10.0 β-3 — Detect `rgba(...,0)` or `transparent` literal so the meta
 * card replaces the raw string with the i18n "투명 / transparent" label.
 * Plain `rgb(...)` and named colors are pass-through.
 */
function isTransparent(value: string): boolean {
  const v = value.trim().toLowerCase();
  if (v === 'transparent') return true;
  // Accepts both rgba(0, 0, 0, 0) and rgba(0,0,0,0).
  const m = v.match(/^rgba\s*\(([^)]+)\)$/);
  if (m === null || m[1] === undefined) return false;
  const parts = m[1].split(',').map((s) => s.trim());
  if (parts.length < 4) return false;
  const alpha = Number(parts[3]);
  return Number.isFinite(alpha) && alpha === 0;
}

export function AnnotationOverlay({
  active,
  onToggle,
  onMark,
  boxes = [],
  mode = 'pick',
  onModeChange,
  hoverRect = null,
  hoverMeta = null,
  saveAudio,
  onMicError,
  pendingBox = null,
  onPanelSave,
  onPanelCancel,
}: AnnotationOverlayProps): React.JSX.Element {
  const t = useT();
  const overlayRef = useRef<HTMLDivElement | null>(null);
  const [drag, setDrag] = useState<DragState | null>(null);

  // v2.10.0 β-3 (F-033 meta card) — Place the card next to hoverRect. Default
  // anchor: top-right of the hovered element (rect.right + 8, rect.top).
  // If that overflows the overlay viewport, flip to the left or shift up.
  // The card width is intentionally bounded; we estimate a fixed budget so
  // layout stays stable across hover targets without a measurement pass.
  const META_CARD_W = 220;
  const META_CARD_H_EST = 110;
  const overlaySize = overlayRef.current?.getBoundingClientRect();
  const overlayW = overlaySize?.width ?? Number.POSITIVE_INFINITY;
  const overlayH = overlaySize?.height ?? Number.POSITIVE_INFINITY;
  const metaCardPos =
    hoverRect !== null && hoverMeta !== null && active && mode === 'pick'
      ? (() => {
          const rightAnchor = hoverRect.x + hoverRect.w + 8;
          const leftAnchor = hoverRect.x - META_CARD_W - 8;
          // Right side fits when there's room to the right of the element.
          const placeLeft = rightAnchor + META_CARD_W > overlayW && leftAnchor >= 0 ? true : false;
          let top = hoverRect.y;
          if (top + META_CARD_H_EST > overlayH) {
            top = Math.max(0, overlayH - META_CARD_H_EST);
          }
          return { left: placeLeft ? leftAnchor : rightAnchor, top };
        })()
      : null;

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
  // v2.10.0 β-2 — region 모드에서만 drag 처리. pick 모드는 webview 안 click 으로.
  const handleMouseDown = useCallback(
    (e: React.MouseEvent<HTMLDivElement>): void => {
      if (!active) return;
      if (mode !== 'region') return;
      if (e.button !== 0) return;
      const { x, y } = overlayCoords(e);
      setDrag({ startX: x, startY: y, curX: x, curY: y });
    },
    [active, mode, overlayCoords]
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
      // v2.10.0 β-4 — onMark 는 "draft 캡처됨" 신호. 부모가 pendingBox state 에
      // 보관 후 InlinePanel 의 [저장] 시점에 최종 forward (race fix).
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
      data-annotation-pick-mode={active ? mode : undefined}
      data-testid="annotation-overlay"
      aria-hidden={!active}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
    >
      {/* 기존 boxes — accent token + 우상단 번호 marker. */}
      {boxes.map((b, i) => (
        <div
          key={`${b.captured_at}-${i}`}
          className="absolute border-2 border-accent bg-accent/15"
          style={{
            left: `${b.x}px`,
            top: `${b.y}px`,
            width: `${b.w}px`,
            height: `${b.h}px`,
          }}
          data-testid={`annotation-box-${i}`}
        >
          {/* v2.10.0 (.omc/DESIGN.md β-1, Codex state_07 패턴) — 번호 라벨로
              각 region 식별. 사용자가 어느 영역이 몇 번째인지 즉시 인지. */}
          <span
            className="absolute -top-2 -left-2 flex h-5 min-w-5 items-center justify-center rounded-pill bg-accent px-xxs text-caption-uppercase uppercase text-white shadow-soft"
            data-testid={`annotation-box-number-${i}`}
            aria-hidden="true"
          >
            {i + 1}
          </span>
        </div>
      ))}

      {/* drag 중인 활성 box (accent-hover = orange 더 밝은 톤). region 모드 only. */}
      {dragRect !== null && dragRect.w >= 1 && dragRect.h >= 1 && (
        <div
          className="absolute border-2 border-accent-hover bg-accent-soft"
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

      {/* v2.10.0 β-2 — pick 모드 hover outline (placeholder-relative). webview
          안 overlay 가 메인 시각 표시이고 이건 placeholder 위 fallback cue. */}
      {active && mode === 'pick' && hoverRect !== null && hoverRect.w >= 1 && hoverRect.h >= 1 && (
        <div
          className="absolute border-2 border-dashed border-accent bg-accent-soft/60"
          style={{
            left: `${hoverRect.x}px`,
            top: `${hoverRect.y}px`,
            width: `${hoverRect.w}px`,
            height: `${hoverRect.h}px`,
            pointerEvents: 'none',
          }}
          data-testid="annotation-hover-outline"
        />
      )}

      {/* v2.10.0 β-3 (F-033 meta card) — Hover meta side card. pick 모드 + hover
          meta + outline 활성 시에만 렌더. screen-reader 에는 노출 X (live hover
          정보, aria-hidden) — pick 액션 자체는 별도 annotation block 으로 chat 에
          기록되므로 보조기기 사용자도 결과를 잃지 않음. */}
      {hoverMeta !== null && metaCardPos !== null && (
        <div
          aria-hidden="true"
          data-testid="annotation-hover-meta-card"
          className="absolute rounded-md border border-hairline bg-surface-card px-sm py-xs text-caption text-text-primary shadow-soft"
          style={{
            left: `${metaCardPos.left}px`,
            top: `${metaCardPos.top}px`,
            width: `${META_CARD_W}px`,
            pointerEvents: 'none',
            zIndex: 5,
          }}
        >
          <div className="flex flex-col gap-xxs">
            <div
              className="font-medium text-text-primary"
              data-testid="annotation-hover-meta-title"
            >
              {`<${hoverMeta.tag}${
                hoverMeta.classes !== undefined && hoverMeta.classes.length > 0
                  ? `.${hoverMeta.classes.join('.')}`
                  : ''
              }>`}
            </div>
            {hoverMeta.id !== undefined && (
              <div className="text-text-tertiary" data-testid="annotation-hover-meta-id">
                {`#${hoverMeta.id}`}
              </div>
            )}
            {hoverMeta.color !== undefined && (
              <div className="flex items-center gap-xs" data-testid="annotation-hover-meta-color">
                <span
                  className="inline-block h-3 w-3 rounded-sm border border-hairline"
                  style={{ background: hoverMeta.color }}
                  aria-hidden="true"
                />
                <span className="text-text-tertiary">
                  {t('preview.annotation.meta.color_label')}
                </span>
                <span className="font-mono text-text-secondary">
                  {isTransparent(hoverMeta.color)
                    ? t('preview.annotation.meta.transparent')
                    : hoverMeta.color}
                </span>
              </div>
            )}
            {hoverMeta.bg_color !== undefined && (
              <div
                className="flex items-center gap-xs"
                data-testid="annotation-hover-meta-bg-color"
              >
                <span
                  className="inline-block h-3 w-3 rounded-sm border border-hairline"
                  style={{ background: hoverMeta.bg_color }}
                  aria-hidden="true"
                />
                <span className="text-text-tertiary">
                  {t('preview.annotation.meta.bg_color_label')}
                </span>
                <span className="font-mono text-text-secondary">
                  {isTransparent(hoverMeta.bg_color)
                    ? t('preview.annotation.meta.transparent')
                    : hoverMeta.bg_color}
                </span>
              </div>
            )}
            {hoverMeta.font !== undefined && (
              <div className="flex items-baseline gap-xs" data-testid="annotation-hover-meta-font">
                <span className="text-text-tertiary">
                  {t('preview.annotation.meta.font_label')}
                </span>
                <span className="font-mono text-text-secondary">{hoverMeta.font}</span>
              </div>
            )}
            <div
              className="flex items-baseline gap-xs"
              data-testid="annotation-hover-meta-dimensions"
            >
              <span className="text-text-tertiary">
                {t('preview.annotation.meta.dimensions_label')}
              </span>
              <span className="font-mono text-text-secondary">{hoverMeta.dimensions}</span>
            </div>
          </div>
        </div>
      )}

      {active && (
        <div
          role="toolbar"
          aria-label={t('preview.annotation.toolbar_aria')}
          className="pointer-events-auto absolute right-sm top-sm z-10 flex items-center gap-xs rounded-md border border-accent/40 bg-surface-card/95 px-sm py-xxs text-caption text-text-primary shadow-card"
          data-testid="annotation-overlay-toolbar"
          // toolbar 영역에서는 drag 시작 안 되도록 stopPropagation.
          onMouseDown={(e) => e.stopPropagation()}
        >
          <Ruler aria-hidden="true" className="h-3 w-3 text-accent" />
          <span>{t('preview.annotation.toolbar_label')}</span>

          {/* v2.10.0 β-2 — segmented control. radiogroup pattern. */}
          {onModeChange !== undefined && (
            <div
              role="radiogroup"
              aria-label={t('preview.annotation.modes_aria')}
              className="ml-xs flex items-center gap-px rounded-sm border border-hairline bg-bg-secondary p-px"
              data-testid="annotation-mode-segment"
            >
              <button
                type="button"
                role="radio"
                aria-checked={mode === 'pick'}
                aria-label={t('preview.annotation.mode_pick_aria')}
                // v2.10.0 β-2 hardening (architect strengthening 7) — title 에
                // 키 단축키 (P) 노출. radio 그룹은 aria-checked 만 사용 — radio
                // 와 aria-pressed 는 양립하지 않음 (a11y 패턴 충돌).
                title={t('preview.annotation.shortcut_pick')}
                onClick={() => onModeChange('pick')}
                data-testid="annotation-mode-pick"
                data-active={mode === 'pick'}
                className="rounded-sm p-xxs text-text-tertiary hover:text-text-primary data-[active=true]:bg-accent data-[active=true]:text-white"
              >
                <MousePointer2 aria-hidden="true" className="h-3 w-3" />
              </button>
              <button
                type="button"
                role="radio"
                aria-checked={mode === 'region'}
                aria-label={t('preview.annotation.mode_region_aria')}
                title={t('preview.annotation.shortcut_region')}
                onClick={() => onModeChange('region')}
                data-testid="annotation-mode-region"
                data-active={mode === 'region'}
                className="rounded-sm p-xxs text-text-tertiary hover:text-text-primary data-[active=true]:bg-accent data-[active=true]:text-white"
              >
                <Ruler aria-hidden="true" className="h-3 w-3" />
              </button>
            </div>
          )}

          {onToggle !== undefined && (
            <button
              type="button"
              onClick={onToggle}
              className="rounded-sm p-xxs text-text-tertiary hover:bg-surface-strong hover:text-text-primary"
              data-testid="annotation-overlay-toggle-off"
              aria-label={t('preview.annotation.exit_aria')}
            >
              <X aria-hidden="true" className="h-3 w-3" />
            </button>
          )}
        </div>
      )}

      {/* v2.10.0 β-4 (F-021 inline panel) — draft mark 옆에 떠 사용자가
          comment + 음성을 첨부할 수 있는 floating panel. pendingBox 가 set
          이고 onPanelSave 가 wire 된 경우에만 mount. */}
      {active && pendingBox !== null && onPanelSave !== undefined && (
        <InlinePanel
          box={pendingBox}
          overlayWidth={overlayW}
          overlayHeight={overlayH}
          saveAudio={saveAudio}
          onMicError={onMicError}
          onSave={onPanelSave}
          onCancel={onPanelCancel ?? ((): void => {})}
        />
      )}
    </div>
  );
}

// ────────────────────────────────────────────────────────────
// v2.10.0 β-4 (F-021 inline panel + voice memo) — InlinePanel
// ────────────────────────────────────────────────────────────

/** Anchor a panel ~220x180 next to the mark; flip when it overflows. */
const PANEL_W = 240;
const PANEL_H_EST = 200;
const PANEL_GAP = 8;

interface InlinePanelProps {
  box: AnnotationBox;
  overlayWidth: number;
  overlayHeight: number;
  saveAudio?: (
    blob: Blob,
    durationMs: number
  ) => Promise<{ uri: string; duration_ms: number } | null>;
  onMicError?: (i18nKey: string) => void;
  onSave: (
    final: AnnotationBox & {
      comment: string;
      comment_audio_uri?: string;
      comment_audio_duration_ms?: number;
    }
  ) => void;
  onCancel: () => void;
}

/** "m:ss" formatter — fixed-width seconds. */
function formatClock(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${s < 10 ? '0' : ''}${s}`;
}

function InlinePanel({
  box,
  overlayWidth,
  overlayHeight,
  saveAudio,
  onMicError,
  onSave,
  onCancel,
}: InlinePanelProps): React.JSX.Element {
  const t = useT();
  const [comment, setComment] = useState('');
  const [saving, setSaving] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  // Cache the last audio URL we created so we can revoke it on unmount/replace.
  const audioObjectUrlRef = useRef<string | null>(null);

  const MAX_MS = 60_000;
  const MAX_BYTES = 5 * 1024 * 1024;
  const recorder = useRecorder({ maxDurationMs: MAX_MS, maxSizeBytes: MAX_BYTES });

  // Autofocus the textarea on mount — directly into typing flow.
  useEffect(() => {
    textareaRef.current?.focus();
  }, []);

  // Build an <audio src> object URL when a blob lands; revoke on replace.
  const audioUrl = useMemo<string | null>(() => {
    if (recorder.blob === null) return null;
    if (audioObjectUrlRef.current !== null) {
      try {
        URL.revokeObjectURL(audioObjectUrlRef.current);
      } catch {
        // best effort
      }
    }
    const url = URL.createObjectURL(recorder.blob);
    audioObjectUrlRef.current = url;
    return url;
  }, [recorder.blob]);

  useEffect(() => {
    return (): void => {
      if (audioObjectUrlRef.current !== null) {
        try {
          URL.revokeObjectURL(audioObjectUrlRef.current);
        } catch {
          // best effort
        }
        audioObjectUrlRef.current = null;
      }
    };
  }, []);

  // Surface mic errors via onMicError (toast). We treat 'size_limit_reached'
  // and 'permission_denied' as the two user-visible reasons; anything else
  // gets the permission_denied bucket.
  useEffect(() => {
    if (recorder.state !== 'error' && recorder.state !== 'stopped') return;
    if (recorder.errorMessage === null) return;
    if (onMicError === undefined) return;
    onMicError(recorder.errorMessage);
  }, [recorder.state, recorder.errorMessage, onMicError]);

  const handleSave = useCallback(async (): Promise<void> => {
    if (saving) return;
    setSaving(true);
    let audioUri: string | undefined;
    let audioMs: number | undefined;
    try {
      if (recorder.blob !== null && saveAudio !== undefined) {
        const r = await saveAudio(recorder.blob, recorder.elapsedMs);
        if (r !== null) {
          audioUri = r.uri;
          audioMs = r.duration_ms;
        } else if (onMicError !== undefined) {
          onMicError('preview.annotation.mic.save_failed');
        }
      }
    } finally {
      setSaving(false);
    }
    onSave({
      ...box,
      comment,
      ...(audioUri !== undefined && { comment_audio_uri: audioUri }),
      ...(audioMs !== undefined && { comment_audio_duration_ms: audioMs }),
    });
  }, [box, comment, onSave, recorder.blob, recorder.elapsedMs, saveAudio, saving, onMicError]);

  const handleCancel = useCallback((): void => {
    // Stop any in-flight recording so the mic releases. Parent's
    // pendingBox reset unmounts us; the hook cleanup also fires.
    if (recorder.state === 'recording') recorder.stop();
    onCancel();
  }, [onCancel, recorder]);

  // Esc closes (= cancel).
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>): void => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        handleCancel();
      }
    },
    [handleCancel]
  );

  // Anchor: right edge of the box + gap. Flip to left side when it overflows
  // the overlay's right edge. Drop below or above the box vertically if it
  // would clip — small content-driven heuristic, no measurement pass.
  const overlayW = Number.isFinite(overlayWidth) ? overlayWidth : Number.POSITIVE_INFINITY;
  const overlayH = Number.isFinite(overlayHeight) ? overlayHeight : Number.POSITIVE_INFINITY;
  const rightAnchor = box.x + box.w + PANEL_GAP;
  const leftAnchor = box.x - PANEL_W - PANEL_GAP;
  const placeLeft = rightAnchor + PANEL_W > overlayW && leftAnchor >= 0;
  const left = placeLeft ? leftAnchor : rightAnchor;
  let top = box.y;
  if (top + PANEL_H_EST > overlayH) {
    top = Math.max(0, overlayH - PANEL_H_EST);
  }

  const recording = recorder.state === 'recording';
  const micDisabled = saveAudio === undefined;
  const elapsedLabel = formatClock(recorder.elapsedMs);
  const maxLabel = formatClock(MAX_MS);

  return (
    // role=dialog (WAI-ARIA) is the correct semantic but eslint-jsx-a11y's
    // `no-noninteractive-element-interactions` rule excludes it from its
    // built-in interactive list. The onMouseDown only stopPropagation's so
    // overlay drag handlers don't fire under the textarea — keyboard nav
    // still flows through child controls (textarea / buttons).
    // eslint-disable-next-line jsx-a11y/no-noninteractive-element-interactions
    <div
      role="dialog"
      aria-label={t('preview.annotation.panel.aria')}
      aria-modal={false}
      data-testid="annotation-inline-panel"
      className="pointer-events-auto absolute z-20 flex flex-col gap-xs rounded-md border border-hairline bg-surface-card px-sm py-xs shadow-card"
      style={{ left: `${left}px`, top: `${top}px`, width: `${PANEL_W}px` }}
      onMouseDown={(e) => e.stopPropagation()}
    >
      <textarea
        ref={textareaRef}
        value={comment}
        onChange={(e) => setComment(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder={t('preview.annotation.panel.placeholder')}
        data-testid="annotation-inline-panel-textarea"
        rows={2}
        className="resize-none rounded-sm border border-hairline bg-surface-strong px-xs py-xxs text-caption text-text-primary placeholder:text-text-tertiary focus:border-accent focus:outline-none"
        style={{ maxHeight: '6em' }}
      />

      <div className="flex items-center justify-between gap-xs">
        <button
          type="button"
          onClick={() => {
            if (recording) {
              recorder.stop();
              return;
            }
            void recorder.start();
          }}
          disabled={micDisabled}
          aria-label={
            recording
              ? t('preview.annotation.mic.stop_aria')
              : t('preview.annotation.mic.start_aria')
          }
          aria-pressed={recording}
          data-testid="annotation-inline-panel-mic"
          data-recording={recording}
          className={
            recording
              ? 'rounded-sm bg-red-600/20 p-xxs text-red-500 hover:bg-red-600/30'
              : 'rounded-sm p-xxs text-text-tertiary hover:bg-surface-strong hover:text-text-primary disabled:opacity-40 disabled:cursor-not-allowed'
          }
        >
          {recording ? (
            <MicOff aria-hidden="true" className="h-4 w-4" />
          ) : (
            <Mic aria-hidden="true" className="h-4 w-4" />
          )}
        </button>

        <span
          className="font-mono text-caption text-text-tertiary"
          data-testid="annotation-inline-panel-duration"
          aria-live={recording ? 'polite' : 'off'}
        >
          {t('preview.annotation.mic.duration_format', {
            current: elapsedLabel,
            max: maxLabel,
          })}
        </span>
      </div>

      {audioUrl !== null && recorder.state === 'stopped' && (
        // User-recorded voice memo — no caption track exists. aria-label
        // provides the SR description for the playback control.
        // eslint-disable-next-line jsx-a11y/media-has-caption
        <audio
          src={audioUrl}
          controls
          data-testid="annotation-inline-panel-audio"
          aria-label={t('preview.annotation.audio_playback_aria')}
          className="w-full"
        />
      )}

      <div className="flex items-center justify-end gap-xs">
        <button
          type="button"
          onClick={handleCancel}
          data-testid="annotation-inline-panel-cancel"
          className="rounded-sm px-xs py-xxs text-caption text-text-tertiary hover:bg-surface-strong hover:text-text-primary"
        >
          {t('preview.annotation.panel.cancel')}
        </button>
        <button
          type="button"
          onClick={() => {
            void handleSave();
          }}
          disabled={saving}
          data-testid="annotation-inline-panel-save"
          className="rounded-sm bg-accent px-xs py-xxs text-caption text-white hover:bg-accent-hover disabled:opacity-50"
        >
          {t('preview.annotation.panel.save')}
        </button>
      </div>
    </div>
  );
}
