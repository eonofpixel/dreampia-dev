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

import { ChevronDown, ChevronRight, FileText, Folder, FolderOpen } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Virtuoso } from 'react-virtuoso';

import { useT } from '../../i18n';

interface FileEntry {
  path: string;
  size_bytes: number;
  mtime: string;
}

// v2.8.0 (Builder UX) — 폴더 계층 트리 노드. flat entries 로부터 build,
// 표시 시 collapsed 폴더의 자식은 hidden.
type TreeNode =
  | {
      kind: 'folder';
      name: string;
      path: string; // workspace-relative, no trailing slash
      depth: number;
    }
  | {
      kind: 'file';
      name: string;
      path: string;
      depth: number;
      entry: FileEntry;
    };

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

/**
 * v2.8.0 (Builder UX) — flat path 목록 → 폴더 계층 visible 노드 목록.
 *
 * 기본은 모든 폴더 expanded. 사용자가 클릭한 폴더만 collapsedFolders 에 들어가
 * 자식을 숨긴다. flat 동작과 호환 — 첫 mount 에 모든 file 가 보임.
 *
 * 시간 복잡도: O(N * D) (N=entries, D=avg depth).
 */
function buildVisibleNodes(
  entries: ReadonlyArray<FileEntry>,
  collapsedFolders: ReadonlySet<string>
): ReadonlyArray<TreeNode> {
  // Step 1 — 모든 폴더 경로 수집 (file 의 ancestor)
  const folderSet = new Set<string>();
  for (const e of entries) {
    const parts = e.path.split('/');
    for (let i = 1; i < parts.length; i++) {
      folderSet.add(parts.slice(0, i).join('/'));
    }
  }
  const folders = [...folderSet].sort();
  const fileEntries = [...entries].sort((a, b) => a.path.localeCompare(b.path));

  type Item = { kind: 'folder'; path: string } | { kind: 'file'; path: string; entry: FileEntry };
  const items: Item[] = [];
  for (const p of folders) items.push({ kind: 'folder', path: p });
  for (const e of fileEntries) items.push({ kind: 'file', path: e.path, entry: e });
  items.sort((a, b) => a.path.localeCompare(b.path));

  const ancestorVisible = (path: string): boolean => {
    // 어떤 부모 폴더라도 collapsedFolders 에 있으면 hidden.
    const parts = path.split('/');
    for (let i = 1; i < parts.length; i++) {
      const ancestor = parts.slice(0, i).join('/');
      if (collapsedFolders.has(ancestor)) return false;
    }
    return true;
  };

  const out: TreeNode[] = [];
  for (const item of items) {
    if (!ancestorVisible(item.path)) continue;
    const parts = item.path.split('/');
    const depth = parts.length - 1;
    const name = parts[parts.length - 1] ?? item.path;
    if (item.kind === 'folder') {
      out.push({ kind: 'folder', name, path: item.path, depth });
    } else {
      out.push({ kind: 'file', name, path: item.path, depth, entry: item.entry });
    }
  }
  return out;
}

/**
 * 검색 쿼리가 있을 때는 flat-style 필터 (폴더 무시, 매칭되는 파일만).
 * UX: 사용자가 검색 중엔 path hierarchy 보다 매칭 자체가 더 중요.
 */
function buildSearchNodes(
  entries: ReadonlyArray<FileEntry>,
  query: string
): ReadonlyArray<TreeNode> {
  const q = query.toLowerCase();
  return entries
    .filter((e) => e.path.toLowerCase().includes(q))
    .map((e) => {
      const parts = e.path.split('/');
      const depth = parts.length - 1;
      const name = parts[parts.length - 1] ?? e.path;
      return { kind: 'file' as const, name, path: e.path, depth, entry: e };
    });
}

