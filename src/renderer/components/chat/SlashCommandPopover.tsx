/**
 * SlashCommandPopover — F-018 (v0.5.0).
 *
 * `/` 로 시작하는 입력 시 textarea 위쪽에 floating popover 로 표시되는 명령
 * 후보 목록. 키보드만으로 탐색 + 실행이 가능하도록 listbox a11y 패턴을 따른다.
 *
 * UI 구성:
 *   - 각 항목: <trigger> (mono) + 라벨 (한국어) + 설명 (text-text-tertiary)
 *   - 인자 필요 명령은 argHint 도 함께 표시
 *   - 활성 항목은 bg-accent/20 + aria-selected="true"
 *   - hover 시 onPick 호출 X — click 에서만 호출 (더블 트리거 방지)
 *   - footer 힌트: ↑↓ 탐색 · Enter 선택 · Esc 닫기
 *
 * a11y:
 *   - role="listbox" 컨테이너 + role="option" 항목
 *   - 각 항목에 안정적 `id` 부여 → ChatInput 의 textarea 가
 *     `aria-activedescendant` 로 가리킴
 *   - aria-label 한국어
 *
 * Spec:
 *   - docs/ux/patterns/F-018-slash-commands.md
 *   - docs/i18n/ime.md (popover 자체는 IME 와 무관, ChatInput 이 가드)
 */

import type { SlashCommand } from '../../commands/registry';

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

/** 각 항목의 안정 DOM id — aria-activedescendant 가 가리킬 수 있도록. */
export function commandOptionId(idPrefix: string, command: SlashCommand): string {
  return `${idPrefix}-option-${command.id}`;
}

export function SlashCommandPopover({
  commands,
  activeIndex,
  onPick,
  idPrefix = 'slash-command',
}: SlashCommandPopoverProps): React.JSX.Element | null {
  if (commands.length === 0) return null;

  return (
    <div
      role="listbox"
      aria-label="슬래시 명령"
      data-testid="slash-command-popover"
      className="absolute bottom-full left-0 right-0 z-30 mb-1 max-h-64 overflow-y-auto rounded-md border border-border-primary bg-bg-secondary shadow-lg"
    >
      <ul className="py-1">
        {commands.map((cmd, index) => {
          const isActive = index === activeIndex;
          return (
            <li
              key={cmd.id}
              id={commandOptionId(idPrefix, cmd)}
              role="option"
              aria-selected={isActive}
              data-testid={`slash-command-option-${cmd.id}`}
              data-active={isActive ? 'true' : 'false'}
              className={
                'flex cursor-pointer items-center gap-2 px-3 py-1.5 text-sm ' +
                (isActive ? 'bg-accent/20' : 'hover:bg-bg-tertiary')
              }
              onMouseDown={(e) => {
                // mousedown 으로 처리 — click 보다 먼저 발생해 textarea blur
                // 전에 선택을 끝낸다 (focus 유지를 위해).
                e.preventDefault();
                onPick(cmd);
              }}
            >
              <code className="font-mono text-xs text-accent">{cmd.trigger}</code>
              {cmd.hasArgs === true && cmd.argHint !== undefined && (
                <span className="font-mono text-xs text-text-tertiary">{cmd.argHint}</span>
              )}
              <span className="font-medium">{cmd.label}</span>
              <span className="ml-auto truncate text-xs text-text-tertiary">{cmd.description}</span>
            </li>
          );
        })}
      </ul>
      <div className="border-t border-border-primary px-3 py-1 text-[10px] text-text-tertiary">
        <kbd className="rounded bg-bg-tertiary px-1">↑</kbd>
        <kbd className="ml-0.5 rounded bg-bg-tertiary px-1">↓</kbd> 탐색
        <span className="mx-2">·</span>
        <kbd className="rounded bg-bg-tertiary px-1">Enter</kbd> 선택
        <span className="mx-2">·</span>
        <kbd className="rounded bg-bg-tertiary px-1">Esc</kbd> 닫기
      </div>
    </div>
  );
}
