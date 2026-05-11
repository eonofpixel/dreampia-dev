/**
 * DiffViewer — read-only unified diff (disk content ↔ draft).
 *
 * v2.7.0 Phase 3 sub-PR. CodePanel 의 편집 모드 토글 안에서 사용자가 "Diff"
 * 토글로 뷰를 전환하면 본 컴포넌트가 CodeEditor 를 대체. mergeControls=false
 * 라 accept/reject 인라인 버튼 없음 — 단순 시각화 only.
 *
 * Codex 패턴 일치도: Codex 의 git diff pane 과 동일한 인라인 diff 패러다임
 * (옵션 D: 우측 PreviewPanel 안에서 호스트). 별도 좌우 분할 X.
 *
 * Decision doc: ../../../../CODE_TAB_DECISION.md (점수 결정 — diff viewer 채택).
 */

import { defaultKeymap, history, historyKeymap } from '@codemirror/commands';
import { bracketMatching, foldGutter, foldKeymap, indentOnInput } from '@codemirror/language';
import { unifiedMergeView } from '@codemirror/merge';
import { searchKeymap } from '@codemirror/search';
import { Compartment, EditorState } from '@codemirror/state';
import { oneDark } from '@codemirror/theme-one-dark';
import {
  EditorView,
  drawSelection,
  highlightActiveLine,
  highlightActiveLineGutter,
  keymap,
  lineNumbers,
} from '@codemirror/view';
import { useEffect, useMemo, useRef } from 'react';

import { detectLanguageExtension } from './languageDetect';

export interface DiffViewerProps {
  /** 디스크의 현재 내용 (original). */
  original: string;
  /** 사용자가 편집한 내용 (modified). */
  modified: string;
  /** 확장자 감지용. */
  relPath?: string;
  /** 다크/라이트 강제. 미지정 시 document data-theme 추정. */
  theme?: 'light' | 'dark';
  /**
   * v2.9.0 (Builder UX, C 4차) — true 면 unifiedMergeView 의 인라인
   * accept/reject 버튼 활성화. 사용자가 hunk 별 토글 가능. ApplyToFileModal
   * 에서 사용 — 기본 false (CodePanel 의 read-only Diff 토글은 그대로).
   */
  mergeControls?: boolean;
  /**
   * v2.9.0 (Builder UX, C 4차) — view 의 doc 이 사용자 상호작용으로 바뀔 때
   * 마다 호출. mergeControls=true 와 짝. ApplyToFileModal 이 최종 merged
   * 결과를 추적해 Accept 시 그 값을 workspace.writeFile.
   */
  onChange?: (current: string) => void;
}

function resolveDarkMode(prop: 'light' | 'dark' | undefined): boolean {
  if (prop !== undefined) return prop === 'dark';
  if (typeof document === 'undefined') return false;
  return document.documentElement.getAttribute('data-theme') === 'dark';
}

export function DiffViewer({
  original,
  modified,
  relPath,
  theme,
  mergeControls = false,
  onChange,
}: DiffViewerProps): React.JSX.Element {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const viewRef = useRef<EditorView | null>(null);
  const themeCompartment = useRef(new Compartment());
  const langCompartment = useRef(new Compartment());
  // v2.9.0 (C 4차) — onChange ref. callback identity 변화로 view 재생성을
  // 트리거하지 않도록.
  const onChangeRef = useRef<typeof onChange>(onChange);
  onChangeRef.current = onChange;

  const langExt = useMemo(
    () => (relPath !== undefined ? detectLanguageExtension(relPath) : undefined),
    [relPath]
  );
  const isDark = resolveDarkMode(theme);

  // Mount 시 한 번만 — original/modified 변경은 doc 교체 + extension 재구성.
  useEffect(() => {
    if (hostRef.current === null) return;
    const baseExtensions = [
      lineNumbers(),
      highlightActiveLineGutter(),
      foldGutter(),
      drawSelection(),
      indentOnInput(),
      bracketMatching(),
      highlightActiveLine(),
      history(),
      keymap.of([...defaultKeymap, ...historyKeymap, ...foldKeymap, ...searchKeymap]),
      EditorView.editable.of(false),
      // v2.9.0 (C 4차) — mergeControls=true 면 doc 수정 dispatch 를 허용해야
      // hunk accept/reject 버튼이 동작. editable=false 라 키보드 입력은 여전
      // 차단 (사용자 직접 타이핑 X, merge 버튼만 영향).
      EditorState.readOnly.of(!mergeControls),
      EditorView.theme({
        '&': { height: '100%', fontSize: '12px' },
        '.cm-scroller': { fontFamily: 'var(--font-mono, ui-monospace, monospace)' },
      }),
      // mergeControls=false 면 인라인 accept/reject 버튼 미노출 (read-only diff).
      // true 면 사용자가 hunk 별 토글 가능 — ApplyToFileModal 의 partial apply.
      unifiedMergeView({ original, mergeControls }),
      EditorView.updateListener.of((update) => {
        if (update.docChanged && onChangeRef.current !== undefined) {
          onChangeRef.current(update.state.doc.toString());
        }
      }),
      themeCompartment.current.of(isDark ? [oneDark] : []),
      langCompartment.current.of(langExt ?? []),
    ];

    const state = EditorState.create({ doc: modified, extensions: baseExtensions });
    const view = new EditorView({ state, parent: hostRef.current });
    viewRef.current = view;
    return (): void => {
      view.destroy();
      viewRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // original / modified 변경 시 view 재생성 — unifiedMergeView 는 extension 의
  // 일부라 단순 dispatch 로 갱신 어려움. content 가 자주 바뀌지 않는 (저장 후
  // 최종 비교 모드) 가정 하에 destroy/recreate 가 명확.
  useEffect(() => {
    const view = viewRef.current;
    if (view === null) return;
    const host = hostRef.current;
    if (host === null) return;
    view.destroy();
    const baseExtensions = [
      lineNumbers(),
      highlightActiveLineGutter(),
      foldGutter(),
      drawSelection(),
      indentOnInput(),
      bracketMatching(),
      highlightActiveLine(),
      history(),
      keymap.of([...defaultKeymap, ...historyKeymap, ...foldKeymap, ...searchKeymap]),
      EditorView.editable.of(false),
      EditorState.readOnly.of(true),
      EditorView.theme({
        '&': { height: '100%', fontSize: '12px' },
        '.cm-scroller': { fontFamily: 'var(--font-mono, ui-monospace, monospace)' },
      }),
      unifiedMergeView({ original, mergeControls: false }),
      themeCompartment.current.of(isDark ? [oneDark] : []),
      langCompartment.current.of(langExt ?? []),
    ];
    const state = EditorState.create({ doc: modified, extensions: baseExtensions });
    const newView = new EditorView({ state, parent: host });
    viewRef.current = newView;
  }, [original, modified, isDark, langExt, mergeControls]);

  return (
    <div className="flex h-full flex-col" data-testid="code-diff-viewer">
      <div ref={hostRef} className="flex-1 overflow-hidden" data-testid="code-diff-viewer-host" />
    </div>
  );
}
