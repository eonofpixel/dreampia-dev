/**
 * CodeEditor — CodeMirror 6 wrapper.
 *
 * Phase 2 (v2.6.0) — read-only.
 * Phase 3 (v2.7.0) — `editable` prop 으로 편집 모드 전환 + onChange callback.
 *
 * 두 모드의 분기는 Compartment 로 처리해 view 를 destroy/recreate 하지 않고
 * runtime 토글이 가능. content prop 변경 (외부 reload, 부모 setContent) 은
 * EditorView.dispatch 로 doc 만 교체.
 *
 * 한계 (Phase 3 scope, decision doc 준수):
 *   - search/replace UI (Cmd+F popover) 는 keymap 만 — 별도 UI 미제공
 *   - linting / autocomplete 미연결 (CodeMirror lang 만 syntax highlight)
 *   - 다중 커서 / vim 모드 미지원
 *
 * 테마: dreampia theme attribute 가 'dark' 면 oneDark 적용. light 모드는
 * CodeMirror 의 내장 light 사용.
 *
 * Decision doc: ../../../../CODE_TAB_DECISION.md.
 */

import { defaultKeymap, history, historyKeymap } from '@codemirror/commands';
import { bracketMatching, foldGutter, foldKeymap, indentOnInput } from '@codemirror/language';
import { highlightSelectionMatches, searchKeymap } from '@codemirror/search';
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

import { useT } from '../../i18n';

import { changeGutter } from './changeGutter';
import { detectLanguageExtension } from './languageDetect';

export interface CodeEditorProps {
  /** UTF-8 source text. binary/oversize 는 호출자가 미리 거절. */
  content: string;
  /** 확장자 감지용 — 'src/foo/bar.ts' 같은 워크스페이스 상대 경로. */
  relPath?: string;
  /** dark theme 강제 토글. 미지정 시 document data-theme 값 사용. */
  theme?: 'light' | 'dark';
  /** truncated 인 경우 푸터 배너 노출. */
  truncated?: boolean;
  /** v2.7.0 — 편집 가능 여부. default false (read-only). */
  editable?: boolean;
  /** v2.7.0 — 편집 시 호출. editable=false 면 호출되지 않음. */
  onChange?: (next: string) => void;
  /**
   * v2.7.0 sub-PR — Mod+S (Cmd/Ctrl+S) 단축키 호출. editable=true 일 때만
   * 의미 있음 (read-only 모드에선 호출돼도 caller 가 자체 가드). 기본 keymap
   * 의 Mod-s 는 OS 의 "Save Page As" 다이얼로그를 열 수 있어 preventDefault
   * 필수. 미지정 시 단축키 자체가 비활성 (기본 OS 동작).
   */
  onSave?: () => void;
  /**
   * v2.7.0 sub-PR — Mod+E (Cmd/Ctrl+E) 단축키 호출. CodePanel 의 편집 모드
   * 토글. caller 가 truncated/eligibility 가드 — 미지정 시 단축키 비활성.
   * Mod+S 와 동일한 paradigm: preventDefault 로 OS/브라우저의 일부 default
   * (예: Edge 의 Find Toolbar) 차단.
   */
  onToggleEdit?: () => void;
  /**
   * v2.8.0 (Builder UX) — disk content baseline. 라인 단위 변경 gutter 가
   * `content` 와 비교해 변경 라인을 좌측 마크로 노출. 미지정 시 gutter
   * 자체가 mount 되지 않음 (read-only / 변경 추적 불필요한 호출자 호환).
   *
   * baseline === content 인 경우 (편집 중이지만 변경 없음 또는 read-only
   * 모드) 마크는 자연스럽게 비어 있음. 정확한 비교는 라인 인덱스 단순
   * 매칭 — Diff 토글 (CodePanel 의 ` Diff` 버튼) 이 정확한 LCS 기반 비교
   * 제공.
   */
  baseline?: string;
  /**
   * v2.8.0 (Builder UX) — EditorView 인스턴스를 외부 (예: EditorOutline)
   * 가 잡을 수 있도록 emit. mount 시 view 한 번, unmount 시 null 한 번.
   * forwardRef 대신 callback 으로 단순화 — 호출자는 useState 로 보관.
   */
  onViewReady?: (view: EditorView | null) => void;
}

