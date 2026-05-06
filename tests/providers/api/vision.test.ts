/**
 * Vision routing unit tests (v1.5.6).
 */

import { describe, it, expect } from 'vitest';
import {
  toAnthropicImageBlock,
  toOpenAIImageBlock,
  toCliImagePlaceholder,
} from '../../../src/providers/api/vision';

describe('v1.5.6 — vision routing', () => {
  it('Anthropic — base64 source 형식', () => {
    const block = toAnthropicImageBlock({ base64: 'ABC', mime: 'image/png' });
    expect(block.type).toBe('image');
    expect(block.source.type).toBe('base64');
    expect(block.source.media_type).toBe('image/png');
    expect(block.source.data).toBe('ABC');
  });

  it('OpenAI — data: URI 형식', () => {
    const block = toOpenAIImageBlock({ base64: 'XYZ', mime: 'image/jpeg' });
    expect(block.type).toBe('image_url');
    expect(block.image_url.url).toBe('data:image/jpeg;base64,XYZ');
  });

  it('CLI placeholder', () => {
    const text = toCliImagePlaceholder({ base64: 'AAAA', mime: 'image/png' });
    expect(text).toContain('image/png');
    expect(text).toContain('4 chars base64');
  });
});
