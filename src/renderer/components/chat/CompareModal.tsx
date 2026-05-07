/**
 * CompareModal — v0.12.0 (I) Cross-AI Verify/Compare side-by-side UI.
 *
 * Spec: ROADMAP.md (v0.12.0 I — Codex 권고)
 *
 * 디자인
 * ──────
 *   - 좌우 두 컬럼 (Claude | Codex), 각각 scrollable, monospace text
 *   - 상단 header: prompt 요약 + 양쪽 model + status badge
 *   - 토글: "diff 표시" — 단순 line-by-line diff (Codex 권고대로 deep diff 알고리즘 X)
 *   - 하단: 각 side 별 "응답 채택" 버튼 (한 응답을 chat 에 inject)
 *   - cancel / close 버튼 — Esc 도 close
 *
 *   렌더링은 dangerouslySetInnerHTML 절대 사용 X — 모든 텍스트는 React text node.
 */

import { useEffect, useMemo, useState } from 'react';
import { X } from 'lucide-react';
import { useT } from '../../i18n';
import type {
  CompareRun,
  CompareSide,
  CompareSideResult,
  CompareSideStatus,
} from '../../hooks/useCompare';

export interface CompareModalProps {
  open: boolean;
  /** null 이면 modal 은 placeholder (input 단계). non-null 이면 진행 중 / 완료. */
  run: CompareRun | null;
  isRunning: boolean;
  onClose: () => void;
  onCancel: () => void;
  /**
   * 사용자가 한쪽 응답을 채택. caller (App.tsx) 가 active session 에 user/assistant
   * turn pair 를 append 한다. text 가 빈 문자열이면 caller 가 alert 해도 OK.
   */
  onAccept: (side: CompareSide, text: string, model: string | null) => void;
}

interface UnifiedDiffLine {
  kind: 'common' | 'claude' | 'codex' | 'gap';
  text: string;
}

/**
 * 매우 단순한 line-by-line diff. Codex 권고대로 LCS 같은 algorithm 은 사용 X.
 * 두 array 를 같은 index 까지 비교하며 다른 줄은 양쪽 표시. 길이 차이는 짧은
 * 쪽 끝까지 채운 후 긴 쪽 나머지를 한쪽 only 로 표시.
 */
function buildSimpleDiff(left: string, right: string): UnifiedDiffLine[] {
  const ll = left.split('\n');
  const rl = right.split('\n');
  const max = Math.max(ll.length, rl.length);
  const out: UnifiedDiffLine[] = [];
  for (let i = 0; i < max; i++) {
    const a = ll[i];
    const b = rl[i];
    if (a === undefined && b !== undefined) {
      out.push({ kind: 'codex', text: b });
      continue;
    }
    if (a !== undefined && b === undefined) {
      out.push({ kind: 'claude', text: a });
      continue;
    }
    if (a === undefined && b === undefined) continue;
    if (a === b) {
      out.push({ kind: 'common', text: a as string });
    } else {
      out.push({ kind: 'claude', text: a as string });
      out.push({ kind: 'codex', text: b as string });
    }
  }
  return out;
}

function statusBadgeClass(status: CompareSideStatus): string {
  switch (status) {
    case 'pending':
      return 'bg-bg-tertiary text-text-tertiary';
    case 'streaming':
      return 'bg-blue-500/20 text-blue-300';
    case 'done':
      return 'bg-green-500/20 text-green-300';
    case 'error':
      return 'bg-red-500/20 text-red-300';
    case 'skipped':
      return 'bg-yellow-500/20 text-yellow-300';
    default:
      return 'bg-bg-tertiary text-text-tertiary';
  }
}

function statusLabelKey(status: CompareSideStatus): string {
  switch (status) {
    case 'pending':
      return 'compare.status.pending';
    case 'streaming':
      return 'compare.status.streaming';
    case 'done':
      return 'compare.status.done';
    case 'error':
      return 'compare.status.error';
    case 'skipped':
      return 'compare.status.skipped';
    default:
      return 'compare.status.pending';
  }
}

