/**
 * MessageText — chat text block 의 fenced code block 분리 + 액션 부착.
 *
 * v2.8.0 (Builder UX) — minimum subset of #C (AI → editor "Apply").
 *
 * 입력 text 안에 ```lang\n...\n``` 패턴이 있으면 segment 단위로 분리해
 * 코드 블록만 별도 <pre> 로 렌더 + 우상단에 "Code 로 보내기" 버튼. 버튼
 * 클릭 → onSendToCode(code, lang) — 호출자 (App.tsx) 가 클립보드 복사
 * + Code 모드 진입 + toast 처리.
 *
 * 한계 (v0 — 후속 PR 에서 정교화):
 *   - markdown 의 다른 요소 (heading, list, link, inline `code`) 는 plain
 *     text 로 그대로. 본 컴포넌트의 책임은 fenced block 분리뿐
 *   - "Apply to file" (즉시 IPC 로 파일에 패치) 는 별도 PR. 본 PR 은
 *     클립보드 + 모드 전환까지만 — 사용자가 Code 모드에서 paste
 *   - streaming 중 partial fence (열린 ``` 만 있고 닫힘 X) 는 plain text
 *     로 표시. ChatPanel 이 이미 streaming 분기에서 plain <p> 로 처리
 *     하므로 본 컴포넌트는 stable text 만 받는다고 가정
 *
 * Decision doc: ../../../../BUILDER_UX_ANALYSIS.md (#C minimum subset).
 */

import { ArrowRightToLine, FileEdit } from 'lucide-react';
import { Fragment, useMemo } from 'react';

import { useT } from '../../i18n';

interface CodeSegment {
  kind: 'code';
  language: string;
  content: string;
}

interface TextSegment {
  kind: 'text';
  content: string;
}

type Segment = CodeSegment | TextSegment;

/**
 * fenced block 정규식 — ``` 다음에 선택적 lang, 그리고 닫힘 ``` 까지.
 * 시작/끝의 newline 은 캡처 그룹 안에 포함하지 않음 (trim 으로 처리).
 *
 * 다중 라인 매칭. 안전한 패턴 — backtick 4개 이상 / nested 는 미지원.
 */
const FENCE_RE = /```([\w-]*)\n([\s\S]*?)\n```/g;

/**
 * Pure helper — text 를 segment 배열로 split. 테스트 용이성 위해 분리.
 *
 * fenced block 미발견 시 [{kind:'text', content:text}] 단일 반환.
 * 인접 빈 text segment 는 자동 제거.
 */
export function parseMessageSegments(text: string): ReadonlyArray<Segment> {
  const segments: Segment[] = [];
  let lastIndex = 0;
  // RegExp.exec 의 stateful behavior 를 위해 새 인스턴스로 (동시 호출 안전)
  const re = new RegExp(FENCE_RE.source, FENCE_RE.flags);
  let match: RegExpExecArray | null;
  while ((match = re.exec(text)) !== null) {
    if (match.index > lastIndex) {
      const slice = text.slice(lastIndex, match.index);
      if (slice.length > 0) segments.push({ kind: 'text', content: slice });
    }
    segments.push({
      kind: 'code',
      language: match[1] ?? '',
      content: match[2] ?? '',
    });
    lastIndex = match.index + match[0].length;
  }
  if (lastIndex < text.length) {
    const slice = text.slice(lastIndex);
    if (slice.length > 0) segments.push({ kind: 'text', content: slice });
  }
  if (segments.length === 0) {
    segments.push({ kind: 'text', content: '' });
  }
  return segments;
}

export interface MessageTextProps {
  text: string;
  /** 코드 블록의 "Code 로 보내기" 버튼 클릭 시 호출. 미지정 시 버튼 숨김. */
  onSendToCode?: (code: string, language?: string) => void;
  /**
   * v2.8.x (Builder UX, C 후속) — 코드 블록의 "파일에 적용" 버튼. App.tsx 가
   * 현재 열린 파일이 있을 때만 prop 전달 (미지정 시 버튼 자체 미노출).
   */
  onApplyToFile?: (code: string, language?: string) => void;
  /**
   * v2.10.0 (.omc/DESIGN.md C-2) — Deprecated. user turn 의 새 chrome 이
   * accent-soft + text-text-primary 라 code block 도 일반 chrome (canvas-soft +
   * hairline) 으로 충분한 contrast. legacy caller 호환 위해 prop 은 유지하되
   * 내부에서 사용하지 않음.
   */
  inverse?: boolean;
}

