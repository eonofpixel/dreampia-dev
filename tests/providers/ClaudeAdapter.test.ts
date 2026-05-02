/**
 * ClaudeAdapter — message + tool 변환 양방향 테스트.
 *
 * Spec: docs/session/cross-ai-sync.md lines 76-181
 */

import { describe, it, expect } from 'vitest';
import { ClaudeAdapter } from '../../src/providers/ClaudeAdapter';
import type { Turn, ToolCallId, TurnId } from '../../src/types';

// ────────────────────────────────────────────────────────────
// Test fixture helpers
// ────────────────────────────────────────────────────────────

function userTurn(text: string, id = 'turn-user-1'): Turn {
  return {
    id: id as TurnId,
    role: 'user',
    timestamp: '2026-05-02T01:00:00.000Z',
    status: 'completed',
    content: [{ type: 'text', text }],
  };
}

function assistantTurnWithTool(): Turn {
  return {
    id: 'turn-asst-1' as TurnId,
    role: 'assistant',
    timestamp: '2026-05-02T01:00:01.000Z',
    status: 'completed',
    content: [{ type: 'text', text: 'I will run the test.' }],
    tool_calls: [
      {
        id: 'tc-1' as ToolCallId,
        tool_id: 'shell.run',
        input: { cmd: 'npm test' },
      },
    ],
    model: 'claude-sonnet-4.6',
  };
}

function toolResultTurn(): Turn {
  return {
    id: 'turn-tool-1' as TurnId,
    role: 'tool',
    timestamp: '2026-05-02T01:00:09.000Z',
    status: 'completed',
    content: [],
    tool_results: [
      {
        call_id: 'tc-1' as ToolCallId,
        status: 'success',
        output: { stdout: 'tests passed' },
        duration_ms: 1234,
      },
    ],
  };
}

function systemTurn(): Turn {
  return {
    id: 'turn-system-1' as TurnId,
    role: 'system',
    timestamp: '2026-05-02T00:59:00.000Z',
    status: 'completed',
    content: [{ type: 'text', text: 'You are a helpful assistant.' }],
  };
}

// ────────────────────────────────────────────────────────────
// toProviderMessages
// ────────────────────────────────────────────────────────────

describe('ClaudeAdapter.toProviderMessages — basic shapes', () => {
  it('user text turn → role user with text content block', () => {
    const adapter = new ClaudeAdapter();
    const msgs = adapter.toProviderMessages([userTurn('안녕하세요')]);
    expect(msgs).toHaveLength(1);
    expect(msgs[0]).toEqual({
      role: 'user',
      content: [{ type: 'text', text: '안녕하세요' }],
    });
  });

  it('assistant turn with text + tool_calls → tool_use block appended', () => {
    const adapter = new ClaudeAdapter();
    const msgs = adapter.toProviderMessages([assistantTurnWithTool()]);
    expect(msgs).toHaveLength(1);
    const msg = msgs[0] as { role: string; content: Array<Record<string, unknown>> };
    expect(msg.role).toBe('assistant');
    expect(msg.content).toHaveLength(2);
    expect(msg.content[0]).toEqual({ type: 'text', text: 'I will run the test.' });
    // Tool name dots replaced with underscores
    expect(msg.content[1]).toEqual({
      type: 'tool_use',
      id: 'tc-1',
      name: 'shell_run',
      input: { cmd: 'npm test' },
    });
  });

  it('tool turn → role user with tool_result blocks (Claude convention)', () => {
    const adapter = new ClaudeAdapter();
    const msgs = adapter.toProviderMessages([toolResultTurn()]);
    expect(msgs).toHaveLength(1);
    const msg = msgs[0] as { role: string; content: Array<Record<string, unknown>> };
    expect(msg.role).toBe('user');
    expect(msg.content).toHaveLength(1);
    expect(msg.content[0]).toMatchObject({
      type: 'tool_result',
      tool_use_id: 'tc-1',
    });
  });

  it('system turn is filtered out (system prompt is separate)', () => {
    const adapter = new ClaudeAdapter();
    const msgs = adapter.toProviderMessages([
      systemTurn(),
      userTurn('hello'),
    ]);
    expect(msgs).toHaveLength(1);
    expect((msgs[0] as { role: string }).role).toBe('user');
  });

  it('multi-turn conversation order preserved', () => {
    const adapter = new ClaudeAdapter();
    const msgs = adapter.toProviderMessages([
      userTurn('첫번째'),
      assistantTurnWithTool(),
      toolResultTurn(),
      userTurn('두번째', 'turn-user-2'),
    ]);
    expect(msgs).toHaveLength(4);
    expect((msgs[0] as { role: string }).role).toBe('user');
    expect((msgs[1] as { role: string }).role).toBe('assistant');
    expect((msgs[2] as { role: string }).role).toBe('user'); // tool result
    expect((msgs[3] as { role: string }).role).toBe('user');
  });
});

// ────────────────────────────────────────────────────────────
// Content block fallbacks
// ────────────────────────────────────────────────────────────

