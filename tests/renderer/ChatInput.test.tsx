/**
 * ChatInput — IME-safe Korean input verification.
 *
 * Critical test: Enter key during composition (한글 자모 결합 중) must NOT submit.
 *
 * Spec: docs/i18n/ime.md, docs/design/components/input.md
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { fireEvent } from '@testing-library/react';
import { ChatInput } from '../../src/renderer/components/chat/ChatInput';

describe('ChatInput', () => {
  it('renders with default Korean placeholder', () => {
    render(<ChatInput onSubmit={() => {}} />);
    expect(screen.getByPlaceholderText('메시지를 입력하세요')).toBeInTheDocument();
  });

  it('submits on Enter (no IME)', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();

    render(<ChatInput onSubmit={onSubmit} />);
    const input = screen.getByTestId('chat-input');

    await user.type(input, 'hello');
    await user.keyboard('{Enter}');

    expect(onSubmit).toHaveBeenCalledWith('hello');
    expect(onSubmit).toHaveBeenCalledTimes(1);
  });

  it('does NOT submit on Shift+Enter (newline)', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();

    render(<ChatInput onSubmit={onSubmit} />);
    const input = screen.getByTestId('chat-input');

    await user.type(input, 'hello');
    await user.keyboard('{Shift>}{Enter}{/Shift}');

    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('★ does NOT submit during IME composition (한글 보호)', () => {
    const onSubmit = vi.fn();

    render(<ChatInput onSubmit={onSubmit} />);
    const input = screen.getByTestId('chat-input') as HTMLTextAreaElement;

    // 한글 자모 조합 시뮬레이션:
    //   1. composition 시작 (사용자가 'ㅇ' 입력)
    //   2. composition 진행 ('안')
    //   3. 사용자가 Enter 누름 → 자모 결합 확정 (전송 X)
    fireEvent.compositionStart(input);

    // value 채워짐 (조합 중)
    fireEvent.input(input, { target: { value: '안녕' } });

    // 조합 중 Enter → submit X
    fireEvent.keyDown(input, { key: 'Enter', shiftKey: false });

    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('★ submits on Enter AFTER composition ends', () => {
    const onSubmit = vi.fn();

    render(<ChatInput onSubmit={onSubmit} />);
    const input = screen.getByTestId('chat-input') as HTMLTextAreaElement;

    // 한글 입력 + 조합 종료
    fireEvent.compositionStart(input);
    fireEvent.input(input, { target: { value: '안녕하세요' } });
    fireEvent.compositionEnd(input);

    // 이제 Enter → submit OK
    fireEvent.keyDown(input, { key: 'Enter', shiftKey: false });

    expect(onSubmit).toHaveBeenCalledWith('안녕하세요');
  });

  it('clears input after submit', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();

    render(<ChatInput onSubmit={onSubmit} />);
    const input = screen.getByTestId('chat-input') as HTMLTextAreaElement;

    await user.type(input, '테스트');
    fireEvent.compositionEnd(input); // 한글 조합 끝
    fireEvent.keyDown(input, { key: 'Enter', shiftKey: false });

    expect(input.value).toBe('');
  });

  it('does not submit empty string', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();

    render(<ChatInput onSubmit={onSubmit} />);

    await user.keyboard('{Enter}');
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('does not submit whitespace-only', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();

    render(<ChatInput onSubmit={onSubmit} />);
    const input = screen.getByTestId('chat-input');

    await user.type(input, '   ');
    await user.keyboard('{Enter}');

    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('respects disabled state', () => {
    render(<ChatInput onSubmit={() => {}} disabled />);
    const input = screen.getByTestId('chat-input');
    expect(input).toBeDisabled();
  });

  it('uses custom placeholder', () => {
    render(<ChatInput onSubmit={() => {}} placeholder="후속 변경 사항을 부탁하세요" />);
    expect(screen.getByPlaceholderText('후속 변경 사항을 부탁하세요')).toBeInTheDocument();
  });
});
