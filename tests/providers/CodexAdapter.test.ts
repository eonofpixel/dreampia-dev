/**
 * CodexAdapter — message + tool 변환 양방향 테스트.
 *
 * Spec: docs/session/cross-ai-sync.md lines 190-248
 *
 * 핵심 차이:
 *   - tool turn 1:N split (tool_results 갯수만큼 메시지)
 *   - assistant.tool_calls 는 별도 필드 (content 외)
 *   - thinking 블록은 drop (cross-ai-sync.md 322-352)
 */

import { describe, it, expect } from 'vitest';
import { CodexAdapter } from '../../src/providers/CodexAdapter';
import type { Turn, ToolCallId, TurnId } from '../../src/types';

// ────────────────────────────────────────────────────────────
// Test fixtures
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
    model: 'gpt-5.5',
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

function toolResultTurnWithMultiple(): Turn {
  // 1:N split test — 한 turn 에 여러 tool_results
  return {
    id: 'turn-tool-multi' as TurnId,
    role: 'tool',
    timestamp: '2026-05-02T01:00:09.000Z',
    status: 'completed',
    content: [],
    tool_results: [
      {
        call_id: 'tc-A' as ToolCallId,
        status: 'success',
        output: 'first',
        duration_ms: 100,
      },
      {
        call_id: 'tc-B' as ToolCallId,
        status: 'failed',
        error: { code: 'EXIT_NONZERO', message: 'exit code 1' },
        duration_ms: 200,
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
// toProviderMessages — basic
// ────────────────────────────────────────────────────────────

describe('CodexAdapter.toProviderMessages — basic shapes', () => {
  it('user text turn → role user with string content', () => {
    const adapter = new CodexAdapter();
    const msgs = adapter.toProviderMessages([userTurn('안녕하세요')]);
    expect(msgs).toHaveLength(1);
    expect(msgs[0]).toEqual({
      role: 'user',
      content: '안녕하세요',
    });
  });

  it('assistant turn: text → joined string content; tool_calls → separate field', () => {
    const adapter = new CodexAdapter();
    const msgs = adapter.toProviderMessages([assistantTurnWithTool()]);
    expect(msgs).toHaveLength(1);
    const msg = msgs[0] as {
      role: string;
      content: string;
      tool_calls?: Array<Record<string, unknown>>;
    };
    expect(msg.role).toBe('assistant');
    expect(msg.content).toBe('I will run the test.');
    // tool_calls 는 message 의 별도 field (content array 안에 X)
    expect(msg.tool_calls).toBeDefined();
    expect(msg.tool_calls).toHaveLength(1);
    expect(msg.tool_calls?.[0]).toMatchObject({
      id: 'tc-1',
      type: 'function',
      function: { name: 'shell_run' }, // dots → underscores
    });
    const args = (msg.tool_calls?.[0] as { function: { arguments: string } })
      .function.arguments;
    expect(JSON.parse(args)).toEqual({ cmd: 'npm test' });
  });
});

// ────────────────────────────────────────────────────────────
// Tool turn split (1:N) — critical correctness
// ────────────────────────────────────────────────────────────

describe('CodexAdapter.toProviderMessages — tool turn split', () => {
  it('single tool_result → single role=tool message', () => {
    const adapter = new CodexAdapter();
    const msgs = adapter.toProviderMessages([toolResultTurn()]);
    expect(msgs).toHaveLength(1);
    const msg = msgs[0] as {
      role: string;
      tool_call_id: string;
      content: string;
    };
    expect(msg.role).toBe('tool');
    expect(msg.tool_call_id).toBe('tc-1');
  });

  it('N tool_results in one turn → N separate messages (1:N split)', () => {
    const adapter = new CodexAdapter();
    const msgs = adapter.toProviderMessages([toolResultTurnWithMultiple()]);
    expect(msgs).toHaveLength(2);
    const m0 = msgs[0] as { role: string; tool_call_id: string };
    const m1 = msgs[1] as { role: string; tool_call_id: string };
    expect(m0.role).toBe('tool');
    expect(m0.tool_call_id).toBe('tc-A');
    expect(m1.role).toBe('tool');
    expect(m1.tool_call_id).toBe('tc-B');
  });

  it('failed tool_result serializes error info in content', () => {
    const adapter = new CodexAdapter();
    const msgs = adapter.toProviderMessages([toolResultTurnWithMultiple()]);
    const m1 = msgs[1] as { content: string };
    const parsed = JSON.parse(m1.content);
    expect(parsed.status).toBe('failed');
    expect(parsed.error.code).toBe('EXIT_NONZERO');
  });
});

// ────────────────────────────────────────────────────────────
// System turn — IMPL_NOTES: filter out (cross-ai-sync.md 미명시)
// ────────────────────────────────────────────────────────────

describe('CodexAdapter — system turn handling', () => {
  it('system turn is filtered out (P0 policy — see IMPL_NOTES)', () => {
    const adapter = new CodexAdapter();
    const msgs = adapter.toProviderMessages([systemTurn(), userTurn('hello')]);
    expect(msgs).toHaveLength(1);
    expect((msgs[0] as { role: string }).role).toBe('user');
  });
});

// ────────────────────────────────────────────────────────────
// Lossy conversions — cross-ai-sync.md 322-352
// ────────────────────────────────────────────────────────────

describe('CodexAdapter — lossy conversion behaviors', () => {
  it('mention block in user turn → text fallback "@display"', () => {
    const adapter = new CodexAdapter();
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
        { type: 'text', text: ' please' },
      ],
    };
    const msgs = adapter.toProviderMessages([turn]);
    const msg = msgs[0] as { role: string; content: string };
    expect(msg.content).toContain('@Analyst');
    expect(msg.content).toContain('please');
  });

  it('embedded_card → "[title](url)" fallback', () => {
    const adapter = new CodexAdapter();
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
            title: 'Doc',
            url: 'http://x.test',
          },
        },
      ],
    };
    const msgs = adapter.toProviderMessages([turn]);
    expect((msgs[0] as { content: string }).content).toBe('[Doc](http://x.test)');
  });

  it('thinking block (in unknown form) is dropped — assistant turn', () => {
    // Thinking blocks are not part of our schema's ContentBlock union, but
    // we must verify that *if* they appear via metadata or response, the
    // outgoing assistant turn does NOT include them. Since our schema
    // can't represent thinking, we test that text+tool_calls stay clean.
    const adapter = new CodexAdapter();
    const turn: Turn = {
      id: 't' as TurnId,
      role: 'assistant',
      timestamp: '2026-05-02T01:00:00.000Z',
      status: 'completed',
      content: [{ type: 'text', text: 'visible reply' }],
      tool_calls: [
        { id: 'tc-1' as ToolCallId, tool_id: 'shell.run', input: { cmd: 'ls' } },
      ],
    };
    const msgs = adapter.toProviderMessages([turn]);
    const msg = msgs[0] as {
      content: string;
      tool_calls: Array<Record<string, unknown>>;
    };
    // Only the visible reply should be in content
    expect(msg.content).toBe('visible reply');
    expect(msg.tool_calls).toHaveLength(1);
  });

  it('image block in user turn → multimodal content array (image_url)', () => {
    const adapter = new CodexAdapter();
    const turn: Turn = {
      id: 't' as TurnId,
      role: 'user',
      timestamp: '2026-05-02T01:00:00.000Z',
      status: 'completed',
      content: [
        { type: 'text', text: 'see this' },
        { type: 'image', mime: 'image/png', data: 'AAAA' },
      ],
    };
    const msgs = adapter.toProviderMessages([turn]);
    const msg = msgs[0] as { content: Array<Record<string, unknown>> };
    expect(Array.isArray(msg.content)).toBe(true);
    const imagePart = msg.content.find((p) => p.type === 'image_url');
    expect(imagePart).toBeDefined();
  });
});

