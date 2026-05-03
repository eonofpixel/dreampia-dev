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
 *
 * v0.4.0 — assistant.message.usage 와 result.{usage,total_cost_usd} 도 추출해
 * `usage` StreamEvent 로 emit. assistant 는 turn 중간에도 발생할 수 있어
 * 마지막 값으로 덮어쓰는 게 정확 (Claude 가 누적해서 보내줌). result 가
 * total_cost_usd 를 직접 제공하면 사용, 없으면 estimateCostUsd 로 추정.
 */

import type { ToolCallId } from '@/types';
import { estimateCostUsd } from '../pricing';
import type { StreamEvent, UsageEventData } from '../types';

interface TranslateContext {
  turnId: string;
  model: string;
}

/**
 * Claude usage 객체 → 정수 토큰 카운터.
 * 모든 필드 optional — 누락 시 0.
 */
function parseClaudeUsage(usage: Record<string, unknown> | undefined | null): {
  input_tokens: number;
  output_tokens: number;
  cache_creation_input_tokens: number;
  cache_read_input_tokens: number;
} {
  if (usage === undefined || usage === null) {
    return {
      input_tokens: 0,
      output_tokens: 0,
      cache_creation_input_tokens: 0,
      cache_read_input_tokens: 0,
    };
  }
  const num = (k: string): number => {
    const v = usage[k];
    return typeof v === 'number' && Number.isFinite(v) ? Math.max(0, Math.round(v)) : 0;
  };
  return {
    input_tokens: num('input_tokens'),
    output_tokens: num('output_tokens'),
    cache_creation_input_tokens: num('cache_creation_input_tokens'),
    cache_read_input_tokens: num('cache_read_input_tokens'),
  };
}

export function translateClaudeJsonl(parsed: unknown, ctx: TranslateContext): StreamEvent[] {
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

    // v0.4.0 — assistant message 가 usage 를 포함하면 그대로 emit. 한 turn
    // 동안 여러 번 올 수 있지만 마지막 값이 누적치라 그대로 흘려보내도 안전
    // (UsageStore 는 append-only 라 중복 누적 위험 — 따라서 stream pump 가
    // 마지막 1건만 영속하도록 dedup 처리해야 함. 여기선 그냥 emit).
    const usageRaw = message.usage as Record<string, unknown> | undefined;
    if (usageRaw !== undefined && usageRaw !== null) {
      const tokens = parseClaudeUsage(usageRaw);
      const cost = estimateCostUsd(ctx.model, tokens);
      const data: UsageEventData = {
        provider: 'claude',
        model: ctx.model,
        turn_id: ctx.turnId,
        ...tokens,
        total_cost_usd: cost,
        recorded_at: new Date().toISOString(),
      };
      out.push({ type: 'usage', data });
    }
    return out;
  }

  // ── result — 항상 마지막. usage / total_cost_usd 가 가장 정확. ──
  // CliProvider synthesizes message_complete from accumulated deltas.
  if (evType === 'result') {
    const out: StreamEvent[] = [];

    // Result 의 usage / total_cost_usd 가 가장 신뢰할 만한 최종치 — emit.
    const usageRaw = obj.usage as Record<string, unknown> | undefined;
    if (usageRaw !== undefined && usageRaw !== null) {
      const tokens = parseClaudeUsage(usageRaw);
      const cliCost = obj.total_cost_usd;
      const cost =
        typeof cliCost === 'number' && Number.isFinite(cliCost) && cliCost >= 0
          ? Math.round(cliCost * 1_000_000) / 1_000_000
          : estimateCostUsd(ctx.model, tokens);
      const data: UsageEventData = {
        provider: 'claude',
        model: ctx.model,
        turn_id: ctx.turnId,
        ...tokens,
        total_cost_usd: cost,
        recorded_at: new Date().toISOString(),
      };
      out.push({ type: 'usage', data });
    }

    const isError = obj.is_error === true;
    if (isError) {
      const resultText = typeof obj.result === 'string' ? obj.result : 'unknown error';
      out.push({ type: 'error', error: resultText });
    }
    return out;
  }

  // ── 그 외 unknown event type — silent skip ──
  return [];
}
