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

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useT } from '../../i18n';
import { Button } from '../ui/Button';
import { ModalShell } from '../ui/ModalShell';
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

// v2.10.0 (.omc/DESIGN.md modal migration B) — provider-style raw color 는
// streaming/done 등 status semantic distinction 이라 유지. bg-bg-tertiary
// alias 그대로 (token 시스템 자동 매핑).
function statusBadgeClass(status: CompareSideStatus): string {
  switch (status) {
    case 'pending':
      return 'bg-surface-strong text-text-tertiary';
    case 'streaming':
      return 'bg-blue-500/20 text-blue-300';
    case 'done':
      return 'bg-semantic-success/20 text-semantic-success';
    case 'error':
      return 'bg-semantic-danger/20 text-semantic-danger';
    case 'skipped':
      return 'bg-semantic-warning/20 text-semantic-warning';
    default:
      return 'bg-surface-strong text-text-tertiary';
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

  const diffLines = useMemo<UnifiedDiffLine[]>(() => {
    if (!showDiff) return [];
    if (run === null) return [];
    return buildSimpleDiff(run.claude.text, run.codex.text);
  }, [showDiff, run]);

  // v2.10.0 (modal migration B) — Escape/overlay close 시 isRunning 이면 cancel
  // 도 같이 호출. ModalShell 이 keydown 만 처리하므로 wrapper.
  const handleClose = useCallback((): void => {
    if (isRunning) onCancel();
    onClose();
  }, [isRunning, onCancel, onClose]);

  return (
    <ModalShell
      open={open}
      size="xl"
      title={
        <span className="flex flex-col">
          <span>{t('compare.title')}</span>
          <span
            className="mt-xxs truncate text-caption font-normal text-text-tertiary"
            title={run?.prompt ?? ''}
            data-testid="compare-prompt"
          >
            {run !== null && run.prompt.length > 0 ? run.prompt : t('compare.prompt.empty')}
          </span>
        </span>
      }
      titleId="compare-modal-title"
      onClose={handleClose}
      data-testid="compare-modal"
    >
      <div className="flex flex-1 flex-col overflow-hidden">
        {/* 우상단 toolbar (diff toggle + cancel) — header 옆이 아닌 body 상단 row */}
        <div className="mb-xs flex items-center justify-end gap-xs">
          <Button
            variant="secondary"
            size="sm"
            onClick={() => setShowDiff((v) => !v)}
            data-testid="compare-toggle-diff"
            aria-pressed={showDiff}
          >
            {showDiff ? t('compare.diff.hide') : t('compare.diff.show')}
          </Button>
          {isRunning && (
            <Button variant="danger" size="sm" onClick={onCancel} data-testid="compare-cancel">
              {t('compare.cancel')}
            </Button>
          )}
        </div>

        {showDiff ? (
          <DiffView lines={diffLines} />
        ) : (
          <div className="grid flex-1 grid-cols-2 gap-0 overflow-hidden rounded-md border border-hairline">
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
    </ModalShell>
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
      className={`flex h-full flex-col overflow-hidden ${side === 'claude' ? 'border-r border-hairline' : ''}`}
      data-testid={`compare-side-${side}`}
    >
      <div className="flex items-center justify-between gap-xs border-b border-hairline bg-canvas-soft px-sm py-xs">
        <div className="flex min-w-0 items-center gap-xs">
          <span className="text-body-sm font-semibold text-text-primary">
            {side === 'claude' ? t('compare.side.claude') : t('compare.side.codex')}
          </span>
          {model !== null && (
            <span className="truncate text-caption text-text-tertiary" title={model}>
              {model}
            </span>
          )}
        </div>
        <span
          className={`rounded-pill px-xs py-[2px] text-caption ${statusBadgeClass(status)}`}
          data-testid={`compare-status-${side}`}
        >
          {t(statusLabelKey(status))}
        </span>
      </div>
      <div
        className="flex-1 overflow-y-auto whitespace-pre-wrap p-sm font-mono text-code text-text-primary"
        data-testid={`compare-text-${side}`}
      >
        {error !== null && (
          <div className="mb-xs rounded-md border border-semantic-danger/40 bg-semantic-danger/10 p-xs text-semantic-danger">
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
            {status === 'streaming' && <span className="ml-xxs animate-pulse">▍</span>}
          </>
        )}
      </div>
      <div className="border-t border-hairline bg-canvas-soft px-sm py-xs">
        <Button
          variant="primary"
          size="sm"
          onClick={() => {
            if (!acceptable) return;
            onAccept(side, text, model);
          }}
          disabled={!acceptable}
          data-testid={`compare-accept-${side}`}
        >
          {t('compare.accept')}
        </Button>
      </div>
    </div>
  );
}

function DiffView({ lines }: { lines: UnifiedDiffLine[] }): React.JSX.Element {
  const t = useT();
  if (lines.length === 0) {
    return (
      <div className="flex flex-1 items-center justify-center p-lg text-body-sm text-text-tertiary">
        {t('compare.diff.empty')}
      </div>
    );
  }
  return (
    <div
      className="flex-1 overflow-y-auto rounded-md border border-hairline bg-canvas-soft p-sm font-mono text-code"
      data-testid="compare-diff-view"
    >
      {lines.map((line, idx) => {
        // claude/codex side distinction 은 provider-specific 색 유지.
        let bg = '';
        let prefix = '  ';
        if (line.kind === 'claude') {
          bg = 'bg-blue-500/10 text-blue-300';
          prefix = '< ';
        } else if (line.kind === 'codex') {
          bg = 'bg-purple-500/10 text-purple-300';
          prefix = '> ';
        } else if (line.kind === 'common') {
          prefix = '  ';
        }
        return (
          <div
            key={idx}
            className={`whitespace-pre-wrap px-xs ${bg}`}
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
