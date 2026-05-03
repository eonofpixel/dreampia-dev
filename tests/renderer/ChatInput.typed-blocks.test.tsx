/**
 * ChatInput — v0.13.0 (J) typed-block submit path.
 *
 * 검증:
 *   1. onSubmitBlocks 가 제공되면 멘션 submit 시 (text, blocks) 형태로 호출됨
 *   2. text 부분에는 멘션 토큰이 strip 된 상태
 *   3. blocks 에 file_reference 가 포함됨 (path/snippet/line_count/truncated)
 *   4. onSubmitBlocks 미지정 시 v0.6 plain-text 경로 (onSubmit) 사용
 *   5. mentions 없으면 onSubmitBlocks 호출되지 않고 onSubmit(text) 사용
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ChatInput } from '../../src/renderer/components/chat/ChatInput';
import type { ResolverContext } from '../../src/renderer/mentions/resolver';
import { __mockStore } from '../setup';

const SESSIONS: ReadonlyArray<{ id: string; title: string }> = [
  { id: 'sess-1', title: '첫 세션' },
];

function seedFiles(): void {
  __mockStore.workspaceFiles = [
    { path: 'README.md', size_bytes: 200, mtime: '2025-01-01T00:00:00.000Z' },
  ];
}

describe('ChatInput typed-block submit (v0.13.0)', () => {
  it('emits (text, blocks) via onSubmitBlocks when typed path is enabled', async () => {
    seedFiles();
    __mockStore.workspaceFileContents.set('README.md', {
      content: '# Hello\nworld\n',
      truncated: false,
      line_count: 3,
    });
    const onSubmit = vi.fn();
    const onSubmitBlocks = vi.fn();
    const resolverContext: ResolverContext = {
      workspaceRoot: '/ws',
      readFile: async (args) => window.dreampia.workspace.readFile(args),
      getSession: async () => null,
    };
    const user = userEvent.setup();
    render(
      <ChatInput
        onSubmit={onSubmit}
        onSubmitBlocks={onSubmitBlocks}
        workspaceRoot="/ws"
        ignorePatterns={[]}
        sessions={SESSIONS}
        resolverContext={resolverContext}
      />
    );
    const input = screen.getByTestId('chat-input');
    await user.type(input, 'Look at @README.md');
    await user.keyboard('{Escape}');
    await user.keyboard('{Enter}');
    await waitFor(() => {
      expect(onSubmitBlocks).toHaveBeenCalled();
    });
    // Plain onSubmit 은 호출되면 안 된다 — typed 경로로 우선됨.
    expect(onSubmit).not.toHaveBeenCalled();

    const [text, blocks] = onSubmitBlocks.mock.calls[0] as [
      string,
      Array<{ type: string }>,
    ];
    // text 에서 @README.md 토큰이 제거되었어야 함.
    expect(text).not.toContain('@README.md');
    expect(text).toContain('Look at');
    // blocks 안에 file_reference 가 있어야 함.
    const fileRef = blocks.find((b) => b.type === 'file_reference');
    expect(fileRef).toBeDefined();
    if (fileRef && fileRef.type === 'file_reference') {
      const fb = fileRef as unknown as {
        path: string;
        snippet: string;
        line_count: number;
        truncated: boolean;
      };
      expect(fb.path).toBe('README.md');
      expect(fb.snippet).toContain('# Hello');
      expect(fb.line_count).toBe(3);
      expect(fb.truncated).toBe(false);
    }
  });

  it('falls back to onSubmit (plain-text) when onSubmitBlocks is not provided', async () => {
    seedFiles();
    __mockStore.workspaceFileContents.set('README.md', {
      content: '# Hello\n',
      truncated: false,
      line_count: 1,
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
    await user.type(input, 'See @README.md');
    await user.keyboard('{Escape}');
    await user.keyboard('{Enter}');
    await waitFor(() => {
      expect(onSubmit).toHaveBeenCalled();
    });
    const arg = onSubmit.mock.calls[0]?.[0] as string;
    expect(arg).toContain('--- 컨텍스트 ---');
    expect(arg).toContain('# Hello');
  });

  it('uses onSubmit(text) when there are no mentions even with onSubmitBlocks set', async () => {
    seedFiles();
    const onSubmit = vi.fn();
    const onSubmitBlocks = vi.fn();
    const resolverContext: ResolverContext = {
      workspaceRoot: '/ws',
      readFile: async (args) => window.dreampia.workspace.readFile(args),
      getSession: async () => null,
    };
    const user = userEvent.setup();
    render(
      <ChatInput
        onSubmit={onSubmit}
        onSubmitBlocks={onSubmitBlocks}
        workspaceRoot="/ws"
        ignorePatterns={[]}
        sessions={SESSIONS}
        resolverContext={resolverContext}
      />
    );
    const input = screen.getByTestId('chat-input');
    await user.type(input, 'just text, no mentions');
    await user.keyboard('{Enter}');
    expect(onSubmit).toHaveBeenCalledWith('just text, no mentions');
    expect(onSubmitBlocks).not.toHaveBeenCalled();
  });
});
