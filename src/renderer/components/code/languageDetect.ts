/**
 * languageDetect — extension → CodeMirror language extension.
 *
 * Phase 2 (v2.6.0) — Codex 의 file-open preview 호환. 확장자 감지 후
 * 매칭되는 CodeMirror lang extension 을 반환. 미매칭 시 plain text
 * (extension 미적용) — 사용자에게 'language not supported' 노이즈 X.
 *
 * Decision doc: ../../../../CODE_TAB_DECISION.md (CodeMirror 6 채택).
 */

import { css } from '@codemirror/lang-css';
import { html } from '@codemirror/lang-html';
import { javascript } from '@codemirror/lang-javascript';
import { json } from '@codemirror/lang-json';
import { markdown } from '@codemirror/lang-markdown';
import { python } from '@codemirror/lang-python';
import type { Extension } from '@codemirror/state';

const EXT_TO_LANG: Record<string, () => Extension> = {
  ts: () => javascript({ typescript: true, jsx: false }),
  tsx: () => javascript({ typescript: true, jsx: true }),
  js: () => javascript({ jsx: false }),
  jsx: () => javascript({ jsx: true }),
  mjs: () => javascript(),
  cjs: () => javascript(),
  json: () => json(),
  jsonc: () => json(),
  html: () => html(),
  htm: () => html(),
  css: () => css(),
  scss: () => css(),
  md: () => markdown(),
  mdx: () => markdown(),
  py: () => python(),
};

/**
 * 확장자로부터 CodeMirror language extension 을 반환. 매칭되지 않으면
 * undefined — 호출자는 syntax highlight 없이 plain text 로 렌더한다.
 */
export function detectLanguageExtension(relPath: string): Extension | undefined {
  const lastDot = relPath.lastIndexOf('.');
  if (lastDot < 0) return undefined;
  const ext = relPath.slice(lastDot + 1).toLowerCase();
  const factory = EXT_TO_LANG[ext];
  return factory === undefined ? undefined : factory();
}

/**
 * 단순 라벨 — UI 에서 "TypeScript" 같이 표시.
 */
export function detectLanguageLabel(relPath: string): string {
  const lastDot = relPath.lastIndexOf('.');
  if (lastDot < 0) return 'Plain';
  const ext = relPath.slice(lastDot + 1).toLowerCase();
  const labels: Record<string, string> = {
    ts: 'TypeScript',
    tsx: 'TypeScript (TSX)',
    js: 'JavaScript',
    jsx: 'JavaScript (JSX)',
    mjs: 'JavaScript',
    cjs: 'JavaScript',
    json: 'JSON',
    jsonc: 'JSON (with comments)',
    html: 'HTML',
    htm: 'HTML',
    css: 'CSS',
    scss: 'SCSS',
    md: 'Markdown',
    mdx: 'Markdown (MDX)',
    py: 'Python',
  };
  return labels[ext] ?? ext.toUpperCase();
}
