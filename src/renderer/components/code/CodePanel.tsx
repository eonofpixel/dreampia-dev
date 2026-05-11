/**
 * CodePanel — Phase 2 (v2.6.0) Code mode 의 본체 + Phase 3 (v2.7.0) 편집 모드.
 *
 * Codex 옵션 D — PreviewPanel 의 mode='code' 분기에서 마운트된다. 좌측
 * FileTree (워크스페이스 파일 목록) + 우측 CodeEditor (선택 파일).
 *
 * Phase 3 (v2.7.0):
 *   - Edit 토글 버튼 (read-only ↔ editable)
 *   - 편집 중인 draft / dirty 상태 추적 (parent state, CodeEditor 는 controlled)
 *   - Save 버튼 (workspace.writeFile + expected_mtime conflict 처리)
 *   - Revert 버튼 (draft 폐기 → disk content 복원)
 *
 * 한계 (Phase 3 scope, decision doc 준수):
 *   - 단일 파일 (다중 탭 없음)
 *   - 편집 중 외부 파일 변경 감지 X (저장 시 expected_mtime 으로만 검출)
 *   - autosave 없음 (사용자 명시 저장)
 */

import type { EditorView } from '@codemirror/view';
import { Diff, FileCode2, Globe, ListTree, Pencil, RotateCcw, Save } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';

import { useT } from '../../i18n';

import { CodeEditor } from './CodeEditor';
import { DiffViewer } from './DiffViewer';
import { EditorOutline } from './EditorOutline';
import { FileTree } from './FileTree';
import { detectLanguageLabel } from './languageDetect';
import { pushRecentFile, removeRecentFile } from './recentFiles';

interface FileContent {
  content: string;
  truncated: boolean;
  line_count: number;
}

interface FileWriteResult {
  mtime: string;
  size_bytes: number;
  conflict?: 'mtime_mismatch';
}

// v2.7.0 Phase 3 sub-PR — last-opened file persistence (per workspace).
// Renderer-only localStorage 저장 — IPC 비용 없음. 워크스페이스 별 키.
// 파일이 사라졌으면 readFile 실패 → 사용자에게 에러 노출 + entry 자동 삭제.
const LAST_FILE_STORAGE_PREFIX = 'dreampia.codeMode.lastFile.';

function loadLastOpenedFile(workspaceRoot: string): string | null {
  try {
    return localStorage.getItem(LAST_FILE_STORAGE_PREFIX + workspaceRoot);
  } catch {
    return null;
  }
}

function saveLastOpenedFile(workspaceRoot: string, relPath: string): void {
  try {
    localStorage.setItem(LAST_FILE_STORAGE_PREFIX + workspaceRoot, relPath);
  } catch {
    // localStorage 가 가득 차거나 접근 불가 — 무시 (UX-non-critical).
  }
}

function clearLastOpenedFile(workspaceRoot: string): void {
  try {
    localStorage.removeItem(LAST_FILE_STORAGE_PREFIX + workspaceRoot);
  } catch {
    // ignore
  }
}

// v2.8.0 (Builder UX) — outline 패널 표시 여부 (전역, per-workspace 아님).
// 한 번 켜면 모든 워크스페이스에서 기억 — 빌더툴 사용자 선호.
const OUTLINE_VISIBLE_STORAGE_KEY = 'dreampia.codeMode.outlineVisible';

function loadOutlineVisible(): boolean {
  try {
    return localStorage.getItem(OUTLINE_VISIBLE_STORAGE_KEY) === 'true';
  } catch {
    return false;
  }
}

function saveOutlineVisible(value: boolean): void {
  try {
    localStorage.setItem(OUTLINE_VISIBLE_STORAGE_KEY, value ? 'true' : 'false');
  } catch {
    // quota / SSR — UX-non-critical
  }
}

