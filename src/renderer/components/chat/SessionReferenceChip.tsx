/**
 * SessionReferenceChip — typed `session_reference` block 의 inline chip 표시.
 *
 * v0.13.0 (J) — v0.6.0 plain-text "--- 컨텍스트 ---" 형식 대체.
 *
 * 디자인:
 *   - 기본 collapsed: title + turn count + 펼치기 chevron
 *   - 펼치면 (expanded) context_text 영역 (quote 스타일)
 *   - 별도 "이 세션 열기" 버튼 — onPick 이 있으면 활성, 없으면 disabled
 *
 * Korean / English i18n via `useT`.
 *
 * Spec: docs/session/conversation.md (typed reference blocks)
 */

import { useState } from 'react';
import { ChevronDown, ChevronRight, MessageCircle, ExternalLink } from 'lucide-react';
import { useT } from '../../i18n';

export interface SessionReferenceChipProps {
  sessionId: string;
  title: string;
  contextText: string;
  turnCount: number;
  /**
   * 클릭 시 호출 — 부모가 그 세션으로 전환. 미지정 시 chip 의 "open" 버튼은
   * disabled 로 표시 (chip 자체의 toggle 은 그대로 동작).
   */
  onPick?: () => void;
  /** 사용자 turn 안에서 chip 의 가독성을 위해 inverse 색상 모드. */
  inverse?: boolean;
}

export function SessionReferenceChip({
  sessionId,
  title,
  contextText,
  turnCount,
  onPick,
  inverse = false,
}: SessionReferenceChipProps): React.JSX.Element {
  const t = useT();
  const [expanded, setExpanded] = useState(false);
  const ChevronIcon = expanded ? ChevronDown : ChevronRight;

  // title 이 비어있으면 (legacy / partial fetch) sessionId 를 fallback 표시.
  const displayTitle = title.length > 0 ? title : sessionId;

  const containerCls = inverse
    ? 'bg-white/15 border border-white/25 text-white'
    : 'bg-surface-card border border-accent/40 text-text-primary';
  const headerHoverCls = inverse ? 'hover:bg-white/10' : 'hover:bg-surface-strong';
  const trailingCls = inverse ? 'text-white/80' : 'text-text-tertiary';
  const openBtnCls = inverse
    ? 'text-white/90 hover:text-white disabled:text-white/40'
    : 'text-accent hover:text-accent-hover disabled:text-text-tertiary';

  return (
    <div
      className={`my-1 inline-block rounded-md text-xs ${containerCls}`}
      data-testid="session-reference-chip"
      data-session-id={sessionId}
    >
      <div className="flex items-center gap-0.5">
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className={`flex flex-1 items-center gap-1.5 rounded-md px-2 py-1 text-left ${headerHoverCls}`}
          aria-expanded={expanded}
          aria-label={t('chat.session_reference.aria_label', { title: displayTitle })}
        >
          <ChevronIcon className="h-3 w-3 flex-shrink-0" aria-hidden="true" />
          <MessageCircle className="h-3 w-3 flex-shrink-0" aria-hidden="true" />
          <span className="truncate font-medium" title={displayTitle}>
            {displayTitle}
          </span>
          <span className={`ml-1 flex-shrink-0 ${trailingCls}`}>
            {t('chat.session_reference.turn_count', { count: String(turnCount) })}
          </span>
        </button>
        <button
          type="button"
          onClick={onPick}
          disabled={onPick === undefined}
          className={`mx-0.5 rounded px-1.5 py-1 ${openBtnCls} disabled:cursor-not-allowed`}
          aria-label={t('chat.session_reference.open_aria', { title: displayTitle })}
          data-testid="session-reference-open"
        >
          <ExternalLink className="h-3 w-3" aria-hidden="true" />
        </button>
      </div>
      {expanded && (
        <div
          className={`max-h-64 overflow-auto rounded-b-md border-t px-2 py-1 text-[11px] leading-snug ${
            inverse ? 'border-white/25 bg-black/20' : 'border-hairline bg-canvas-soft'
          }`}
          data-testid="session-reference-context"
        >
          {contextText.length > 0 ? (
            <pre className="whitespace-pre-wrap break-words font-sans">{contextText}</pre>
          ) : (
            <span className={inverse ? 'italic text-white/70' : 'italic text-text-tertiary'}>
              {t('chat.session_reference.empty')}
            </span>
          )}
        </div>
      )}
    </div>
  );
}