function resolveDarkMode(prop: 'light' | 'dark' | undefined): boolean {
  if (prop !== undefined) return prop === 'dark';
  if (typeof document === 'undefined') return false;
  return document.documentElement.getAttribute('data-theme') === 'dark';
}

export function CodeEditor({
  content,
  relPath,
  theme,
  truncated = false,
  editable = false,
  onChange,
  onSave,
  onToggleEdit,
  baseline,
  onViewReady,
}: CodeEditorProps): React.JSX.Element {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const viewRef = useRef<EditorView | null>(null);

  // editable / onChange / onSave / onToggleEdit 가 prop 변경으로 흔들려도
  // view 를 재생성하지 않도록 최신 핸들러를 ref 로 보관. keymap /
  // updateListener 안에서 .current 호출.
  const onChangeRef = useRef<typeof onChange>(onChange);
  onChangeRef.current = onChange;
  const onSaveRef = useRef<typeof onSave>(onSave);
  onSaveRef.current = onSave;
  const onToggleEditRef = useRef<typeof onToggleEdit>(onToggleEdit);
  onToggleEditRef.current = onToggleEdit;
  const onViewReadyRef = useRef<typeof onViewReady>(onViewReady);
  onViewReadyRef.current = onViewReady;

  const t = useT();

  // Compartment: editable / theme / language 를 runtime 에 reconfigure.
  const editableCompartment = useRef(new Compartment());
  const themeCompartment = useRef(new Compartment());
  const langCompartment = useRef(new Compartment());

  // v2.8.0 (Builder UX) — change gutter ref. mount 시점에 baseline prop 이
  // defined 면 1회 마운트. 이후 toggle 미지원 — 호출자 (CodePanel) 가 항상
  // diskContent 를 baseline 으로 전달하므로 마운트 후 undefined 로 가는
  // 케이스 없음. baseline 변경은 setBaseline effect 로 dispatch.
  const changeGutterRef = useRef<ReturnType<typeof changeGutter> | null>(null);

  const langExt = useMemo(
    () => (relPath !== undefined ? detectLanguageExtension(relPath) : undefined),
    [relPath]
  );

  const isDark = resolveDarkMode(theme);

  // ── Mount once ─────────────────────────────────────────────────
  useEffect(() => {
    if (hostRef.current === null) return;
    // v2.8.0 (Builder UX) — baseline prop 이 정의돼 있으면 changeGutter 한 번
    // 만 마운트. baseline 후속 변경은 별도 effect 의 setBaseline.dispatch 로.
    const enableChangeGutter = baseline !== undefined;
    if (enableChangeGutter) {
      changeGutterRef.current = changeGutter();
    }
    const baseExtensions = [
      lineNumbers(),
      highlightActiveLineGutter(),
      foldGutter(),
      drawSelection(),
      indentOnInput(),
      bracketMatching(),
      highlightActiveLine(),
      highlightSelectionMatches(),
      history(),
      keymap.of([
        {
          // v2.7.0 sub-PR — Mod+S 저장. preventDefault=true 로 OS 의 "Save
          // Page As" 다이얼로그 차단. onSave 미지정 시에도 항상 동작 (handler
          // 가 no-op 일 뿐, OS 다이얼로그 차단은 유지) — 안 차단하면 사용자
          // 가 일반 textarea 처럼 저장하려다 브라우저 chrome 으로 빠짐.
          key: 'Mod-s',
          preventDefault: true,
          run: (): boolean => {
            onSaveRef.current?.();
            return true;
          },
        },
        {
          // v2.7.0 sub-PR — Mod+E 편집 모드 토글. onToggleEdit 미지정 시
          // run 이 false 반환 → 다른 keymap 으로 fallthrough (단, defaultKeymap
          // 에 Mod-e 바인딩 없어 결과적으로 OS default 동작). preventDefault
          // 는 핸들러 등록 시에만.
          key: 'Mod-e',
          preventDefault: true,
          run: (): boolean => {
            const fn = onToggleEditRef.current;
            if (fn === undefined) return false;
            fn();
            return true;
          },
        },
        ...defaultKeymap,
        ...historyKeymap,
        ...foldKeymap,
        ...searchKeymap,
      ]),
      EditorView.theme({
        '&': { height: '100%', fontSize: '12px' },
        '.cm-scroller': { fontFamily: 'var(--font-mono, ui-monospace, monospace)' },
      }),
      EditorView.updateListener.of((update) => {
        if (update.docChanged) {
          const next = update.state.doc.toString();
          onChangeRef.current?.(next);
        }
      }),
      editableCompartment.current.of(buildEditableExtensions(editable)),
      themeCompartment.current.of(isDark ? [oneDark] : []),
      langCompartment.current.of(langExt ?? []),
      ...(changeGutterRef.current !== null ? [changeGutterRef.current.extension] : []),
    ];

    const state = EditorState.create({ doc: content, extensions: baseExtensions });
    const view = new EditorView({ state, parent: hostRef.current });
    viewRef.current = view;
    // v2.8.0 (Builder UX) — initial baseline dispatch. StateField 의 default
    // 가 '' 라 mount 직후 dispatch 해야 정확한 비교가 시작됨.
    if (changeGutterRef.current !== null && baseline !== undefined) {
      view.dispatch({
        effects: changeGutterRef.current.setBaseline.of(baseline),
      });
    }
    // v2.8.0 (Builder UX) — view 인스턴스 emit. 외부 (EditorOutline) 가
    // syntaxTree 접근 / scrollIntoView dispatch 에 사용. unmount 시 null 로
    // 해제하지 않으면 외부가 destroy 된 view 를 들고 있게 됨.
    onViewReadyRef.current?.(view);
    return (): void => {
      onViewReadyRef.current?.(null);
      view.destroy();
      viewRef.current = null;
      changeGutterRef.current = null;
    };
    // 마운트 시 한 번만 — content/editable/theme/lang 후속 변경은 별도 effect.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── content prop 외부 변경 시 doc 교체 ───────────────────────────
  useEffect(() => {
    const view = viewRef.current;
    if (view === null) return;
    const current = view.state.doc.toString();
    if (current === content) return;
    view.dispatch({
      changes: { from: 0, to: current.length, insert: content },
    });
  }, [content]);

  // ── editable / theme / language 토글 ────────────────────────────
  useEffect(() => {
    const view = viewRef.current;
    if (view === null) return;
    view.dispatch({
      effects: editableCompartment.current.reconfigure(buildEditableExtensions(editable)),
    });
  }, [editable]);

  useEffect(() => {
    const view = viewRef.current;
    if (view === null) return;
    view.dispatch({
      effects: themeCompartment.current.reconfigure(isDark ? [oneDark] : []),
    });
  }, [isDark]);

  useEffect(() => {
    const view = viewRef.current;
    if (view === null) return;
    view.dispatch({
      effects: langCompartment.current.reconfigure(langExt ?? []),
    });
  }, [langExt]);

  // ── baseline 외부 변경 시 setBaseline effect dispatch ──────────────
  // 호출자가 reload / 저장 후 새 disk content 를 baseline 으로 갱신할 때.
  // changeGutterRef 가 null (마운트 시 baseline undefined 였음) 이면 no-op.
  useEffect(() => {
    const view = viewRef.current;
    const cg = changeGutterRef.current;
    if (view === null || cg === null) return;
    if (baseline === undefined) return;
    view.dispatch({ effects: cg.setBaseline.of(baseline) });
  }, [baseline]);

  return (
    <div className="flex h-full flex-col" data-testid="code-editor">
      <div ref={hostRef} className="flex-1 overflow-hidden" data-testid="code-editor-host" />
      {truncated && (
        <div
          className="border-t border-border-primary bg-bg-secondary px-3 py-1.5 text-[11px] text-text-tertiary"
          data-testid="code-editor-truncated"
        >
          {t('preview.code.editor.truncated')}
        </div>
      )}
    </div>
  );
}

function buildEditableExtensions(editable: boolean): readonly [
  ReturnType<typeof EditorView.editable.of>,
  ReturnType<typeof EditorState.readOnly.of>,
] {
  return [EditorView.editable.of(editable), EditorState.readOnly.of(!editable)];
}
