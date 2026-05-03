/**
 * ChatInput — message composer with Korean IME-safe submission + slash commands.
 *
 * Spec:
 *   - docs/i18n/ime.md (composition events)
 *   - docs/design/components/input.md
 *   - docs/ux/patterns/F-018-slash-commands.md (/ trigger)
 *   - docs/ux/patterns/F-019-mention-palette.md (@ trigger)
 */

import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import {
  filterCommands,
  parseSlashInput,
  type SlashCommand,
  type SlashCommandId,
} from '../../commands/registry';
import {
  SlashCommandPopover,
  commandOptionId,
} from './SlashCommandPopover';

export interface ChatInputProps {
  onSubmit: (text: string) => void;
  placeholder?: string;
  disabled?: boolean;
  /**
   * Onboarding 추천 prompt → 자동 채움. 외부에서 값이 바뀔 때마다 input 에 반영.
   * 사용자가 즉시 검토/수정할 수 있도록 auto-submit 은 하지 않는다.
   */
  initialValue?: string;
  /**
   * v0.5.0 (F-018) — slash command handler 맵.
   *
   * 각 key 는 SlashCommandId, value 는 인자(arg) 를 받는 callback.
   * 인자가 없는 명령은 callback 이 arg 를 무시한다.
   *
   * 미지정 또는 특정 id 의 handler 가 없으면, 슬래시 입력은 그냥 메시지로
   * 취급되어 onSubmit 으로 흘러간다 (silent no-op 방지).
   */
  commandHandlers?: Partial<Record<SlashCommandId, (arg?: string) => void>>;
}

const POPOVER_ID_PREFIX = 'slash-command';

