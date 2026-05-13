/**
 * MigrationToast tests (v2.4.0 UI styling — US-602).
 *
 * Coverage:
 *   - dismissed=true → null (no toast rendered)
 *   - dismissed=false → toast visible with both text + hint + 확인 button
 *   - 확인 click invokes onDismiss + closes toast
 *   - onDismiss pending → button shows "저장 중..." + disabled
 *   - onDismiss failure → toast still hides (best-effort)
 *   - Tailwind chrome (positioning, color) applied via known data-testid
 */

import { beforeEach, describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, act, waitFor } from '@testing-library/react';
import { MigrationToast } from '../../src/renderer/components/MigrationToast';
import { __resetLocale } from '../../src/renderer/i18n';

describe('v2.4.0 — MigrationToast', () => {
  beforeEach(() => {
    __resetLocale();
  });

  it('dismissed=true → returns null', () => {
    render(<MigrationToast dismissed={true} onDismiss={vi.fn()} />);
    expect(screen.queryByTestId('migration-toast')).not.toBeInTheDocument();
  });

  it('dismissed=false → toast renders with body + hint + button', () => {
    render(<MigrationToast dismissed={false} onDismiss={vi.fn()} />);
    expect(screen.getByTestId('migration-toast')).toBeInTheDocument();
    expect(screen.getByText(/플러그인이 격리된 프로세스/i)).toBeInTheDocument();
    expect(screen.getByText(/설정에서 인프로세스 모드/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /확인/i })).toBeInTheDocument();
  });

  it('확인 click invokes onDismiss + hides toast', async () => {
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

  it('button shows 저장 중... + disabled while onDismiss pending', async () => {
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
    expect(screen.getByRole('button', { name: /저장 중/i })).toBeDisabled();
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

  it('toast body does not intercept app clicks while dismiss button remains clickable', () => {
    render(<MigrationToast dismissed={false} onDismiss={vi.fn()} />);
    expect(screen.getByTestId('migration-toast')).toHaveClass('pointer-events-none');
    expect(screen.getByTestId('migration-toast-dismiss')).toHaveClass('pointer-events-auto');
  });
});
