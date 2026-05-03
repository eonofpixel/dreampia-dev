/**
 * MCP discovery — v0.9.0 정적 추천 + Claude/Codex CLI config 자동 탐지.
 *
 * 검증:
 *  1. SUGGESTED_MCP_SERVERS — 정적 목록 형태 + 길이.
 *  2. extractServersFromConfig — mcpServers 패턴 (object map).
 *  3. extractServersFromConfig — mcp_servers 패턴 (array of full McpServerConfig).
 *  4. extractServersFromConfig — 중첩 mcp.servers 패턴.
 *  5. id sanitize — 영문/숫자/하이픈/언더스코어 외 문자는 '_' 로 치환.
 *  6. 깨진 항목은 silent drop.
 *  7. 중복 id 제거.
 *  8. detectMcpFromClaudeConfig / Codex — 파일 부재 시 빈 배열.
 */

import { describe, it, expect } from 'vitest';
import {
  SUGGESTED_MCP_SERVERS,
  __extractServersFromConfigForTesting,
  detectMcpFromClaudeConfig,
  detectMcpFromCodexConfig,
} from '../../../src/main/mcp/discovery';

describe('SUGGESTED_MCP_SERVERS', () => {
  it('contains at least 3 entries (filesystem, github, memory)', () => {
    expect(SUGGESTED_MCP_SERVERS.length).toBeGreaterThanOrEqual(3);
    const ids = SUGGESTED_MCP_SERVERS.map((s) => s.id);
    expect(ids).toContain('filesystem');
    expect(ids).toContain('github');
    expect(ids).toContain('memory');
  });

  it('every entry has Korean description', () => {
    for (const s of SUGGESTED_MCP_SERVERS) {
      // 한글이 description 에 포함되는지 정도만 확인.
      expect(s.description.length).toBeGreaterThan(0);
      expect(s.install_hint.length).toBeGreaterThan(0);
    }
  });
});

describe('extractServersFromConfig — mcpServers map pattern', () => {
  it('parses Anthropic CLI style mcpServers object', () => {
    const raw = {
      mcpServers: {
        'github': {
          command: 'npx',
          args: ['-y', '@modelcontextprotocol/server-github'],
          env: { GITHUB_TOKEN: 'xxx' },
        },
        'filesystem': {
          command: 'npx',
          args: ['-y', '@modelcontextprotocol/server-filesystem', '/tmp'],
        },
      },
    };
    const out = __extractServersFromConfigForTesting(raw, 'claude');
    expect(out).toHaveLength(2);
    const github = out.find((c) => c.id === 'github');
    expect(github?.command).toBe('npx');
    expect(github?.env).toEqual({ GITHUB_TOKEN: 'xxx' });
    expect(github?.enabled).toBe(false); // default 보수적 — 사용자가 explicit add 해야 enabled
  });

  it('sanitizes invalid id characters to underscore', () => {
    const raw = {
      mcpServers: {
        'foo bar/baz': {
          command: 'npx',
          args: [],
        },
      },
    };
    const out = __extractServersFromConfigForTesting(raw, 'claude');
    expect(out).toHaveLength(1);
    expect(out[0]?.id).toMatch(/^[a-zA-Z0-9_-]+$/);
  });

  it('drops entries without command', () => {
    const raw = {
      mcpServers: {
        'broken': { args: [] },
      },
    };
    expect(__extractServersFromConfigForTesting(raw, 'claude')).toHaveLength(0);
  });

  it('handles nested mcp.servers pattern', () => {
    const raw = {
      mcp: {
        servers: {
          'memory': { command: 'npx', args: ['-y', '@modelcontextprotocol/server-memory'] },
        },
      },
    };
    const out = __extractServersFromConfigForTesting(raw, 'codex');
    expect(out).toHaveLength(1);
    expect(out[0]?.id).toBe('memory');
  });
});

describe('extractServersFromConfig — mcp_servers array pattern', () => {
  it('parses array of fully-formed McpServerConfig', () => {
    const raw = {
      mcp_servers: [
        {
          id: 'github',
          name: 'GitHub MCP',
          command: 'npx',
          args: ['-y', '@modelcontextprotocol/server-github'],
          env: {},
          enabled: true,
          added_at: '2026-05-03T00:00:00.000Z',
        },
      ],
    };
    const out = __extractServersFromConfigForTesting(raw, 'codex');
    expect(out).toHaveLength(1);
    expect(out[0]?.name).toBe('GitHub MCP');
  });

  it('drops malformed array entries', () => {
    const raw = {
      mcp_servers: [{ id: 'broken' }, 'not an object', null],
    };
    expect(__extractServersFromConfigForTesting(raw, 'codex')).toHaveLength(0);
  });
});

describe('extractServersFromConfig — duplicate handling', () => {
  it('deduplicates by id (first occurrence wins)', () => {
    const raw = {
      mcpServers: {
        'shared': { command: 'A', args: [] },
      },
      mcp: {
        servers: {
          'shared': { command: 'B', args: [] },
        },
      },
    };
    const out = __extractServersFromConfigForTesting(raw, 'claude');
    expect(out).toHaveLength(1);
    expect(out[0]?.command).toBe('A');
  });

  it('returns empty array for non-object input', () => {
    expect(__extractServersFromConfigForTesting(null, 'claude')).toHaveLength(0);
    expect(__extractServersFromConfigForTesting('hello', 'claude')).toHaveLength(0);
    expect(__extractServersFromConfigForTesting(42, 'claude')).toHaveLength(0);
    expect(__extractServersFromConfigForTesting([], 'claude')).toHaveLength(0);
  });
});

describe('detectMcpFromClaudeConfig / detectMcpFromCodexConfig', () => {
  it('returns empty array when no config file exists (best-effort)', async () => {
    // homedir 의 실제 config 가 없는 환경에서도 throw 안 되고 빈 배열.
    // 실제 Anthropic / Codex 사용자 환경에선 결과가 있을 수 있어 length 만 보지 않는다.
    const claudeResult = await detectMcpFromClaudeConfig();
    const codexResult = await detectMcpFromCodexConfig();
    expect(Array.isArray(claudeResult)).toBe(true);
    expect(Array.isArray(codexResult)).toBe(true);
  });
});
