/**
 * FileTree — Phase 2 (v2.6.0) workspace 파일 목록 패널.
 *
 * Codex file-open preview 패턴 (옵션 D): 우측 PreviewPanel 의 'code' 모드
 * 에서 좌측 분할 영역에 표시. 사용자가 파일을 선택하면 CodeEditor 가
 * 우측에서 해당 파일을 read-only 로 표시.
 *
 * Phase 2 scope (단순 flat list):
 *   - workspace.listFiles 호출 (기존 v0.6.0 IPC 재사용 — fs IPC 신규 X)
 *   - 검색 입력 (path substring 필터)
 *   - 파일 선택 → onSelect(rel_path)
 *   - virtualization (react-virtuoso, 이미 설치됨)
 *
 * Phase 3+ scope (deferred):
 *   - 폴더 트리 / collapse / expand
 *   - 다중 파일 탭
 *   - 외부 변경 감지 (chokidar)
 *
 * Decision doc: ../../../../CODE_TAB_DECISION.md.
 */

import { FileText } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Virtuoso } from 'react-virtuoso';

interface FileEntry {
  path: string;
  size_bytes: number;
  mtime: string;
}

export interface FileTreeProps {
  /** 워크스페이스 루트 (절대 경로). undefined 면 빈 상태. */
  workspaceRoot?: string;
  /** mention 과 동일한 ignore_patterns 재사용 권장. */
  ignorePatterns?: ReadonlyArray<string>;
  /** 현재 선택된 파일 (rel_path) — 강조 표시. */
  selectedPath?: string;
  /** 파일 클릭 시 호출. */
  onSelect: (relPath: string) => void;
}

const MAX_FILES = 2000;

/**
 * ChatPanel.tsx 의 TURN_VIRTUALIZATION_THRESHOLD 와 동일 paradigm — 작은
 * 리스트는 simple map (jsdom 에서 Virtuoso 가 측정 실패로 row 미렌더 하는
 * 문제 회피 + Virtuoso wrapper overhead 제거).
 */
const VIRTUALIZATION_THRESHOLD = 100;

/**
 * v2.7.x sub-PR — Resizable FileTree. drag handle 으로 너비 조정 + localStorage
 * 영속. range 는 사용자 화면 비율을 보호하기 위해 [180, 480] 으로 clamp.
 */
const TREE_WIDTH_DEFAULT = 260;
const TREE_WIDTH_MIN = 180;
const TREE_WIDTH_MAX = 480;
const TREE_WIDTH_STORAGE_KEY = 'dreampia.codeMode.fileTreeWidth';

function loadStoredWidth(): number {
  try {
    const raw = localStorage.getItem(TREE_WIDTH_STORAGE_KEY);
    if (raw === null) return TREE_WIDTH_DEFAULT;
    const n = Number(raw);
    if (!Number.isFinite(n)) return TREE_WIDTH_DEFAULT;
    return Math.max(TREE_WIDTH_MIN, Math.min(TREE_WIDTH_MAX, n));
  } catch {
    return TREE_WIDTH_DEFAULT;
  }
}

function saveStoredWidth(width: number): void {
  try {
    localStorage.setItem(TREE_WIDTH_STORAGE_KEY, String(Math.round(width)));
  } catch {
    // localStorage 가용 불가 — 무시
  }
}

