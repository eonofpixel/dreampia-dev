/**
 * ChatInput — F-019 @ mention 통합 테스트.
 *
 * 검증:
 *   1. `@s` 입력 시 file 멘션 popover 가 열리고 매칭 항목 표시
 *   2. `@session:` 입력 시 session 후보 표시
 *   3. ↑↓ 키로 highlighted 이동, Enter 로 항목 선택 (텍스트 교체)
 *   4. Esc 로 popover 닫기 (input 보존)
 *   5. IME composition 중에는 popover 가 열리지 않음
 *   6. 슬래시 popover 와 동시 표시 X (`/...` 입력 시 mention popover 숨김)
 *   7. submit 시 mention resolve → context prepend
 *   8. 클릭 (mouseDown) 으로도 항목 선택
 *
 * Spec: docs/ux/patterns/F-019-mention-palette.md, docs/i18n/ime.md
 */

import { describe, it, expect, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ChatInput } from '../../src/renderer/components/chat/ChatInput';
import type { ResolverContext } from '../../src/renderer/mentions/resolver';
import { __mockStore } from '../setup';

const SESSIONS: ReadonlyArray<{ id: string; title: string }> = [
  { id: 'sess-1', title: '첫 세션' },
  { id: 'sess-2', title: '두번째 세션' },
];

function seedFiles(): void {
  __mockStore.workspaceFiles = [
    { path: 'README.md', size_bytes: 200, mtime: '2025-01-01T00:00:00.000Z' },
    { path: 'src/main/index.ts', size_bytes: 1024, mtime: '2025-01-01T00:00:00.000Z' },
    { path: 'src/main/preload.ts', size_bytes: 512, mtime: '2025-01-01T00:00:00.000Z' },
  ];
}