export function CompareModal({
  open,
  run,
  isRunning,
  onClose,
  onCancel,
  onAccept,
}: CompareModalProps): React.JSX.Element | null {
  const t = useT();
  const [showDiff, setShowDiff] = useState(false);

  // 모달 닫힐 때 diff 토글도 reset.
  useEffect(() => {
    if (!open) setShowDiff(false);
  }, [open]);

  // Esc → close (또는 isRunning 시 cancel + close 후 호출자가 다음 동작 결정)
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') {
        e.preventDefault();
        if (isRunning) {
          onCancel();
        }
        onClose();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
    };
  }, [open, isRunning, onCancel, onClose]);

  const diffLines = useMemo<UnifiedDiffLine[]>(() => {
    if (!showDiff) return [];
    if (run === null) return [];
    return buildSimpleDiff(run.claude.text, run.codex.text);
  }, [showDiff, run]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
      role="dialog"
      aria-modal="true"
      aria-label={t('compare.title')}
      data-testid="compare-modal"
    >
      <div className="flex max-h-[92vh] w-[1100px] max-w-[95vw] flex-col rounded-lg border border-border-primary bg-bg-primary shadow-xl">
        {/* Header */}
        <div className="flex items-start justify-between gap-4 border-b border-border-primary p-4">
          <div className="min-w-0 flex-1">
            <h2 className="text-lg font-semibold">{t('compare.title')}</h2>
            <p
              className="mt-1 truncate text-xs text-text-tertiary"
              title={run?.prompt ?? ''}
              data-testid="compare-prompt"
            >
              {run !== null && run.prompt.length > 0 ? run.prompt : t('compare.prompt.empty')}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setShowDiff((v) => !v)}
              className="rounded-md border border-border-primary px-2 py-1 text-xs text-text-secondary hover:bg-bg-tertiary"
              data-testid="compare-toggle-diff"
              aria-pressed={showDiff}
            >
              {showDiff ? t('compare.diff.hide') : t('compare.diff.show')}
            </button>
            {isRunning && (
              <button
                type="button"
                onClick={onCancel}
                className="rounded-md border border-red-500/40 px-2 py-1 text-xs text-red-300 hover:bg-red-500/10"
                data-testid="compare-cancel"
              >
                {t('compare.cancel')}
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              className="rounded-md p-2 hover:bg-bg-tertiary"
              aria-label={t('compare.close')}
              data-testid="compare-close"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="flex flex-1 flex-col overflow-hidden">
          {showDiff ? (
            <DiffView lines={diffLines} />
          ) : (
            <div className="grid flex-1 grid-cols-2 gap-0 overflow-hidden">
              <SidePanel
                side="claude"
                result={run?.claude ?? null}
                onAccept={onAccept}
                isRunning={isRunning}
              />
              <SidePanel
                side="codex"
                result={run?.codex ?? null}
                onAccept={onAccept}
                isRunning={isRunning}
              />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

interface SidePanelProps {
  side: CompareSide;
  result: CompareSideResult | null;
  isRunning: boolean;
  onAccept: (side: CompareSide, text: string, model: string | null) => void;
}

function SidePanel({ side, result, isRunning, onAccept }: SidePanelProps): React.JSX.Element {
  const t = useT();
  const status: CompareSideStatus = result?.status ?? 'pending';
  const text = result?.text ?? '';
  const model = result?.model ?? null;
  const error = result?.error ?? null;
  const acceptable = status === 'done' && text.length > 0 && !isRunning;

  return (
    <div
      className={`flex h-full flex-col overflow-hidden ${side === 'claude' ? 'border-r border-border-primary' : ''}`}
      data-testid={`compare-side-${side}`}
    >
      <div className="flex items-center justify-between gap-2 border-b border-border-primary bg-bg-secondary px-3 py-2">
        <div className="flex min-w-0 items-center gap-2">
          <span className="text-sm font-semibold">
            {side === 'claude' ? t('compare.side.claude') : t('compare.side.codex')}
          </span>
          {model !== null && (
            <span className="truncate text-xs text-text-tertiary" title={model}>
              {model}
            </span>
          )}
        </div>
        <span
          className={`rounded px-2 py-0.5 text-xs ${statusBadgeClass(status)}`}
          data-testid={`compare-status-${side}`}
        >
          {t(statusLabelKey(status))}
        </span>
      </div>
      <div
        className="flex-1 overflow-y-auto whitespace-pre-wrap p-3 font-mono text-xs text-text-primary"
        data-testid={`compare-text-${side}`}
      >
        {error !== null && (
          <div className="mb-2 rounded border border-red-500/40 bg-red-500/10 p-2 text-red-300">
            {error}
          </div>
        )}
        {text.length === 0 && status === 'pending' && (
          <div className="text-text-tertiary">{t('compare.text.waiting')}</div>
        )}
        {text.length === 0 && status === 'streaming' && (
          <div className="text-text-tertiary">{t('compare.text.streaming')}</div>
        )}
        {text.length > 0 && (
          <>
            {text}
            {status === 'streaming' && <span className="ml-1 animate-pulse">▍</span>}
          </>
        )}
      </div>
      <div className="border-t border-border-primary bg-bg-secondary px-3 py-2">
        <button
          type="button"
          onClick={() => {
            if (!acceptable) return;
            onAccept(side, text, model);
          }}
          disabled={!acceptable}
          className="rounded bg-accent px-3 py-1 text-xs font-medium text-white hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-50"
          data-testid={`compare-accept-${side}`}
        >
          {t('compare.accept')}
        </button>
      </div>
    </div>
  );
}

function DiffView({ lines }: { lines: UnifiedDiffLine[] }): React.JSX.Element {
  const t = useT();
  if (lines.length === 0) {
    return (
      <div className="flex flex-1 items-center justify-center p-6 text-sm text-text-tertiary">
        {t('compare.diff.empty')}
      </div>
    );
  }
  return (
    <div
      className="flex-1 overflow-y-auto bg-bg-primary p-3 font-mono text-xs"
      data-testid="compare-diff-view"
    >
      {lines.map((line, idx) => {
        let bg = '';
        let prefix = '  ';
        if (line.kind === 'claude') {
          bg = 'bg-blue-500/10 text-blue-200';
          prefix = '< ';
        } else if (line.kind === 'codex') {
          bg = 'bg-green-500/10 text-green-200';
          prefix = '> ';
        } else if (line.kind === 'common') {
          prefix = '  ';
        }
        return (
          <div
            key={idx}
            className={`whitespace-pre-wrap px-2 ${bg}`}
            data-testid={`compare-diff-line-${line.kind}`}
          >
            <span className="select-none text-text-tertiary">{prefix}</span>
            {line.text}
          </div>
        );
      })}
    </div>
  );
}
