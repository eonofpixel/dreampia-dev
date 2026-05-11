/**
 * changeGutter — CodeMirror 라인 단위 변경 마크 gutter.
 *
 * v2.8.0 (Builder UX) — 편집 모드에서 disk content (baseline) 대비 현재
 * 라인이 다르면 좌측 gutter 에 색 마크. baseline 보다 라인이 늘어났으면
 * "added" (녹색), 같은 인덱스에서 텍스트가 다르면 "modified" (파랑).
 *
 * 디자인 결정:
 *   - LCS / Myers diff 까지는 안 함. 라인 인덱스 단순 비교 — 한 줄 삽입
 *     으로 모든 후속 라인이 modified 로 보일 수 있다. v0 우선 land 후
 *     사용자 피드백으로 정교화 여부 결정 (BUILDER_UX_ANALYSIS.md #E).
 *   - "deleted" 는 현재 라인 위에 인디케이터로 표시할 수 없는 구조 (line
 *     자체가 없으므로 marker range 가 없음). MVP 에선 미표시. 사용자가
 *     diff 토글 (Mod+E 후 Diff 버튼) 로 정확한 비교 가능.
 *   - baseline 이 비어 있으면 (e.g. 새 파일) 모든 라인이 added 로 표시.
 *   - 컬러: oneDark 테마 가독성 우선 — modified 파랑 (#3b82f6),
 *     added 녹색 (#22c55e). 폭 3px (line-numbers 와 텍스트 사이).
 *
 * 사용:
 *   ```ts
 *   const ext = changeGutter();
 *   // mount: extensions: [..., ext.extension]
 *   // baseline 갱신: view.dispatch({ effects: ext.setBaseline.of('disk content') });
 *   ```
 */

import { RangeSet, StateEffect, StateField } from '@codemirror/state';
import type { Extension } from '@codemirror/state';
import { EditorView, gutter, GutterMarker } from '@codemirror/view';

const setBaselineEffect = StateEffect.define<string>();

const baselineField = StateField.define<string>({
  create: () => '',
  update(value, tr) {
    for (const eff of tr.effects) {
      if (eff.is(setBaselineEffect)) return eff.value;
    }
    return value;
  },
});

class ChangeMarker extends GutterMarker {
  constructor(private readonly kind: 'modified' | 'added') {
    super();
  }
  override eq(other: GutterMarker): boolean {
    return other instanceof ChangeMarker && other.kind === this.kind;
  }
  override toDOM(): Node {
    const span = document.createElement('span');
    span.dataset.changeKind = this.kind;
    span.style.display = 'inline-block';
    span.style.width = '3px';
    span.style.height = '100%';
    span.style.background = this.kind === 'added' ? '#22c55e' : '#3b82f6';
    return span;
  }
}

const modifiedMarker = new ChangeMarker('modified');
const addedMarker = new ChangeMarker('added');

/**
 * Pure helper — baseline / current 두 텍스트를 라인 단위 비교.
 * 테스트가 view 없이도 markers logic 을 검증할 수 있도록 분리.
 *
 * trailing-newline 정규화: 단일 trailing `\n` 만 제거 후 split. 'a\n' 과
 * 'a' 를 같은 라인 모델로 보고, 사용자가 의도하지 않은 trailing 빈 라인
 * 마크 false-positive 를 방지.
 *
 * @returns 0-based 라인 인덱스 → kind 매핑. kind 가 없는 라인은 unchanged.
 */
function splitLines(text: string): string[] {
  const stripped = text.endsWith('\n') ? text.slice(0, -1) : text;
  return stripped.split('\n');
}

export function diffLines(
  baseline: string,
  current: string
): ReadonlyArray<{ lineIndex: number; kind: 'added' | 'modified' }> {
  const baselineLines = splitLines(baseline);
  const currentLines = splitLines(current);
  const out: Array<{ lineIndex: number; kind: 'added' | 'modified' }> = [];
  for (let i = 0; i < currentLines.length; i++) {
    const baselineLine = i < baselineLines.length ? baselineLines[i] : undefined;
    if (baselineLine === undefined) {
      out.push({ lineIndex: i, kind: 'added' });
    } else if (baselineLine !== currentLines[i]) {
      out.push({ lineIndex: i, kind: 'modified' });
    }
  }
  return out;
}

export interface ChangeGutter {
  /** mount 시 extensions 배열에 spread. */
  readonly extension: Extension;
  /** baseline 변경 시 view.dispatch({ effects: [setBaseline.of(text)] }). */
  readonly setBaseline: typeof setBaselineEffect;
}

export function changeGutter(): ChangeGutter {
  const ext: Extension = [
    baselineField,
    gutter({
      class: 'cm-change-gutter',
      markers: (view: EditorView) => {
        const baseline = view.state.field(baselineField);
        const doc = view.state.doc;
        const current = doc.toString();
        if (baseline === current) return RangeSet.empty;
        const diffs = diffLines(baseline, current);
        const ranges = diffs.map((d) => {
          const line = doc.line(d.lineIndex + 1);
          const marker = d.kind === 'added' ? addedMarker : modifiedMarker;
          return marker.range(line.from);
        });
        return RangeSet.of(ranges, true);
      },
    }),
  ];
  return { extension: ext, setBaseline: setBaselineEffect };
}
