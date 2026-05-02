/**
 * translateClaudeJsonl + translateCodexJsonl tests.
 *
 * Based on real CLI output captured 2026-05-02:
 *   claude 2.1.123 -- flags: --print --output-format stream-json --bare --verbose
 *   codex 0.125.0  -- flags: exec --json --skip-git-repo-check --ephemeral
 */

import { describe, it, expect } from 'vitest';
import { translateClaudeJsonl } from '../../../src/providers/cli/translateClaudeJsonl';
import { translateCodexJsonl } from '../../../src/providers/cli/translateCodexJsonl';

const ctx = { turnId: 't-1', model: 'claude-haiku-4-5-20251001' };

describe('translateClaudeJsonl', () => {
  it('system/init -> empty (metadata, not user content)', () => {
    const out = translateClaudeJsonl(
      { type: 'system', subtype: 'init', cwd: '/tmp', session_id: '43e8abc' },
      ctx
    );
    expect(out).toEqual([]);
  });

  it('system/hook_started -> empty', () => {
    const out = translateClaudeJsonl(
      { type: 'system', subtype: 'hook_started', hook_id: 'h1', hook_name: 'SessionStart:startup' },
      ctx
    );
    expect(out).toEqual([]);
  });

  it('system/hook_response -> empty', () => {
    const out = translateClaudeJsonl(
      { type: 'system', subtype: 'hook_response', hook_id: 'h1', output: 'ok' },
      ctx
    );
    expect(out).toEqual([]);
  });

  it('assistant text block -> text_delta', () => {
    const out = translateClaudeJsonl(
      {
        type: 'assistant',
        message: {
          id: 'dddb123',
          role: 'assistant',
          content: [{ type: 'text', text: 'Hello world' }],
        },
        session_id: 'sess1',
      },
      ctx
    );
    expect(out).toEqual([{ type: 'text_delta', text: 'Hello world' }]);
  });

  it('assistant tool_use block -> tool_call_start + tool_call_complete (underscore->dot)', () => {
    const out = translateClaudeJsonl(
      {
        type: 'assistant',
        message: {
          id: 'msg2',
          role: 'assistant',
          content: [
            { type: 'tool_use', id: 'tu_abc', name: 'read_file', input: { path: 'src/app.ts' } },
          ],
        },
      },
      ctx
    );
    expect(out).toHaveLength(2);
    expect(out[0]).toEqual({
      type: 'tool_call_start',
      tool_call: { id: 'tu_abc', tool_id: 'read.file', input: { path: 'src/app.ts' } },
    });
    expect(out[1]).toEqual({
      type: 'tool_call_complete',
      tool_call: { id: 'tu_abc', tool_id: 'read.file', input: { path: 'src/app.ts' } },
    });
  });

  it('assistant with multiple content blocks -> multiple events', () => {
    const out = translateClaudeJsonl(
      {
        type: 'assistant',
        message: {
          role: 'assistant',
          content: [
            { type: 'text', text: 'Planning...' },
            { type: 'tool_use', id: 'tu_1', name: 'bash', input: { command: 'ls' } },
          ],
        },
      },
      ctx
    );
    expect(out).toHaveLength(3);
    expect(out[0]?.type).toBe('text_delta');
    expect(out[1]?.type).toBe('tool_call_start');
    expect(out[2]?.type).toBe('tool_call_complete');
  });

  it('assistant with no content array -> empty', () => {
    const out = translateClaudeJsonl(
      { type: 'assistant', message: { role: 'assistant' } },
      ctx
    );
    expect(out).toEqual([]);
  });

  it('result with is_error:true -> error event with result text', () => {
    const out = translateClaudeJsonl(
      {
        type: 'result',
        subtype: 'success',
        is_error: true,
        result: 'Not logged in - Please run /login',
        session_id: 'sess1',
      },
      ctx
    );
    expect(out).toEqual([{ type: 'error', error: 'Not logged in - Please run /login' }]);
  });

  it('result with is_error:false -> empty (CliProvider synthesizes message_complete)', () => {
    const out = translateClaudeJsonl(
      { type: 'result', subtype: 'success', is_error: false, result: 'done', session_id: 'sess1' },
      ctx
    );
    expect(out).toEqual([]);
  });

  it('unknown event type -> empty', () => {
    expect(translateClaudeJsonl({ type: 'ping' }, ctx)).toEqual([]);
    expect(translateClaudeJsonl({ type: 'content_block_delta', delta: { type: 'text_delta', text: 'x' } }, ctx)).toEqual([]);
    expect(translateClaudeJsonl({ type: 'message_stop' }, ctx)).toEqual([]);
  });

  it('non-object input -> empty', () => {
    expect(translateClaudeJsonl(null, ctx)).toEqual([]);
    expect(translateClaudeJsonl('string', ctx)).toEqual([]);
    expect(translateClaudeJsonl(42, ctx)).toEqual([]);
  });
});

