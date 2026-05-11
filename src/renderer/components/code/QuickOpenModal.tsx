/**
 * QuickOpenModal — Cmd/Ctrl+P fuzzy file open (v2.8.0 builder UX).
 *
 * Codex desktop / VS Code / JetBrains 공통 패턴. workspace.listFiles 결과를
 * 메모리에 캐시하고 substring 필터 + 키보드 navigation 제공.
 *
 * 진입: App.tsx 전역 Mod+P 키바인딩. 워크스페이스 미선택이면 modal 안에서
 * 안내 표시. 파일 선택 시 onSelect(relPath) → 부모가 Code 모드 전환 + 파일
 * 로드 + modal 닫기.
 *
 * Decision doc: ../../../../BUILDER_UX_ANALYSIS.md (#A — 최우선 land).
 */

import { Clock, FileText, Search } from 'lucide-react';
import { Fragment, useEffect, useMemo, useRef, useState } from 'react';

import { useT } from '../../i18n';

import { loadRecentFiles } from './recentFiles';

interface FileEntry {
  path: string;
  size_bytes: number;
  mtime: string;
}

export interface QuickOpenModalProps {
  open: boolean;
  /** undefined 면 안내 표시. */
  workspaceRoot?: string;
  ignorePatterns?: ReadonlyArray<string>;
  onClose: () => void;
  /** 사용자가 파일 선택 시 호출. 부모가 Code 모드 + loadFile 처리. */
  onSelect: (relPath: string) => void;
}

const MAX_FILES = 2000;
const VISIBLE_LIMIT = 50;

/**
 * Row — display 단위. recent 행은 entry.path 만 있고 size/mtime 은 비어 있음
 * (loadRecentFiles 가 path 만 반환). list view 가 양쪽을 동일하게 렌더링
 * 하지만 추가 메타데이터 표시는 모두 entry 기준이라 차이 없음.
 */
type Row = { kind: 'recent'; path: string } | { kind: 'file'; entry: FileEntry };

