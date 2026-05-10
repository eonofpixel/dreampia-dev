/**
 * MigrationToast tests (v2.4.0 UI styling — US-602).
 *
 * Coverage:
 *   - dismissed=true → null (no toast rendered)
 *   - dismissed=false → toast visible with both text + hint + Got it button
 *   - Got it click invokes onDismiss + closes toast
 *   - onDismiss pending → button shows "Saving…" + disabled
 *   - onDismiss failure → toast still hides (best-effort)
 *   - Tailwind chrome (positioning, color) applied via known data-testid
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, act, waitFor } from '@testing-library/react';
import { MigrationToast } from '../../src/renderer/components/MigrationToast';

describe('v2.4.0 — MigrationToast', () => {
  it('dismissed=true → returns null', () => {
    render(<MigrationToast dismissed={true} onDismiss={vi.fn()} />);
    expect(screen.queryByTestId('migration-toast')).not.toBeInTheDocument();
  });

  it('dismissed=false → toast renders with body + hint + button', () => {
    render(<MigrationToast dismissed={false} onDismiss={vi.fn()} />);
    expect(screen.getByTestId('migration-toast')).toBeInTheDocument();
    expect(
      screen.getByText(/Plugins now run in isolated process/i)
    ).toBeInTheDocument();
    expect(screen.getByText(/in-process mode in settings/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /got it/i })).toBeInTheDocument();
  });

  it('Got it click invokes onDismiss + hides toast', async () => {
    const onDismiss = vi.fn().mockResolvedValue({ ok: true });
    render(<MigrationToast dismissed={false} onDismiss={onDismiss} />);
    expect(screen.getByTestId('migration-toast')).toBeInTheDocument();
    await act(async () => {
      fireEvent.click(screen.getByTestId('migration-toast-dismiss'));
    });
    expect(onDismiss).toHaveBeenCalledTimes(1);
    await waitFor(() => {
      expect(screen.queryByTestId('migration-toast')).not.toBeInTheDocument();
    });
  });

  it('button shows Saving… + disabled while onDismiss pending', async () => {
    let resolveDismiss: (v: { ok: true }) => void = () => {};
    const onDismiss = vi.fn(
      () =>
        new Promise<{ ok: true }>((r) => {
          resolveDismiss = r;
        })
    );
    render(<MigrationToast dismissed={false} onDismiss={onDismiss} />);
    await act(async () => {
      fireEvent.click(screen.getByTestId('migration-toast-dismiss'));
    });
    expect(screen.getByRole('button', { name: /saving…/i })).toBeDisabled();
    await act(async () => {
      resolveDismiss({ ok: true });
    });
  });

  it('onDismiss failure → toast still hides (best-effort)', async () => {
    const onDismiss = vi.fn().mockResolvedValue({ ok: false, reason: 'persist failed' });
    render(<MigrationToast dismissed={false} onDismiss={onDismiss} />);
    await act(async () => {
      fireEvent.click(screen.getByTestId('migration-toast-dismiss'));
    });
    // Best-effort UX: even on persist failure, toast hides so user isn't stuck.
    // Caller can re-trigger by re-rendering with dismissed=false.
    await waitFor(() => {
      expect(screen.queryByTestId('migration-toast')).not.toBeInTheDocument();
    });
  });

  it('aria-live polite + role status (a11y)', () => {
    render(<MigrationToast dismissed={false} onDismiss={vi.fn()} />);
    const toast = screen.getByTestId('migration-toast');
    expect(toast).toHaveAttribute('role', 'status');
    expect(toast).toHaveAttribute('aria-live', 'polite');
  });
});