export function FileTree({
  workspaceRoot,
  ignorePatterns,
  selectedPath,
  onSelect,
}: FileTreeProps): React.JSX.Element {
  const t = useT();
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
      setError(t('preview.code.api_unavailable'));
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
  }, [workspaceRoot, ignorePatterns, t]);

  // v2.8.0 (Builder UX) — 폴더 계층 표시. 기본 모든 폴더 expanded — 사용자
  // 가 클릭한 폴더만 collapsedFolders 에 추가되어 자식 숨김. 검색 중엔
  // hierarchy 무시하고 flat 매칭만.
  const [collapsedFolders, setCollapsedFolders] = useState<ReadonlySet<string>>(() => new Set());

  // 선택된 파일의 ancestor 폴더 자동 expand (collapsed 였더라도 다시 보이게).
  // Quick Open 등으로 외부에서 파일 열었을 때 해당 폴더가 보이도록.
  useEffect(() => {
    if (selectedPath === undefined || selectedPath.length === 0) return;
    const parts = selectedPath.split('/');
    if (parts.length <= 1) return;
    setCollapsedFolders((prev) => {
      let next: Set<string> | null = null;
      for (let i = 1; i < parts.length; i++) {
        const ancestor = parts.slice(0, i).join('/');
        if (prev.has(ancestor)) {
          if (next === null) next = new Set(prev);
          next.delete(ancestor);
        }
      }
      return next ?? prev;
    });
  }, [selectedPath]);

  const toggleFolder = (path: string): void => {
    setCollapsedFolders((prev) => {
      const next = new Set(prev);
      if (next.has(path)) {
        next.delete(path);
      } else {
        next.add(path);
      }
      return next;
    });
  };

  // 검색 활성 시 flat 매칭, 아니면 폴더 hierarchy 표시.
  const visibleNodes = useMemo<ReadonlyArray<TreeNode>>(() => {
    if (query.length > 0) return buildSearchNodes(entries, query);
    return buildVisibleNodes(entries, collapsedFolders);
  }, [entries, query, collapsedFolders]);

  const fileCount = useMemo(() => entries.length, [entries]);
  const visibleFileCount = useMemo(
    () => visibleNodes.filter((n) => n.kind === 'file').length,
    [visibleNodes]
  );

  // v2.7.x sub-PR — resize state. lazy init 으로 localStorage 1회만 읽음.
  const [width, setWidth] = useState<number>(() => loadStoredWidth());
  const dragStartRef = useRef<{ x: number; w: number } | null>(null);

  const handleHandleMouseDown = (event: React.MouseEvent<HTMLButtonElement>): void => {
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
      className="relative flex h-full shrink-0 flex-col border-r border-hairline bg-canvas-soft"
      style={{ width }}
      data-testid="code-file-tree"
      data-tree-width={width}
    >
      <div className="border-b border-hairline p-2">
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t('preview.code.tree.search_placeholder')}
          aria-label={t('preview.code.tree.search_aria')}
          className="w-full rounded border border-hairline bg-surface-card px-2 py-1 text-xs text-text-primary placeholder:text-text-tertiary focus:border-accent focus:outline-none"
          data-testid="code-file-tree-search"
        />
      </div>
      <div className="flex-1 overflow-hidden">
        {workspaceRoot === undefined || workspaceRoot.length === 0 ? (
          <p className="px-3 py-4 text-xs text-text-tertiary" data-testid="code-file-tree-empty">
            {t('preview.code.tree.empty_workspace')}
          </p>
        ) : loading ? (
          <p className="px-3 py-4 text-xs text-text-tertiary" data-testid="code-file-tree-loading">
            {t('preview.code.tree.loading')}
          </p>
        ) : error !== null ? (
          <p
            className="px-3 py-4 text-xs text-semantic-danger"
            role="alert"
            data-testid="code-file-tree-error"
          >
            {error}
          </p>
        ) : visibleNodes.length === 0 ? (
          <p
            className="px-3 py-4 text-xs text-text-tertiary"
            data-testid="code-file-tree-no-results"
          >
            {query.length === 0 ? t('preview.code.tree.empty') : t('preview.code.tree.no_results')}
          </p>
        ) : visibleNodes.length < VIRTUALIZATION_THRESHOLD ? (
          <ul className="h-full overflow-y-auto" data-testid="code-file-tree-list">
            {visibleNodes.map((node) => (
              <li key={`${node.kind}:${node.path}`}>
                <TreeRow
                  node={node}
                  selected={node.kind === 'file' && node.path === selectedPath}
                  expanded={node.kind === 'folder' && !collapsedFolders.has(node.path)}
                  onSelectFile={onSelect}
                  onToggleFolder={toggleFolder}
                />
              </li>
            ))}
          </ul>
        ) : (
          <Virtuoso
            data={[...visibleNodes]}
            itemContent={(_index, node) => (
              <TreeRow
                node={node}
                selected={node.kind === 'file' && node.path === selectedPath}
                expanded={node.kind === 'folder' && !collapsedFolders.has(node.path)}
                onSelectFile={onSelect}
                onToggleFolder={toggleFolder}
              />
            )}
          />
        )}
      </div>
      <footer className="border-t border-hairline px-3 py-1 text-[10px] text-text-tertiary">
        {visibleFileCount} / {fileCount}
        {entries.length === MAX_FILES && t('preview.code.tree.cap_reached')}
      </footer>
      {/* v2.7.x sub-PR — drag-to-resize handle. button element 로 a11y
          interactive 요건 충족. 4px wide hit area on the right edge. */}
      <button
        type="button"
        aria-label={t('preview.code.tree.resize_aria')}
        className="absolute right-0 top-0 h-full w-1 cursor-col-resize bg-transparent hover:bg-accent/40 focus:bg-accent/40 focus:outline-none"
        data-testid="code-file-tree-resize-handle"
        onMouseDown={handleHandleMouseDown}
      />
    </div>
  );
}

