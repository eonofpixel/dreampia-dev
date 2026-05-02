/**
 * translateClaudeJsonl + translateCodexJsonl tests.
 *
 * Best-effort 변환이므로 가장 가능성 높은 shape 들에 대해 동작 검증.
 */

import { describe, it, expect } from 'vitest';
import { translateClaudeJsonl } from '../../../src/providers/cli/translateClaudeJsonl';
import { translateCodexJsonl } from '../../../src/providers/cli/translateCodexJsonl';

const ctx = { turnId: 't-1', model: 'claude-3.5-sonnet' };

describe('translateClaudeJsonl', () => {
  it('content_block_delta -> text_delta', () => {
    const out = translateClaudeJsonl(
      { type: 'content_block_delta', delta: { type: 'text_delta', text: 'hello' } },
      ctx
    );
    expect(out).toEqual([{ type: 'text_delta', text: 'hello' }]);
  });

  it('tool_use -> tool_call_start with underscore→dot', () => {
    const out = translateClaudeJsonl(
      { type: 'tool_use', id: 'tu_123', name: 'shell_run', input: { cmd: 'ls' } },
      ctx
    );
    expect(out).toEqual([
      {
        type: 'tool_call_start',
        tool_call: { id: 'tu_123', tool_id: 'shell.run', input: { cmd: 'ls' } },
      },
    ]);
  });

  it('error event -> error StreamEvent (object form)', () => {
    const out = translateClaudeJsonl(
      { type: 'error', error: { message: 'overloaded' } },
      ctx
    );
    expect(out).toEqual([{ type: 'error', error: 'overloaded' }]);
  });

  it('error event -> error StreamEvent (string form)', () => {
    const out = translateClaudeJsonl({ type: 'error', error: 'bad' }, ctx);
    expect(out).toEqual([{ type: 'error', error: 'bad' }]);
  });

  it('message_stop -> empty array (CliProvider synthesizes)', () => {
    const out = translateClaudeJsonl({ type: 'message_stop' }, ctx);
    expect(out).toEqual([]);
  });

  it('unknown event type -> empty array', () => {
    const out = translateClaudeJsonl({ type: 'ping' }, ctx);
    expect(out).toEqual([]);
  });

  it('non-object input -> empty array', () => {
    expect(translateClaudeJsonl(null, ctx)).toEqual([]);
    expect(translateClaudeJsonl('string', ctx)).toEqual([]);
    expect(translateClaudeJsonl(42, ctx)).toEqual([]);
  });
});

describe('translateCodexJsonl', () => {
  it('delta.content (top-level) -> text_delta', () => {
    const out = translateCodexJsonl({ delta: { content: 'world' } }, ctx);
    expect(out).toEqual([{ type: 'text_delta', text: 'world' }]);
  });

  it('Responses API: response.output_text.delta -> text_delta', () => {
    const out = translateCodexJsonl(
      { type: 'response.output_text.delta', delta: 'partial' },
      ctx
    );
    expect(out).toEqual([{ type: 'text_delta', text: 'partial' }]);
  });

  it('chat.completions: choices[0].delta.content -> text_delta', () => {
    const out = translateCodexJsonl(
      { choices: [{ delta: { content: 'hey' } }] },
      ctx
    );
    expect(out).toEqual([{ type: 'text_delta', text: 'hey' }]);
  });

  it('tool_calls[] -> tool_call_start with parsed args', () => {
    const out = translateCodexJsonl(
      {
        tool_calls: [
          {
            id: 'call_1',
            function: { name: 'read_file', arguments: '{"path":"a.ts"}' },
          },
        ],
      },
      ctx
    );
    expect(out).toEqual([
      {
        type: 'tool_call_start',
        tool_call: {
          id: 'call_1',
          tool_id: 'read.file',
          input: { path: 'a.ts' },
        },
      },
    ]);
  });

  it('tool_calls[] preserves raw args when JSON.parse fails', () => {
    const out = translateCodexJsonl(
      {
        tool_calls: [
          { id: 'c2', function: { name: 'echo', arguments: 'not-json' } },
        ],
      },
      ctx
    );
    expect(out[0]).toMatchObject({
      type: 'tool_call_start',
      tool_call: { id: 'c2', tool_id: 'echo', input: 'not-json' },
    });
  });

  it('error -> error StreamEvent', () => {
    const out = translateCodexJsonl({ error: { message: 'rate_limit' } }, ctx);
    expect(out).toContainEqual({ type: 'error', error: 'rate_limit' });
  });

  it('unknown shape -> empty array', () => {
    expect(translateCodexJsonl({ foo: 'bar' }, ctx)).toEqual([]);
  });

  it('non-object input -> empty array', () => {
    expect(translateCodexJsonl(null, ctx)).toEqual([]);
    expect(translateCodexJsonl(42, ctx)).toEqual([]);
  });
});
