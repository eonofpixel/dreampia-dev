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
  Wrench,
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
        icon: <CheckCircle2 className="h-3 w-3 text-semantic-success" aria-hidden="true" />,
        color: 'text-semantic-success',
      };
    case 'failed':
      return {
        label: STATUS_LABELS_KO.failed,
        icon: <XCircle className="h-3 w-3 text-semantic-danger" aria-hidden="true" />,
        color: 'text-semantic-danger',
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
        icon: <Clock className="h-3 w-3 text-semantic-warning" aria-hidden="true" />,
        color: 'text-semantic-warning',
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

  // v2.10.0 (.omc/DESIGN.md C-1) — raw red/green/amber + bg-bg-tertiary
  // chrome → semantic.* tokens + surface-card. radius-md → radius-lg (card
  // hierarchy 와 align).
  return (
    <div
      data-testid="tool-call-card"
      className="mt-xxs rounded-lg border border-hairline bg-surface-card text-caption"
    >
      {/* Header row */}
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="flex w-full items-center gap-xs rounded-t-lg px-xs py-xxs text-left transition-colors duration-fast ease-out hover:bg-surface-strong/60"
        aria-expanded={expanded}
      >
        <ChevronIcon className="h-3 w-3 shrink-0 text-text-tertiary" aria-hidden="true" />

        {/* Tool name */}
        <span className="flex flex-1 items-center gap-xxs truncate font-mono font-medium text-text-primary">
          <Wrench aria-hidden="true" className="h-3 w-3 shrink-0 text-text-tertiary" />
          <span className="truncate">{call.tool_id}</span>
        </span>

        {/* Status badge */}
        <span className={`flex shrink-0 items-center gap-xxs ${statusConfig.color}`}>
          {statusConfig.icon}
          <span>{statusConfig.label}</span>
        </span>

        {/* Duration */}
        {result && (
          <span className="ml-xxs shrink-0 text-text-tertiary">
            ({formatDuration(result.duration_ms)})
          </span>
        )}
      </button>

      {/* Collapsed summary: input preview always visible */}
      {!expanded && (
        <div className="truncate border-t border-hairline/60 px-xs py-xxs font-mono text-text-secondary">
          {inputPreview}
        </div>
      )}

      {/* Expanded detail: full input + result */}
      {expanded && (
        <div className="space-y-xs border-t border-hairline/60 p-xs">
          {/* Full input */}
          <div>
            <div className="mb-[2px] text-text-tertiary">입력</div>
            <pre className="whitespace-pre-wrap break-all font-mono leading-relaxed text-text-secondary">
              {inputJson}
            </pre>
          </div>

          {/* Success output */}
          {status === 'success' && outputPreview !== null && (
            <div>
              <div className="mb-[2px] text-text-tertiary">출력</div>
              <pre className="whitespace-pre-wrap break-all font-mono leading-relaxed text-text-secondary">
                {outputPreview}
              </pre>
            </div>
          )}

          {/* Failed error */}
          {status === 'failed' && result?.error && (
            <div className="rounded-md border border-semantic-danger/30 bg-semantic-danger/10 px-xs py-xxs">
              <div className="font-mono font-semibold text-semantic-danger">
                {result.error.code}
              </div>
              <div className="mt-[2px] text-semantic-danger/80">{result.error.message}</div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
