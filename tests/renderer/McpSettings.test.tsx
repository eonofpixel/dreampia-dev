/**
 * McpSettings — UI modal smoke test.
 *
 * 검증 포인트:
 *  - open=true 일 때만 dialog 표시
 *  - 빈 상태 안내 문구 표시
 *  - 등록된 서버 목록 / status badge 표시
 *  - [+ 서버 추가] form 제출 시 useMcp.add 호출
 *  - [제거] / [재시작] / [로그 보기] 버튼 동작
 */

import { describe, it, expect } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { McpSettings } from '../../src/renderer/components/settings/McpSettings';
import { __mockStore } from '../setup';

describe('McpSettings', () => {
  it('renders nothing when open=false', () => {
    const { container } = render(<McpSettings open={false} onClose={() => {}} />);
    expect(container.firstChild).toBeNull();
  });

  it('renders dialog with header when open=true', async () => {
    render(<McpSettings open={true} onClose={() => {}} />);
    expect(screen.getByRole('dialog', { name: /MCP 서버 설정/i })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /MCP 서버/i })).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.getByText(/등록된 MCP 서버가 없어요/i)).toBeInTheDocument();
    });
  });

  it('shows registered servers list with status', async () => {
    __mockStore.mcpServers.set('github', {
      config: {
        id: 'github',
        name: 'GitHub MCP',
        command: 'npx',
        args: ['-y', '@modelcontextprotocol/server-github'],
        env: {},
        enabled: true,
        added_at: '2026-05-02T00:00:00Z',
      },
      status: 'ready',
      tools: [{ name: 'list_repos' }, { name: 'get_repo' }],
      last_log: [],
    });
    render(<McpSettings open={true} onClose={() => {}} />);
    await waitFor(() => {
      expect(screen.getByText(/GitHub MCP/i)).toBeInTheDocument();
    });
    expect(screen.getByText(/@github/i)).toBeInTheDocument();
    expect(screen.getByText(/도구 2개/i)).toBeInTheDocument();
  });

  it('displays last_error in red when set', async () => {
    __mockStore.mcpServers.set('broken', {
      config: {
        id: 'broken',
        name: 'Broken',
        command: 'fail',
        args: [],
        env: {},
        enabled: true,
        added_at: '2026-05-02T00:00:00Z',
      },
      status: 'error',
      tools: [],
      last_log: [],
      last_error: 'spawn failed: ENOENT',
    });
    render(<McpSettings open={true} onClose={() => {}} />);
    await waitFor(() => {
      expect(screen.getByText(/에러: spawn failed: ENOENT/i)).toBeInTheDocument();
    });
  });

  it('opens add form on [+ 서버 추가] click', async () => {
    const user = userEvent.setup();
    render(<McpSettings open={true} onClose={() => {}} />);
    await user.click(screen.getByRole('button', { name: /서버 추가/i }));
    expect(screen.getByRole('dialog', { name: /MCP 서버 추가/i })).toBeInTheDocument();
  });

  it('submits add form with valid input → server appears in list', async () => {
    const user = userEvent.setup();
    render(<McpSettings open={true} onClose={() => {}} />);
    // 빈 상태 확인 후
    await waitFor(() => {
      expect(screen.getByText(/등록된 MCP 서버가 없어요/i)).toBeInTheDocument();
    });

    await user.click(screen.getByRole('button', { name: /서버 추가/i }));
    const form = screen.getByRole('dialog', { name: /MCP 서버 추가/i });
    // 폼의 input 들을 순서대로 가져옴 — ID, 이름, 실행 명령 (3 textbox)
    const inputs = within(form).getAllByRole('textbox');
    expect(inputs.length).toBeGreaterThanOrEqual(3);
    await user.type(inputs[0]!, 'demo');
    await user.type(inputs[1]!, 'Demo Server');
    await user.type(inputs[2]!, 'node');
    await user.click(within(form).getByRole('button', { name: /^추가$/i }));

    await waitFor(() => {
      expect(screen.queryByRole('dialog', { name: /MCP 서버 추가/i })).not.toBeInTheDocument();
    });
    await waitFor(() => {
      expect(screen.getByText(/Demo Server/i)).toBeInTheDocument();
    });
  });

  it('add form rejects invalid id format', async () => {
    const user = userEvent.setup();
    render(<McpSettings open={true} onClose={() => {}} />);
    await user.click(screen.getByRole('button', { name: /서버 추가/i }));
    const form = screen.getByRole('dialog', { name: /MCP 서버 추가/i });
    const inputs = within(form).getAllByRole('textbox');
    await user.type(inputs[0]!, 'has spaces');
    await user.type(inputs[1]!, 'X');
    await user.type(inputs[2]!, 'node');
    await user.click(within(form).getByRole('button', { name: /^추가$/i }));
    expect(
      within(form).getByText(/id 는 영문\/숫자\/하이픈\/언더스코어만 사용할 수 있어요/)
    ).toBeInTheDocument();
  });

  it('add form rejects malformed env line', async () => {
    const user = userEvent.setup();
    render(<McpSettings open={true} onClose={() => {}} />);
    await user.click(screen.getByRole('button', { name: /서버 추가/i }));
    const form = screen.getByRole('dialog', { name: /MCP 서버 추가/i });
    const textboxes = within(form).getAllByRole('textbox');
    // textboxes: [id, name, command, args, env, cwd] — env 는 5번째 (index 4)
    await user.type(textboxes[0]!, 'envtest');
    await user.type(textboxes[1]!, 'EnvTest');
    await user.type(textboxes[2]!, 'node');
    await user.type(textboxes[4]!, 'NO_EQUALS_SIGN_HERE');
    await user.click(within(form).getByRole('button', { name: /^추가$/i }));
    expect(within(form).getByText(/환경 변수 형식 오류/)).toBeInTheDocument();
  });

  it('clicks remove button → server vanishes', async () => {
    const user = userEvent.setup();
    __mockStore.mcpServers.set('toremove', {
      config: {
        id: 'toremove',
        name: 'Removable',
        command: 'x',
        args: [],
        env: {},
        enabled: true,
        added_at: '2026-05-02T00:00:00Z',
      },
      status: 'ready',
      tools: [],
      last_log: [],
    });
    render(<McpSettings open={true} onClose={() => {}} />);
    await waitFor(() => {
      expect(screen.getByText(/Removable/)).toBeInTheDocument();
    });
    await user.click(screen.getByRole('button', { name: /^제거$/i }));
    await waitFor(() => {
      expect(screen.queryByText(/Removable/)).not.toBeInTheDocument();
    });
  });

  it('clicks restart button → IPC call invoked', async () => {
    const user = userEvent.setup();
    __mockStore.mcpServers.set('restartable', {
      config: {
        id: 'restartable',
        name: 'Restart Me',
        command: 'x',
        args: [],
        env: {},
        enabled: true,
        added_at: '2026-05-02T00:00:00Z',
      },
      status: 'error',
      tools: [],
      last_log: [],
    });
    render(<McpSettings open={true} onClose={() => {}} />);
    await waitFor(() => {
      expect(screen.getByText(/Restart Me/)).toBeInTheDocument();
    });
    await user.click(screen.getByRole('button', { name: /^재시작$/i }));
    expect(window.dreampia.mcp.restart).toHaveBeenCalledWith('restartable');
  });

  it('view-logs button opens logs modal', async () => {
    const user = userEvent.setup();
    __mockStore.mcpServers.set('logsrv', {
      config: {
        id: 'logsrv',
        name: 'LogsServer',
        command: 'x',
        args: [],
        env: {},
        enabled: true,
        added_at: '2026-05-02T00:00:00Z',
      },
      status: 'ready',
      tools: [],
      last_log: ['line 1', 'line 2'],
    });
    render(<McpSettings open={true} onClose={() => {}} />);
    await waitFor(() => {
      expect(screen.getByText(/LogsServer/)).toBeInTheDocument();
    });
    await user.click(screen.getByRole('button', { name: /로그 보기/i }));
    expect(screen.getByRole('dialog', { name: /logsrv 로그/i })).toBeInTheDocument();
    expect(screen.getByText(/line 1/)).toBeInTheDocument();
    expect(screen.getByText(/line 2/)).toBeInTheDocument();
  });

  it('calls onClose when X button clicked', async () => {
    let closed = false;
    const user = userEvent.setup();
    render(
      <McpSettings
        open={true}
        onClose={() => {
          closed = true;
        }}
      />
    );
    // 'MCP 서버' header dialog 의 닫기 버튼 (form 내부 닫기 버튼과 분리)
    const dialog = screen.getByRole('dialog', { name: /MCP 서버 설정/i });
    await user.click(within(dialog).getByLabelText('닫기'));
    expect(closed).toBe(true);
  });
});
