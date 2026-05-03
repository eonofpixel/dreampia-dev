/**
 * ChatInput — message composer with Korean IME-safe submission.
 *
 * Spec:
 *   - docs/i18n/ime.md (composition events)
 *   - docs/design/components/input.md
 *   - docs/ux/patterns/F-018-slash-commands.md (/ trigger)
 *   - docs/ux/patterns/F-019-mention-palette.md (@ trigger)
 */

import { useEffect, useRef, useState, type KeyboardEvent } from 'react';

export interface ChatInputProps {
  onSubmit: (text: string) => void;
  placeholder?: string;
  disabled?: boolean;
  /**
   * Onboarding 추천 prompt → 자동 채움. 외부에서 값이 바뀔 때마다 input 에 반영.
   * 사용자가 즉시 검토/수정할 수 있도록 auto-submit 은 하지 않는다.
   */
  initialValue?: string;
}

export function ChatInput({
  onSubmit,
  placeholder = '메시지를 입력하세요',
  disabled,
  initialValue,
}: ChatInputProps): React.JSX.Element {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [value, setValue] = useState(initialValue ?? '');
  const [isComposing, setIsComposing] = useState(false);

  // initialValue 가 외부에서 변경되면 (예: 추천 prompt 클릭) input 에 반영.
  // 빈 문자열은 무시 — 사용자가 직접 입력 후 cleared 상태를 덮어쓰지 않도록.
  useEffect(() => {
    if (initialValue !== undefined && initialValue.length > 0) {
      setValue(initialValue);
      textareaRef.current?.focus();
    }
  }, [initialValue]);

  const submit = (): void => {
    const text = value.trim();
    if (!text) return;
    onSubmit(text);
    setValue('');
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>): void => {
    // ★ IME composition 중 Enter 무시 (한글 자모 결합 보호)
    // Spec: docs/i18n/ime.md
    if (isComposing) return;

    // Enter (no shift) = submit. Shift+Enter = newline.
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      submit();
    }
  };

  return (
    <div className="border-t border-border-primary bg-bg-secondary p-3">
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
      />

      <div className="mt-2 flex items-center justify-between text-xs text-text-tertiary">
        <span>
          <kbd className="rounded bg-bg-tertiary px-1 py-0.5">Enter</kbd> 전송
          <span className="mx-2">·</span>
          <kbd className="rounded bg-bg-tertiary px-1 py-0.5">Shift+Enter</kbd> 줄바꿈
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