describe('ClaudeAdapter — content block fallbacks', () => {
  it('mention block → text fallback "@display"', () => {
    const adapter = new ClaudeAdapter();
    const turn: Turn = {
      id: 'turn-1' as TurnId,
      role: 'user',
      timestamp: '2026-05-02T01:00:00.000Z',
      status: 'completed',
      content: [
        {
          type: 'mention',
          ref: { kind: 'agent', id: 'Analyst', display: 'Analyst' },
        },
        { type: 'text', text: ' please review' },
      ],
    };
    const msgs = adapter.toProviderMessages([turn]);
    const msg = msgs[0] as { content: Array<Record<string, unknown>> };
    expect(msg.content[0]).toEqual({ type: 'text', text: '@Analyst' });
    expect(msg.content[1]).toEqual({ type: 'text', text: ' please review' });
  });

  it('embedded_card block → text fallback "[title](url)"', () => {
    const adapter = new ClaudeAdapter();
    const turn: Turn = {
      id: 'turn-1' as TurnId,
      role: 'user',
      timestamp: '2026-05-02T01:00:00.000Z',
      status: 'completed',
      content: [
        {
          type: 'embedded_card',
          card: {
            kind: 'web_preview',
            title: 'Dashboard',
            url: 'http://127.0.0.1:3000/dashboard',
          },
        },
      ],
    };
    const msgs = adapter.toProviderMessages([turn]);
    const msg = msgs[0] as { content: Array<Record<string, unknown>> };
    expect(msg.content[0]).toEqual({
      type: 'text',
      text: '[Dashboard](http://127.0.0.1:3000/dashboard)',
    });
  });

  it('image block → base64 source structure', () => {
    const adapter = new ClaudeAdapter();
    const turn: Turn = {
      id: 'turn-1' as TurnId,
      role: 'user',
      timestamp: '2026-05-02T01:00:00.000Z',
      status: 'completed',
      content: [
        {
          type: 'image',
          mime: 'image/png',
          data: 'iVBORw0KGgoAAA',
        },
      ],
    };
    const msgs = adapter.toProviderMessages([turn]);
    const msg = msgs[0] as { content: Array<Record<string, unknown>> };
    expect(msg.content[0]).toEqual({
      type: 'image',
      source: {
        type: 'base64',
        media_type: 'image/png',
        data: 'iVBORw0KGgoAAA',
      },
    });
  });
});

// ────────────────────────────────────────────────────────────
// Tool name encoding (critical correctness)
// ────────────────────────────────────────────────────────────

describe('ClaudeAdapter — tool name encoding', () => {
  it('outgoing: shell.run → shell_run (dots → underscores)', () => {
    const adapter = new ClaudeAdapter();
    const msgs = adapter.toProviderMessages([assistantTurnWithTool()]);
    const msg = msgs[0] as { content: Array<{ type: string; name?: string }> };
    const toolUse = msg.content.find((c) => c.type === 'tool_use');
    expect(toolUse?.name).toBe('shell_run');
  });

  it('outgoing: nested.dot.tool → nested_dot_tool', () => {
    const adapter = new ClaudeAdapter();
    const turn: Turn = {
      id: 'turn-1' as TurnId,
      role: 'assistant',
      timestamp: '2026-05-02T01:00:00.000Z',
      status: 'completed',
      content: [],
      tool_calls: [
        {
          id: 'tc-1' as ToolCallId,
          tool_id: 'nested.dot.tool',
          input: {},
        },
      ],
    };
    const msgs = adapter.toProviderMessages([turn]);
    const msg = msgs[0] as { content: Array<{ type: string; name?: string }> };
    const toolUse = msg.content.find((c) => c.type === 'tool_use');
    expect(toolUse?.name).toBe('nested_dot_tool');
  });

  it('incoming: shell_run → shell.run (underscores → dots)', () => {
    const adapter = new ClaudeAdapter();
    const response = {
      content: [
        { type: 'text', text: 'OK' },
        { type: 'tool_use', id: 'tc-x', name: 'shell_run', input: { cmd: 'ls' } },
      ],
      model: 'claude-sonnet-4.6',
    };
    const { tool_calls } = adapter.fromProviderResponse(response);
    expect(tool_calls).toHaveLength(1);
    expect(tool_calls[0]?.tool_id).toBe('shell.run');
  });
});

// ────────────────────────────────────────────────────────────
// fromProviderResponse
// ────────────────────────────────────────────────────────────