export function FileTree({
  workspaceRoot,
  ignorePatterns,
  selectedPath,
  onSelect,
}: FileTreeProps): React.JSX.Element {
  const [entries, setEntries] = useState<ReadonlyArray<FileEntry>>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const lastRequestedRoot = useRef<string | undefined>(undefined);

  useEffect(() => {
    if (workspaceRoot === undefined || workspaceRoot.length === 0) {
      setEntries([]);
      setError(null);
      return;
    }
    if (lastRequestedRoot.current === workspaceRoot) return;
    lastRequestedRoot.current = workspaceRoot;
    const ws = typeof window !== 'undefined' ? window.dreampia?.workspace : undefined;
    if (ws === undefined || typeof ws.listFiles !== 'function') {
      setError('Workspace API 를 사용할 수 없습니다.');
      return;
    }
    setLoading(true);
    setError(null);
    void (async () => {
      try {
        const result = await ws.listFiles({
          workspace_root: workspaceRoot,
          ignore_patterns: ignorePatterns ? [...ignorePatterns] : undefined,
          max_files: MAX_FILES,
        });
        if (result.ok) {
          // 알파벳 순. Phase 3 에서 폴더 우선 정렬로 전환.
          const sorted = [...result.value].sort((a, b) => a.path.localeCompare(b.path));
          setEntries(sorted);
        } else {
          setError(result.error);
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      } finally {
        setLoading(false);
      }
    })();
  }, [workspaceRoot, ignorePatterns]);

  const filtered = useMemo(() => {
    if (query.length === 0) return entries;
    const q = query.toLowerCase();
    return entries.filter((e) => e.path.toLowerCase().includes(q));
  }, [entries, query]);

  // v2.7.x sub-PR — resize state. lazy init 으로 localStorage 1회만 읽음.
  const [width, setWidth] = useState<number>(() => loadStoredWidth());
  const dragStartRef = useRef<{ x: number; w: number } | null>(null);

  const handleHandleMouseDown = (event: React.MouseEvent<HTMLDivElement>): void => {
    event.preventDefault();
    dragStartRef.current = { x: event.clientX, w: width };
    const onMove = (e: MouseEvent): void => {
      if (dragStartRef.current === null) return;
      const delta = e.clientX - dragStartRef.current.x;
      const next = Math.max(
        TREE_WIDTH_MIN,
        Math.min(TREE_WIDTH_MAX, dragStartRef.current.w + delta)
      );
      setWidth(next);
    };
    const onUp = (): void => {
      dragStartRef.current = null;
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
      // 영속은 drag 종료 시 한 번만 — 매 mousemove 마다 쓰지 않음.
      setWidth((current) => {
        saveStoredWidth(current);
        return current;
      });
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  };

  return (
    <div
      className="relative flex h-full shrink-0 flex-col border-r border-border-primary bg-bg-secondary"
      style={{ width }}
      data-testid="code-file-tree"
      data-tree-width={width}
    >
      <div className="border-b border-border-primary p-2">
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="파일 검색"
          aria-label="파일 검색"
          className="w-full rounded border border-border-primary bg-bg-primary px-2 py-1 text-xs text-text-primary placeholder:text-text-tertiary focus:border-accent focus:outline-none"
          data-testid="code-file-tree-search"
        />
      </div>
      <div className="flex-1 overflow-hidden">
        {workspaceRoot === undefined || workspaceRoot.length === 0 ? (
          <p className="px-3 py-4 text-xs text-text-tertiary" data-testid="code-file-tree-empty">
            워크스페이스를 먼저 선택하세요.
          </p>
        ) : loading ? (
          <p className="px-3 py-4 text-xs text-text-tertiary" data-testid="code-file-tree-loading">
            파일 목록 불러오는 중...
          </p>
        ) : error !== null ? (
          <p
            className="px-3 py-4 text-xs text-red-300"
            role="alert"
            data-testid="code-file-tree-error"
          >
            {error}
          </p>
        ) : filtered.length === 0 ? (
          <p
            className="px-3 py-4 text-xs text-text-tertiary"
            data-testid="code-file-tree-no-results"
          >
            {query.length === 0 ? '파일이 없습니다.' : '일치하는 파일이 없습니다.'}
          </p>
        ) : filtered.length < VIRTUALIZATION_THRESHOLD ? (
          <ul className="h-full overflow-y-auto" data-testid="code-file-tree-list">
            {filtered.map((entry) => (
              <li key={entry.path}>
                <FileRow
                  entry={entry}
                  selected={entry.path === selectedPath}
                  onSelect={onSelect}
                />
              </li>
            ))}
          </ul>
        ) : (
          <Virtuoso
            data={[...filtered]}
            itemContent={(_index, entry) => (
              <FileRow
                entry={entry}
                selected={entry.path === selectedPath}
                onSelect={onSelect}
              />
            )}
          />
        )}
      </div>
      <footer className="border-t border-border-primary px-3 py-1 text-[10px] text-text-tertiary">
        {filtered.length} / {entries.length}
        {entries.length === MAX_FILES && ' (한도 도달)'}
      </footer>
      {/* v2.7.x sub-PR — drag-to-resize handle. button element 로 a11y
          interactive 요건 충족. 4px wide hit area on the right edge. */}
      <button
        type="button"
        aria-label="파일 트리 너비 조정"
        className="absolute right-0 top-0 h-full w-1 cursor-col-resize bg-transparent hover:bg-accent/40 focus:bg-accent/40 focus:outline-none"
        data-testid="code-file-tree-resize-handle"
        onMouseDown={handleHandleMouseDown}
      />
    </div>
  );
}

function FileRow({
  entry,
  selected,
  onSelect,
}: {
  entry: FileEntry;
  selected: boolean;
  onSelect: (relPath: string) => void;
}): React.JSX.Element {
  return (
    <button
      type="button"
      onClick={() => onSelect(entry.path)}
      data-testid={`code-file-row-${entry.path}`}
      data-selected={selected ? 'true' : 'false'}
      className={
        selected
          ? 'flex w-full items-center gap-1.5 border-l-2 border-accent bg-bg-tertiary px-3 py-1 text-left text-xs text-text-primary'
          : 'flex w-full items-center gap-1.5 border-l-2 border-transparent px-3 py-1 text-left text-xs text-text-secondary hover:bg-bg-tertiary'
      }
    >
      <FileText aria-hidden="true" className="h-3 w-3 shrink-0 text-text-tertiary" />
      <span className="truncate font-mono">{entry.path}</span>
    </button>
  );
}
