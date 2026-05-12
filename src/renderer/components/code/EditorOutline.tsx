/**
 * EditorOutline — 우측 outline 패널.
 *
 * v2.8.0 (Builder UX) — CodeMirror 의 lezer syntaxTree 를 walk 해 함수/
 * 클래스/메서드/마크다운 헤딩을 list 로 노출. 클릭 시 view.dispatch 로
 * 해당 위치 scroll + cursor 이동.
 *
 * MVP 한계 (BUILDER_UX_ANALYSIS.md #H):
 *   - JS/TS + Markdown 만. 그 외 언어는 빈 결과
 *   - 심볼 이름은 노드 첫 줄 trim 후 max 60자 — lezer 의 child selector 로
 *     이름만 정확히 추출하면 더 깔끔하지만 grammar 마다 다른 selector 라
 *     v0 에선 line preview 로 통일
 *   - depth 는 ancestor count 단순 추적 — nested 함수 / 클래스 들여쓰기 OK
 */

import { syntaxTree } from '@codemirror/language';
import type { EditorView } from '@codemirror/view';
import { ListTree } from 'lucide-react';
import { useEffect, useState } from 'react';

import { useT } from '../../i18n';

interface OutlineEntry {
  /** doc 안에서의 시작 offset. view.dispatch 의 selection anchor 로 사용. */
  from: number;
  /** 사람이 읽는 라벨 — 라인 텍스트 trim + 60자 cap. */
  label: string;
  /** lezer 노드 이름 — 아이콘 결정 / debug. */
  kind: string;
  /** ancestor depth — 0 = top-level. UI 들여쓰기. */
  depth: number;
}

/**
 * lezer 노드 이름 화이트리스트. 언어별로 grammar 가 다른 노드 이름을
 * 노출 — 모두 모아 한 set 에. 미스 매칭은 outline 누락이지 깨짐 X.
 */
const SYMBOL_NODE_NAMES = new Set([
  // JS/TS — @lezer/javascript 의 노드 이름
  'FunctionDeclaration',
  'ClassDeclaration',
  'MethodDeclaration',
  'InterfaceDeclaration',
  'TypeAliasDeclaration',
  'EnumDeclaration',
  'PropertyDeclaration',
  // Markdown — @lezer/markdown
  'ATXHeading1',
  'ATXHeading2',
  'ATXHeading3',
  'ATXHeading4',
  'ATXHeading5',
  'ATXHeading6',
  'SetextHeading1',
  'SetextHeading2',
  // Python — @lezer/python (best-effort, 패키지가 있으면 잡힘)
  'FunctionDefinition',
  'ClassDefinition',
]);

const MAX_LABEL = 60;

/**
 * Pure helper — view state 에서 outline entries 추출. 테스트 용이성 위해
 * 컴포넌트 밖. EditorView 의 state.field(...) 가 아닌 syntaxTree(state) 로
 * 접근 — Lang 별 syntax extension 이 mount 돼 있어야 의미 있음.
 */
export function extractOutline(view: EditorView): ReadonlyArray<OutlineEntry> {
  const state = view.state;
  const tree = syntaxTree(state);
  const doc = state.doc;
  const out: OutlineEntry[] = [];

  // ancestor stack — exit 콜백이 마지막 hit 노드 pop. depth 는 stack 길이.
  const stack: number[] = []; // 각 entry 는 hit 노드의 to 위치

  tree.iterate({
    enter(node) {
      // 현재 stack 에서 자기보다 from 이 작거나 같지만 to 가 끝난 항목 pop.
      // (iterate 는 enter 순서가 doc 진행 순서라 단순 비교 가능.)
      while (stack.length > 0 && stack[stack.length - 1]! <= node.from) {
        stack.pop();
      }
      if (!SYMBOL_NODE_NAMES.has(node.name)) return;
      const line = doc.lineAt(node.from);
      const raw = line.text.trim();
      const label = raw.length > MAX_LABEL ? raw.slice(0, MAX_LABEL - 1) + '…' : raw;
      out.push({
        from: node.from,
        label,
        kind: node.name,
        depth: stack.length,
      });
      stack.push(node.to);
    },
  });

  return out;
}

export interface EditorOutlineProps {
  /** CodeEditor 가 onViewReady 로 emit 한 view. null 이면 안내 표시. */
  view: EditorView | null;
}

export function EditorOutline({ view }: EditorOutlineProps): React.JSX.Element {
  const t = useT();
  const [entries, setEntries] = useState<ReadonlyArray<OutlineEntry>>([]);

  useEffect(() => {
    if (view === null) {
      setEntries([]);
      return;
    }
    // 마운트 시 1회 + 500ms 폴링.
    //
    // 정공법은 EditorView.updateListener.of(...) 인데 그 Extension 은 view
    // 생성 시점에만 등록 가능. 마운트 후 동적 추가는 StateEffect.appendConfig
    // 로 가능하지만 detach 안 돼 EditorOutline unmount 후에도 listener 잔존.
    // 폴링이 잠깐 stale 일 뿐 detach 안전 + 비용 무시 가능 (extractOutline
    // 은 typical 파일에서 < 1ms).
    const recompute = (): void => {
      setEntries(extractOutline(view));
    };
    recompute();
    const handle = window.setInterval(recompute, 500);
    return (): void => {
      window.clearInterval(handle);
    };
  }, [view]);

  const handleJump = (entry: OutlineEntry): void => {
    if (view === null) return;
    view.dispatch({
      selection: { anchor: entry.from },
      effects: [],
      scrollIntoView: true,
    });
    view.focus();
  };

  return (
    <aside
      className="flex w-[220px] flex-col border-l border-hairline bg-canvas-soft"
      aria-label={t('preview.code.outline.aria')}
      data-testid="code-outline"
    >
      <header className="flex items-center gap-1.5 border-b border-hairline px-3 py-1.5 text-[11px] uppercase tracking-wide text-text-tertiary">
        <ListTree aria-hidden="true" className="h-3 w-3" />
        <span>{t('preview.code.outline.title')}</span>
        <span
          className="ml-auto text-[10px] normal-case tracking-normal text-text-tertiary"
          data-testid="code-outline-count"
        >
          {entries.length}
        </span>
      </header>
      <div className="flex-1 overflow-y-auto py-1">
        {view === null ? (
          <p
            className="px-3 py-4 text-center text-[11px] text-text-tertiary"
            data-testid="code-outline-no-view"
          >
            {t('preview.code.outline.no_view')}
          </p>
        ) : entries.length === 0 ? (
          <p
            className="px-3 py-4 text-center text-[11px] text-text-tertiary"
            data-testid="code-outline-empty"
          >
            {t('preview.code.outline.empty')}
          </p>
        ) : (
          <ul data-testid="code-outline-list">
            {entries.map((entry, idx) => (
              <li key={`${entry.from}:${idx}`}>
                <button
                  type="button"
                  onClick={() => handleJump(entry)}
                  className="flex w-full items-baseline gap-1.5 px-3 py-1 text-left text-[11px] hover:bg-surface-strong"
                  data-testid={`code-outline-row-${idx}`}
                  data-outline-kind={entry.kind}
                  style={{ paddingLeft: `${12 + entry.depth * 10}px` }}
                >
                  <span className="truncate font-mono text-text-primary">{entry.label}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </aside>
  );
}
