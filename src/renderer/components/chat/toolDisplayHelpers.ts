/**
 * Tool display helpers — tool result lookup and formatting utilities.
 *
 * Spec: P1-3 ChatPanel Tool result display
 */

import type { Turn, ToolResultRef } from '@/types';

/**
 * Find the result for a tool_call by scanning subsequent role='tool' turns.
 * Returns undefined if no matching result yet (still pending).
 *
 * Per INV-3: tool turns must immediately follow the assistant turn.
 */
export function findToolResult(
  turns: ReadonlyArray<Turn>,
  fromIndex: number,
  callId: string
): ToolResultRef | undefined {
  for (let i = fromIndex + 1; i < turns.length; i++) {
    const t = turns[i];
    if (!t) continue;
    if (t.role !== 'tool') break; // tool results must immediately follow
    const found = t.tool_results?.find((r) => r.call_id === callId);
    if (found) return found;
  }
  return undefined;
}

/**
 * Format duration: <1000ms shown as "Xms", otherwise "X.Ys" (1 decimal).
 */
export function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

/**
 * Safe JSON.stringify — wraps in try/catch for circular references.
 */
export function safeJsonStringify(value: unknown): string {
  try {
    return JSON.stringify(value);
  } catch {
    return '[unable to serialize]';
  }
}

export const STATUS_LABELS_KO = {
  success: '완료',
  failed: '실패',
  cancelled: '취소됨',
  timeout: '시간 초과',
} as const;
