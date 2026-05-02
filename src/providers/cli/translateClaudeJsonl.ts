/**
 * Claude CLI JSONL → StreamEvent 변환.
 *
 * Verified against real `claude --print --output-format stream-json --bare --verbose` output.
 * Captured 2026-05-02. CLI version: 2.1.123 (Claude Code).
 *
 * Sample events (one of each type observed):
 *
 * // 1. Init (first line — metadata only, emit nothing)
 * {"type":"system","subtype":"init","cwd":"...","session_id":"43e8...","tools":["Bash","Edit",...],"mcp_servers":[],"model":"claude-haiku-4-5-20251001","permissionMode":"default","slash_commands":[...],"apiKeySource":"none","claude_code_version":"2.1.123"}
 *
 * // 2. Assistant message (one or more per turn)
 * {"type":"assistant","message":{"id":"dddb...","model":"<synthetic>","role":"assistant","stop_reason":"stop_sequence","content":[{"type":"text","text":"Not logged in · Please run /login"}],"usage":{...},"context_management":null},"parent_tool_use_id":null,"session_id":"43e8...","uuid":"907a...","error":"authentication_failed"}
 *
 * // 3. Result (always last)
 * {"type":"result","subtype":"success","is_error":true,"api_error_status":null,"duration_ms":143,"duration_api_ms":0,"num_turns":1,"result":"Not logged in · Please run /login","stop_reason":"stop_sequence","session_id":"43e8...","total_cost_usd":0,"usage":{...},"modelUsage":{},"permission_denials":[],"terminal_reason":"completed","fast_mode_state":"off","uuid":"4912..."}
 *
 * // Hook events (--bare disables, but captured without --bare):
 * {"type":"system","subtype":"hook_started","hook_id":"...","hook_name":"SessionStart:startup",...}
 * {"type":"system","subtype":"hook_response","hook_id":"...","output":"...",...}
 */

import type { ToolCallId } from '@/types';
import type { StreamEvent } from '../types';

interface TranslateContext {
  turnId: string;
  model: string;
}

export function translateClaudeJsonl(
  parsed: unknown,
  _ctx: TranslateContext
): StreamEvent[] {
  if (typeof parsed !== 'object' || parsed === null) return [];
  const obj = parsed as Record<string, unknown>;
  const evType = typeof obj.type === 'string' ? obj.type : '';

  // ── system: init / hook_* — emit nothing (metadata / hooks) ──
  if (evType === 'system') {
    return [];
  }

  // ── assistant — iterate message.content blocks ──
  if (evType === 'assistant') {
    const message = obj.message as Record<string, unknown> | undefined;
    if (message === undefined || message === null) return [];
    const content = message.content;
    if (!Array.isArray(content)) return [];

    const out: StreamEvent[] = [];
    for (const block of content) {
      if (typeof block !== 'object' || block === null) continue;
      const b = block as Record<string, unknown>;
      const bType = typeof b.type === 'string' ? b.type : '';

      if (bType === 'text' && typeof b.text === 'string') {
        out.push({ type: 'text_delta', text: b.text });
      } else if (bType === 'tool_use') {
        const id = typeof b.id === 'string' ? b.id : '';
        const name = typeof b.name === 'string' ? b.name : '';
        // Claude convention: underscore → dot (e.g. read_file → read.file)
        const tool_id = name.replace(/_/g, '.');
        out.push({
          type: 'tool_call_start',
          tool_call: { id, tool_id, input: b.input },
        });
        out.push({
          type: 'tool_call_complete',
          tool_call: { id: id as ToolCallId, tool_id, input: b.input },
        });
      }
    }
    return out;
  }

  // ── result — only emit error when is_error === true ──
  // CliProvider synthesizes message_complete from accumulated deltas.
  if (evType === 'result') {
    const isError = obj.is_error === true;
    if (isError) {
      const resultText =
        typeof obj.result === 'string' ? obj.result : 'unknown error';
      return [{ type: 'error', error: resultText }];
    }
    return [];
  }

  // ── 그 외 unknown event type — silent skip ──
  return [];
}