export function QuickOpenModal({
  open,
  workspaceRoot,
  ignorePatterns,
  onClose,
  onSelect,
}: QuickOpenModalProps): React.JSX.Element | null {
  const t = useT();
  const [entries, setEntries] = useState<ReadonlyArray<FileEntry>>([]);
  const [recents, setRecents] = useState<ReadonlyArray<string>>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [highlightIdx, setHighlightIdx] = useState(0);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const listRef = useRef<HTMLUListElement | null>(null);

  // open 될 때마다 입력 초기화 + listFiles 1회 호출 (cache 없음 — 매번 fresh)
  useEffect(() => {
    if (!open) return;
    setQuery('');
    setHighlightIdx(0);
    setError(null);
    if (workspaceRoot === undefined || workspaceRoot.length === 0) {
      setEntries([]);
      setRecents([]);
      return;
    }
    // v2.8.0 (Builder UX) — recents 는 localStorage 라 즉시 동기 로드. open
    // 시점마다 새로 읽어 외부 (CodePanel.loadFile) 변경을 picks up.
    setRecents(loadRecentFiles(workspaceRoot));
    const ws = typeof window !== 'undefined' ? window.dreampia?.workspace : undefined;
    if (ws === undefined || typeof ws.listFiles !== 'function') {
      setError(t('preview.code.api_unavailable'));
      return;
    }
    setLoading(true);
    void (async () => {
      try {
        const result = await ws.listFiles({
          workspace_root: workspaceRoot,
          ignore_patterns: ignorePatterns ? [...ignorePatterns] : undefined,
          max_files: MAX_FILES,
        });
        if (result.ok) {
          setEntries([...result.value].sort((a, b) => a.path.localeCompare(b.path)));
        } else {
          setError(result.error);
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      } finally {
        setLoading(false);
      }
    })();
  }, [open, workspaceRoot, ignorePatterns, t]);

  // open 시 input 자동 포커스
  useEffect(() => {
    if (open && inputRef.current !== null) {
      inputRef.current.focus();
    }
  }, [open]);

  // 필터링 + score 정렬. substring 매칭 + filename 우선 가중치.
  //
  // v2.8.0 (Builder UX): query 가 비어 있을 때 recents 를 list 상단에
  // "Recents" 섹션으로 노출. 일반 파일 섹션은 recents 와 중복 제외하고
  // alpha 정렬. query 입력 시 fuzzy 검색 결과만 표시 (recents 는 일반
  // 파일 풀에 이미 포함되어 있으므로 자연스럽게 매칭됨).
  const rows = useMemo<ReadonlyArray<Row>>(() => {
    if (query.length === 0) {
      const recentSet = new Set(recents);
      const entriesNotInRecents = entries.filter((e) => !recentSet.has(e.path));
      const recentRows: Row[] = recents.map((p) => ({ kind: 'recent', path: p }));
      const fileRows: Row[] = entriesNotInRecents
        .slice(0, Math.max(0, VISIBLE_LIMIT - recentRows.length))
        .map((entry) => ({ kind: 'file', entry }));
      return [...recentRows, ...fileRows];
    }
    const q = query.toLowerCase();
    const scored: Array<{ entry: FileEntry; score: number }> = [];
    for (const entry of entries) {
      const path = entry.path.toLowerCase();
      const fname = path.slice(path.lastIndexOf('/') + 1);
      const fnIdx = fname.indexOf(q);
      const pathIdx = path.indexOf(q);
      if (fnIdx >= 0) {
        // filename hit — 가장 높은 score (prefix 매칭이 가장 높음)
        scored.push({ entry, score: 1000 - fnIdx });
      } else if (pathIdx >= 0) {
        // path-only hit
        scored.push({ entry, score: 500 - pathIdx });
      }
    }
    scored.sort((a, b) => b.score - a.score);
    return scored.slice(0, VISIBLE_LIMIT).map<Row>((s) => ({ kind: 'file', entry: s.entry }));
  }, [entries, recents, query]);

  function rowPath(row: Row): string {
    return row.kind === 'recent' ? row.path : row.entry.path;
  }

  // query 변경 시 highlightIdx 0 으로 리셋
  useEffect(() => {
    setHighlightIdx(0);
  }, [query]);

  // 선택 행을 화면에 보이도록 scroll (간단한 scrollIntoView)
  useEffect(() => {
    const list = listRef.current;
    if (list === null) return;
    const row = list.querySelector<HTMLElement>(`[data-row-idx="${highlightIdx}"]`);
    row?.scrollIntoView({ block: 'nearest' });
  }, [highlightIdx]);

  const handleKeyDown = (event: React.KeyboardEvent<HTMLInputElement>): void => {
    if (event.key === 'Escape') {
      event.preventDefault();
      onClose();
      return;
    }
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setHighlightIdx((i) => Math.min(rows.length - 1, i + 1));
      return;
    }
    if (event.key === 'ArrowUp') {
      event.preventDefault();
      setHighlightIdx((i) => Math.max(0, i - 1));
      return;
    }
    if (event.key === 'Enter') {
      event.preventDefault();
      const pick = rows[highlightIdx];
      if (pick !== undefined) {
        onSelect(rowPath(pick));
      }
    }
  };

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[55] flex items-start justify-center bg-black/60 pt-[10vh]"
      role="dialog"
      aria-modal="true"
      aria-label={t('quick_open.aria')}
      data-testid="quick-open-modal"
    >
      <div className="flex w-[640px] max-w-[95vw] flex-col rounded-lg border border-border-primary bg-bg-primary shadow-2xl">
        <div className="flex items-center gap-2 border-b border-border-primary px-3 py-2">
          <Search aria-hidden="true" className="h-4 w-4 shrink-0 text-text-tertiary" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={t('quick_open.placeholder')}
            aria-label={t('quick_open.placeholder')}
            className="flex-1 bg-transparent text-sm text-text-primary placeholder:text-text-tertiary focus:outline-none"
            data-testid="quick-open-input"
          />
        </div>
        <div className="max-h-[50vh] overflow-y-auto">
          {workspaceRoot === undefined || workspaceRoot.length === 0 ? (
            <p
              className="px-3 py-6 text-center text-xs text-text-tertiary"
              data-testid="quick-open-no-workspace"
            >
              {t('quick_open.no_workspace')}
            </p>
          ) : loading ? (
            <p
              className="px-3 py-6 text-center text-xs text-text-tertiary"
              data-testid="quick-open-loading"
            >
              {t('preview.code.tree.loading')}
            </p>
          ) : error !== null ? (
            <p
              className="px-3 py-6 text-center text-xs text-red-300"
              role="alert"
              data-testid="quick-open-error"
            >
              {error}
            </p>
          ) : rows.length === 0 ? (
            <p
              className="px-3 py-6 text-center text-xs text-text-tertiary"
              data-testid="quick-open-empty"
            >
              {query.length === 0
                ? t('preview.code.tree.empty')
                : t('preview.code.tree.no_results')}
            </p>
          ) : (
            <ul ref={listRef} className="py-1" data-testid="quick-open-list">
              {rows.map((row, idx) => {
                const path = rowPath(row);
                // recents 섹션 헤더는 첫 recent 행 직전에 1회. all-files 섹션
                // 헤더는 recents 가 존재할 때만 첫 file 행 직전에 노출 (검색
                // 결과만 있는 query 입력 상태에선 헤더 없음).
                const prev = idx > 0 ? rows[idx - 1] : undefined;
                const showRecentHeader = row.kind === 'recent' && prev?.kind !== 'recent';
                const showAllHeader =
                  query.length === 0 && row.kind === 'file' && prev?.kind === 'recent';
                return (
                  <Fragment key={`${row.kind}:${path}`}>
                    {showRecentHeader && (
                      <li
                        className="flex items-center gap-1.5 px-3 pb-0.5 pt-1 text-[10px] uppercase tracking-wide text-text-tertiary"
                        data-testid="quick-open-section-recents"
                      >
                        <Clock aria-hidden="true" className="h-2.5 w-2.5" />
                        <span>{t('quick_open.section.recents')}</span>
                      </li>
                    )}
                    {showAllHeader && (
                      <li
                        className="px-3 pb-0.5 pt-1.5 text-[10px] uppercase tracking-wide text-text-tertiary"
                        data-testid="quick-open-section-all"
                      >
                        {t('quick_open.section.all')}
                      </li>
                    )}
                    <li>
                      <button
                        type="button"
                        onClick={() => onSelect(path)}
                        onMouseEnter={() => setHighlightIdx(idx)}
                        data-row-idx={idx}
                        data-row-kind={row.kind}
                        data-testid={`quick-open-row-${path}`}
                        data-highlighted={idx === highlightIdx ? 'true' : 'false'}
                        className={
                          idx === highlightIdx
                            ? 'flex w-full items-center gap-2 bg-accent/15 px-3 py-1.5 text-left text-xs'
                            : 'flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs hover:bg-bg-tertiary'
                        }
                      >
                        {row.kind === 'recent' ? (
                          <Clock
                            aria-hidden="true"
                            className="h-3 w-3 shrink-0 text-text-tertiary"
                          />
                        ) : (
                          <FileText
                            aria-hidden="true"
                            className="h-3 w-3 shrink-0 text-text-tertiary"
                          />
                        )}
                        <span className="truncate font-mono text-text-primary">{path}</span>
                      </button>
                    </li>
                  </Fragment>
                );
              })}
            </ul>
          )}
        </div>
        <footer className="border-t border-border-primary px-3 py-1 text-[10px] text-text-tertiary">
          <span className="mr-3">↑↓ {t('quick_open.hint.navigate')}</span>
          <span className="mr-3">Enter {t('quick_open.hint.open')}</span>
          <span>Esc {t('quick_open.hint.close')}</span>
        </footer>
      </div>
    </div>
  );
}
