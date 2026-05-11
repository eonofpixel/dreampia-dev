/**
 * MessageText — chat text 의 fenced code block 분리 + 액션 부착.
 *
 * v2.8.0 (Builder UX) — minimum subset of #C (AI → editor "Apply").
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import {
  MessageText,
  parseMessageSegments,
} from '../../src/renderer/components/chat/MessageText';

describe('MessageText', () => {
  describe('parseMessageSegments (pure)', () => {
    it('빈 string → 단일 빈 text segment', () => {
      const out = parseMessageSegments('');
      expect(out).toEqual([{ kind: 'text', content: '' }]);
    });

    it('fence 없는 plain text → 단일 text segment', () => {
      const out = parseMessageSegments('hello world');
      expect(out).toEqual([{ kind: 'text', content: 'hello world' }]);
    });

    it('단일 fenced block 추출 (lang 포함)', () => {
      const out = parseMessageSegments('before\n```ts\nconst x = 1;\n```\nafter');
      expect(out).toEqual([
        { kind: 'text', content: 'before\n' },
        { kind: 'code', language: 'ts', content: 'const x = 1;' },
        { kind: 'text', content: '\nafter' },
      ]);
    });

    it('lang 없는 fence → language 빈 string', () => {
      const out = parseMessageSegments('```\nplain code\n```');
      expect(out).toEqual([{ kind: 'code', language: '', content: 'plain code' }]);
    });

    it('연속 multiple fence 추출', () => {
      const out = parseMessageSegments('```js\na\n```\n\n```py\nb\n```');
      expect(out).toHaveLength(3); // code + text(\n\n) + code
      expect(out[0]).toEqual({ kind: 'code', language: 'js', content: 'a' });
      expect(out[1]).toEqual({ kind: 'text', content: '\n\n' });
      expect(out[2]).toEqual({ kind: 'code', language: 'py', content: 'b' });
    });

    it('partial fence (닫힘 없음) → text 로 그대로', () => {
      const out = parseMessageSegments('```ts\nconst x = 1;\nno closing fence');
      expect(out).toEqual([
        { kind: 'text', content: '```ts\nconst x = 1;\nno closing fence' },
      ]);
    });

    it('fence 가 다른 fence 안에 nested 면 첫 닫힘에서 끊김 (단순 정규식 한계)', () => {
      // ``` ... `` ``` 같은 케이스는 비현실적이라 단순 정규식의 한계 수용.
      const out = parseMessageSegments('```a\nfirst\n```\n```b\nsecond\n```');
      expect(out.filter((s) => s.kind === 'code')).toHaveLength(2);
    });
  });

  describe('component', () => {
    it('fence 없는 text → 단일 <p>, code block / 버튼 렌더 안 됨', () => {
      render(<MessageText text="hello" />);
      expect(screen.queryByTestId('message-text')).not.toBeInTheDocument();
      expect(screen.queryByTestId('message-code-block-0')).not.toBeInTheDocument();
    });

    it('fenced block 발견 시 code block UI 마운트', () => {
      render(<MessageText text={'```ts\nconst x = 1;\n```'} />);
      expect(screen.getByTestId('message-text')).toBeInTheDocument();
      expect(screen.getByTestId('message-code-block-0')).toBeInTheDocument();
      expect(screen.getByTestId('message-code-language-0').textContent).toBe('ts');
    });

    it('onSendToCode 미지정 시 버튼 미노출', () => {
      render(<MessageText text={'```\nx\n```'} />);
      expect(screen.queryByTestId('message-code-send-0')).not.toBeInTheDocument();
    });

    it('onSendToCode 지정 시 버튼 클릭이 콜백을 (코드, lang) 으로 호출', async () => {
      const user = userEvent.setup();
      const onSendToCode = vi.fn();
      render(
        <MessageText
          text={'prefix\n```py\nprint(1)\n```\nsuffix'}
          onSendToCode={onSendToCode}
        />
      );
      // segment 0 = text(prefix), segment 1 = code, segment 2 = text(suffix)
      // testid suffix 는 segment 인덱스 — code 는 1번.
      await user.click(screen.getByTestId('message-code-send-1'));
      expect(onSendToCode).toHaveBeenCalledTimes(1);
      expect(onSendToCode).toHaveBeenCalledWith('print(1)', 'py');
    });

    it('lang 없는 fence → 콜백의 language 인자가 undefined', async () => {
      const user = userEvent.setup();
      const onSendToCode = vi.fn();
      render(<MessageText text={'```\nbare\n```'} onSendToCode={onSendToCode} />);
      await user.click(screen.getByTestId('message-code-send-0'));
      expect(onSendToCode).toHaveBeenCalledWith('bare', undefined);
    });

    it('multiple fence 가 각자 개별 버튼', async () => {
      const user = userEvent.setup();
      const onSendToCode = vi.fn();
      render(
        <MessageText
          text={'```js\na\n```\n```ts\nb\n```'}
          onSendToCode={onSendToCode}
        />
      );
      await user.click(screen.getByTestId('message-code-send-0'));
      await user.click(screen.getByTestId('message-code-send-2'));
      expect(onSendToCode).toHaveBeenNthCalledWith(1, 'a', 'js');
      expect(onSendToCode).toHaveBeenNthCalledWith(2, 'b', 'ts');
    });

    it('inverse=true 도 일반 chrome (hairline + canvas-soft) 동일 — v2.10.0 deprecated', () => {
      // v2.10.0 (.omc/DESIGN.md C-2) — inverse prop 은 legacy. user turn 의 새
      // bg-accent-soft 위에서도 일반 code block chrome 으로 충분한 contrast.
      // prop 받아도 internal ignore. 같은 chrome 인지 검증.
      const { container, rerender } = render(<MessageText text={'```\nx\n```'} inverse={false} />);
      const blockFalse = container.querySelector('[data-testid="message-code-block-0"]');
      const classesFalse = blockFalse?.className ?? '';

      rerender(<MessageText text={'```\nx\n```'} inverse={true} />);
      const blockTrue = container.querySelector('[data-testid="message-code-block-0"]');
      expect(blockTrue?.className ?? '').toBe(classesFalse);
    });

    // ────────────────────────────────────────────────────────────
    // v2.8.x — onApplyToFile (C 후속)
    // ────────────────────────────────────────────────────────────

    it('onApplyToFile 미지정 시 Apply 버튼 미노출', () => {
      render(<MessageText text={'```\nx\n```'} onSendToCode={vi.fn()} />);
      expect(screen.queryByTestId('message-code-apply-0')).not.toBeInTheDocument();
      expect(screen.getByTestId('message-code-send-0')).toBeInTheDocument();
    });

    it('onApplyToFile 지정 시 Apply 버튼 클릭이 콜백 호출', async () => {
      const user = userEvent.setup();
      const onApplyToFile = vi.fn();
      render(
        <MessageText
          text={'```ts\nconst x = 1;\n```'}
          onSendToCode={vi.fn()}
          onApplyToFile={onApplyToFile}
        />
      );
      await user.click(screen.getByTestId('message-code-apply-0'));
      expect(onApplyToFile).toHaveBeenCalledWith('const x = 1;', 'ts');
    });

    it('두 버튼 모두 노출 시 Apply 가 먼저 (좌측), Send 가 우측', () => {
      render(
        <MessageText
          text={'```\nx\n```'}
          onSendToCode={vi.fn()}
          onApplyToFile={vi.fn()}
        />
      );
      const apply = screen.getByTestId('message-code-apply-0');
      const send = screen.getByTestId('message-code-send-0');
      // DocumentPosition: apply 가 send 보다 먼저 → DOCUMENT_POSITION_FOLLOWING
      const pos = apply.compareDocumentPosition(send);
      // eslint-disable-next-line no-bitwise
      expect(pos & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    });
  });
});
