/**
 * languageDetect — Phase 2 (v2.6.0) unit tests.
 *
 * 확장자 감지 + label 매핑이 fragile 한 부분이라 unit 으로 고정. CodeMirror
 * extension instance 자체는 검증하지 않음 (라이브러리 책임).
 */

import { describe, expect, it } from 'vitest';

import {
  detectLanguageExtension,
  detectLanguageLabel,
} from '../../src/renderer/components/code/languageDetect';

describe('detectLanguageExtension', () => {
  it.each([
    ['src/foo.ts', true],
    ['src/foo.tsx', true],
    ['src/foo.js', true],
    ['src/foo.jsx', true],
    ['src/foo.mjs', true],
    ['src/foo.json', true],
    ['src/foo.html', true],
    ['src/foo.css', true],
    ['src/foo.scss', true],
    ['README.md', true],
    ['notes.mdx', true],
    ['script.py', true],
  ])('returns extension for %s', (path, hasExt) => {
    const ext = detectLanguageExtension(path);
    expect(Boolean(ext)).toBe(hasExt);
  });

  it.each([['LICENSE', undefined], ['Dockerfile', undefined], ['data.csv', undefined]])(
    'returns undefined for unsupported %s',
    (path, expected) => {
      expect(detectLanguageExtension(path)).toBe(expected);
    }
  );

  it('is case-insensitive', () => {
    expect(detectLanguageExtension('foo.TS')).toBeDefined();
    expect(detectLanguageExtension('foo.JSON')).toBeDefined();
  });
});

describe('detectLanguageLabel', () => {
  it.each([
    ['foo.ts', 'TypeScript'],
    ['foo.tsx', 'TypeScript (TSX)'],
    ['foo.js', 'JavaScript'],
    ['foo.jsx', 'JavaScript (JSX)'],
    ['foo.json', 'JSON'],
    ['foo.html', 'HTML'],
    ['foo.css', 'CSS'],
    ['foo.md', 'Markdown'],
    ['foo.py', 'Python'],
  ])('%s → %s', (path, expected) => {
    expect(detectLanguageLabel(path)).toBe(expected);
  });

  it('returns "Plain" when no extension', () => {
    expect(detectLanguageLabel('LICENSE')).toBe('Plain');
  });

  it('returns uppercased extension for unknown ones', () => {
    expect(detectLanguageLabel('data.yml')).toBe('YML');
  });
});
