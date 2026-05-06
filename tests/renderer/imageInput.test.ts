/**
 * imageInput utility unit tests (v1.5.3).
 */

import { describe, it, expect } from 'vitest';
import {
  validateImageFile,
  readFileAsBase64,
} from '../../src/renderer/utils/imageInput';
import { IMAGE_MAX_BYTES, PDF_MAX_BYTES } from '../../src/types/mediaConstants';

function makeFile(name: string, mime: string, size: number): File {
  // jsdom File - 빈 string blob + 강제 size override 는 불가하므로 ArrayBuffer 사용.
  const buf = new Uint8Array(Math.max(size, 1));
  return new File([buf], name, { type: mime });
}

describe('v1.5.3 — imageInput', () => {
  it('validateImageFile — png 정상', () => {
    const f = makeFile('a.png', 'image/png', 1024);
    expect(validateImageFile(f).ok).toBe(true);
  });

  it('validateImageFile — bmp unsupported', () => {
    const f = makeFile('a.bmp', 'image/bmp', 1024);
    const r = validateImageFile(f);
    expect(r.ok).toBe(false);
    if (r.ok === false) expect(r.reason).toBe('mime_unsupported');
  });

  it('validateImageFile — image too large', () => {
    const f = makeFile('big.png', 'image/png', IMAGE_MAX_BYTES + 1);
    const r = validateImageFile(f);
    expect(r.ok).toBe(false);
    if (r.ok === false && r.reason === 'too_large') {
      expect(r.limit).toBe(IMAGE_MAX_BYTES);
    }
  });

  it('validateImageFile — pdf 정상', () => {
    const f = makeFile('a.pdf', 'application/pdf', 1024);
    expect(validateImageFile(f).ok).toBe(true);
  });

  it('validateImageFile — pdf too large', () => {
    const f = makeFile('big.pdf', 'application/pdf', PDF_MAX_BYTES + 1);
    const r = validateImageFile(f);
    expect(r.ok).toBe(false);
    if (r.ok === false && r.reason === 'too_large') {
      expect(r.limit).toBe(PDF_MAX_BYTES);
    }
  });

  it('readFileAsBase64 — bytes → base64', async () => {
    // 'hi' 의 base64 = 'aGk='.
    const buf = new Uint8Array([0x68, 0x69]); // 'h', 'i'
    const f = new File([buf], 'x.png', { type: 'image/png' });
    const r = await readFileAsBase64(f);
    expect(r.base64).toBe('aGk=');
    expect(r.mime).toBe('image/png');
    expect(r.name).toBe('x.png');
    expect(r.size_bytes).toBe(2);
  });
});