export interface CodePanelProps {
  /** 워크스페이스 절대 루트. undefined 면 빈 상태 — FileTree 가 prompt. */
  workspaceRoot?: string;
  /** mention popover 와 동일한 ignore 패턴 재사용 권장. */
  ignorePatterns?: ReadonlyArray<string>;
  /**
   * Phase 1 에서 도입한 mode-switcher. CodePanel 헤더의 [Browser] 버튼이
   * 이 콜백으로 'browser' 를 보낸다.
   */
  onSwitchMode?: (next: 'browser' | 'code') => void;
  /**
   * v2.8.0 (Builder UX) — Quick Open 등 외부에서 파일 로드 요청. 값 변화 시
   * loadFile(requestedFile). 한 번 소비되면 onRequestedFileConsumed 로 reset.
   */
  requestedFile?: string;
  onRequestedFileConsumed?: () => void;
  /**
   * v2.8.x (Builder UX, C 후속) — 현재 열린 파일의 메타데이터 emit. App.tsx
   * 가 ChatPanel 의 "Apply to file" 버튼을 활성화할 때 target 파일 식별에
   * 사용. 파일 미선택 / 워크스페이스 변경 / 로드 실패 시 null. mtime / content
   * 도 함께 — writeFile 의 expected_mtime 검증과 diff preview 에 사용.
   *
   * Refs: BUILDER_UX_ANALYSIS.md #C — Apply-to-file follow-up.
   */
  onCurrentFileChange?: (info: { path: string; mtime?: string; content: string } | null) => void;
  /**
   * v2.8.x (Builder UX, C 3차) — 외부 (App.tsx 의 ApplyToFileModal accept)
   * 가 disk content 를 갱신했음을 알림. 값 변화 시 selectedPath 가 일치하면
   * setDiskContent + setDiskMtime + 외부 변경 banner reset. 일회성 — 한 번
   * 소비하면 onAppliedDiskUpdateConsumed 로 부모가 reset.
   *
   * fs watcher 없이도 in-process write 후 즉시 baseline 동기화 — change
   * gutter / diff toggle / dirty 비교가 stale baseline 을 가리키지 않게.
   */
  appliedDiskUpdate?: { path: string; content: string; mtime?: string } | null;
  onAppliedDiskUpdateConsumed?: () => void;
}

