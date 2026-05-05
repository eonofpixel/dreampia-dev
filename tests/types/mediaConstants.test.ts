/**
 * mediaConstants unit tests (v1.2.0).
 */

import { describe, it, expect } from 'vitest';
import {
  IMAGE_MAX_BYTES,
  IMAGE_MAX_PER_TURN,
  PDF_MAX_BYTES,
  PDF_MAX_PER_TURN,
  PDF_MIME_TYPE,
  TURN_MEDIA_TOTAL_MAX_BYTES,
  checkAttachment,
  checkTurnAttachments,
  isImageMime,
  isPdfMime,
} from '../../src/types/mediaConstants';

describe('v1.2.0 — mediaConstants helpers', () => {
  it('isImageMime / isPdfMime', () => {
    expect(isImageMime('image/png')).toBe(true);
    expect(isImageMime('image/jpeg')).toBe(true);
    expect(isImageMime('image/webp')).toBe(true);
    expect(isImageMime('image/gif')).toBe(true);
    expect(isImageMime('image/bmp')).toBe(false);
    expect(isImageMime('text/plain')).toBe(false);
    expect(isPdfMime(PDF_MIME_TYPE)).toBe(true);
    expect(isPdfMime('image/png')).toBe(false);
  });

  it('checkAttachment — 정상 image', () => {
    expect(checkAttachment('image/png', 1024).ok).toBe(true);
  });

  it('checkAttachment — image 너무 큰 경우 too_large', () => {
    expect(checkAttachment('image/png', IMAGE_MAX_BYTES + 1).reason).toBe('too_large');
  });

  it('checkAttachment — pdf 정상 / 큰 경우', () => {
    expect(checkAttachment(PDF_MIME_TYPE, 1024).ok).toBe(true);
    expect(checkAttachment(PDF_MIME_TYPE, PDF_MAX_BYTES + 1).reason).toBe('too_large');
  });

  it('checkAttachment — 알 수 없는 mime → mime_unsupported', () => {
    expect(checkAttachment('video/mp4', 100).reason).toBe('mime_unsupported');
  });

  it('checkTurnAttachments — 0개 → ok', () => {
    expect(checkTurnAttachments([]).ok).toBe(true);
  });

  it('checkTurnAttachments — image 너무 많이', () => {
    const attachments = Array.from({ length: IMAGE_MAX_PER_TURN + 1 }, () => ({
      mime: 'image/png',
      size_bytes: 100,
    }));
    expect(checkTurnAttachments(attachments).reason).toBe('too_many_per_turn');
  });

  it('checkTurnAttachments — pdf 너무 많이', () => {
    const attachments = Array.from({ length: PDF_MAX_PER_TURN + 1 }, () => ({
      mime: PDF_MIME_TYPE,
      size_bytes: 100,
    }));
    expect(checkTurnAttachments(attachments).reason).toBe('too_many_per_turn');
  });

  it('checkTurnAttachments — 합계 exceeded → turn_total_exceeded', () => {
    // 6 PDFs * 9MB = 54MB > 50MB. (PDF_MAX_PER_TURN=4 이라 too_many 가 먼저
    // 라 PDF 4개 + image 다수로 합계만 초과.) image 8개 * 8MB = 64MB > 50MB
    // 이고 IMAGE_MAX_PER_TURN=8 그대로.
    const attachments = Array.from({ length: 8 }, () => ({
      mime: 'image/png',
      size_bytes: 8 * 1024 * 1024,
    }));
    expect(checkTurnAttachments(attachments).reason).toBe('turn_total_exceeded');
  });
});
