/**
 * Codex CLI JSONL → StreamEvent 변환.
 *
 * Verified against real `codex exec --json --skip-git-repo-check --ephemeral` output.
 * Captured 2026-05-02. CLI version: codex-cli 0.125.0.
 *
 * Sample events (one of each type observed):
 *
 * {"type":"thread.started","thread_id":"019de952-..."}
 * {"type":"turn.started"}
 * {"type":"item.completed","item":{"id":"item_0","type":"agent_message","text":"Hello there, friend"}}
 * {"type":"turn.completed","usage":{"input_tokens":24973,"cached_input_tokens":4480,"output_tokens":72,"reasoning_output_tokens":62}}
 *
 * // Error events (reconnect/network errors interleaved with JSON):
 * {"type":"error","message":"Reconnecting... 2/5 (stream disconnected before completion: ...)"}
 *
 * // Non-JSON lines (log lines from CLI, NOT JSON — JsonlParser correctly skips):
 * 2026-05-02T15:32:41.420188Z ERROR codex_api::endpoint::responses_websocket: failed to connect ...
 */

import type { ToolCallId } from '@/types';
import type { StreamEvent } from '../types';

interface TranslateContext {
  turnId: string;
  model: string;
}

export function translateCodexJsonl(
  parsed: unknown,
  _ctx: TranslateContext
): StreamEvent[] {
  if (typeof parsed !== 'object' || parsed === null) return [];
  const obj = parsed as Record<string, unknown>;
  const evType = typeof obj.type === 'string' ? obj.type : '';

  // ── thread.started — emit nothing (metadata) ──
  if (evType === 'thread.started') {
    return [];
  }

  // ── turn.started — emit nothing ──
  if (evType === 'turn.started') {
    return [];
  }

  // ── item.completed — main content delivery ──
  if (evType === 'item.completed') {
    const item = obj.item as Record<string, unknown> | undefined;
    if (item === undefined || item === null) return [];
    const itemType = typeof item.type === 'string' ? item.type : '';

    if (itemType === 'agent_message' && typeof item.text === 'string') {
      return [{ type: 'text_delta', text: item.text }];
    }

    // TODO: tool_use items not yet observed in captures.
    // When codex emits function_call items the shape is unknown.
    // Best-effort: emit tool_call_complete if we can extract id/name/input.
    if (itemType === 'function_call') {
      const id = typeof item.id === 'string' ? item.id : '';
      const name = typeof item.name === 'string' ? item.name : '';
      const tool_id = name.replace(/_/g, '.');
      const input = item.arguments ?? item.input;
      return [
        {
          type: 'tool_call_complete',
          tool_call: { id: id as ToolCallId, tool_id, input },
        },
      ];
    }

    return [];
  }

  // ── turn.completed — emit nothing (CliProvider synthesizes message_complete) ──
  if (evType === 'turn.completed') {
    return [];
  }

  // ── error — reconnect / network errors ──
  if (evType === 'error') {
    const message =
      typeof obj.message === 'string' ? obj.message : 'unknown error';
    return [{ type: 'error', error: message }];
  }

  // ── 그 외 unknown event type — silent skip ──
  return [];
}
