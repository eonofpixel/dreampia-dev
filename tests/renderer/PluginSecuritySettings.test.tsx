/**
 * PluginSecuritySettings tests (v2.4.0).
 *
 * Coverage:
 *   - Loading state when getSecurity is pending
 *   - Renders three sections (verification mode / isolation mode / feed publisher)
 *   - Active radio reflects current state
 *   - Click verification mode → setMcpVerificationMode invoked + state refetched
 *   - Click isolation mode → setPluginIsolationMode invoked
 *   - Save publisher → setMcpRevocationFeedPublisher with input values
 *   - Clear publisher → setMcpRevocationFeedPublisher(null)
 *   - Permissive default badge ("⚠ permissive default") when publisher null
 *   - Enforced badge ("✓ enforced") when publisher set
 *   - Error from IPC surfaces in alert
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, act, waitFor } from '@testing-library/react';
import { PluginSecuritySettings } from '../../src/renderer/components/plugins/PluginSecuritySettings';

interface MockApi {
  getSecurity: ReturnType<typeof vi.fn>;
  setMcpVerificationMode: ReturnType<typeof vi.fn>;
  setPluginIsolationMode: ReturnType<typeof vi.fn>;
  setMcpRevocationFeedPublisher: ReturnType<typeof vi.fn>;
}

function setupApi(initialState: {
  mcpVerificationMode: 'strict' | 'warn' | 'off';
  pluginIsolationMode: 'utility_process' | 'in_process' | 'auto';
  mcpRevocationFeedPublisher: { issuer: string; subject_pattern: string } | null;
}): MockApi {
  const api: MockApi = {
    getSecurity: vi.fn().mockResolvedValue({ ok: true, value: initialState }),
    setMcpVerificationMode: vi.fn().mockResolvedValue({ ok: true }),
    setPluginIsolationMode: vi.fn().mockResolvedValue({ ok: true }),
    setMcpRevocationFeedPublisher: vi.fn().mockResolvedValue({ ok: true }),
  };
  // @ts-expect-error — injecting a partial preload api stub onto window for component tests.
  globalThis.window.dreampia = { plugin: api };
  return api;
}

beforeEach(() => {
  // @ts-expect-error — clean window stub between tests.
  globalThis.window.dreampia = undefined;
});

describe('v2.4.0 — PluginSecuritySettings', () => {
  it('shows loading state until getSecurity resolves', () => {
    const slowApi = {
      getSecurity: vi.fn(() => new Promise(() => {})),
      setMcpVerificationMode: vi.fn(),
      setPluginIsolationMode: vi.fn(),
      setMcpRevocationFeedPublisher: vi.fn(),
    };
    // @ts-expect-error — partial stub.
    globalThis.window.dreampia = { plugin: slowApi };
    render(<PluginSecuritySettings />);
    expect(screen.getByTestId('plugin-security-loading')).toBeInTheDocument();
  });

  it('renders strict/warn/off radios with current selection highlighted', async () => {
    setupApi({
      mcpVerificationMode: 'warn',
      pluginIsolationMode: 'utility_process',
      mcpRevocationFeedPublisher: null,
    });
    render(<PluginSecuritySettings />);
    await waitFor(() => screen.getByTestId('plugin-security-settings'));
    const warnBtn = screen.getByTestId('verification-mode-warn');
    expect(warnBtn).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByTestId('verification-mode-strict')).toHaveAttribute('aria-checked', 'false');
  });

  it('clicking a verification mode invokes setMcpVerificationMode + refetches', async () => {
    const api = setupApi({
      mcpVerificationMode: 'strict',
      pluginIsolationMode: 'utility_process',
      mcpRevocationFeedPublisher: null,
    });
    render(<PluginSecuritySettings />);
    await waitFor(() => screen.getByTestId('plugin-security-settings'));
    expect(api.getSecurity).toHaveBeenCalledTimes(1);
    await act(async () => {
      fireEvent.click(screen.getByTestId('verification-mode-warn'));
    });
    expect(api.setMcpVerificationMode).toHaveBeenCalledWith('warn');
    expect(api.getSecurity).toHaveBeenCalledTimes(2); // refetch
  });

  it('clicking an isolation mode invokes setPluginIsolationMode', async () => {
    const api = setupApi({
      mcpVerificationMode: 'strict',
      pluginIsolationMode: 'utility_process',
      mcpRevocationFeedPublisher: null,
    });
    render(<PluginSecuritySettings />);
    await waitFor(() => screen.getByTestId('plugin-security-settings'));
    await act(async () => {
      fireEvent.click(screen.getByTestId('isolation-mode-auto'));
    });
    expect(api.setPluginIsolationMode).toHaveBeenCalledWith('auto');
  });

  it('feed publisher save uses input values', async () => {
    const api = setupApi({
      mcpVerificationMode: 'strict',
      pluginIsolationMode: 'utility_process',
      mcpRevocationFeedPublisher: null,
    });
    render(<PluginSecuritySettings />);
    await waitFor(() => screen.getByTestId('plugin-security-settings'));
    fireEvent.change(screen.getByTestId('feed-publisher-issuer'), {
      target: { value: 'https://token.actions.githubusercontent.com' },
    });
    fireEvent.change(screen.getByTestId('feed-publisher-subject'), {
      target: { value: 'repo:foo/bar:ref:refs/heads/main' },
    });
    await act(async () => {
      fireEvent.click(screen.getByTestId('feed-publisher-save'));
    });
    expect(api.setMcpRevocationFeedPublisher).toHaveBeenCalledWith({
      issuer: 'https://token.actions.githubusercontent.com',
      subject_pattern: 'repo:foo/bar:ref:refs/heads/main',
    });
  });

  it('feed publisher clear button calls setMcpRevocationFeedPublisher(null)', async () => {
    const api = setupApi({
      mcpVerificationMode: 'strict',
      pluginIsolationMode: 'utility_process',
      mcpRevocationFeedPublisher: { issuer: 'https://x.example.com', subject_pattern: 'a/b' },
    });
    render(<PluginSecuritySettings />);
    await waitFor(() => screen.getByTestId('plugin-security-settings'));
    await act(async () => {
      fireEvent.click(screen.getByTestId('feed-publisher-clear'));
    });
    expect(api.setMcpRevocationFeedPublisher).toHaveBeenCalledWith(null);
  });

  it('publisher status: "permissive default" when null', async () => {
    setupApi({
      mcpVerificationMode: 'strict',
      pluginIsolationMode: 'utility_process',
      mcpRevocationFeedPublisher: null,
    });
    render(<PluginSecuritySettings />);
    await waitFor(() => screen.getByTestId('plugin-security-settings'));
    expect(screen.getByTestId('feed-publisher-status').textContent).toMatch(/permissive default/i);
  });

  it('publisher status: "enforced" when publisher set', async () => {
    setupApi({
      mcpVerificationMode: 'strict',
      pluginIsolationMode: 'utility_process',
      mcpRevocationFeedPublisher: { issuer: 'https://x.example.com', subject_pattern: 'a/b' },
    });
    render(<PluginSecuritySettings />);
    await waitFor(() => screen.getByTestId('plugin-security-settings'));
    expect(screen.getByTestId('feed-publisher-status').textContent).toMatch(/enforced/i);
  });

  it('IPC error surfaces in alert', async () => {
    const api: MockApi = {
      getSecurity: vi.fn().mockResolvedValue({
        ok: true,
        value: {
          mcpVerificationMode: 'strict',
          pluginIsolationMode: 'utility_process',
          mcpRevocationFeedPublisher: null,
        },
      }),
      setMcpVerificationMode: vi.fn().mockResolvedValue({ ok: false, error: 'persist failed' }),
      setPluginIsolationMode: vi.fn(),
      setMcpRevocationFeedPublisher: vi.fn(),
    };
    // @ts-expect-error — injecting partial stub.
    globalThis.window.dreampia = { plugin: api };
    render(<PluginSecuritySettings />);
    await waitFor(() => screen.getByTestId('plugin-security-settings'));
    await act(async () => {
      fireEvent.click(screen.getByTestId('verification-mode-warn'));
    });
    await waitFor(() => {
      expect(screen.getByTestId('plugin-security-error').textContent).toContain('persist failed');
    });
  });
});
