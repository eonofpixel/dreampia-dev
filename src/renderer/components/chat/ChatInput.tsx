/**
 * ChatInput — message composer with Korean IME-safe submission + slash commands
 * + @ mention palette.
 *
 * Spec:
 *   - docs/i18n/ime.md (composition events)
 *   - docs/design/components/input.md
 *   - docs/ux/patterns/F-018-slash-commands.md (/ trigger)
 *   - docs/ux/patterns/F-019-mention-palette.md (@ trigger)
 */

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type ChangeEvent,
} from 'react';
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
import {
  ChatInputSuggestionPopover,
  suggestionOptionId,
  type SuggestionItem,
} from './ChatInputSuggestionPopover';
import { findActiveMention, findAllMentions, type MentionMatch } from '../../mentions/parser';
import {
  resolveMentions,
  formatMentionsAsContext,
  type ResolverContext,
} from '../../mentions/resolver';
import type { FileEntry } from '@/types/workspace';
import { useT } from '../../i18n';

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
  /**
   * v0.6.0 (F-019) — @ mention 의 file 후보를 enumerate 할 workspace root.
   * 미지정 시 파일 멘션 popover 는 표시되지 않는다 (file 후보 fetch 못함).
   */
  workspaceRoot?: string;
  /**
   * v0.6.0 (F-019) — file enumeration 시 제외할 glob patterns.
   * 미지정 시 빈 배열 → 모든 파일 노출 (caller 가 명시 권장).
   */
  ignorePatterns?: ReadonlyArray<string>;
  /**
   * v0.6.0 (F-019) — `@session:` 멘션 popover 후보. id + title 만 사용.
   */
  sessions?: ReadonlyArray<{ id: string; title: string }>;
  /**
   * v0.6.0 (F-019) — submit 시 mention resolve 에 사용. 미지정 시 멘션 resolve
   * 단계가 skip 되어 사용자 입력은 raw 그대로 onSubmit 에 전달된다.
   */
  resolverContext?: ResolverContext;
}

const SLASH_POPOVER_PREFIX = 'slash-command';
const MENTION_POPOVER_PREFIX = 'mention';
const MENTION_SUGGESTION_LIMIT = 50;

/** 멘션 popover 후보 SuggestionItem (origin 보존). */
type MentionSuggestion = SuggestionItem & {
  /** 'file' | 'session'. unknown 케이스에선 helper item 도 노출 X. */
  kind: 'file' | 'session';
  /**
   * 사용자가 선택했을 때 멘션 토큰을 어떤 문자열로 교체할지.
   * file → `@${path}`, session → `@session:${id}`.
   */
  insert: string;
};