/**
 * TreeRow — file 또는 folder 한 줄. depth 만큼 들여쓰기, folder 는 chevron +
 * Folder/FolderOpen 아이콘 + 자식 토글, file 은 FileText + 선택 highlight.
 */
function TreeRow({
  node,
  selected,
  expanded,
  onSelectFile,
  onToggleFolder,
}: {
  node: TreeNode;
  selected: boolean;
  expanded: boolean;
  onSelectFile: (relPath: string) => void;
  onToggleFolder: (folderPath: string) => void;
}): React.JSX.Element {
  const indentPx = node.depth * 12;
  if (node.kind === 'folder') {
    return (
      <button
        type="button"
        onClick={() => onToggleFolder(node.path)}
        aria-expanded={expanded}
        data-testid={`code-folder-row-${node.path}`}
        className="flex w-full items-center gap-1 border-l-2 border-transparent px-2 py-1 text-left text-xs text-text-secondary hover:bg-surface-strong"
      >
        <span style={{ paddingLeft: indentPx }} aria-hidden className="shrink-0" />
        {expanded ? (
          <ChevronDown aria-hidden="true" className="h-3 w-3 shrink-0 text-text-tertiary" />
        ) : (
          <ChevronRight aria-hidden="true" className="h-3 w-3 shrink-0 text-text-tertiary" />
        )}
        {expanded ? (
          <FolderOpen aria-hidden="true" className="h-3 w-3 shrink-0 text-text-tertiary" />
        ) : (
          <Folder aria-hidden="true" className="h-3 w-3 shrink-0 text-text-tertiary" />
        )}
        <span className="truncate font-mono">{node.name}</span>
      </button>
    );
  }
  // file
  return (
    <button
      type="button"
      onClick={() => onSelectFile(node.path)}
      data-testid={`code-file-row-${node.path}`}
      data-selected={selected ? 'true' : 'false'}
      className={
        selected
          ? 'flex w-full items-center gap-1 border-l-2 border-accent bg-surface-strong px-2 py-1 text-left text-xs text-text-primary'
          : 'flex w-full items-center gap-1 border-l-2 border-transparent px-2 py-1 text-left text-xs text-text-secondary hover:bg-surface-strong'
      }
    >
      <span style={{ paddingLeft: indentPx }} aria-hidden className="shrink-0" />
      <span className="h-3 w-3 shrink-0" aria-hidden />
      <FileText aria-hidden="true" className="h-3 w-3 shrink-0 text-text-tertiary" />
      <span className="truncate font-mono">{node.name}</span>
    </button>
  );
}
