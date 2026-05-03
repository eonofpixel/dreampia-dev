/**
 * ChatInput — F-018 slash command 통합 테스트.
 *
 * 검증:
 *   1. `/` 입력 시 popover 가 열린다 (그리고 IME composition 중에는 열리지 않음)
 *   2. ↑↓ 키로 highlighted 인덱스 이동
 *   3. Enter → handler 호출 + input clear
 *   4. Esc → popover 닫기 (같은 입력 유지)
 *   5. Tab → trigger 자동완성
 *   6. unknown trigger 는 그냥 메시지로 onSubmit 흘러감
 *   7. handler 가 없는 명령은 메시지로 fallback
 *   8. /model + arg 정상 동작 (handler 가 arg 받음)
 *
 * Spec: docs/ux/patterns/F-018-slash-commands.md, docs/i18n/ime.md
 */

import { describe, it, expect, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ChatInput } from '../../src/renderer/components/chat/ChatInput';
import type { SlashCommandId } from '../../src/renderer/commands/registry';

type Handlers = Partial<Record<SlashCommandId, (arg?: string) => void>>;

describe('ChatInput slash commands (F-018)', () => {
  it('typing / opens popover with all commands', async () => {
    const user = userEvent.setup();
    const handlers: Handlers = { help: vi.fn() };
    render(<ChatInput onSubmit={() => {}} commandHandlers={handlers} />);

    const input = screen.getByTestId('chat-input');
    await user.type(input, '/');
    expect(screen.getByTestId('slash-command-popover')).toBeInTheDocument();
    // 7 commands present.
    expect(screen.getByTestId('slash-command-option-help')).toBeInTheDocument();
    expect(screen.getByTestId('slash-command-option-clear')).toBeInTheDocument();
    expect(screen.getByTestId('slash-command-option-model')).toBeInTheDocument();
  });

  it('narrows popover when continuing to type (/u → only /usage)', async () => {
    const user = userEvent.setup();
    render(<ChatInput onSubmit={() => {}} commandHandlers={{}} />);

    const input = screen.getByTestId('chat-input');
    await user.type(input, '/u');
    expect(screen.queryByTestId('slash-command-option-help')).toBeNull();
    expect(screen.getByTestId('slash-command-option-usage')).toBeInTheDocument();
  });

  it('★ does NOT open popover during IME composition', () => {
    render(<ChatInput onSubmit={() => {}} commandHandlers={{}} />);

    const input = screen.getByTestId('chat-input') as HTMLTextAreaElement;
    fireEvent.compositionStart(input);
    fireEvent.input(input, { target: { value: '/' } });
    // composition 중에는 popover 가 안 떠야 한다.
    expect(screen.queryByTestId('slash-command-popover')).toBeNull();

    fireEvent.compositionEnd(input);
    // composition 끝나면 같은 value 로 popover 가 등장해야 한다.
    expect(screen.getByTestId('slash-command-popover')).toBeInTheDocument();
  });

  it('ArrowDown moves active index down', async () => {
    const user = userEvent.setup();
    render(<ChatInput onSubmit={() => {}} commandHandlers={{}} />);

    const input = screen.getByTestId('chat-input');
    await user.type(input, '/');
    // 초기 active = 0번 (help).
    expect(screen.getByTestId('slash-command-option-help')).toHaveAttribute(
      'aria-selected',
      'true'
    );
    await user.keyboard('{ArrowDown}');
    expect(screen.getByTestId('slash-command-option-help')).toHaveAttribute(
      'aria-selected',
      'false'
    );
    expect(screen.getByTestId('slash-command-option-clear')).toHaveAttribute(
      'aria-selected',
      'true'
    );
  });

  it('ArrowUp moves active index up (clamped at 0)', async () => {
    const user = userEvent.setup();
    render(<ChatInput onSubmit={() => {}} commandHandlers={{}} />);

    const input = screen.getByTestId('chat-input');
    await user.type(input, '/');
    await user.keyboard('{ArrowDown}{ArrowDown}{ArrowUp}');
    expect(screen.getByTestId('slash-command-option-clear')).toHaveAttribute(
      'aria-selected',
      'true'
    );
    // 0 까지 갔다가 한 번 더 ↑ 눌러도 clamp.
    await user.keyboard('{ArrowUp}{ArrowUp}{ArrowUp}');
    expect(screen.getByTestId('slash-command-option-help')).toHaveAttribute(
      'aria-selected',
      'true'
    );
  });

  it('Enter on highlighted command calls its handler and clears input', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    const helpHandler = vi.fn();
    render(
      <ChatInput onSubmit={onSubmit} commandHandlers={{ help: helpHandler }} />
    );

    const input = screen.getByTestId('chat-input') as HTMLTextAreaElement;
    await user.type(input, '/help');
    await user.keyboard('{Enter}');

    expect(helpHandler).toHaveBeenCalledTimes(1);
    expect(onSubmit).not.toHaveBeenCalled();
    expect(input.value).toBe('');
  });

  it('Escape closes popover without invoking handler', async () => {
    const user = userEvent.setup();
    const helpHandler = vi.fn();
    render(<ChatInput onSubmit={() => {}} commandHandlers={{ help: helpHandler }} />);

    const input = screen.getByTestId('chat-input') as HTMLTextAreaElement;
    await user.type(input, '/help');
    expect(screen.getByTestId('slash-command-popover')).toBeInTheDocument();

    await user.keyboard('{Escape}');
    expect(screen.queryByTestId('slash-command-popover')).toBeNull();
    expect(helpHandler).not.toHaveBeenCalled();
    // Esc 는 input 의 value 는 유지해야 한다.
    expect(input.value).toBe('/help');
  });

  it('Tab autocompletes the highlighted trigger (no args)', async () => {
    const user = userEvent.setup();
    render(<ChatInput onSubmit={() => {}} commandHandlers={{}} />);

    const input = screen.getByTestId('chat-input') as HTMLTextAreaElement;
    await user.type(input, '/h');
    await user.keyboard('{Tab}');
    expect(input.value).toBe('/help');
    // popover 는 Tab 후 dismissed.
    expect(screen.queryByTestId('slash-command-popover')).toBeNull();
  });

  it('Tab autocompletes /model with trailing space (hasArgs)', async () => {
    const user = userEvent.setup();
    render(<ChatInput onSubmit={() => {}} commandHandlers={{}} />);

    const input = screen.getByTestId('chat-input') as HTMLTextAreaElement;
    await user.type(input, '/m');
    await user.keyboard('{Tab}');
    expect(input.value).toBe('/model ');
  });

  it('clicking a popover item picks that command', async () => {
    const user = userEvent.setup();
    const usageHandler = vi.fn();
    render(<ChatInput onSubmit={() => {}} commandHandlers={{ usage: usageHandler }} />);

    const input = screen.getByTestId('chat-input');
    await user.type(input, '/');
    fireEvent.mouseDown(screen.getByTestId('slash-command-option-usage'));
    expect(usageHandler).toHaveBeenCalledTimes(1);
  });

  it('/model <name> Enter → handler receives arg', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    const modelHandler = vi.fn();
    render(
      <ChatInput
        onSubmit={onSubmit}
        commandHandlers={{ model: modelHandler }}
      />
    );

    const input = screen.getByTestId('chat-input') as HTMLTextAreaElement;
    await user.type(input, '/model gpt-4o');
    // 인자 입력 단계에서는 popover 가 첫 토큰만 보고 model 1개를 표시할 수
    // 있지만, 사용자가 Enter 를 눌렀을 때는 parseSlashInput → handler arg 흐름.
    // popover 가 열려있을 가능성이 있으므로 Esc 로 먼저 닫고 Enter.
    await user.keyboard('{Escape}');
    await user.keyboard('{Enter}');

    expect(modelHandler).toHaveBeenCalledWith('gpt-4o');
    expect(onSubmit).not.toHaveBeenCalled();
    expect(input.value).toBe('');
  });

  it('unknown trigger falls through to onSubmit', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    render(<ChatInput onSubmit={onSubmit} commandHandlers={{ help: vi.fn() }} />);

    const input = screen.getByTestId('chat-input') as HTMLTextAreaElement;
    // /unknown 은 SLASH_COMMANDS 에 없음. popover 는 안 뜨고 그냥 메시지처럼 전송.
    await user.type(input, '/unknown');
    expect(screen.queryByTestId('slash-command-popover')).toBeNull();
    await user.keyboard('{Enter}');

    expect(onSubmit).toHaveBeenCalledWith('/unknown');
  });

  it('command without registered handler falls through to onSubmit', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    // help 만 등록, /clear 는 등록 X.
    render(<ChatInput onSubmit={onSubmit} commandHandlers={{ help: vi.fn() }} />);

    const input = screen.getByTestId('chat-input') as HTMLTextAreaElement;
    await user.type(input, '/clear');
    await user.keyboard('{Escape}'); // popover 우선 닫고 메시지 전송 의도 확인
    await user.keyboard('{Enter}');

    expect(onSubmit).toHaveBeenCalledWith('/clear');
  });

  it('textarea has combobox a11y attributes when popover open', async () => {
    const user = userEvent.setup();
    render(<ChatInput onSubmit={() => {}} commandHandlers={{}} />);

    const input = screen.getByTestId('chat-input');
    await user.type(input, '/');
    expect(input).toHaveAttribute('role', 'combobox');
    expect(input).toHaveAttribute('aria-expanded', 'true');
    expect(input).toHaveAttribute('aria-activedescendant', 'slash-command-option-help');
  });
});