export function ChatInput({
  onSubmit,
  placeholder,
  disabled,
  initialValue,
  commandHandlers,
  workspaceRoot,
  ignorePatterns,
  sessions,
  resolverContext,
}: ChatInputProps): React.JSX.Element {
  const t = useT();
  // 사용자가 명시 placeholder 를 넘기지 않으면 locale-aware default.
  const effectivePlaceholder = placeholder ?? t('chat.input.placeholder');
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [value, setValue] = useState(initialValue ?? '');
  const [isComposing, setIsComposing] = useState(false);
  /**
   * cursor 위치 (selectionStart). textarea 의 selectionStart 는 `useState`
   * 가 아니라 imperative 하게 읽어야 하므로 setValue 후 microtask 안에서
   * sync 하기 위해 useState + ref 이중 보유. ref 는 keyboard handler 의 즉시
   * 사용용.
   */
  const [cursorPos, setCursorPos] = useState(0);
  const cursorPosRef = useRef(0);

  // v0.5.0 — slash command popover 상태.
  // popoverOpen 은 'commands 가 비어있지 않을 때만 보임' 과 별개로 두어,
  // Esc 로 강제 close 한 상태에서 사용자가 같은 `/` 입력을 유지하더라도
  // 다시 열리지 않도록 한다 (간단한 dismissed 토글 대용).
  const [popoverDismissed, setPopoverDismissed] = useState(false);
  const [popoverIndex, setPopoverIndex] = useState(0);

  // v0.6.0 — @ mention popover 상태.
  const [mentionDismissed, setMentionDismissed] = useState(false);
  const [mentionIndex, setMentionIndex] = useState(0);
  // file entries 는 lazy load — 첫 @ trigger 시 한 번 IPC 호출.
  const [fileEntries, setFileEntries] = useState<ReadonlyArray<FileEntry> | null>(null);
  const [fileLoadAttempted, setFileLoadAttempted] = useState(false);

  // initialValue 가 외부에서 변경되면 (예: 추천 prompt 클릭) input 에 반영.
  // 빈 문자열은 무시 — 사용자가 직접 입력 후 cleared 상태를 덮어쓰지 않도록.
  useEffect(() => {
    if (initialValue !== undefined && initialValue.length > 0) {
      setValue(initialValue);
      // 새 prompt 가 들어오면 cursor 도 끝으로 옮김 — 사용자가 바로 이어서
      // 타이핑할 수 있도록.
      cursorPosRef.current = initialValue.length;
      setCursorPos(initialValue.length);
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

  const slashOpen = filteredCommands.length > 0;

  // popover 가 열려있는데 인덱스가 범위를 벗어나면 0 으로 reset.
  // 사용자가 입력을 좁혀 매칭 개수가 줄었을 때 발생.
  useEffect(() => {
    if (!slashOpen) return;
    if (popoverIndex >= filteredCommands.length) {
      setPopoverIndex(0);
    }
  }, [slashOpen, popoverIndex, filteredCommands.length]);

  // value 가 `/` 로 시작하지 않게 변하면 dismissed flag 도 리셋
  // — 다음에 다시 `/` 를 입력하면 자연스럽게 popover 가 열리도록.
  useEffect(() => {
    if (!value.startsWith('/') && popoverDismissed) {
      setPopoverDismissed(false);
    }
  }, [value, popoverDismissed]);

  // ─────────────────────────────────────────────────────────────
  // @ mention detection — cursor-aware
  // ─────────────────────────────────────────────────────────────

  /**
   * 사용자가 cursor 위치 기준으로 멘션 안에 있는지 (dismissed 와 무관).
   * dismissed 플래그 reset 판단에 사용 — 멘션 토큰을 벗어나면 dismissed 해제.
   */
  const baseMention = useMemo<MentionMatch | null>(() => {
    if (isComposing) return null;
    if (value.startsWith('/')) return null; // slash 우선
    return findActiveMention(value, cursorPos);
  }, [value, cursorPos, isComposing]);

  /**
   * 활성 멘션 (popover 가 보일 때의 멘션). dismissed 면 null.
   */
  const activeMention = useMemo<MentionMatch | null>(() => {
    if (mentionDismissed) return null;
    return baseMention;
  }, [baseMention, mentionDismissed]);

  // 사용자가 멘션 토큰을 벗어나면 (e.g. 공백을 추가했거나 `@` 를 지웠음)
  // dismissed 플래그도 리셋 — 다음 `@` 입력 시 자연스럽게 열림.
  useEffect(() => {
    if (baseMention === null && mentionDismissed) {
      setMentionDismissed(false);
    }
  }, [baseMention, mentionDismissed]);

  // 첫 멘션 trigger 시 file enumeration 한 번. workspaceRoot 가 없으면 skip.
  useEffect(() => {
    if (activeMention === null) return;
    if (fileLoadAttempted) return;
    if (workspaceRoot === undefined || workspaceRoot.length === 0) return;
    setFileLoadAttempted(true);
    const ws = typeof window !== 'undefined' ? window.dreampia?.workspace : undefined;
    if (ws === undefined || typeof ws.listFiles !== 'function') return;
    void (async () => {
      try {
        const result = await ws.listFiles({
          workspace_root: workspaceRoot,
          ignore_patterns: ignorePatterns ? [...ignorePatterns] : undefined,
        });
        if (result.ok) setFileEntries(result.value);
      } catch {
        // silent — IPC 실패 시 popover 는 빈 상태로 표시.
      }
    })();
  }, [activeMention, fileLoadAttempted, workspaceRoot, ignorePatterns]);

  // 멘션 후보. activeMention.kind 에 따라 file / session 분기.
  const mentionSuggestions = useMemo<ReadonlyArray<MentionSuggestion>>(() => {
    if (activeMention === null) return [];
    const q = activeMention.value.toLowerCase();
    if (activeMention.kind === 'session') {
      const list = sessions ?? [];
      return list
        .filter((s) => q.length === 0 || s.title.toLowerCase().includes(q) || s.id.toLowerCase().includes(q))
        .slice(0, MENTION_SUGGESTION_LIMIT)
        .map(
          (s): MentionSuggestion => ({
            id: `session-${s.id}`,
            primary: s.title,
            secondary: t('chat.input.mention.session_label'),
            badge: '@session',
            kind: 'session',
            insert: `@session:${s.id}`,
          })
        );
    }
    if (activeMention.kind === 'file') {
      const list = fileEntries ?? [];
      return list
        .filter((f) => q.length === 0 || f.path.toLowerCase().includes(q))
        .slice(0, MENTION_SUGGESTION_LIMIT)
        .map(
          (f): MentionSuggestion => ({
            id: `file-${f.path}`,
            primary: f.path,
            secondary: `${(f.size_bytes / 1024).toFixed(1)} KB`,
            badge: '@file',
            kind: 'file',
            insert: `@${f.path}`,
          })
        );
    }
    // 'unknown' — `@` 만 입력. 사용자가 아직 type 안 끝난 상태.
    // Helper 한 줄: "session: 세션 첨부".
    return [
      {
        id: 'helper-session',
        primary: t('chat.input.mention.session_helper_primary'),
        secondary: t('chat.input.mention.session_helper_secondary'),
        badge: '@',
        kind: 'session',
        insert: '@session:',
      },
    ];
  }, [activeMention, sessions, fileEntries, t]);

  const mentionOpen = activeMention !== null && mentionSuggestions.length > 0;

  useEffect(() => {
    if (!mentionOpen) return;
    if (mentionIndex >= mentionSuggestions.length) {
      setMentionIndex(0);
    }
  }, [mentionOpen, mentionIndex, mentionSuggestions.length]);

  // ─────────────────────────────────────────────────────────────
  // Handlers
  // ─────────────────────────────────────────────────────────────

  const closeSlashPopover = (): void => {
    setPopoverDismissed(true);
    setPopoverIndex(0);
  };

  const closeMentionPopover = (): void => {
    setMentionDismissed(true);
    setMentionIndex(0);
  };

  const executeCommand = (command: SlashCommand, arg: string): boolean => {
    const handler = commandHandlers?.[command.id];
    if (handler === undefined) return false;
    handler(arg.length === 0 ? undefined : arg);
    setValue('');
    cursorPosRef.current = 0;
    setCursorPos(0);
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
      const next = `${command.trigger} `;
      setValue(next);
      cursorPosRef.current = next.length;
      setCursorPos(next.length);
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

  /**
   * 멘션 popover 에서 항목 선택. activeMention 의 토큰을 `insert` 문자열로
   * 교체한 뒤 cursor 를 그 끝으로 이동.
   */
  const handlePickMention = (item: MentionSuggestion): void => {
    if (activeMention === null) return;
    const before = value.slice(0, activeMention.start);
    const after = value.slice(activeMention.end);
    // session helper 의 경우 이어서 user 가 session id 를 입력해야 하므로
    // popover 는 닫지 않고 keep open. 단 dismissed 는 false 로 — 이미 user
    // intent 표시.
    const insertText = item.insert;
    const next = `${before}${insertText}${after}`;
    setValue(next);
    const newCursor = before.length + insertText.length;
    cursorPosRef.current = newCursor;
    setCursorPos(newCursor);
    setMentionIndex(0);
    // session helper 는 popover 를 닫지 않음 — 사용자가 ID 를 이어서 입력 가능.
    if (item.kind === 'session' && item.id === 'helper-session') {
      // dismissed 그대로 false — popover 가 다시 떠도 됨.
    } else {
      setMentionDismissed(true);
    }
    textareaRef.current?.focus();
  };

  /**
   * Submit 파이프라인:
   *   1) value trim
   *   2) slash 우선 처리
   *   3) 멘션 parse + resolve (resolverContext 있을 때만)
   *   4) onSubmit 호출 + clear
   */
  const submit = (): void => {
    const text = value.trim();
    if (!text) return;

    // v0.5.0 — slash command 우선 처리. 매칭되지 않으면 그냥 메시지 전송.
    const parsed = parseSlashInput(text);
    if (parsed !== null) {
      const handled = executeCommand(parsed.command, parsed.arg);
      if (handled) return;
      // 등록된 명령이지만 handler 가 없으면 (조립 오류) 메시지로 fallback.
    }

    // v0.6.0 — 멘션 resolve. resolverContext 미지정 시 plain 전송.
    const mentions = findAllMentions(text);
    if (mentions.length === 0 || resolverContext === undefined) {
      onSubmit(text);
      setValue('');
      cursorPosRef.current = 0;
      setCursorPos(0);
      return;
    }

    // resolve 는 비동기 — 사용자에게 즉시 input clear 해주고, resolved 텍스트
    // 가 도착하면 onSubmit. 입력 중간에 추가 키 입력이 들어와도 안전하다
    // (이전 submit 의 resolve 결과는 그냥 onSubmit 으로 흘러감).
    setValue('');
    cursorPosRef.current = 0;
    setCursorPos(0);
    void (async () => {
      try {
        const resolved = await resolveMentions(mentions, resolverContext);
        const augmented = formatMentionsAsContext(text, resolved);
        onSubmit(augmented);
      } catch {
        // resolve 단계가 통째로 실패해도 사용자 메시지는 보존 — raw 전송.
        onSubmit(text);
      }
    })();
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>): void => {
    // ★ IME composition 중 모든 키 무시 (한글 자모 결합 보호).
    // Spec: docs/i18n/ime.md
    if (isComposing) return;

    // v0.5.0 — slash popover 가 열려 있을 때 키보드 탐색 우선.
    if (slashOpen) {
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
        closeSlashPopover();
        return;
      }
      if (e.key === 'Tab') {
        // Tab → 자동완성 (trigger + space if hasArgs).
        e.preventDefault();
        const command = filteredCommands[popoverIndex];
        if (command !== undefined) {
          const next = command.hasArgs === true ? `${command.trigger} ` : command.trigger;
          setValue(next);
          cursorPosRef.current = next.length;
          setCursorPos(next.length);
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

    // v0.6.0 — 멘션 popover 가 열려 있을 때 키보드 탐색.
    if (mentionOpen) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setMentionIndex((idx) => Math.min(idx + 1, mentionSuggestions.length - 1));
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setMentionIndex((idx) => Math.max(idx - 1, 0));
        return;
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        closeMentionPopover();
        return;
      }
      if (e.key === 'Tab') {
        e.preventDefault();
        const item = mentionSuggestions[mentionIndex];
        if (item !== undefined) handlePickMention(item);
        return;
      }
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        const item = mentionSuggestions[mentionIndex];
        if (item !== undefined) handlePickMention(item);
        return;
      }
    }

    // Enter (no shift) = submit. Shift+Enter = newline.
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      submit();
    }
  };

  // textarea selection 추적 — onSelect 와 onKeyUp 양쪽에서 selectionStart 를
  // 읽어 cursor state 를 sync.
  const syncCursor = useCallback(() => {
    const ta = textareaRef.current;
    if (ta === null) return;
    const next = ta.selectionStart;
    cursorPosRef.current = next;
    setCursorPos(next);
  }, []);

  const handleChange = (e: ChangeEvent<HTMLTextAreaElement>): void => {
    setValue(e.target.value);
    // 입력 직후 cursor 도 갱신. e.target.selectionStart 가 즉시 정확.
    const next = e.target.selectionStart;
    cursorPosRef.current = next;
    setCursorPos(next);
  };

  // textarea 에 aria-activedescendant 로 활성 항목 가리키기 — listbox 패턴.
  const ariaActiveDescendant = (() => {
    if (slashOpen) {
      const cmd = filteredCommands[popoverIndex];
      if (cmd !== undefined) return commandOptionId(SLASH_POPOVER_PREFIX, cmd);
    }
    if (mentionOpen) {
      const item = mentionSuggestions[mentionIndex];
      if (item !== undefined) return suggestionOptionId(MENTION_POPOVER_PREFIX, item.id);
    }
    return undefined;
  })();

  const popoverIsOpen = slashOpen || mentionOpen;
  // a11y: combobox 는 aria-controls / aria-expanded 가 항상 정의돼 있어야 한다
  // (jsx-a11y rule). popover 가 닫혀 있으면 default 로 슬래시 listbox id 를
  // 가리킴 — 안 보이는 element 라도 attribute 자체는 valid.
  const ariaControls = mentionOpen
    ? `${MENTION_POPOVER_PREFIX}-listbox`
    : `${SLASH_POPOVER_PREFIX}-listbox`;

  return (
    <div className="relative border-t border-border-primary bg-bg-secondary p-3">
      {slashOpen && (
        <SlashCommandPopover
          commands={filteredCommands}
          activeIndex={popoverIndex}
          onPick={handlePickCommand}
          idPrefix={SLASH_POPOVER_PREFIX}
        />
      )}
      {!slashOpen && mentionOpen && (
        <ChatInputSuggestionPopover<MentionSuggestion>
          items={mentionSuggestions}
          activeIndex={mentionIndex}
          onPick={handlePickMention}
          idPrefix={MENTION_POPOVER_PREFIX}
          ariaLabel={t('chat.input.mention_popover_aria')}
          testid="mention-popover"
          optionTestidPrefix="mention-option"
          footerHint={t('chat.input.mention_footer')}
        />
      )}
      <textarea
        ref={textareaRef}
        value={value}
        onChange={handleChange}
        onSelect={syncCursor}
        onKeyUp={syncCursor}
        onClick={syncCursor}
        onCompositionStart={() => setIsComposing(true)}
        onCompositionEnd={() => setIsComposing(false)}
        onKeyDown={handleKeyDown}
        placeholder={effectivePlaceholder}
        disabled={disabled}
        rows={3}
        className="w-full resize-none rounded-md border border-border-primary bg-bg-primary px-3 py-2 text-sm leading-relaxed focus:border-border-focus focus:outline-none disabled:opacity-50"
        aria-label={t('chat.input.aria_label')}
        data-testid="chat-input"
        // listbox a11y: textarea 가 controller 역할. combobox role 은
        // aria-controls / aria-expanded 가 항상 정의돼 있어야 한다.
        role="combobox"
        aria-expanded={popoverIsOpen}
        aria-controls={ariaControls}
        aria-autocomplete="list"
        {...(ariaActiveDescendant !== undefined && {
          'aria-activedescendant': ariaActiveDescendant,
        })}
      />

      <div className="mt-2 flex items-center justify-between text-xs text-text-tertiary">
        <span>
          <kbd className="rounded bg-bg-tertiary px-1 py-0.5">Enter</kbd>{' '}
          {t('chat.input.hint.enter_send')}
          <span className="mx-2">·</span>
          <kbd className="rounded bg-bg-tertiary px-1 py-0.5">Shift+Enter</kbd>{' '}
          {t('chat.input.hint.shift_enter_newline')}
          <span className="mx-2">·</span>
          <kbd className="rounded bg-bg-tertiary px-1 py-0.5">/</kbd>{' '}
          {t('chat.input.hint.slash_commands')}
          <span className="mx-2">·</span>
          <kbd className="rounded bg-bg-tertiary px-1 py-0.5">@</kbd>{' '}
          {t('chat.input.hint.at_mention')}
        </span>

        <button
          onClick={submit}
          disabled={disabled || !value.trim()}
          className="rounded bg-accent px-3 py-1 font-medium text-white hover:bg-accent-hover disabled:opacity-50"
          aria-label={t('chat.input.send')}
        >
          {t('chat.input.send')}
        </button>
      </div>
    </div>
  );
}
