/**
 * useMcp — IPC bridge hook 검증.
 *
 * window.dreampia.mcp 는 setup.ts 의 in-memory mock. 각 테스트는
 * __mockStore.mcpServers 에 fixture 를 직접 채워 hook 의 refresh / mutation
 * 동작을 검증한다.
 */

import { describe, it, expect } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import { useMcp, type McpServerConfigUI } from '../../src/renderer/hooks/useMcp';
import { __mockStore } from '../setup';

function fixtureConfig(id: string, overrides: Partial<McpServerConfigUI> = {}): McpServerConfigUI {
  return {
    id,
    name: `Server ${id}`,
    command: 'node',
    args: [],
    env: {},
    enabled: true,
    added_at: '2026-05-02T00:00:00Z',
    ...overrides,
  };
}

describe('useMcp', () => {
  it('refresh fetches initial empty list', async () => {
    const { result } = renderHook(() => useMcp());
    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });
    expect(result.current.servers).toEqual([]);
    expect(result.current.error).toBeNull();
  });

  it('add adds a server + auto-refreshes', async () => {
    const { result } = renderHook(() => useMcp());
    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });
    let success = false;
    await act(async () => {
      success = await result.current.add(fixtureConfig('alpha'));
    });
    expect(success).toBe(true);
    await waitFor(() => {
      expect(result.current.servers).toHaveLength(1);
    });
    expect(result.current.servers[0]?.config.id).toBe('alpha');
  });

  it('add returns false + sets error when IPC rejects', async () => {
    __mockStore.mcpAddBehavior = 'fail';
    const { result } = renderHook(() => useMcp());
    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });
    let success = true;
    await act(async () => {
      success = await result.current.add(fixtureConfig('failing'));
    });
    expect(success).toBe(false);
    expect(result.current.error).toMatch(/mock add failure/);
  });

  it('remove deletes server + refreshes', async () => {
    __mockStore.mcpServers.set('toRemove', {
      config: fixtureConfig('toRemove'),
      status: 'ready',
      tools: [],
      last_log: [],
    });
    const { result } = renderHook(() => useMcp());
    await waitFor(() => {
      expect(result.current.servers).toHaveLength(1);
    });
    await act(async () => {
      await result.current.remove('toRemove');
    });
    await waitFor(() => {
      expect(result.current.servers).toHaveLength(0);
    });
  });

  it('restart triggers status update + refresh', async () => {
    __mockStore.mcpServers.set('beta', {
      config: fixtureConfig('beta'),
      status: 'error',
      tools: [],
      last_log: [],
    });
    const { result } = renderHook(() => useMcp());
    await waitFor(() => {
      expect(result.current.servers[0]?.status).toBe('error');
    });
    await act(async () => {
      await result.current.restart('beta');
    });
    await waitFor(() => {
      expect(result.current.servers[0]?.status).toBe('ready');
    });
  });

  it('getLogs returns server log lines', async () => {
    __mockStore.mcpServers.set('logged', {
      config: fixtureConfig('logged'),
      status: 'ready',
      tools: [],
      last_log: ['line 1', 'line 2'],
    });
    const { result } = renderHook(() => useMcp());
    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });
    let logs: string[] = [];
    await act(async () => {
      logs = await result.current.getLogs('logged');
    });
    expect(logs).toEqual(['line 1', 'line 2']);
  });

  it('refresh re-fetches from IPC', async () => {
    const { result } = renderHook(() => useMcp());
    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });
    expect(result.current.servers).toHaveLength(0);

    __mockStore.mcpServers.set('latejoin', {
      config: fixtureConfig('latejoin'),
      status: 'ready',
      tools: [],
      last_log: [],
    });
    await act(async () => {
      await result.current.refresh();
    });
    expect(result.current.servers).toHaveLength(1);
    expect(result.current.servers[0]?.config.id).toBe('latejoin');
  });
});
