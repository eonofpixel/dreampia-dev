/**
 * ToastsProvider + useToastsContext / useOptionalToasts (v1.7.11).
 *
 * 검증:
 *  - ToastsProvider 안에서 useToastsContext 가 같은 인스턴스 반환
 *  - Provider 밖에서 useToastsContext 호출 → throw (명확한 에러)
 *  - Provider 밖에서 useOptionalToasts → null
 *  - 자식이 push 한 toast 가 같은 list 에 누적
 *  - 두 자식이 같은 인스턴스 공유 (cross-component)
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import {
  useToasts,
  ToastsProvider,
  useToastsContext,
  useOptionalToasts,
} from '../../src/renderer/hooks/useToasts';

function Wrapper(props: { children: React.ReactNode }): React.JSX.Element {
  const toasts = useToasts();
  return <ToastsProvider value={toasts}>{props.children}</ToastsProvider>;
}

function Pusher({ message }: { message: string }): React.JSX.Element {
  const toasts = useToastsContext();
  return (
    <button
      data-testid={`push-${message}`}
      onClick={() => {
        toasts.error(message);
      }}
    >
      push
    </button>
  );
}

function Display(): React.JSX.Element {
  const toasts = useToastsContext();
  return (
    <ul data-testid="toast-list">
      {toasts.list.map((t) => (
        <li key={t.id} data-testid={`toast-${t.message}`}>
          {t.message}
        </li>
      ))}
    </ul>
  );
}

function OptionalDisplay(): React.JSX.Element {
  const toasts = useOptionalToasts();
  return (
    <span data-testid="optional-status">{toasts === null ? 'absent' : 'present'}</span>
  );
}

describe('v1.7.11 — ToastsProvider', () => {
  it('자식이 push 한 toast 가 같은 list 에 반영', () => {
    render(
      <Wrapper>
        <Pusher message="hello" />
        <Display />
      </Wrapper>
    );
    const btn = screen.getByTestId('push-hello');
    act(() => {
      btn.click();
    });
    expect(screen.getByTestId('toast-hello')).toBeInTheDocument();
  });

  it('두 자식이 같은 인스턴스 공유', () => {
    render(
      <Wrapper>
        <Pusher message="a" />
        <Pusher message="b" />
        <Display />
      </Wrapper>
    );
    act(() => {
      screen.getByTestId('push-a').click();
    });
    act(() => {
      screen.getByTestId('push-b').click();
    });
    expect(screen.getByTestId('toast-a')).toBeInTheDocument();
    expect(screen.getByTestId('toast-b')).toBeInTheDocument();
  });

  it('Provider 밖에서 useToastsContext → throw', () => {
    function Bare(): React.JSX.Element {
      useToastsContext();
      return <div />;
    }
    // React 가 error boundary 미존재 시 console.error 를 호출 — 무시.
    const consoleErrSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(() => render(<Bare />)).toThrowError(/must be used within a ToastsProvider/);
    consoleErrSpy.mockRestore();
  });

  it('Provider 밖에서 useOptionalToasts → null', () => {
    render(<OptionalDisplay />);
    expect(screen.getByTestId('optional-status').textContent).toBe('absent');
  });

  it('Provider 안에서 useOptionalToasts → present (non-null)', () => {
    render(
      <Wrapper>
        <OptionalDisplay />
      </Wrapper>
    );
    expect(screen.getByTestId('optional-status').textContent).toBe('present');
  });
});
