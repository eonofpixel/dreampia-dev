/**
 * ChatInputSuggestionPopover — Generic listbox popover for ChatInput.
 *
 * v0.6.0 (F-019) 에서 도입. v0.5.0 의 SlashCommandPopover 가 슬래시-전용으로
 * 짜여 있어 같은 listbox/aria/keyboard 패턴을 `@` 멘션 popover 가 재사용 못
 * 하던 문제 해결. 이 컴포넌트는 도메인-무관한 "추천 항목 listbox" 만 책임지고,
 * SlashCommandPopover / 멘션 popover 가 SuggestionItem 으로 매핑해서 위에 얹는다.
 *
 * UI 구성:
 *   - 각 항목: badge (mono, optional) + primary (bold, 한국어) + secondary (muted)
 *   - 활성 항목은 bg-accent/20 + aria-selected="true"
 *   - mouseDown 으로 선택 (textarea blur 전, focus 유지)
 *   - footer 힌트는 caller 가 한국어 string 으로 주입
 *
 * a11y:
 *   - role="listbox" 컨테이너 + role="option" 항목
 *   - 각 항목에 안정적 `id` (idPrefix 기반) → ChatInput textarea 가
 *     `aria-activedescendant` 로 가리킴
 *   - aria-label 한국어
 *
 * Spec:
 *   - docs/ux/patterns/F-018-slash-commands.md
 *   - docs/ux/patterns/F-019-mention-palette.md
 *   - docs/i18n/ime.md (popover 자체는 IME 와 무관, ChatInput 이 가드)
 */

export interface SuggestionItem {
  /** 안정 DOM id 의 suffix. 같은 popover 안에서 unique 해야 한다. */
  id: string;
  /** 메인 라벨 (bold, 왼쪽). 한국어 권장. */
  primary: string;
  /** 부가 설명 (오른쪽, muted). 빈 문자열은 렌더링 X. */
  secondary?: string;
  /** 좌측 mono 뱃지 (예: trigger `/help` 또는 kind `@file`). */
  badge?: string;
}

export interface ChatInputSuggestionPopoverProps<T extends SuggestionItem> {
  /** 표시할 항목들. 빈 배열이면 popover 자체를 렌더하지 않는다. */
  items: ReadonlyArray<T>;
  /** 키보드 탐색으로 강조된 인덱스. 범위 밖이면 어떤 항목도 강조 X. */
  activeIndex: number;
  /** Enter / mouseDown 시 호출. */
  onPick: (item: T) => void;
  /**
   * 항목 DOM id 의 prefix. 페이지에 popover 가 여러 개여도 충돌하지 않도록
   * caller 가 unique 한 값을 넘긴다 (예: `slash-command`, `mention-palette`).
   */
  idPrefix: string;
  /** 비어있을 때 표시할 힌트 (한국어). 미지정 시 popover 자체를 그리지 않음. */
  emptyMessage?: string;
  /** 푸터 힌트 (한국어). 미지정 시 푸터 미표시. */
  footerHint?: string;
  /**
   * popover 자체 aria-label (한국어). 기본값 "추천 항목".
   * 슬래시 팔레트는 "슬래시 명령", 멘션 팔레트는 "멘션 후보" 등으로 override.
   */
  ariaLabel?: string;
  /**
   * 외곽 컨테이너의 `data-testid`. 슬래시는 `slash-command-popover`,
   * 멘션은 `mention-popover` 같은 식으로 caller 가 지정.
   */
  testid?: string;
  /**
   * 각 항목의 testid prefix. 결과는 `${optionTestidPrefix}-${item.id}`.
   * 슬래시는 `slash-command-option`, 멘션은 `mention-option` 등.
   */
  optionTestidPrefix?: string;
}

/** 각 항목의 안정 DOM id — aria-activedescendant 가 가리킬 수 있도록. */
export function suggestionOptionId(idPrefix: string, itemId: string): string {
  return `${idPrefix}-option-${itemId}`;
}

/**
 * Generic listbox popover. 도메인-무관 — 슬래시 / 멘션 / 그 외 추천 UI 가
 * 모두 같은 a11y / 키보드 / 스타일을 공유하도록.
 */
export function ChatInputSuggestionPopover<T extends SuggestionItem>({
  items,
  activeIndex,
  onPick,
  idPrefix,
  emptyMessage,
  footerHint,
  ariaLabel = '추천 항목',
  testid,
  optionTestidPrefix,
}: ChatInputSuggestionPopoverProps<T>): React.JSX.Element | null {
  // 비어있을 때: emptyMessage 가 있으면 안내 표시, 없으면 아예 렌더 X.
  if (items.length === 0) {
    if (emptyMessage === undefined || emptyMessage.length === 0) return null;
    return (
      <div
        role="listbox"
        aria-label={ariaLabel}
        {...(testid !== undefined && { 'data-testid': testid })}
        className="absolute bottom-full left-0 right-0 z-30 mb-1 rounded-md border border-border-primary bg-bg-secondary px-3 py-2 text-xs text-text-tertiary shadow-lg"
      >
        {emptyMessage}
      </div>
    );
  }

  return (
    <div
      role="listbox"
      aria-label={ariaLabel}
      {...(testid !== undefined && { 'data-testid': testid })}
      className="absolute bottom-full left-0 right-0 z-30 mb-1 max-h-64 overflow-y-auto rounded-md border border-border-primary bg-bg-secondary shadow-lg"
    >
      <ul className="py-1">
        {items.map((item, index) => {
          const isActive = index === activeIndex;
          const optionTestid =
            optionTestidPrefix !== undefined ? `${optionTestidPrefix}-${item.id}` : undefined;
          return (
            <li
              key={item.id}
              id={suggestionOptionId(idPrefix, item.id)}
              role="option"
              aria-selected={isActive}
              {...(optionTestid !== undefined && { 'data-testid': optionTestid })}
              data-active={isActive ? 'true' : 'false'}
              className={
                'flex cursor-pointer items-center gap-2 px-3 py-1.5 text-sm ' +
                (isActive ? 'bg-accent/20' : 'hover:bg-bg-tertiary')
              }
              onMouseDown={(e) => {
                // mousedown 으로 처리 — click 보다 먼저 발생해 textarea blur
                // 전에 선택을 끝낸다 (focus 유지).
                e.preventDefault();
                onPick(item);
              }}
            >
              {item.badge !== undefined && item.badge.length > 0 && (
                <code className="font-mono text-xs text-accent">{item.badge}</code>
              )}
              <span className="font-medium">{item.primary}</span>
              {item.secondary !== undefined && item.secondary.length > 0 && (
                <span className="ml-auto truncate text-xs text-text-tertiary">
                  {item.secondary}
                </span>
              )}
            </li>
          );
        })}
      </ul>
      {footerHint !== undefined && footerHint.length > 0 && (
        <div className="border-t border-border-primary px-3 py-1 text-[10px] text-text-tertiary">
          {footerHint}
        </div>
      )}
    </div>
  );
}
