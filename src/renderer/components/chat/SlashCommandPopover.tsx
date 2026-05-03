/**
 * SlashCommandPopover — F-018 (v0.5.0).
 *
 * `/` 로 시작하는 입력 시 textarea 위쪽에 floating popover 로 표시되는 명령
 * 후보 목록. 키보드만으로 탐색 + 실행이 가능하도록 listbox a11y 패턴을 따른다.
 *
 * v0.6.0: 본 컴포넌트는 generic `ChatInputSuggestionPopover` 의 thin wrapper
 * 가 되어 listbox/aria/keyboard 패턴을 멘션 popover 와 공유한다. 기존 호출
 * 측 (ChatInput / 테스트) 의 인터페이스는 보존 — testid, aria-label, 표시
 * 텍스트 모두 동일.
 *
 * UI 구성 (mapping → SuggestionItem):
 *   - badge   = `<trigger>` 또는 `<trigger> <argHint>` (hasArgs 명령)
 *   - primary = `cmd.label` (한국어)
 *   - secondary = `cmd.description`
 *   - 활성 항목은 bg-accent/20 + aria-selected="true"
 *   - hover 시 onPick 호출 X — mousedown 에서만 호출 (focus 유지)
 *   - footer 힌트: ↑↓ 탐색 · Enter 선택 · Esc 닫기
 *
 * a11y:
 *   - role="listbox" 컨테이너 + role="option" 항목
 *   - aria-label="슬래시 명령" (한국어)
 *   - 각 항목에 안정적 `id` 부여 → ChatInput textarea 가
 *     `aria-activedescendant` 로 가리킴
 *
 * Spec:
 *   - docs/ux/patterns/F-018-slash-commands.md
 *   - docs/ux/patterns/F-019-mention-palette.md (공유 popover 패턴)
 *   - docs/i18n/ime.md (popover 자체는 IME 와 무관, ChatInput 이 가드)
 */

import type { SlashCommand } from '../../commands/registry';
import {
  ChatInputSuggestionPopover,
  suggestionOptionId,
  type SuggestionItem,
} from './ChatInputSuggestionPopover';

export interface SlashCommandPopoverProps {
  /**
   * 표시할 명령 목록. 빈 배열이면 popover 를 그리지 않는다.
   * 정렬 책임은 caller (registry.filterCommands) 가 진다.
   */
  commands: ReadonlyArray<SlashCommand>;
  /**
   * 키보드 탐색으로 강조된 항목의 인덱스. commands 길이 범위를 벗어난 값은
   * 아무것도 강조하지 않는 안전 fallback (= 인덱스 0 도 강조 X).
   */
  activeIndex: number;
  /** 사용자가 항목을 선택했을 때 호출 (Enter 또는 click). */
  onPick: (command: SlashCommand) => void;
  /**
   * 각 항목에 안정 id 를 부여하기 위한 prefix. 같은 페이지에 popover 가
   * 여러 개 떠도 id 충돌이 없도록 caller 가 unique 한 값을 넘긴다.
   * 미지정 시 'slash-command'. ChatInput 은 한 번만 mount 되므로 default 충분.
   */
  idPrefix?: string;
}

/**
 * 각 항목의 안정 DOM id — aria-activedescendant 가 가리킬 수 있도록.
 *
 * 기존 호출 측 (ChatInput) 의 시그니처를 보존하기 위해 SlashCommand 자체를
 * 받도록 유지. 내부적으로는 `suggestionOptionId(prefix, command.id)` 로 위임.
 */
export function commandOptionId(idPrefix: string, command: SlashCommand): string {
  return suggestionOptionId(idPrefix, command.id);
}

/** 슬래시 명령용 SuggestionItem — 원본 SlashCommand 도 재참조 가능. */
type SlashSuggestionItem = SuggestionItem & { command: SlashCommand };

function commandToItem(cmd: SlashCommand): SlashSuggestionItem {
  // hasArgs 가 true 면 badge 에 trigger + argHint 를 함께 표시 → 사용자가
  // popover 만으로도 인자 형식을 알 수 있다 (예: `/model <모델명>`).
  const badge =
    cmd.hasArgs === true && cmd.argHint !== undefined && cmd.argHint.length > 0
      ? `${cmd.trigger} ${cmd.argHint}`
      : cmd.trigger;
  return {
    id: cmd.id,
    primary: cmd.label,
    secondary: cmd.description,
    badge,
    command: cmd,
  };
}

export function SlashCommandPopover({
  commands,
  activeIndex,
  onPick,
  idPrefix = 'slash-command',
}: SlashCommandPopoverProps): React.JSX.Element | null {
  if (commands.length === 0) return null;

  const items = commands.map(commandToItem);

  return (
    <ChatInputSuggestionPopover<SlashSuggestionItem>
      items={items}
      activeIndex={activeIndex}
      onPick={(item) => onPick(item.command)}
      idPrefix={idPrefix}
      ariaLabel="슬래시 명령"
      testid="slash-command-popover"
      optionTestidPrefix="slash-command-option"
      footerHint="↑↓ 탐색 · Enter 선택 · Esc 닫기"
    />
  );
}
