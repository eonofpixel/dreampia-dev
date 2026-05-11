/**
 * ApplyToFileModal — chat 코드 블록을 현재 열린 파일에 적용하기 전 confirm.
 *
 * v2.8.x (Builder UX, C 후속).
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { ApplyToFileModal } from '../../src/renderer/components/code/ApplyToFileModal';

// ResizeObserver stub: jsdom 에 없음 — CodeMirror 가 사용.
class ResizeObserverStub {
  observe(): void {}
  unobserve(): void {}
  disconnect(): void {}
}
(globalThis as unknown as { ResizeObserver: typeof ResizeObserverStub }).ResizeObserver =
  ResizeObserverStub;

describe('ApplyToFileModal', () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('target=null → 아무것도 렌더하지 않음', () => {
    const { container } = render(
      <ApplyToFileModal target={null} onAccept={vi.fn()} onCancel={vi.fn()} />
    );
    expect(container.firstChild).toBeNull();
  });

  it('target 지정 시 path + lines delta + 두 버튼 노출', () => {
    render(
      <ApplyToFileModal
        target={{
          path: 'src/foo.ts',
          diskContent: 'a\nb\nc\n',
          newCode: 'a\nb\nc\nd\ne\n',
        }}
        onAccept={vi.fn()}
        onCancel={vi.fn()}
      />
    );
    expect(screen.getByTestId('apply-to-file-modal')).toBeInTheDocument();
    expect(screen.getByTestId('apply-to-file-path').textContent).toBe('src/foo.ts');
    // delta: 3 → 5
    expect(screen.getByTestId('apply-to-file-lines-delta').textContent).toContain('3');
    expect(screen.getByTestId('apply-to-file-lines-delta').textContent).toContain('5');
    expect(screen.getByTestId('apply-to-file-cancel')).toBeInTheDocument();
    expect(screen.getByTestId('apply-to-file-accept')).toBeInTheDocument();
  });

  it('Cancel 버튼이 onCancel 호출', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    const onCancel = vi.fn();
    render(
      <ApplyToFileModal
        target={{ path: 'a.ts', diskContent: '', newCode: 'x' }}
        onAccept={vi.fn()}
        onCancel={onCancel}
      />
    );
    await user.click(screen.getByTestId('apply-to-file-cancel'));
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it('Accept 버튼이 onAccept 호출', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    const onAccept = vi.fn();
    render(
      <ApplyToFileModal
        target={{ path: 'a.ts', diskContent: '', newCode: 'x' }}
        onAccept={onAccept}
        onCancel={vi.fn()}
      />
    );
    await user.click(screen.getByTestId('apply-to-file-accept'));
    expect(onAccept).toHaveBeenCalledTimes(1);
  });

  it('Esc 키가 onCancel 호출', () => {
    const onCancel = vi.fn();
    render(
      <ApplyToFileModal
        target={{ path: 'a.ts', diskContent: '', newCode: 'x' }}
        onAccept={vi.fn()}
        onCancel={onCancel}
      />
    );
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it('saving=true 면 두 버튼 disabled + Esc 무시', () => {
    const onCancel = vi.fn();
    render(
      <ApplyToFileModal
        target={{ path: 'a.ts', diskContent: '', newCode: 'x' }}
        onAccept={vi.fn()}
        onCancel={onCancel}
        saving={true}
      />
    );
    expect(screen.getByTestId('apply-to-file-cancel')).toBeDisabled();
    expect(screen.getByTestId('apply-to-file-accept')).toBeDisabled();
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onCancel).not.toHaveBeenCalled();
  });

  it('preview 패널이 DiffViewer (CodeMirror merge) 를 마운트', () => {
    render(
      <ApplyToFileModal
        target={{
          path: 'a.ts',
          diskContent: 'old\n',
          newCode: 'new\n',
          language: 'ts',
        }}
        onAccept={vi.fn()}
        onCancel={vi.fn()}
      />
    );
    // DiffViewer 의 wrapper testid (code-diff-viewer) 가 마운트됨.
    expect(screen.getByTestId('apply-to-file-preview')).toBeInTheDocument();
    expect(screen.getByTestId('code-diff-viewer')).toBeInTheDocument();
  });

  it('overlay click 이 onCancel 호출 (모달 본체 click 은 무시)', () => {
    const onCancel = vi.fn();
    render(
      <ApplyToFileModal
        target={{ path: 'a.ts', diskContent: '', newCode: 'x' }}
        onAccept={vi.fn()}
        onCancel={onCancel}
      />
    );
    const overlay = screen.getByTestId('apply-to-file-modal');
    fireEvent.click(overlay); // overlay 자체 click — onCancel 트리거.
    expect(onCancel).toHaveBeenCalledTimes(1);
    onCancel.mockClear();
    // 모달 본체 안의 path span click → propagation 으로 overlay 까지 가지만
    // e.target !== e.currentTarget 이라 onCancel 호출 X.
    fireEvent.click(screen.getByTestId('apply-to-file-path'));
    expect(onCancel).not.toHaveBeenCalled();
  });
});
