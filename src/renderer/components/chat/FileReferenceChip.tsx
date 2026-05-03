/**
 * FileReferenceChip — typed `file_reference` block 의 inline chip 표시.
 *
 * v0.13.0 (J) — v0.6.0 plain-text "--- 컨텍스트 ---" 형식 대체.
 *
 * 디자인:
 *   - 기본 collapsed: path + line count + truncated 표시 + 펼치기 chevron
 *   - 펼치면 (expanded) snippet 코드 블록 노출 (mono font, scrollable)
 *   - chip 자체가 하나의 button — Enter / Space 로 toggle
 *
 * Korean / English i18n via `useT`.
 *
 * Spec: docs/session/conversation.md (typed reference blocks)
 */

import { useState } from 'react';
import { ChevronDown, ChevronRight, FileText } from 'lucide-react';
import { useT } from '../../i18n';

export interface FileReferenceChipProps {
  path: string;
  snippet: string;
  lineCount: number;
  truncated: boolean;
  /** Optional language hint — code fence syntax highlight 시각힌트만, syntax HL X. */
  language?: string;
  /**
   * 사용자 turn (accent 배경) 안에서 chip 의 가독성을 위해 inverse 색상 모드.
   * 기본 false — 어시스턴트 turn (회색 배경) 용 색상.
   */
  inverse?: boolean;
}

export function FileReferenceChip({
  path,
  snippet,
  lineCount,
  truncated,
  language,
  inverse = false,
}: FileReferenceChipProps): React.JSX.Element {
  const t = useT();
  const [expanded, setExpanded] = useState(false);
  const ChevronIcon = expanded ? ChevronDown : ChevronRight;

  // 색상 — user (accent) 안에서는 흰 글자 + 반투명 배경. 그 외 회색 배경 위
  // 에서는 표준 surface 톤 사용. inverse 가 false 인 경우 disabled 외관과
  // 차별화하기 위해 accent border 로 시각 강조.
  const containerCls = inverse
    ? 'bg-white/15 border border-white/25 text-white'
    : 'bg-bg-primary border border-accent/40 text-text-primary';
  const headerHoverCls = inverse ? 'hover:bg-white/10' : 'hover:bg-bg-tertiary';
  const trailingCls = inverse ? 'text-white/80' : 'text-text-tertiary';

  return (
    <div
      className={`my-1 inline-block rounded-md text-xs ${containerCls}`}
      data-testid="file-reference-chip"
      data-path={path}
    >
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className={`flex w-full items-center gap-1.5 rounded-md px-2 py-1 text-left ${headerHoverCls}`}
        aria-expanded={expanded}
        aria-label={t('chat.file_reference.aria_label', { path })}
      >
        <ChevronIcon className="h-3 w-3 flex-shrink-0" aria-hidden="true" />
        <FileText className="h-3 w-3 flex-shrink-0" aria-hidden="true" />
        <span className="truncate font-medium" title={path}>
          {path}
        </span>
        <span className={`ml-1 flex-shrink-0 ${trailingCls}`}>
          {t('chat.file_reference.line_count', { count: String(lineCount) })}
          {truncated && (
            <>
              <span className="mx-1">·</span>
              <span data-testid="file-reference-truncated">
                {t('chat.file_reference.truncated')}
              </span>
            </>
          )}
        </span>
      </button>
      {expanded && (
        <div
          className={`max-h-64 overflow-auto rounded-b-md border-t px-2 py-1 font-mono text-[11px] leading-snug ${
            inverse ? 'border-white/25 bg-black/20' : 'border-border-primary bg-bg-secondary'
          }`}
          data-testid="file-reference-snippet"
          {...(language !== undefined && { 'data-language': language })}
        >
          <pre className="whitespace-pre-wrap break-all">{snippet}</pre>
        </div>
      )}
    </div>
  );
}
