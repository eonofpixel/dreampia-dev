/**
 * ToolCallCard — inline tool call + result display.
 *
 * Shows tool name, input preview, status badge, and result output or error.
 * Expand/collapse toggle reveals full JSON detail.
 *
 * Spec: P1-3 ChatPanel Tool result display
 */

import { useState } from 'react';
import {
  CheckCircle2,
  XCircle,
  Clock,
  CircleSlash,
  Loader2,
  ChevronRight,
  ChevronDown,
} from 'lucide-react';
import type { ToolCallRef, ToolResultRef } from '@/types';
import { formatDuration, safeJsonStringify, STATUS_LABELS_KO } from './toolDisplayHelpers';

export interface ToolCallCardProps {
  call: ToolCallRef;
  result?: ToolResultRef; // undefined = still pending
}

type ToolStatus = 'pending' | ToolResultRef['status'];

interface StatusConfig {
  label: string;
  icon: React.ReactNode;
  color: string;
}

function useStatusConfig(status: ToolStatus): StatusConfig {
  switch (status) {
    case 'pending':
      return {
        label: '실행 중',
        icon: <Loader2 className="h-3 w-3 animate-spin" aria-hidden="true" />,
        color: 'text-text-secondary',
      };
    case 'success':
      return {
        label: STATUS_LABELS_KO.success,
        icon: <CheckCircle2 className="h-3 w-3 text-green-500" aria-hidden="true" />,
        color: 'text-green-600',
      };
    case 'failed':
      return {
        label: STATUS_LABELS_KO.failed,
        icon: <XCircle className="h-3 w-3 text-red-500" aria-hidden="true" />,
        color: 'text-red-600',
      };
    case 'cancelled':
      return {
        label: STATUS_LABELS_KO.cancelled,
        icon: <CircleSlash className="h-3 w-3 text-text-tertiary" aria-hidden="true" />,
        color: 'text-text-tertiary',
      };
    case 'timeout':
      return {
        label: STATUS_LABELS_KO.timeout,
        icon: <Clock className="h-3 w-3 text-amber-500" aria-hidden="true" />,
        color: 'text-amber-600',
      };
  }
}

export function ToolCallCard({ call, result }: ToolCallCardProps): React.JSX.Element {
  const [expanded, setExpanded] = useState(false);

  const status: ToolStatus = result ? result.status : 'pending';
  const statusConfig = useStatusConfig(status);

  // Input preview: safe stringify, truncated to 80 chars
  const inputJson = safeJsonStringify(call.input ?? {});
  const inputPreview = inputJson.length > 80 ? inputJson.slice(0, 80) + '…' : inputJson;

  // Output preview for success: truncated to 200 chars
  const outputJson = result?.output !== undefined ? safeJsonStringify(result.output) : null;
  const outputPreview =
    outputJson !== null
      ? outputJson.length > 200
        ? outputJson.slice(0, 200) + '…'
        : outputJson
      : null;

  const ChevronIcon = expanded ? ChevronDown : ChevronRight;

  return (
    <div
      data-testid="tool-call-card"
      className="mt-1.5 rounded-md border border-border-primary bg-bg-tertiary text-xs"
    >
      {/* Header row */}
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="flex w-full items-center gap-1.5 px-2 py-1.5 text-left hover:bg-bg-secondary/60 rounded-t-md transition-colors"
        aria-expanded={expanded}
      >
        <ChevronIcon className="h-3 w-3 shrink-0 text-text-tertiary" aria-hidden="true" />

        {/* Tool name */}
        <span className="font-mono font-medium text-text-primary truncate flex-1">
          🔧 {call.tool_id}
        </span>

        {/* Status badge */}
        <span className={`flex items-center gap-1 shrink-0 ${statusConfig.color}`}>
          {statusConfig.icon}
          <span>{statusConfig.label}</span>
        </span>

        {/* Duration */}
        {result && (
          <span className="shrink-0 text-text-tertiary ml-1">
            ({formatDuration(result.duration_ms)})
          </span>
        )}
      </button>

      {/* Collapsed summary: input preview always visible */}
      {!expanded && (
        <div className="border-t border-border-primary/50 px-2 py-1 font-mono text-text-secondary truncate">
          {inputPreview}
        </div>
      )}

      {/* Expanded detail: full input + result */}
      {expanded && (
        <div className="border-t border-border-primary/50 space-y-1.5 p-2">
          {/* Full input */}
          <div>
            <div className="mb-0.5 text-text-tertiary">입력</div>
            <pre className="whitespace-pre-wrap break-all font-mono text-text-secondary leading-relaxed">
              {inputJson}
            </pre>
          </div>

          {/* Success output */}
          {status === 'success' && outputPreview !== null && (
            <div>
              <div className="mb-0.5 text-text-tertiary">출력</div>
              <pre className="whitespace-pre-wrap break-all font-mono text-text-secondary leading-relaxed">
                {outputPreview}
              </pre>
            </div>
          )}

          {/* Failed error */}
          {status === 'failed' && result?.error && (
            <div className="rounded bg-red-500/10 px-2 py-1.5 border border-red-500/20">
              <div className="font-mono font-semibold text-red-600">{result.error.code}</div>
              <div className="mt-0.5 text-red-600/80">{result.error.message}</div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
