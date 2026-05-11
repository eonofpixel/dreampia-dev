/**
 * EditorOutline — 통합 동작 + extractOutline 알고리즘 검증.
 *
 * v2.8.0 (Builder UX) — outline 패널.
 *
 * extractOutline 은 EditorView 가 필요해 실제 jsdom CodeMirror 마운트로
 * 검증. 단순 JS 코드 1개로 핵심 노드 (FunctionDeclaration / ClassDeclaration
 * / MethodDeclaration) 추출 정상성 확인.
 */

import { javascript } from '@codemirror/lang-javascript';
import { EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

import { EditorOutline, extractOutline } from '../../src/renderer/components/code/EditorOutline';

function makeView(source: string): EditorView {
  const state = EditorState.create({
    doc: source,
    extensions: [javascript({ typescript: true })],
  });
  // host 미연결 view 도 state.field/syntaxTree 접근은 정상 동작.
  const host = document.createElement('div');
  document.body.appendChild(host);
  return new EditorView({ state, parent: host });
}

describe('EditorOutline', () => {
  describe('extractOutline (pure)', () => {
    it('빈 소스 → 빈 결과', () => {
      const view = makeView('');
      try {
        expect(extractOutline(view)).toEqual([]);
      } finally {
        view.destroy();
      }
    });

    it('top-level function 1개 추출', () => {
      const view = makeView('function hello() { return 1; }\n');
      try {
        const out = extractOutline(view);
        expect(out).toHaveLength(1);
        expect(out[0]?.kind).toBe('FunctionDeclaration');
        expect(out[0]?.depth).toBe(0);
        expect(out[0]?.label).toContain('hello');
      } finally {
        view.destroy();
      }
    });

    it('class + method 가 nested depth 로 추출', () => {
      const source = 'class Foo {\n  bar() { return 1; }\n}\n';
      const view = makeView(source);
      try {
        const out = extractOutline(view);
        // ClassDeclaration top-level + MethodDeclaration nested
        const cls = out.find((e) => e.kind === 'ClassDeclaration');
        const method = out.find((e) => e.kind === 'MethodDeclaration');
        expect(cls).toBeDefined();
        expect(method).toBeDefined();
        expect(cls?.depth).toBe(0);
        expect(method?.depth).toBeGreaterThan(0);
      } finally {
        view.destroy();
      }
    });

    it('label 이 60자 cap', () => {
      const longName = 'x'.repeat(80);
      const view = makeView(`function ${longName}() {}\n`);
      try {
        const out = extractOutline(view);
        expect(out[0]?.label.length).toBeLessThanOrEqual(60);
        expect(out[0]?.label.endsWith('…')).toBe(true);
      } finally {
        view.destroy();
      }
    });
  });

  describe('component', () => {
    it('view=null → no_view 안내', () => {
      render(<EditorOutline view={null} />);
      expect(screen.getByTestId('code-outline-no-view')).toBeInTheDocument();
    });

    it('view 있으면 outline 마운트 + count 표시', () => {
      const view = makeView('function a() {}\n');
      try {
        render(<EditorOutline view={view} />);
        expect(screen.getByTestId('code-outline')).toBeInTheDocument();
        expect(screen.getByTestId('code-outline-count').textContent).toBe('1');
        expect(screen.getByTestId('code-outline-row-0')).toBeInTheDocument();
      } finally {
        view.destroy();
      }
    });

    it('row 클릭이 view.dispatch 호출', () => {
      const view = makeView('function a() {}\n\nfunction b() {}\n');
      const dispatchSpy = vi.spyOn(view, 'dispatch');
      const focusSpy = vi.spyOn(view, 'focus').mockImplementation(() => {});
      try {
        render(<EditorOutline view={view} />);
        const row = screen.getByTestId('code-outline-row-1');
        row.click();
        expect(dispatchSpy).toHaveBeenCalled();
        expect(focusSpy).toHaveBeenCalled();
      } finally {
        view.destroy();
      }
    });

    it('view 가 null 로 reset 되면 entries 비워짐', () => {
      const view = makeView('function a() {}\n');
      try {
        const { rerender } = render(<EditorOutline view={view} />);
        expect(screen.getByTestId('code-outline-row-0')).toBeInTheDocument();
        rerender(<EditorOutline view={null} />);
        expect(screen.getByTestId('code-outline-no-view')).toBeInTheDocument();
        expect(screen.queryByTestId('code-outline-list')).not.toBeInTheDocument();
      } finally {
        view.destroy();
      }
    });
  });
});
