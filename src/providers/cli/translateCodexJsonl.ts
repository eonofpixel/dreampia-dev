/**
 * Codex CLI JSONL → StreamEvent 변환.
 *
 * Spec: docs/session/cross-ai-sync.md (P0 — CLI 인증 위임)
 *
 * 주의 — best-effort 변환:
 *   실제 codex CLI 출력 형태를 직접 검증할 수 없어 OpenAI Responses /
 *   chat.completions 스트리밍 + Codex 디자인 문서를 참조해 작성한 가장
 *   그럴듯한 형태.
 *
 *   가능한 OpenAI-style 이벤트:
 *     { delta: { content: '...' } }                          ← 텍스트 청크
 *     { choices: [{ delta: { content: '...' } }] }           ← chat.completions
 *     { type: 'response.output_text.delta', delta: '...' }   ← Responses API
 *     { type: 'response.tool_call.created', tool_call: {id, function: {...}} }
 *     { tool_calls: [{ id, function: { name, arguments } }] }
 *     { type: 'response.completed' }
 *     { error: { message } }
 *
 * 알 수 없는 이벤트는 빈 배열.
 */

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

  const out: StreamEvent[] = [];

  // ── Responses API: response.output_text.delta ──
  if (obj.type === 'response.output_text.delta' && typeof obj.delta === 'string') {
    out.push({ type: 'text_delta', text: obj.delta });
  }

  // ── delta.content (top-level) ──
  if (out.length === 0) {
    const delta = obj.delta as Record<string, unknown> | undefined;
    if (delta !== undefined && typeof delta.content === 'string') {
      out.push({ type: 'text_delta', text: delta.content });
    }
  }

  // ── chat.completions: choices[0].delta.content ──
  if (out.length === 0 && Array.isArray(obj.choices)) {
    const first = obj.choices[0] as Record<string, unknown> | undefined;
    const choiceDelta = first?.delta as Record<string, unknown> | undefined;
    if (choiceDelta !== undefined && typeof choiceDelta.content === 'string') {
      out.push({ type: 'text_delta', text: choiceDelta.content });
    }
  }

  // ── tool_calls[] ──
  if (Array.isArray(obj.tool_calls)) {
    for (const raw of obj.tool_calls) {
      if (typeof raw !== 'object' || raw === null) continue;
      const tc = raw as Record<string, unknown>;
      const id = typeof tc.id === 'string' ? tc.id : '';
      const fn = tc.function as Record<string, unknown> | undefined;
      const name = typeof fn?.name === 'string' ? fn.name : '';
      // OpenAI: arguments 는 stringified JSON. parse 시도하되 실패하면 raw 보존.
      let input: unknown = fn?.arguments;
      if (typeof fn?.arguments === 'string') {
        try {
          input = JSON.parse(fn.arguments);
        } catch {
          input = fn.arguments;
        }
      }
      out.push({
        type: 'tool_call_start',
        tool_call: {
          id,
          tool_id: name.replace(/_/g, '.'),
          input,
        },
      });
    }
  }

  // ── response.tool_call.created ──
  if (obj.type === 'response.tool_call.created') {
    const tc = obj.tool_call as Record<string, unknown> | undefined;
    if (tc !== undefined) {
      const id = typeof tc.id === 'string' ? tc.id : '';
      const fn = tc.function as Record<string, unknown> | undefined;
      const name = typeof fn?.name === 'string' ? fn.name : '';
      let input: unknown = fn?.arguments;
      if (typeof fn?.arguments === 'string') {
        try {
          input = JSON.parse(fn.arguments);
        } catch {
          input = fn.arguments;
        }
      }
      out.push({
        type: 'tool_call_start',
        tool_call: { id, tool_id: name.replace(/_/g, '.'), input },
      });
    }
  }

  // ── error ──
  if (obj.error !== undefined && obj.error !== null) {
    const err = obj.error;
    let message = 'unknown error';
    if (typeof err === 'string') {
      message = err;
    } else if (typeof err === 'object') {
      const errObj = err as Record<string, unknown>;
      if (typeof errObj.message === 'string') message = errObj.message;
    }
    out.push({ type: 'error', error: message });
  }

  // ── response.completed / done — 빈 배열 (CliProvider 가 합성) ──
  return out;
}
