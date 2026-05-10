/**
 * IsolationDowngradeModal tests (v2.4.0 Task 6 / G6).
 *
 * Coverage:
 *   - Modal renders with package_id displayed
 *   - Confirm button disabled until package_id typed exactly
 *   - Type matching package_id enables confirm; onConfirm called
 *   - onConfirm success → onClose called (modal dismiss)
 *   - onConfirm failure → error displayed, modal stays open
 *   - Cancel button → onClose called
 *   - Backdrop click → onClose called
 *   - open=false → returns null (no DOM)
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, act, waitFor } from '@testing-library/react';
import { IsolationDowngradeModal } from '../../src/renderer/components/marketplace/IsolationDowngradeModal';

describe('v2.4.0 Task 6 — IsolationDowngradeModal', () => {
  it('renders package_id and full warning copy', () => {
    render(
      <IsolationDowngradeModal
        open={true}
        package_id="@eonofpixel/sample"
        onClose={vi.fn()}
        onConfirm={vi.fn().mockResolvedValue({ ok: true })}
      />
    );
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByText(/run plugin in main process/i)).toBeInTheDocument();
    // Package id appears at least once (in the warning paragraph).
    const matches = screen.getAllByText('@eonofpixel/sample');
    expect(matches.length).toBeGreaterThan(0);
    // Warning bullets present.
    expect(screen.getByText(/can take down the entire app/i)).toBeInTheDocument();
  });

  it('open=false → null (no dialog rendered)', () => {
    render(
      <IsolationDowngradeModal
        open={false}
        package_id="@eonofpixel/sample"
        onClose={vi.fn()}
        onConfirm={vi.fn()}
      />
    );
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('confirm button disabled until typed text exactly matches package_id', async () => {
    render(
      <IsolationDowngradeModal
        open={true}
        package_id="@eonofpixel/sample"
        onClose={vi.fn()}
        onConfirm={vi.fn().mockResolvedValue({ ok: true })}
      />
    );
    const input = screen.getByLabelText(/plugin id confirmation/i);
    const confirmBtn = screen.getByRole('button', { name: /run in main process/i });
    expect(confirmBtn).toBeDisabled();

    fireEvent.change(input, { target: { value: '@eonofpixel/sample-typo' } });
    expect(confirmBtn).toBeDisabled();

    fireEvent.change(input, { target: { value: '@eonofpixel/sample' } });
    expect(confirmBtn).not.toBeDisabled();
  });

  it('confirm success → onClose invoked', async () => {
    const onClose = vi.fn();
    const onConfirm = vi.fn().mockResolvedValue({ ok: true });
    render(
      <IsolationDowngradeModal
        open={true}
        package_id="pkg"
        onClose={onClose}
        onConfirm={onConfirm}
      />
    );
    fireEvent.change(screen.getByLabelText(/plugin id confirmation/i), {
      target: { value: 'pkg' },
    });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /run in main process/i }));
    });
    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('confirm failure → error message shown, modal stays open', async () => {
    const onClose = vi.fn();
    const onConfirm = vi.fn().mockResolvedValue({ ok: false, reason: 'persist failed' });
    render(
      <IsolationDowngradeModal
        open={true}
        package_id="pkg"
        onClose={onClose}
        onConfirm={onConfirm}
      />
    );
    fireEvent.change(screen.getByLabelText(/plugin id confirmation/i), {
      target: { value: 'pkg' },
    });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /run in main process/i }));
    });
    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent('persist failed');
    });
    expect(onClose).not.toHaveBeenCalled();
  });

  it('cancel button → onClose without onConfirm', () => {
    const onClose = vi.fn();
    const onConfirm = vi.fn();
    render(
      <IsolationDowngradeModal
        open={true}
        package_id="pkg"
        onClose={onClose}
        onConfirm={onConfirm}
      />
    );
    fireEvent.click(screen.getByRole('button', { name: /cancel/i }));
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it('backdrop click → onClose', () => {
    const onClose = vi.fn();
    render(
      <IsolationDowngradeModal
        open={true}
        package_id="pkg"
        onClose={onClose}
        onConfirm={vi.fn()}
      />
    );
    fireEvent.click(screen.getByLabelText(/close downgrade modal/i));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('typed input resets when modal reopens with new package_id', () => {
    const { rerender } = render(
      <IsolationDowngradeModal
        open={true}
        package_id="first"
        onClose={vi.fn()}
        onConfirm={vi.fn()}
      />
    );
    const inputFirst = screen.getByLabelText(/plugin id confirmation/i) as HTMLInputElement;
    fireEvent.change(inputFirst, { target: { value: 'first' } });
    expect(inputFirst.value).toBe('first');

    // Close.
    rerender(
      <IsolationDowngradeModal
        open={false}
        package_id="first"
        onClose={vi.fn()}
        onConfirm={vi.fn()}
      />
    );
    // Reopen with different package_id.
    rerender(
      <IsolationDowngradeModal
        open={true}
        package_id="second"
        onClose={vi.fn()}
        onConfirm={vi.fn()}
      />
    );
    const inputSecond = screen.getByLabelText(/plugin id confirmation/i) as HTMLInputElement;
    expect(inputSecond.value).toBe('');
  });

  it('submit button shows loading state while onConfirm pending', async () => {
    let resolveConfirm: (v: { ok: true }) => void = () => {};
    const onConfirm = vi.fn(
      () =>
        new Promise<{ ok: true }>((r) => {
          resolveConfirm = r;
        })
    );
    render(
      <IsolationDowngradeModal
        open={true}
        package_id="pkg"
        onClose={vi.fn()}
        onConfirm={onConfirm}
      />
    );
    fireEvent.change(screen.getByLabelText(/plugin id confirmation/i), {
      target: { value: 'pkg' },
    });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /run in main process/i }));
    });
    expect(screen.getByRole('button', { name: /saving…/i })).toBeInTheDocument();
    await act(async () => {
      resolveConfirm({ ok: true });
    });
  });
});