// ────────────────────────────────────────────────────────────
// Tool name encoding
// ────────────────────────────────────────────────────────────

describe('CodexAdapter — tool name encoding', () => {
  it('outgoing: shell.run → function.name = shell_run', () => {
    const adapter = new CodexAdapter();
    const msgs = adapter.toProviderMessages([assistantTurnWithTool()]);
    const msg = msgs[0] as { tool_calls: Array<{ function: { name: string } }> };
    expect(msg.tool_calls[0]?.function.name).toBe('shell_run');
  });

  it('incoming: function.name shell_run → tool_id shell.run', () => {
    const adapter = new CodexAdapter();
    const response = {
      choices: [
        {
          message: {
            role: 'assistant',
            content: 'OK',
            tool_calls: [
              {
                id: 'tc-x',
                type: 'function',
                function: {
                  name: 'shell_run',
                  arguments: '{"cmd":"ls"}',
                },
              },
            ],
          },
        },
      ],
      model: 'gpt-5.5',
    };
    const { tool_calls } = adapter.fromProviderResponse(response);
    expect(tool_calls).toHaveLength(1);
    expect(tool_calls[0]?.tool_id).toBe('shell.run');
    expect(tool_calls[0]?.input).toEqual({ cmd: 'ls' });
  });
});

// ────────────────────────────────────────────────────────────
// fromProviderResponse — both shapes (choices vs direct)
// ────────────────────────────────────────────────────────────

