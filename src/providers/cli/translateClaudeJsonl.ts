/**
 * Claude CLI JSONL → StreamEvent 변환.
 *
 * Spec: docs/session/cross-ai-sync.md (P0 — CLI 인증 위임)
 *
 * 주의 — best-effort 변환:
 *   실제 `claude --format json-stream` (또는 `--output-format stream-json`)
 *   출력 형태를 직접 검증할 수 없는 환경에서 작성된 가장 그럴듯한 형태.
 *   Anthropic SSE 와 anthropic-cli source 를 참고한 주요 이벤트:
 *
 *     { type: 'message_start', message: {...} }
 *     { type: 'content_block_start', index, content_block }
 *     { type: 'content_block_delta', delta: { type: 'text_delta', text: '...' } }
 *     { type: 'tool_use', id, name, input }
 *     { type: 'message_stop' }   또는   { type: 'message_complete' }
 *     { type: 'error', error: { message } }
 *
 * 실제 CLI 출력과 다를 경우 이 함수만 갱신하면 됨.
 * 알 수 없는 이벤트는 빈 배열 반환 (silent skip).
 */

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

  // ── content_block_delta { delta: { type:'text_delta', text } } ──
  if (evType === 'content_block_delta') {
    const delta = obj.delta as Record<string, unknown> | undefined;
    if (
      delta !== undefined &&
      delta.type === 'text_delta' &&
      typeof delta.text === 'string'
    ) {
      return [{ type: 'text_delta', text: delta.text }];
    }
    if (
      delta !== undefined &&
      delta.type === 'input_json_delta' &&
      typeof delta.partial_json === 'string' &&
      typeof obj.tool_call_id === 'string'
    ) {
      return [
        {
          type: 'tool_call_input_delta',
          tool_call_id: obj.tool_call_id,
          partial_input: delta.partial_json,
        },
      ];
    }
    return [];
  }

  // ── tool_use {id, name, input} ──
  if (evType === 'tool_use') {
    const id = typeof obj.id === 'string' ? obj.id : '';
    const name = typeof obj.name === 'string' ? obj.name : '';
    // Claude convention: tool_id 는 dot 구분자 (read_file → read.file 같은 매핑은
    // 호출 측 책임. 여기서는 underscore → dot 만 단순 변환).
    const tool_id = name.replace(/_/g, '.');
    return [
      {
        type: 'tool_call_start',
        tool_call: {
          id,
          tool_id,
          input: obj.input,
        },
      },
    ];
  }

  // ── message_stop / message_complete ──
  // CliProvider 가 누적된 text 로 finalTurn 합성하므로 여기선 빈 배열.
  if (evType === 'message_stop' || evType === 'message_complete') {
    return [];
  }

  // ── error ──
  if (evType === 'error') {
    const err = obj.error as Record<string, unknown> | string | undefined;
    let message = 'unknown error';
    if (typeof err === 'string') {
      message = err;
    } else if (err !== undefined && err !== null) {
      const errObj = err as Record<string, unknown>;
      if (typeof errObj.message === 'string') message = errObj.message;
    }
    return [{ type: 'error', error: message }];
  }

  // ── 그 외 (message_start / content_block_start / ping 등) — 무시 ──
  return [];
}