describe('ClaudeAdapter.fromProviderResponse — incoming parsing', () => {
  it('text + tool_use → Turn with content + tool_calls', () => {
    const adapter = new ClaudeAdapter();
    const response = {
      content: [
        { type: 'text', text: 'I will help.' },
        {
          type: 'tool_use',
          id: 'tc-1',
          name: 'shell_run',
          input: { cmd: 'npm test' },
        },
      ],
      model: 'claude-sonnet-4.6',
    };
    const { new_turn, tool_calls } = adapter.fromProviderResponse(response);

    expect(new_turn.role).toBe('assistant');
    expect(new_turn.status).toBe('completed');
    expect(new_turn.model).toBe('claude-sonnet-4.6');
    expect(new_turn.content).toHaveLength(1);
    expect(new_turn.content[0]).toEqual({ type: 'text', text: 'I will help.' });
    expect(new_turn.tool_calls).toHaveLength(1);
    expect(tool_calls[0]?.tool_id).toBe('shell.run');
    expect(tool_calls[0]?.input).toEqual({ cmd: 'npm test' });
    expect(tool_calls[0]?.id).toBe('tc-1');
  });

  it('text-only response has no tool_calls field', () => {
    const adapter = new ClaudeAdapter();
    const response = {
      content: [{ type: 'text', text: 'Hello!' }],
      model: 'claude-haiku-3.5',
    };
    const { new_turn, tool_calls } = adapter.fromProviderResponse(response);
    expect(tool_calls).toHaveLength(0);
    expect(new_turn.tool_calls).toBeUndefined();
  });

  it('missing model defaults to claude-unknown (non-fatal)', () => {
    const adapter = new ClaudeAdapter();
    const { new_turn } = adapter.fromProviderResponse({
      content: [{ type: 'text', text: 'hi' }],
    });
    expect(new_turn.model).toBe('claude-unknown');
  });

  it('unknown block types ignored gracefully', () => {
    const adapter = new ClaudeAdapter();
    const response = {
      content: [
        { type: 'thinking', content: 'internal' },
        { type: 'text', text: 'Hello' },
      ],
      model: 'claude-sonnet-4.6',
    };
    const { new_turn } = adapter.fromProviderResponse(response);
    expect(new_turn.content).toEqual([{ type: 'text', text: 'Hello' }]);
  });
});

// ────────────────────────────────────────────────────────────
// fromProviderToolResult
// ────────────────────────────────────────────────────────────

describe('ClaudeAdapter.fromProviderToolResult', () => {
  it('success case: is_error absent → status success', () => {
    const adapter = new ClaudeAdapter();
    const result = adapter.fromProviderToolResult({
      tool_use_id: 'tc-1',
      content: 'output here',
      duration_ms: 100,
    });
    expect(result.call_id).toBe('tc-1');
    expect(result.status).toBe('success');
    expect(result.output).toBe('output here');
  });

  it('error case: is_error true → status failed', () => {
    const adapter = new ClaudeAdapter();
    const result = adapter.fromProviderToolResult({
      tool_use_id: 'tc-2',
      is_error: true,
      content: 'something went wrong',
    });
    expect(result.status).toBe('failed');
    expect(result.error?.message).toContain('something went wrong');
  });
});

// ────────────────────────────────────────────────────────────
// Capability flags
// ────────────────────────────────────────────────────────────

describe('ClaudeAdapter — capability flags', () => {
  it('supportsExtendedThinking returns true', () => {
    expect(new ClaudeAdapter().supportsExtendedThinking()).toBe(true);
  });

  it('supportsPromptCaching returns true', () => {
    expect(new ClaudeAdapter().supportsPromptCaching()).toBe(true);
  });

  it('maxContextTokens is 200_000', () => {
    expect(new ClaudeAdapter().maxContextTokens()).toBe(200_000);
  });

  it('provider field is "claude"', () => {
    expect(new ClaudeAdapter().provider).toBe('claude');
  });
});

// ────────────────────────────────────────────────────────────
// toProviderConfig + toProviderTools
// ────────────────────────────────────────────────────────────

describe('ClaudeAdapter.toProviderConfig', () => {
  it('includes model + effort when set', () => {
    const adapter = new ClaudeAdapter();
    const turn: Turn = {
      id: 't' as TurnId,
      role: 'user',
      timestamp: '2026-05-02T01:00:00.000Z',
      status: 'completed',
      content: [],
      model: 'claude-sonnet-4.6',
      effort: 'high',
    };
    const config = adapter.toProviderConfig(turn);
    expect(config.model).toBe('claude-sonnet-4.6');
    expect(config.effort).toBe('high');
  });

  it('omits unset fields', () => {
    const adapter = new ClaudeAdapter();
    const turn: Turn = {
      id: 't' as TurnId,
      role: 'user',
      timestamp: '2026-05-02T01:00:00.000Z',
      status: 'completed',
      content: [],
    };
    const config = adapter.toProviderConfig(turn);
    expect(config.model).toBeUndefined();
    expect(config.effort).toBeUndefined();
  });
});

describe('ClaudeAdapter.toProviderTools — placeholder', () => {
  it('encodes tool name with underscores', () => {
    const adapter = new ClaudeAdapter();
    const tools = adapter.toProviderTools([
      { id: 'shell.run', description: 'run shell command' },
    ]);
    expect(tools).toHaveLength(1);
    expect((tools[0] as { name: string }).name).toBe('shell_run');
  });
});

// ────────────────────────────────────────────────────────────
// parseStreamChunk (P0 stub)
// ────────────────────────────────────────────────────────────

describe('ClaudeAdapter.parseStreamChunk — P0 stub', () => {
  it('returns empty array (P1 implementation pending)', () => {
    const adapter = new ClaudeAdapter();
    expect(adapter.parseStreamChunk('data: {"type":"text"}')).toEqual([]);
  });
});
