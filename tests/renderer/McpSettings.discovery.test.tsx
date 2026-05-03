/**
 * McpSettings — v0.9.0 추천 + 자동 탐지 UI 검증.
 *
 * Existing v0.2.0 tests 는 McpSettings.test.tsx — 그대로 유지.
 * v0.9.0 추가분만 별도 file 로.
 */

import { describe, it, expect } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { McpSettings } from '../../src/renderer/components/settings/McpSettings';
import { __mockStore } from '../setup';

describe('McpSettings — discovery section (v0.9.0)', () => {
  it('renders 추천 section when suggested servers present', async () => {
    __mockStore.mcpDiscovery.suggested = [
      {
        id: 'filesystem',
        name: 'Filesystem',
        description: '파일 시스템 접근',
        command: 'npx',
        args: ['-y', '@modelcontextprotocol/server-filesystem', '/'],
        install_hint: 'npx 가 PATH 에 있으면 자동 설치',
      },
    ];
    render(<McpSettings open={true} onClose={() => {}} />);
    await waitFor(() => {
      expect(screen.getByTestId('suggested-filesystem')).toBeInTheDocument();
    });
    expect(screen.getByText(/추천 서버/i)).toBeInTheDocument();
  });

  it('renders 발견된 section when from_claude has entries', async () => {
    __mockStore.mcpDiscovery.from_claude = [
      {
        id: 'github-from-claude',
        name: 'GitHub',
        command: 'npx',
        args: ['-y', '@modelcontextprotocol/server-github'],
        env: {},
        enabled: false,
        added_at: '2026-05-03T00:00:00.000Z',
      },
    ];
    render(<McpSettings open={true} onClose={() => {}} />);
    await waitFor(() => {
      expect(screen.getByTestId('discovered-github-from-claude')).toBeInTheDocument();
    });
    expect(screen.getByText(/CLI 에서 발견된 서버/i)).toBeInTheDocument();
  });

  it('clicking suggested [추가] opens add form pre-filled with id and command', async () => {
    __mockStore.mcpDiscovery.suggested = [
      {
        id: 'memory',
        name: 'Memory',
        description: '대화 컨텍스트 영구 저장',
        command: 'npx',
        args: ['-y', '@modelcontextprotocol/server-memory'],
        install_hint: '추가 설정 불필요',
      },
    ];
    render(<McpSettings open={true} onClose={() => {}} />);
    const addBtn = await screen.findByTestId('suggested-add-memory');
    await userEvent.click(addBtn);
    // Form 이 열렸는지 — 새 dialog (MCP 서버 추가 dialog).
    await waitFor(() => {
      expect(screen.getByRole('dialog', { name: /MCP 서버 추가/i })).toBeInTheDocument();
    });
    // ID 필드는 'memory' 로 채워져 있어야 함.
    const idInput = screen.getByDisplayValue('memory');
    expect(idInput).toBeInTheDocument();
  });

  it('discovery section omits when no suggestions and no discovered servers', async () => {
    // Default mockStore.mcpDiscovery 는 모두 비어있음.
    render(<McpSettings open={true} onClose={() => {}} />);
    await waitFor(() => {
      expect(screen.getByText(/등록된 MCP 서버가 없어요/i)).toBeInTheDocument();
    });
    expect(screen.queryByTestId('mcp-discovery-section')).not.toBeInTheDocument();
  });

  it('clicking discovered [추가] opens add form pre-filled with command and args', async () => {
    __mockStore.mcpDiscovery.from_codex = [
      {
        id: 'github-codex',
        name: 'GitHub Codex',
        command: 'npx',
        args: ['-y', '@modelcontextprotocol/server-github'],
        env: { GITHUB_TOKEN: 'xxx' },
        enabled: false,
        added_at: '2026-05-03T00:00:00.000Z',
      },
    ];
    render(<McpSettings open={true} onClose={() => {}} />);
    const addBtn = await screen.findByTestId('discovered-add-github-codex');
    await userEvent.click(addBtn);
    await waitFor(() => {
      expect(screen.getByRole('dialog', { name: /MCP 서버 추가/i })).toBeInTheDocument();
    });
    expect(screen.getByDisplayValue('github-codex')).toBeInTheDocument();
  });
});
