/**
 * changeGutter — diffLines pure helper 단위 테스트.
 *
 * v2.8.0 (Builder UX) — 라인 단위 변경 마크 gutter. CodeMirror view 자체는
 * jsdom 에서 layout 이 flaky 하므로 helper 의 비교 로직만 검증.
 */

import { describe, it, expect } from 'vitest';

import { diffLines } from '../../src/renderer/components/code/changeGutter';

describe('changeGutter / diffLines', () => {
  it('동일 텍스트 → 빈 결과', () => {
    expect(diffLines('a\nb\nc', 'a\nb\nc')).toEqual([]);
  });

  it('빈 baseline → 모든 라인이 added', () => {
    const result = diffLines('', 'x\ny');
    // 빈 string.split('\n') 는 [''] 한 라인 → 'x' 가 modified, 'y' 가 added
    expect(result).toEqual([
      { lineIndex: 0, kind: 'modified' },
      { lineIndex: 1, kind: 'added' },
    ]);
  });

  it('baseline 보다 라인이 늘어나면 added 로 표시', () => {
    const result = diffLines('a\nb', 'a\nb\nc\nd');
    expect(result).toEqual([
      { lineIndex: 2, kind: 'added' },
      { lineIndex: 3, kind: 'added' },
    ]);
  });

  it('같은 인덱스에서 텍스트만 다르면 modified', () => {
    const result = diffLines('a\nb\nc', 'a\nB\nc');
    expect(result).toEqual([{ lineIndex: 1, kind: 'modified' }]);
  });

  it('단일 라인 수정 + 라인 추가 mix', () => {
    const result = diffLines('a\nb', 'a\nB\nc');
    expect(result).toEqual([
      { lineIndex: 1, kind: 'modified' },
      { lineIndex: 2, kind: 'added' },
    ]);
  });

  it('current 가 baseline 보다 짧으면 (라인 삭제) → 결과 없음 (MVP 한계)', () => {
    // MVP 결정: deleted 는 라인 자체가 없어 marker range 가 없음. diff 토글
    // 로 정확한 비교. 본 테스트는 의도적 한계 검증.
    const result = diffLines('a\nb\nc\nd', 'a\nb');
    expect(result).toEqual([]);
  });

  it('한 줄 삽입 후 후속 라인이 modified 로 보이는 v0 한계 검증', () => {
    // baseline: a, b, c, d
    // current:  a, NEW, b, c, d  → b/c/d 가 인덱스 shift 로 modified, NEW 는
    // 마지막에 added 로 보임. LCS diff 가 아니라 라인 인덱스 단순 비교라
    // 발생하는 의도적 한계 (BUILDER_UX_ANALYSIS.md #E v0).
    const result = diffLines('a\nb\nc\nd', 'a\nNEW\nb\nc\nd');
    expect(result).toEqual([
      { lineIndex: 1, kind: 'modified' }, // 'NEW' vs 'b'
      { lineIndex: 2, kind: 'modified' }, // 'b' vs 'c'
      { lineIndex: 3, kind: 'modified' }, // 'c' vs 'd'
      { lineIndex: 4, kind: 'added' }, // 'd' 는 baseline 에 없음
    ]);
  });

  it('trailing newline 정규화: 단일 \\n 만 strip 후 비교 (false-positive 방지)', () => {
    // 'a\n' → ['a'], 'a\nb\n' → ['a', 'b'] — 사용자가 b 라인을 추가한 것.
    // 정규화 없이 split 하면 baseline[1]='', current[1]='b' 로 modified +
    // added 가 동시에 떠 false-positive. 정규화 후엔 깔끔히 added 1개.
    const result = diffLines('a\n', 'a\nb\n');
    expect(result).toEqual([{ lineIndex: 1, kind: 'added' }]);
  });

  it('baseline 과 current 모두 빈 string → 빈 결과', () => {
    expect(diffLines('', '')).toEqual([]);
  });
});