describe('ChatInput @ mention (F-019)', () => {
  it('typing @ opens mention popover with helper item (unknown kind)', async () => {
    seedFiles();
    const user = userEvent.setup();
    render(
      <ChatInput
        onSubmit={() => {}}
        workspaceRoot="/ws"
        ignorePatterns={[]}
        sessions={SESSIONS}
      />
    );

    const input = screen.getByTestId('chat-input');
    await user.type(input, '@');
    // unknown kind 일 땐 helper item ('session:') 표시.
    await waitFor(() =>
      expect(screen.getByTestId('mention-popover')).toBeInTheDocument()
    );
    expect(screen.getByTestId('mention-option-helper-session')).toBeInTheDocument();
  });

  it('typing @s shows file matches (kind=file)', async () => {
    seedFiles();
    const user = userEvent.setup();
    render(
      <ChatInput
        onSubmit={() => {}}
        workspaceRoot="/ws"
        ignorePatterns={[]}
        sessions={SESSIONS}
      />
    );

    const input = screen.getByTestId('chat-input');
    await user.type(input, '@s');
    await waitFor(() =>
      expect(screen.getByTestId('mention-popover')).toBeInTheDocument()
    );
    // 'src/main/index.ts' 와 'src/main/preload.ts' 모두 's' 포함.
    expect(screen.getByTestId('mention-option-file-src/main/index.ts')).toBeInTheDocument();
    expect(screen.getByTestId('mention-option-file-src/main/preload.ts')).toBeInTheDocument();
  });

  it('typing @session: lists session candidates', async () => {
    seedFiles();
    const user = userEvent.setup();
    render(
      <ChatInput
        onSubmit={() => {}}
        workspaceRoot="/ws"
        ignorePatterns={[]}
        sessions={SESSIONS}
      />
    );

    const input = screen.getByTestId('chat-input');
    await user.type(input, '@session:');
    await waitFor(() =>
      expect(screen.getByTestId('mention-popover')).toBeInTheDocument()
    );
    expect(screen.getByTestId('mention-option-session-sess-1')).toBeInTheDocument();
    expect(screen.getByTestId('mention-option-session-sess-2')).toBeInTheDocument();
  });

  it('★ does NOT open mention popover during IME composition', async () => {
    seedFiles();
    render(
      <ChatInput
        onSubmit={() => {}}
        workspaceRoot="/ws"
        ignorePatterns={[]}
        sessions={SESSIONS}
      />
    );

    const input = screen.getByTestId('chat-input') as HTMLTextAreaElement;
    fireEvent.compositionStart(input);
    // 조합 중 입력 — fireEvent.change 는 onChange handler 를 정상 trigger.
    fireEvent.change(input, { target: { value: '@s' } });
    // composition 중에는 popover 가 안 떠야 한다.
    expect(screen.queryByTestId('mention-popover')).toBeNull();

    // composition 종료 + cursor 를 끝으로 옮기고 select 이벤트로 syncCursor.
    fireEvent.compositionEnd(input);
    input.setSelectionRange(2, 2);
    fireEvent.select(input);
    // composition 끝나면 같은 value + 갱신된 cursor 로 popover 등장.
    await waitFor(() =>
      expect(screen.getByTestId('mention-popover')).toBeInTheDocument()
    );
  });

  it('mention popover hidden when input starts with / (slash takes precedence)', async () => {
    seedFiles();
    const user = userEvent.setup();
    render(
      <ChatInput
        onSubmit={() => {}}
        workspaceRoot="/ws"
        ignorePatterns={[]}
        sessions={SESSIONS}
      />
    );

    const input = screen.getByTestId('chat-input');
    await user.type(input, '/help @s');
    // slash popover 는 `/help` 부분이 매칭이라 떠 있을 수 있고, mention popover 는 X.
    expect(screen.queryByTestId('mention-popover')).toBeNull();
  });

  it('ArrowDown moves active mention down', async () => {
    seedFiles();
    const user = userEvent.setup();
    render(
      <ChatInput
        onSubmit={() => {}}
        workspaceRoot="/ws"
        ignorePatterns={[]}
        sessions={SESSIONS}
      />
    );

    const input = screen.getByTestId('chat-input');
    await user.type(input, '@s');
    await waitFor(() =>
      expect(screen.getByTestId('mention-popover')).toBeInTheDocument()
    );
    // 첫 항목 active.
    const items = screen.getAllByRole('option');
    expect(items[0]).toHaveAttribute('aria-selected', 'true');
    await user.keyboard('{ArrowDown}');
    // 1번째로 이동.
    const itemsAfter = screen.getAllByRole('option');
    expect(itemsAfter[0]).toHaveAttribute('aria-selected', 'false');
    expect(itemsAfter[1]).toHaveAttribute('aria-selected', 'true');
  });

  it('Escape closes mention popover but preserves input value', async () => {
    seedFiles();
    const user = userEvent.setup();
    render(
      <ChatInput
        onSubmit={() => {}}
        workspaceRoot="/ws"
        ignorePatterns={[]}
        sessions={SESSIONS}
      />
    );

    const input = screen.getByTestId('chat-input') as HTMLTextAreaElement;
    await user.type(input, '@s');
    await waitFor(() =>
      expect(screen.getByTestId('mention-popover')).toBeInTheDocument()
    );
    await user.keyboard('{Escape}');
    expect(screen.queryByTestId('mention-popover')).toBeNull();
    expect(input.value).toBe('@s');
  });

  it('Enter on highlighted file inserts @path into input', async () => {
    seedFiles();
    const user = userEvent.setup();
    render(
      <ChatInput
        onSubmit={() => {}}
        workspaceRoot="/ws"
        ignorePatterns={[]}
        sessions={SESSIONS}
      />
    );

    const input = screen.getByTestId('chat-input') as HTMLTextAreaElement;
    await user.type(input, '@README');
    await waitFor(() =>
      expect(
        screen.getByTestId('mention-option-file-README.md')
      ).toBeInTheDocument()
    );
    await user.keyboard('{Enter}');
    expect(input.value).toContain('@README.md');
  });

  it('mouseDown on a popover item picks that item', async () => {
    seedFiles();
    const user = userEvent.setup();
    render(
      <ChatInput
        onSubmit={() => {}}
        workspaceRoot="/ws"
        ignorePatterns={[]}
        sessions={SESSIONS}
      />
    );

    const input = screen.getByTestId('chat-input') as HTMLTextAreaElement;
    await user.type(input, '@README');
    await waitFor(() =>
      expect(
        screen.getByTestId('mention-option-file-README.md')
      ).toBeInTheDocument()
    );
    fireEvent.mouseDown(screen.getByTestId('mention-option-file-README.md'));
    expect(input.value).toContain('@README.md');
  });

  it('submit with no mentions calls onSubmit with raw text', async () => {
    seedFiles();
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    render(
      <ChatInput
        onSubmit={onSubmit}
        workspaceRoot="/ws"
        ignorePatterns={[]}
        sessions={SESSIONS}
      />
    );

    const input = screen.getByTestId('chat-input');
    await user.type(input, 'hello world');
    await user.keyboard('{Enter}');
    expect(onSubmit).toHaveBeenCalledWith('hello world');
  });

  it('submit with file @ mention prepends context (resolver wired)', async () => {
    seedFiles();
    __mockStore.workspaceFileContents.set('README.md', {
      content: '# Hello\nworld\n',
      truncated: false,
      line_count: 3,
    });

    const onSubmit = vi.fn();
    const resolverContext: ResolverContext = {
      workspaceRoot: '/ws',
      readFile: async (args) => window.dreampia.workspace.readFile(args),
      getSession: async () => null,
    };
    const user = userEvent.setup();
    render(
      <ChatInput
        onSubmit={onSubmit}
        workspaceRoot="/ws"
        ignorePatterns={[]}
        sessions={SESSIONS}
        resolverContext={resolverContext}
      />
    );

    const input = screen.getByTestId('chat-input');
    // Type message + @ mention. @README.md 가 멘션으로 인식되도록 앞뒤에 공백.
    await user.type(input, 'Look at @README.md');
    // popover 가 떠있을 수 있으므로 닫고 submit.
    await user.keyboard('{Escape}');
    await user.keyboard('{Enter}');
    // resolver 는 비동기 — onSubmit 이 augmented 텍스트로 호출될 때까지 대기.
    await waitFor(() => {
      expect(onSubmit).toHaveBeenCalled();
    });
    const arg = onSubmit.mock.calls[0]?.[0] as string;
    expect(arg).toContain('Look at @README.md');
    expect(arg).toContain('--- 컨텍스트 ---');
    expect(arg).toContain('@README.md');
    expect(arg).toContain('# Hello');
  });

  it('submit without resolverContext sends raw text even with mentions', async () => {
    seedFiles();
    const onSubmit = vi.fn();
    const user = userEvent.setup();
    render(
      <ChatInput
        onSubmit={onSubmit}
        workspaceRoot="/ws"
        ignorePatterns={[]}
        sessions={SESSIONS}
      />
    );

    const input = screen.getByTestId('chat-input');
    await user.type(input, 'plain @file.ts');
    await user.keyboard('{Escape}');
    await user.keyboard('{Enter}');
    expect(onSubmit).toHaveBeenCalledWith('plain @file.ts');
  });
});