export function MessageText({
  text,
  onSendToCode,
  onApplyToFile,
  // v2.10.0 (C-2) — unused, kept for prop compat. caller 가 inverse 전달해도 ignore.
  inverse: _inverse = false,
}: MessageTextProps): React.JSX.Element {
  const t = useT();
  const segments = useMemo(() => parseMessageSegments(text), [text]);

  // fenced block 1개도 없으면 단순 <p> 로 — DOM 노이즈 최소화 + 기존
  // streaming-cursor-안의-<p> 마크업과 시각적으로 동일.
  if (segments.length === 1 && segments[0]?.kind === 'text') {
    return <p>{segments[0].content}</p>;
  }

  return (
    <div className="space-y-1.5" data-testid="message-text">
      {segments.map((seg, idx) => {
        if (seg.kind === 'text') {
          // text segment 가 빈 줄 만으로 이뤄진 경우도 그대로 (line break 보존).
          return (
            <p key={idx} className="whitespace-pre-wrap">
              {seg.content}
            </p>
          );
        }
        // v2.10.0 (.omc/DESIGN.md C-2) — code block chrome 토큰화. user turn
        // 의 새 bg-accent-soft 위에서도 동일한 surface (canvas-soft) 가 자연
        // contrast — 이전엔 black/20 hardcoded 이었음. inverse 의미는 "user
        // turn 안" → background 대비 + apply button accent tint.
        return (
          <Fragment key={idx}>
            <div
              className="group/code overflow-hidden rounded-md border border-hairline bg-canvas-soft"
              data-testid={`message-code-block-${idx}`}
              data-code-language={seg.language}
            >
              <header className="flex items-center gap-xs border-b border-hairline px-xs py-xxs text-caption-uppercase uppercase text-text-tertiary">
                <span data-testid={`message-code-language-${idx}`}>
                  {seg.language.length > 0 ? seg.language : t('chat.code_block.plain_label')}
                </span>
                {onApplyToFile !== undefined && (
                  <button
                    type="button"
                    onClick={() => onApplyToFile(seg.content, seg.language || undefined)}
                    aria-label={t('chat.code_block.apply_to_file_aria')}
                    className="ml-auto flex items-center gap-xxs rounded-md border border-accent/40 bg-accent-soft px-xs py-[2px] text-caption normal-case tracking-normal text-accent hover:bg-accent/15"
                    data-testid={`message-code-apply-${idx}`}
                  >
                    <FileEdit aria-hidden="true" className="h-3 w-3" />
                    <span>{t('chat.code_block.apply_to_file')}</span>
                  </button>
                )}
                {onSendToCode !== undefined && (
                  <button
                    type="button"
                    onClick={() => onSendToCode(seg.content, seg.language || undefined)}
                    aria-label={t('chat.code_block.send_to_code_aria')}
                    className={[
                      onApplyToFile === undefined ? 'ml-auto' : '',
                      'flex items-center gap-xxs rounded-md border border-hairline bg-surface-card px-xs py-[2px] text-caption normal-case tracking-normal text-text-secondary hover:bg-surface-strong',
                    ]
                      .filter((c) => c.length > 0)
                      .join(' ')}
                    data-testid={`message-code-send-${idx}`}
                  >
                    <ArrowRightToLine aria-hidden="true" className="h-3 w-3" />
                    <span>{t('chat.code_block.send_to_code')}</span>
                  </button>
                )}
              </header>
              <pre className="overflow-x-auto px-xs py-xxs text-code text-text-primary">
                <code>{seg.content}</code>
              </pre>
            </div>
          </Fragment>
        );
      })}
    </div>
  );
}