export function CodePanel({
  workspaceRoot,
  ignorePatterns,
  onSwitchMode,
  requestedFile,
  onRequestedFileConsumed,
  onCurrentFileChange,
  appliedDiskUpdate,
  onAppliedDiskUpdateConsumed,
}: CodePanelProps): React.JSX.Element {
  const t = useT();
  const [selectedPath, setSelectedPath] = useState<string | undefined>(undefined);
  const [diskContent, setDiskContent] = useState<string>('');
  const [draft, setDraft] = useState<string>('');
  const [diskMtime, setDiskMtime] = useState<string | undefined>(undefined);
  const [truncated, setTruncated] = useState(false);
  const [lineCount, setLineCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [conflict, setConflict] = useState(false);
  // v2.7.0 Phase 3 sub-PR — Diff toggle. dirty 인 동안만 의미 있음 (저장
  // 직후엔 disk == draft 라 diff 가 비어 있음). editing=false 시 자동 숨김.
  const [showDiff, setShowDiff] = useState(false);
  // v2.7.0 Phase 3 sub-PR — 외부 변경 감지 (폴링). 디스크 mtime 이 마지막
  // load 시점과 달라지면 true. 사용자에게 reload prompt.
  const [externalChange, setExternalChange] = useState(false);
  // v2.8.0 (Builder UX) — outline 패널 표시 + 현재 EditorView 인스턴스.
  // outline 토글은 localStorage 영속, view 는 mount 시 CodeEditor 가 emit.
  const [outlineVisible, setOutlineVisible] = useState<boolean>(() => loadOutlineVisible());
  const [editorView, setEditorView] = useState<EditorView | null>(null);

  const isDirty = editing && draft !== diskContent;

  // 워크스페이스가 바뀌면 모든 상태 초기화 — 잔존 콘텐츠가 새 워크스페이스
  // 트리와 함께 보이지 않도록.
  useEffect(() => {
    setSelectedPath(undefined);
    setDiskContent('');
    setDraft('');
    setDiskMtime(undefined);
    setTruncated(false);
    setLineCount(0);
    setError(null);
    setEditing(false);
    setConflict(false);
    setShowDiff(false);
    setExternalChange(false);
  }, [workspaceRoot]);

  // editing 종료 시 diff 토글도 자동 해제 — 보기 모드에선 의미 없음.
  useEffect(() => {
    if (!editing) setShowDiff(false);
  }, [editing]);

  // v2.7.0 Phase 3 sub-PR — 외부 변경 폴링. 5초마다 statFile 호출 후 디스크
  // mtime 이 마지막 load 시점과 다르면 externalChange=true. 사용자가 reload
  // 해야 정확한 base 위에서 작업 계속 가능.
  // 활성 조건: workspaceRoot + selectedPath + diskMtime 모두 정의됨.
  // 폴링 빈도: 5_000ms — 사용자 체감 지연 vs IPC 비용 trade-off.
  useEffect(() => {
    if (
      workspaceRoot === undefined ||
      workspaceRoot.length === 0 ||
      selectedPath === undefined ||
      diskMtime === undefined
    ) {
      return;
    }
    const ws = typeof window !== 'undefined' ? window.dreampia?.workspace : undefined;
    if (ws === undefined || typeof ws.statFile !== 'function') return;
    let cancelled = false;
    const tick = async (): Promise<void> => {
      const stat = await ws.statFile({
        workspace_root: workspaceRoot,
        rel_path: selectedPath,
      });
      if (cancelled) return;
      if (stat.ok && stat.value.exists && stat.value.mtime !== diskMtime) {
        setExternalChange(true);
      }
    };
    const handle = setInterval(() => {
      void tick();
    }, 5_000);
    return (): void => {
      cancelled = true;
      clearInterval(handle);
    };
  }, [workspaceRoot, selectedPath, diskMtime]);

  const loadFile = useCallback(
    (relPath: string) => {
      setSelectedPath(relPath);
      setError(null);
      setConflict(false);
      if (workspaceRoot === undefined || workspaceRoot.length === 0) return;
      const ws = typeof window !== 'undefined' ? window.dreampia?.workspace : undefined;
      if (ws === undefined || typeof ws.readFile !== 'function') {
        setError(t('preview.code.api_unavailable'));
        return;
      }
      setLoading(true);
      void (async () => {
        try {
          const result = await ws.readFile({
            workspace_root: workspaceRoot,
            rel_path: relPath,
          });
          if (result.ok) {
            const fc = result.value as FileContent;
            setDiskContent(fc.content);
            setDraft(fc.content);
            setTruncated(fc.truncated);
            setLineCount(fc.line_count);
            setExternalChange(false);
            // v2.7.0 sub-PR — last-opened 영속. 다음 mount 시 restore.
            saveLastOpenedFile(workspaceRoot, relPath);
            // v2.8.0 (Builder UX) — recents list 갱신. QuickOpenModal 이
            // query 비어 있을 때 상단 "Recents" 섹션으로 노출.
            pushRecentFile(workspaceRoot, relPath);
            // v2.7.0 Phase 3 sub-PR — readFile 직후 별도 stat 호출로 정확한
            // 디스크 mtime 캡처. writeFile 의 expected_mtime + 폴링 비교용.
            if (typeof ws.statFile === 'function') {
              const stat = await ws.statFile({
                workspace_root: workspaceRoot,
                rel_path: relPath,
              });
              if (stat.ok && stat.value.exists && stat.value.mtime !== undefined) {
                setDiskMtime(stat.value.mtime);
              } else {
                setDiskMtime(undefined);
              }
            } else {
              setDiskMtime(undefined);
            }
          } else {
            setError(result.error);
            setDiskContent('');
            setDraft('');
            setTruncated(false);
            setLineCount(0);
            // 파일 사라짐/접근 실패 → stale entry 제거. 다음 mount 시
            // restore 시도가 같은 에러를 반복하지 않도록.
            clearLastOpenedFile(workspaceRoot);
            // v2.8.0 (Builder UX) — recents 에서도 같은 entry 제거. 사용자가
            // QuickOpenModal 의 Recents 섹션에서 다시 클릭해도 같은 에러를
            // 반복하지 않도록.
            removeRecentFile(workspaceRoot, relPath);
          }
        } catch (err) {
          setError(err instanceof Error ? err.message : String(err));
        } finally {
          setLoading(false);
        }
      })();
    },
    [workspaceRoot, t]
  );

  // v2.7.0 sub-PR — workspace mount 시 마지막 열린 파일 자동 restore.
  // workspace-clear effect 가 selectedPath 를 undefined 로 reset 한 후
  // 본 effect 가 loadFile(restoredPath) 를 호출. 사용자가 즉시 다른 파일을
  // 클릭하면 그 호출이 우선 (양쪽 모두 loadFile 동일 경로라 race 무관).
  // 파일이 사라졌으면 loadFile 의 실패 path 가 localStorage entry 를 정리.
  useEffect(() => {
    if (workspaceRoot === undefined || workspaceRoot.length === 0) return;
    const restored = loadLastOpenedFile(workspaceRoot);
    if (restored === null) return;
    loadFile(restored);
  }, [workspaceRoot, loadFile]);

  // v2.8.0 (Builder UX) — Quick Open 등 외부 요청으로 파일 로드.
  // requestedFile 값이 변하면 loadFile 호출 + 부모에게 소비 알림. 부모는
  // 즉시 prop 을 undefined 로 reset 하지만 본 effect 는 그 사이 fire 됨.
  useEffect(() => {
    if (requestedFile === undefined || requestedFile.length === 0) return;
    loadFile(requestedFile);
    onRequestedFileConsumed?.();
  }, [requestedFile, loadFile, onRequestedFileConsumed]);

  // v2.8.x (Builder UX, C 3차) — Apply-to-file 성공 후 disk baseline 즉시
  // 동기화. App.tsx 가 prop 으로 새 content + mtime 을 dispatch → selectedPath
  // 가 일치하면 적용 + externalChange banner reset. 즉시 소비 callback 으로
  // 부모가 prop 을 null 로 reset → 같은 update 가 반복 적용되지 않도록.
  useEffect(() => {
    if (appliedDiskUpdate === null || appliedDiskUpdate === undefined) return;
    if (selectedPath === undefined || selectedPath !== appliedDiskUpdate.path) {
      // 사용자가 그 사이 파일을 바꿨거나 닫았으면 무시 — disk state 침범 X.
      onAppliedDiskUpdateConsumed?.();
      return;
    }
    setDiskContent(appliedDiskUpdate.content);
    if (appliedDiskUpdate.mtime !== undefined) {
      setDiskMtime(appliedDiskUpdate.mtime);
    }
    setExternalChange(false);
    onAppliedDiskUpdateConsumed?.();
  }, [appliedDiskUpdate, selectedPath, onAppliedDiskUpdateConsumed]);

  // v2.8.x (Builder UX, C 후속) — 현재 열린 파일 메타데이터 emit. App.tsx
  // 가 ChatPanel "Apply to file" 버튼 활성화 + writeFile target 식별에 사용.
  // callback 의 identity 변화로 effect 가 흔들리지 않도록 ref 로 보관 후 호출.
  const onCurrentFileChangeRef = useRef<typeof onCurrentFileChange>(onCurrentFileChange);
  onCurrentFileChangeRef.current = onCurrentFileChange;
  useEffect(() => {
    if (selectedPath === undefined) {
      onCurrentFileChangeRef.current?.(null);
      return;
    }
    onCurrentFileChangeRef.current?.({
      path: selectedPath,
      content: diskContent,
      ...(diskMtime !== undefined && { mtime: diskMtime }),
    });
  }, [selectedPath, diskContent, diskMtime]);

  // v2.8.0 (Builder UX) — document.title 을 현재 파일 + dirty 상태로 동기화.
  // 형태: `● filename.ext — Dreampia-Dev` (편집 중 + 변경 있음) 또는
  //       `filename.ext — Dreampia-Dev` (편집 X 또는 변경 없음) 또는
  //       `Dreampia-Dev` (파일 미선택).
  // 사용자가 다른 작업창과 빠르게 전환할 때 unsaved 작업 식별이 가능해야.
  useEffect(() => {
    if (selectedPath === undefined) {
      document.title = 'Dreampia-Dev';
      return;
    }
    const segments = selectedPath.split('/');
    const fname = segments[segments.length - 1] ?? selectedPath;
    document.title = `${isDirty ? '● ' : ''}${fname} — Dreampia-Dev`;
  }, [selectedPath, isDirty]);

  // CodePanel 언마운트 (Browser 모드 전환 등) 시 기본 title 복원. 위 effect
  // 의 cleanup 으로 묶지 않은 이유: 의존성 바뀔 때마다 reset 으로 깜빡이지
  // 않도록. 본 effect 는 mount 시 1회만 등록되어 언마운트 시점에 fire.
  useEffect(() => {
    return (): void => {
      document.title = 'Dreampia-Dev';
    };
  }, []);

  const handleSave = useCallback(() => {
    if (workspaceRoot === undefined || workspaceRoot.length === 0 || selectedPath === undefined)
      return;
    const ws = typeof window !== 'undefined' ? window.dreampia?.workspace : undefined;
    if (ws === undefined || typeof ws.writeFile !== 'function') {
      setError(t('preview.code.api_unavailable'));
      return;
    }
    setSaving(true);
    setConflict(false);
    void (async () => {
      try {
        const result = await ws.writeFile({
          workspace_root: workspaceRoot,
          rel_path: selectedPath,
          content: draft,
          ...(diskMtime !== undefined && { expected_mtime: diskMtime }),
        });
        if (result.ok) {
          const wr = result.value as FileWriteResult;
          if (wr.conflict === 'mtime_mismatch') {
            setConflict(true);
            setDiskMtime(wr.mtime);
          } else {
            // 성공 — draft 가 disk 가 됨.
            setDiskContent(draft);
            setDiskMtime(wr.mtime);
          }
        } else {
          setError(result.error);
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      } finally {
        setSaving(false);
      }
    })();
  }, [workspaceRoot, selectedPath, draft, diskMtime, t]);

  const handleRevert = useCallback(() => {
    setDraft(diskContent);
    setConflict(false);
  }, [diskContent]);

  const handleForceOverwrite = useCallback(() => {
    setDiskMtime(undefined);
    setConflict(false);
    handleSave();
  }, [handleSave]);

  return (
    <aside
      className="relative flex h-full flex-1 flex-col border-l border-border-primary bg-bg-primary"
      aria-label={t('preview.aside_aria')}
      data-testid="preview-panel-code"
      data-mode="code"
    >
      <header className="flex items-center gap-2 border-b border-border-primary px-3 py-2 text-xs text-text-secondary">
        <FileCode2 aria-hidden="true" className="h-3.5 w-3.5 shrink-0" />
        {selectedPath !== undefined ? (
          (() => {
            // v2.8.0 (Builder UX) — Breadcrumb: dir segments muted + filename
            // emphasized. monospace 로 유지하되 색만 분리.
            const segments = selectedPath.split('/');
            const fname = segments[segments.length - 1] ?? selectedPath;
            const dirs = segments.slice(0, -1);
            return (
              <span
                className="flex min-w-0 flex-1 items-center truncate font-mono"
                title={selectedPath}
                data-testid="code-active-path"
              >
                {dirs.map((seg, idx) => (
                  <span key={idx} className="text-text-tertiary">
                    <span>{seg}</span>
                    <span className="mx-0.5 select-none">/</span>
                  </span>
                ))}
                <span className="truncate text-text-primary">{fname}</span>
              </span>
            );
          })()
        ) : (
          <span className="flex-1 font-medium text-text-primary">{t('preview.code.title')}</span>
        )}
        {selectedPath !== undefined && (
          <span
            className="shrink-0 text-[10px] text-text-tertiary"
            data-testid="code-active-language"
          >
            {detectLanguageLabel(selectedPath)}
            {lineCount > 0 && <> · {lineCount} lines</>}
            {isDirty && (
              <span className="ml-1 text-yellow-300" data-testid="code-dirty-marker">
                ●
              </span>
            )}
          </span>
        )}
        {selectedPath !== undefined && !truncated && (
          <button
            type="button"
            onClick={() => setEditing((v) => !v)}
            aria-pressed={editing}
            className={
              editing
                ? 'flex items-center gap-1 rounded border border-accent bg-accent/10 px-2 py-0.5 text-[11px] text-accent'
                : 'flex items-center gap-1 rounded border border-border-primary bg-bg-tertiary px-2 py-0.5 text-[11px] hover:bg-border-primary'
            }
            data-testid="code-edit-toggle"
          >
            <Pencil aria-hidden="true" className="h-3 w-3" />
            <span>
              {editing ? t('preview.code.toolbar.editing') : t('preview.code.toolbar.edit')}
            </span>
          </button>
        )}
        {editing && isDirty && (
          <button
            type="button"
            onClick={() => setShowDiff((v) => !v)}
            aria-pressed={showDiff}
            className={
              showDiff
                ? 'flex items-center gap-1 rounded border border-accent bg-accent/10 px-2 py-0.5 text-[11px] text-accent'
                : 'flex items-center gap-1 rounded border border-border-primary bg-bg-tertiary px-2 py-0.5 text-[11px] hover:bg-border-primary'
            }
            data-testid="code-diff-toggle"
          >
            <Diff aria-hidden="true" className="h-3 w-3" />
            <span>
              {showDiff ? t('preview.code.toolbar.editor_view') : t('preview.code.toolbar.diff')}
            </span>
          </button>
        )}
        {editing && isDirty && (
          <button
            type="button"
            onClick={handleRevert}
            className="flex items-center gap-1 rounded border border-border-primary bg-bg-tertiary px-2 py-0.5 text-[11px] hover:bg-border-primary"
            data-testid="code-revert"
          >
            <RotateCcw aria-hidden="true" className="h-3 w-3" />
            <span>{t('preview.code.toolbar.revert')}</span>
          </button>
        )}
        {editing && (
          <button
            type="button"
            onClick={handleSave}
            disabled={!isDirty || saving}
            className="flex items-center gap-1 rounded border border-emerald-600/50 bg-emerald-900/20 px-2 py-0.5 text-[11px] text-emerald-300 hover:bg-emerald-900/30 disabled:opacity-50 disabled:cursor-not-allowed"
            data-testid="code-save"
          >
            <Save aria-hidden="true" className="h-3 w-3" />
            <span>
              {saving ? t('preview.code.toolbar.saving') : t('preview.code.toolbar.save')}
            </span>
          </button>
        )}
        {selectedPath !== undefined && (
          <button
            type="button"
            onClick={() => {
              const next = !outlineVisible;
              setOutlineVisible(next);
              saveOutlineVisible(next);
            }}
            aria-pressed={outlineVisible}
            aria-label={t('preview.code.outline.toggle_aria')}
            className={
              outlineVisible
                ? 'flex items-center gap-1 rounded border border-accent bg-accent/10 px-2 py-0.5 text-[11px] text-accent'
                : 'flex items-center gap-1 rounded border border-border-primary bg-bg-tertiary px-2 py-0.5 text-[11px] hover:bg-border-primary'
            }
            data-testid="code-outline-toggle"
          >
            <ListTree aria-hidden="true" className="h-3 w-3" />
            <span>{t('preview.code.outline.toggle')}</span>
          </button>
        )}
        {onSwitchMode !== undefined && (
          <button
            type="button"
            onClick={() => onSwitchMode('browser')}
            className="flex items-center gap-1 rounded border border-border-primary bg-bg-tertiary px-2 py-0.5 text-[11px] hover:bg-border-primary"
            aria-label={t('preview.mode.browser_aria')}
            data-testid="preview-mode-browser"
          >
            <Globe aria-hidden="true" className="h-3 w-3" />
            <span>Browser</span>
          </button>
        )}
      </header>
      {externalChange && selectedPath !== undefined && (
        <div
          role="status"
          className="flex items-center gap-2 border-b border-blue-700/50 bg-blue-900/20 px-3 py-1.5 text-[11px] text-blue-200"
          data-testid="code-external-change-banner"
        >
          <span className="flex-1">{t('preview.code.external.message')}</span>
          <button
            type="button"
            onClick={() => {
              if (selectedPath !== undefined) loadFile(selectedPath);
            }}
            className="rounded border border-blue-600/50 bg-blue-900/30 px-2 py-0.5 hover:bg-blue-900/50"
            data-testid="code-external-reload"
          >
            {t('preview.code.external.reload')}
          </button>
          <button
            type="button"
            onClick={() => setExternalChange(false)}
            className="rounded border border-border-primary bg-bg-tertiary px-2 py-0.5"
            data-testid="code-external-dismiss"
          >
            {t('preview.code.external.dismiss')}
          </button>
        </div>
      )}
      {conflict && selectedPath !== undefined && (
        <div
          role="alert"
          className="flex items-center gap-2 border-b border-yellow-700/50 bg-yellow-900/20 px-3 py-1.5 text-[11px] text-yellow-200"
          data-testid="code-conflict-banner"
        >
          <span className="flex-1">{t('preview.code.conflict.message')}</span>
          <button
            type="button"
            onClick={handleForceOverwrite}
            className="rounded border border-yellow-600/50 bg-yellow-900/30 px-2 py-0.5 hover:bg-yellow-900/50"
            data-testid="code-force-overwrite"
          >
            {t('preview.code.conflict.overwrite')}
          </button>
          <button
            type="button"
            onClick={() => {
              setConflict(false);
              if (selectedPath !== undefined) loadFile(selectedPath);
            }}
            className="rounded border border-border-primary bg-bg-tertiary px-2 py-0.5"
            data-testid="code-conflict-reload"
          >
            {t('preview.code.conflict.reload')}
          </button>
        </div>
      )}
      <div className="flex flex-1 overflow-hidden">
        <FileTree
          workspaceRoot={workspaceRoot}
          ignorePatterns={ignorePatterns}
          selectedPath={selectedPath}
          onSelect={loadFile}
        />
        <div className="flex flex-1 flex-col overflow-hidden">
          {selectedPath === undefined ? (
            <EmptyEditor />
          ) : loading ? (
            <p
              className="flex flex-1 items-center justify-center text-xs text-text-tertiary"
              data-testid="code-editor-loading"
            >
              {t('preview.code.editor.loading')}
            </p>
          ) : error !== null ? (
            <p
              className="flex flex-1 items-center justify-center px-6 text-center text-xs text-red-300"
              role="alert"
              data-testid="code-editor-error"
            >
              {error}
            </p>
          ) : showDiff ? (
            <DiffViewer original={diskContent} modified={draft} relPath={selectedPath} />
          ) : (
            <CodeEditor
              content={editing ? draft : diskContent}
              relPath={selectedPath}
              truncated={truncated}
              editable={editing && !truncated}
              onChange={(next) => setDraft(next)}
              onSave={editing && isDirty && !saving ? handleSave : undefined}
              onToggleEdit={!truncated ? () => setEditing((v) => !v) : undefined}
              baseline={diskContent}
              onViewReady={setEditorView}
            />
          )}
        </div>
        {outlineVisible && selectedPath !== undefined && <EditorOutline view={editorView} />}
      </div>
    </aside>
  );
}

function EmptyEditor(): React.JSX.Element {
  const t = useT();
  return (
    <div
      className="flex flex-1 flex-col items-center justify-center gap-2 px-6 text-center text-text-tertiary"
      data-testid="code-editor-empty"
    >
      <FileCode2 aria-hidden="true" className="h-12 w-12" />
      <p className="text-sm font-medium text-text-secondary">{t('preview.code.empty.heading')}</p>
      <p className="max-w-[280px] text-xs leading-relaxed">{t('preview.code.empty.hint')}</p>
    </div>
  );
}