describe('translateCodexJsonl', () => {
  it('thread.started -> empty', () => {
    const out = translateCodexJsonl({ type: 'thread.started', thread_id: '019de952-abc' }, ctx);
    expect(out).toEqual([]);
  });

  it('turn.started -> empty', () => {
    const out = translateCodexJsonl({ type: 'turn.started' }, ctx);
    expect(out).toEqual([]);
  });

  it('turn.completed -> empty (CliProvider synthesizes message_complete)', () => {
    const out = translateCodexJsonl(
      { type: 'turn.completed', usage: { input_tokens: 24973, output_tokens: 72 } },
      ctx
    );
    expect(out).toEqual([]);
  });

  it('item.completed agent_message -> text_delta', () => {
    const out = translateCodexJsonl(
      { type: 'item.completed', item: { id: 'item_0', type: 'agent_message', text: 'Hello there, friend' } },
      ctx
    );
    expect(out).toEqual([{ type: 'text_delta', text: 'Hello there, friend' }]);
  });

  it('item.completed function_call (best-effort TODO) -> tool_call_complete', () => {
    const out = translateCodexJsonl(
      {
        type: 'item.completed',
        item: { id: 'call_1', type: 'function_call', name: 'read_file', input: { path: 'a.ts' } },
      },
      ctx
    );
    expect(out).toHaveLength(1);
    expect(out[0]?.type).toBe('tool_call_complete');
    const tc = (out[0] as { type: 'tool_call_complete'; tool_call: { id: string; tool_id: string } }).tool_call;
    expect(tc.id).toBe('call_1');
    expect(tc.tool_id).toBe('read.file');
  });

  it('item.completed unknown item type -> empty', () => {
    const out = translateCodexJsonl(
      { type: 'item.completed', item: { id: 'x', type: 'something_new' } },
      ctx
    );
    expect(out).toEqual([]);
  });

  it('error -> error StreamEvent with message field', () => {
    const out = translateCodexJsonl(
      { type: 'error', message: 'Reconnecting... 2/5 (stream disconnected)' },
      ctx
    );
    expect(out).toEqual([{ type: 'error', error: 'Reconnecting... 2/5 (stream disconnected)' }]);
  });

  it('unknown event type -> empty', () => {
    expect(translateCodexJsonl({ type: 'response.output_text.delta', delta: 'x' }, ctx)).toEqual([]);
    expect(translateCodexJsonl({ delta: { content: 'world' } }, ctx)).toEqual([]);
    expect(translateCodexJsonl({ choices: [{ delta: { content: 'hey' } }] }, ctx)).toEqual([]);
    expect(translateCodexJsonl({ foo: 'bar' }, ctx)).toEqual([]);
  });

  it('non-object input -> empty', () => {
    expect(translateCodexJsonl(null, ctx)).toEqual([]);
    expect(translateCodexJsonl(42, ctx)).toEqual([]);
  });
});
