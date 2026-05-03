/**
 * Sidebar — v0.9.0 MCP status indicator 검증.
 *
 * indicator 는 onOpenMcpSettings prop 이 있을 때만 표시.
 * 색상 dot:
 *   - 0 서버: gray
 *   - all ready: green
 *   - any connecting: yellow
 *   - any error: red
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Sidebar } from '../../src/renderer/components/sidebar/Sidebar';
import { __mockStore } from '../setup';

describe('Sidebar — MCP status indicator (v0.9.0)', () => {
  it('does not show indicator when onOpenMcpSettings is undefined', () => {
    render(
      <Sidebar sessions={[]} onSelectSession={() => {}} onNewChat={() => {}} />
    );
    expect(screen.queryByTestId('sidebar-mcp-status')).not.toBeInTheDocument();
  });

  it('shows indicator with empty count when 0 servers', async () => {
    render(
      <Sidebar
        sessions={[]}
        onSelectSession={() => {}}
        onNewChat={() => {}}
        onOpenMcpSettings={() => {}}
      />
    );
    await waitFor(() => {
      expect(screen.getByTestId('sidebar-mcp-status')).toBeInTheDocument();
    });
    expect(screen.getByTestId('sidebar-mcp-status')).toHaveTextContent(/0 서버/);
  });

  it('shows green-dot for all-ready servers', async () => {
    __mockStore.mcpServers.set('a', {
      config: {
        id: 'a',
        name: 'A',
        command: 'cmd',
        args: [],
        env: {},
        enabled: true,
        added_at: '2026-05-03T00:00:00.000Z',
      },
      status: 'ready',
      tools: [],
      last_log: [],
    });
    render(
      <Sidebar
        sessions={[]}
        onSelectSession={() => {}}
        onNewChat={() => {}}
        onOpenMcpSettings={() => {}}
      />
    );
    await waitFor(() => {
      expect(screen.getByTestId('sidebar-mcp-status')).toHaveTextContent(/1 준비/);
    });
    const dot = screen
      .getByTestId('sidebar-mcp-status')
      .querySelector('span.bg-green-500');
    expect(dot).not.toBeNull();
  });

  it('shows red-dot when any server in error state', async () => {
    __mockStore.mcpServers.set('a', {
      config: {
        id: 'a',
        name: 'A',
        command: 'cmd',
        args: [],
        env: {},
        enabled: true,
        added_at: '2026-05-03T00:00:00.000Z',
      },
      status: 'error',
      last_error: 'spawn failed',
      tools: [],
      last_log: [],
    });
    render(
      <Sidebar
        sessions={[]}
        onSelectSession={() => {}}
        onNewChat={() => {}}
        onOpenMcpSettings={() => {}}
      />
    );
    await waitFor(() => {
      expect(screen.getByTestId('sidebar-mcp-status')).toHaveTextContent(/1 오류/);
    });
    const dot = screen
      .getByTestId('sidebar-mcp-status')
      .querySelector('span.bg-red-500');
    expect(dot).not.toBeNull();
  });

  it('clicking indicator invokes onOpenMcpSettings', async () => {
    const user = userEvent.setup();
    const onOpenMcpSettings = vi.fn();
    render(
      <Sidebar
        sessions={[]}
        onSelectSession={() => {}}
        onNewChat={() => {}}
        onOpenMcpSettings={onOpenMcpSettings}
      />
    );
    const indicator = await screen.findByTestId('sidebar-mcp-status');
    await user.click(indicator);
    expect(onOpenMcpSettings).toHaveBeenCalledTimes(1);
  });
});