export function ChatInput({
  onSubmit,
  placeholder = '메시지를 입력하세요',
  disabled,
  initialValue,
  commandHandlers,
}: ChatInputProps): React.JSX.Element {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [value, setValue] = useState(initialValue ?? '');
  const [isComposing, setIsComposing] = useState(false);

  // v0.5.0 — slash command popover 상태.
  // popoverOpen 은 'commands 가 비어있지 않을 때만 보임' 과 별개로 두어,
  // Esc 로 강제 close 한 상태에서 사용자가 같은 `/` 입력을 유지하더라도
  // 다시 열리지 않도록 한다 (간단한 dismissed 토글 대용).
  const [popoverDismissed, setPopoverDismissed] = useState(false);
  const [popoverIndex, setPopoverIndex] = useState(0);

  // initialValue 가 외부에서 변경되면 (예: 추천 prompt 클릭) input 에 반영.
  // 빈 문자열은 무시 — 사용자가 직접 입력 후 cleared 상태를 덮어쓰지 않도록.
  useEffect(() => {
    if (initialValue !== undefined && initialValue.length > 0) {
      setValue(initialValue);
      textareaRef.current?.focus();
    }
  }, [initialValue]);

  // 현재 입력에 매칭되는 명령. IME composition 중이거나 dismissed 상태면 빈 배열.
  // value 가 `/` 로 시작하지 않으면 filterCommands 가 빈 배열을 반환 → popover 숨김.
  const filteredCommands = useMemo<ReadonlyArray<SlashCommand>>(() => {
    if (isComposing) return [];
    if (popoverDismissed) return [];
    if (!value.startsWith('/')) return [];
    // `/<trigger> <arg>` 형식에서 첫 토큰만 query 로 사용 — arg 단계에서는
    // 사용자가 이미 명령을 확정했으므로 popover 를 굳이 다시 펼치지 않는다.
    const space = value.indexOf(' ');
    const query = space === -1 ? value : value.slice(0, space);
    return filterCommands(query);
  }, [value, isComposing, popoverDismissed]);

  const popoverOpen = filteredCommands.length > 0;

  // popover 가 열려있는데 인덱스가 범위를 벗어나면 0 으로 reset.
  // 사용자가 입력을 좁혀 매칭 개수가 줄었을 때 발생.
  useEffect(() => {
    if (!popoverOpen) return;
    if (popoverIndex >= filteredCommands.length) {
      setPopoverIndex(0);
    }
  }, [popoverOpen, popoverIndex, filteredCommands.length]);

  // value 가 `/` 로 시작하지 않게 변하면 dismissed flag 도 리셋
  // — 다음에 다시 `/` 를 입력하면 자연스럽게 popover 가 열리도록.
  useEffect(() => {
    if (!value.startsWith('/') && popoverDismissed) {
      setPopoverDismissed(false);
    }
  }, [value, popoverDismissed]);

  const closePopover = (): void => {
    setPopoverDismissed(true);
    setPopoverIndex(0);
  };

  const executeCommand = (command: SlashCommand, arg: string): boolean => {
    const handler = commandHandlers?.[command.id];
    if (handler === undefined) return false;
    handler(arg.length === 0 ? undefined : arg);
    setValue('');
    setPopoverIndex(0);
    setPopoverDismissed(false);
    return true;
  };

  /**
   * 사용자가 popover 에서 명령을 고른 시점.
   *   - hasArgs 가 true 면 trigger + ' ' 까지만 채우고 arg 입력을 기다린다
   *   - hasArgs 가 false 면 즉시 실행 (handler 가 없으면 popover 만 닫음)
   */
  const handlePickCommand = (command: SlashCommand): void => {
    if (command.hasArgs === true) {
      setValue(`${command.trigger} `);
      // popover 는 인자 입력 단계에서 자동으로 hide 됨 (filteredCommands 가
      // arg 부분에서는 첫 토큰만 보므로 같은 명령 1개만 매칭되지만, UX 는
      // popover 를 닫는 게 자연스럽다). dismissed 로 강제 close.
      setPopoverDismissed(true);
      setPopoverIndex(0);
      // 입력 focus 유지 (popover click 이 blur 시키지 않도록 mousedown
      // 에서 preventDefault 했지만, 이중 보호).
      textareaRef.current?.focus();
      return;
    }
    executeCommand(command, '');
  };

  const submit = (): void => {
    const text = value.trim();
    if (!text) return;

    // v0.5.0 — slash command 우선 처리. 매칭되지 않으면 그냥 메시지 전송.
    const parsed = parseSlashInput(text);
    if (parsed !== null) {
      const handled = executeCommand(parsed.command, parsed.arg);
      if (handled) return;
      // 등록된 명령이지만 handler 가 없으면 (조립 오류) 메시지로 fallback.
      // 이러면 사용자에게는 "엇? 그냥 보내졌네?" 정도로 읽힘 — 매우 안전.
    }

    onSubmit(text);
    setValue('');
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>): void => {
    // ★ IME composition 중 모든 키 무시 (한글 자모 결합 보호).
    // Spec: docs/i18n/ime.md
    if (isComposing) return;

    // v0.5.0 — popover 가 열려 있을 때 키보드 탐색 우선.
    if (popoverOpen) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setPopoverIndex((idx) => Math.min(idx + 1, filteredCommands.length - 1));
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setPopoverIndex((idx) => Math.max(idx - 1, 0));
        return;
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        closePopover();
        return;
      }
      if (e.key === 'Tab') {
        // Tab → 자동완성 (trigger + space if hasArgs).
        e.preventDefault();
        const command = filteredCommands[popoverIndex];
        if (command !== undefined) {
          const next = command.hasArgs === true ? `${command.trigger} ` : command.trigger;
          setValue(next);
          setPopoverDismissed(true);
          setPopoverIndex(0);
        }
        return;
      }
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        const command = filteredCommands[popoverIndex];
        if (command !== undefined) {
          handlePickCommand(command);
        }
        return;
      }
    }

    // Enter (no shift) = submit. Shift+Enter = newline.
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      submit();
    }
  };

  // textarea 에 aria-activedescendant 로 활성 항목 가리키기 — listbox 패턴.
  const activeOption = popoverOpen ? filteredCommands[popoverIndex] : undefined;
  const ariaActiveDescendant =
    activeOption !== undefined ? commandOptionId(POPOVER_ID_PREFIX, activeOption) : undefined;

  return (
    <div className="relative border-t border-border-primary bg-bg-secondary p-3">
      {popoverOpen && (
        <SlashCommandPopover
          commands={filteredCommands}
          activeIndex={popoverIndex}
          onPick={handlePickCommand}
          idPrefix={POPOVER_ID_PREFIX}
        />
      )}
      <textarea
        ref={textareaRef}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onCompositionStart={() => setIsComposing(true)}
        onCompositionEnd={() => setIsComposing(false)}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        disabled={disabled}
        rows={3}
        className="w-full resize-none rounded-md border border-border-primary bg-bg-primary px-3 py-2 text-sm leading-relaxed focus:border-border-focus focus:outline-none disabled:opacity-50"
        aria-label="채팅 입력"
        data-testid="chat-input"
        // listbox a11y: textarea 가 controller 역할.
        role="combobox"
        aria-expanded={popoverOpen}
        aria-controls={popoverOpen ? `${POPOVER_ID_PREFIX}-listbox` : undefined}
        aria-autocomplete="list"
        {...(ariaActiveDescendant !== undefined && {
          'aria-activedescendant': ariaActiveDescendant,
        })}
      />

      <div className="mt-2 flex items-center justify-between text-xs text-text-tertiary">
        <span>
          <kbd className="rounded bg-bg-tertiary px-1 py-0.5">Enter</kbd> 전송
          <span className="mx-2">·</span>
          <kbd className="rounded bg-bg-tertiary px-1 py-0.5">Shift+Enter</kbd> 줄바꿈
          <span className="mx-2">·</span>
          <kbd className="rounded bg-bg-tertiary px-1 py-0.5">/</kbd> 명령어
        </span>

        <button
          onClick={submit}
          disabled={disabled || !value.trim()}
          className="rounded bg-accent px-3 py-1 font-medium text-white hover:bg-accent-hover disabled:opacity-50"
          aria-label="전송"
        >
          전송
        </button>
      </div>
    </div>
  );
}
