/**
 * Unit tests for `extractTurnText`.
 *
 * v0.7.0 (F-026 Chat Search) — verifies which ContentBlock variants are
 * indexed (text / mention / embedded_card.title) and which are skipped
 * (image / file / undefined / empty).
 */

import { describe, it, expect } from 'vitest';
import { extractTurnText } from '../../src/storage/turnText';
import type { ContentBlock } from '../../src/types';

describe('extractTurnText', () => {
  it('returns empty string for undefined', () => {
    expect(extractTurnText(undefined)).toBe('');
  });

  it('returns empty string for empty array', () => {
    expect(extractTurnText([])).toBe('');
  });

  it('joins multiple text blocks with single space', () => {
    const blocks: ContentBlock[] = [
      { type: 'text', text: 'hello' },
      { type: 'text', text: 'world' },
    ];
    expect(extractTurnText(blocks)).toBe('hello world');
  });

  it('returns single text content', () => {
    const blocks: ContentBlock[] = [{ type: 'text', text: 'just one block' }];
    expect(extractTurnText(blocks)).toBe('just one block');
  });

  it('skips image / file blocks', () => {
    const blocks: ContentBlock[] = [
      { type: 'text', text: 'before' },
      { type: 'image', mime: 'image/png', data: 'BASE64==' },
      {
        type: 'file',
        mime: 'application/pdf',
        uri: 'file:///tmp/doc.pdf',
        size_bytes: 1024,
        name: 'doc.pdf',
      },
      { type: 'text', text: 'after' },
    ];
    expect(extractTurnText(blocks)).toBe('before after');
  });

  it('uses mention.ref.display', () => {
    const blocks: ContentBlock[] = [
      { type: 'text', text: 'see' },
      { type: 'mention', ref: { kind: 'file', id: '123', display: 'README.md' } },
    ];
    expect(extractTurnText(blocks)).toBe('see README.md');
  });

  it('uses embedded_card.card.title', () => {
    const blocks: ContentBlock[] = [
      {
        type: 'embedded_card',
        card: { kind: 'web_preview', title: 'GitHub Page' },
      },
    ];
    expect(extractTurnText(blocks)).toBe('GitHub Page');
  });

  it('handles Korean text correctly', () => {
    const blocks: ContentBlock[] = [
      { type: 'text', text: '안녕하세요' },
      { type: 'text', text: '반갑습니다' },
    ];
    expect(extractTurnText(blocks)).toBe('안녕하세요 반갑습니다');
  });

  it('skips empty text blocks', () => {
    const blocks: ContentBlock[] = [
      { type: 'text', text: '' },
      { type: 'text', text: 'real' },
    ];
    expect(extractTurnText(blocks)).toBe('real');
  });

  it('returns empty string when only non-indexable blocks present', () => {
    const blocks: ContentBlock[] = [
      { type: 'image', mime: 'image/png', data: 'BASE64==' },
    ];
    expect(extractTurnText(blocks)).toBe('');
  });

  it('returns empty string for non-array input', () => {
    expect(extractTurnText(null as unknown as ContentBlock[])).toBe('');
  });
});
