/**
 * FileReferenceChip — v0.13.0 (J) typed file mention chip.
 *
 * 검증:
 *   1. path / line count / truncated 표시 (collapsed)
 *   2. truncated=false 면 truncated badge X
 *   3. 클릭하면 snippet 영역이 펼쳐짐
 *   4. 다시 클릭하면 접힘
 *   5. inverse=true 면 user-turn 색상 모드 (basic smoke — 클래스 적용)
 */

import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { FileReferenceChip } from '../../src/renderer/components/chat/FileReferenceChip';

describe('FileReferenceChip', () => {
  it('renders path and line count by default (collapsed)', () => {
    render(
      <FileReferenceChip
        path="src/index.ts"
        snippet="export const x = 1;"
        lineCount={1}
        truncated={false}
      />
    );
    expect(screen.getByTestId('file-reference-chip')).toBeInTheDocument();
    expect(screen.getByTestId('file-reference-chip')).toHaveAttribute(
      'data-path',
      'src/index.ts'
    );
    expect(screen.getByText('src/index.ts')).toBeInTheDocument();
    // collapsed 상태에선 snippet 영역 X.
    expect(screen.queryByTestId('file-reference-snippet')).toBeNull();
  });

  it('does NOT show truncated badge when truncated=false', () => {
    render(
      <FileReferenceChip
        path="a.ts"
        snippet="x"
        lineCount={1}
        truncated={false}
      />
    );
    expect(screen.queryByTestId('file-reference-truncated')).toBeNull();
  });

  it('shows truncated badge when truncated=true', () => {
    render(
      <FileReferenceChip
        path="big.ts"
        snippet={'x'.repeat(10)}
        lineCount={9999}
        truncated={true}
      />
    );
    expect(screen.getByTestId('file-reference-truncated')).toBeInTheDocument();
  });

  it('expands snippet on header click and collapses on second click', () => {
    render(
      <FileReferenceChip
        path="a.ts"
        snippet="hello\nworld"
        lineCount={2}
        truncated={false}
      />
    );
    const header = screen.getByRole('button', { name: /파일 참조/ });
    fireEvent.click(header);
    const snippetEl = screen.getByTestId('file-reference-snippet');
    expect(snippetEl).toBeInTheDocument();
    expect(snippetEl.textContent).toContain('hello');
    expect(snippetEl.textContent).toContain('world');
    fireEvent.click(header);
    expect(screen.queryByTestId('file-reference-snippet')).toBeNull();
  });

  it('inverse mode applies different visual style (smoke)', () => {
    render(
      <FileReferenceChip
        path="a.ts"
        snippet="x"
        lineCount={1}
        truncated={false}
        inverse={true}
      />
    );
    // inverse=true → 'bg-white/15' 가 포함된 컨테이너.
    const chip = screen.getByTestId('file-reference-chip');
    expect(chip.className).toContain('bg-white/15');
  });

  it('passes language as data attribute when expanded', () => {
    render(
      <FileReferenceChip
        path="a.py"
        snippet="print(1)"
        lineCount={1}
        truncated={false}
        language="py"
      />
    );
    fireEvent.click(screen.getByRole('button', { name: /파일 참조/ }));
    const snippetEl = screen.getByTestId('file-reference-snippet');
    expect(snippetEl).toHaveAttribute('data-language', 'py');
  });
});