describe('CodexAdapter.fromProviderResponse', () => {
  it('extracts message from choices[0].message shape', () => {
    const adapter = new CodexAdapter();
    const response = {
      choices: [
        {
          message: {
            role: 'assistant',
            content: 'Hello!',
          },
        },
      ],
      model: 'gpt-5.5',
    };
    const { new_turn } = adapter.fromProviderResponse(response);
    expect(new_turn.content).toEqual([{ type: 'text', text: 'Hello!' }]);
  });

  it('handles direct message shape', () => {
    const adapter = new CodexAdapter();
    const response = {
      role: 'assistant',
      content: 'direct',
      model: 'gpt-4.1',
    };
    const { new_turn } = adapter.fromProviderResponse(response);
    expect(new_turn.content).toEqual([{ type: 'text', text: 'direct' }]);
    expect(new_turn.model).toBe('gpt-4.1');
  });

  it('preserves tool_call.input as parsed JSON', () => {
    const adapter = new CodexAdapter();
    const response = {
      choices: [
        {
          message: {
            content: '',
            tool_calls: [
              {
                id: 'tc-1',
                type: 'function',
                function: {
                  name: 'shell_run',
                  arguments: '{"cmd":"npm test","cwd":"/tmp"}',
                },
              },
            ],
          },
        },
      ],
      model: 'gpt-5.5',
    };
    const { tool_calls } = adapter.fromProviderResponse(response);
    expect(tool_calls[0]?.input).toEqual({ cmd: 'npm test', cwd: '/tmp' });
  });

  it('falls back gracefully on malformed arguments JSON', () => {
    const adapter = new CodexAdapter();
    const response = {
      choices: [
        {
          message: {
            content: '',
            tool_calls: [
              {
                id: 'tc-1',
                type: 'function',
                function: {
                  name: 'shell_run',
                  arguments: 'not-json',
                },
              },
            ],
          },
        },
      ],
      model: 'gpt-5.5',
    };
    const { tool_calls } = adapter.fromProviderResponse(response);
    expect(tool_calls[0]?.input).toBe('not-json');
  });
});

// ────────────────────────────────────────────────────────────
// Capability flags
// ────────────────────────────────────────────────────────────

describe('CodexAdapter — capability flags', () => {
  it('supportsExtendedThinking returns false', () => {
    expect(new CodexAdapter().supportsExtendedThinking()).toBe(false);
  });

  it('supportsPromptCaching returns false', () => {
    expect(new CodexAdapter().supportsPromptCaching()).toBe(false);
  });

  it('maxContextTokens is 256_000', () => {
    expect(new CodexAdapter().maxContextTokens()).toBe(256_000);
  });

  it('provider field is "codex"', () => {
    expect(new CodexAdapter().provider).toBe('codex');
  });
});

// ────────────────────────────────────────────────────────────
// toProviderConfig + toProviderTools
// ────────────────────────────────────────────────────────────

describe('CodexAdapter.toProviderConfig', () => {
  it('maps effort to reasoning_effort', () => {
    const adapter = new CodexAdapter();
    const turn: Turn = {
      id: 't' as TurnId,
      role: 'user',
      timestamp: '2026-05-02T01:00:00.000Z',
      status: 'completed',
      content: [],
      effort: 'high',
      model: 'o1-preview',
    };
    const config = adapter.toProviderConfig(turn);
    expect(config.reasoning_effort).toBe('high');
    expect(config.model).toBe('o1-preview');
  });
});

describe('CodexAdapter.toProviderTools', () => {
  it('OpenAI function tool format', () => {
    const adapter = new CodexAdapter();
    const tools = adapter.toProviderTools([
      { id: 'shell.run', description: 'run command' },
    ]);
    expect(tools).toHaveLength(1);
    const t = tools[0] as { type: string; function: { name: string } };
    expect(t.type).toBe('function');
    expect(t.function.name).toBe('shell_run');
  });
});

// ────────────────────────────────────────────────────────────
// parseStreamChunk (P0 stub)
// ────────────────────────────────────────────────────────────

describe('CodexAdapter.parseStreamChunk — P0 stub', () => {
  it('returns empty array (P1 implementation pending)', () => {
    const adapter = new CodexAdapter();
    expect(adapter.parseStreamChunk('data: {"choices":[]}')).toEqual([]);
  });
});
