/**
 * mediaConstants — Image/PDF 첨부 정책 상수 (v1.2.0).
 *
 * Spec: docs/v1.x-roadmap.md (P2 v1.2.x Image/PDF), v1.0.1 revert 의 부활.
 *
 * 정책 (Codex 권고):
 *  - Image: PNG / JPEG / WebP / GIF (animated 포함). max 10 MB.
 *  - PDF: max 20 MB. 텍스트 추출 + 미리보기 (이미지 변환은 후속).
 *  - 영속화 위치: `~/.dreampia/media/<sha256>/<filename>` (LRU).
 *  - 단일 turn 합계 max 50 MB (image + pdf).
 *
 * 본 commit 은 상수 + helper 만 — DnD / 영속 / 업로드는 v1.2.1 이후.
 */

/** Image MIME types — Anthropic / OpenAI vision 모두 지원. */
export const IMAGE_MIME_TYPES: ReadonlyArray<string> = [
  'image/png',
  'image/jpeg',
  'image/webp',
  'image/gif',
] as const;

/** PDF MIME type. */
export const PDF_MIME_TYPE = 'application/pdf' as const;

/** Image 파일 단일 max size (bytes). 10 MB. */
export const IMAGE_MAX_BYTES = 10 * 1024 * 1024;

/** PDF 파일 단일 max size (bytes). 20 MB. */
export const PDF_MAX_BYTES = 20 * 1024 * 1024;

/** Turn 의 모든 media 첨부 합계 max (bytes). 50 MB. */
export const TURN_MEDIA_TOTAL_MAX_BYTES = 50 * 1024 * 1024;

/** Image 파일 한 turn 의 max 개수. */
export const IMAGE_MAX_PER_TURN = 8;

/** PDF 파일 한 turn 의 max 개수. */
export const PDF_MAX_PER_TURN = 4;

export type MediaKind = 'image' | 'pdf';

export interface MediaSizeCheck {
  ok: boolean;
  reason?: 'mime_unsupported' | 'too_large' | 'too_many_per_turn' | 'turn_total_exceeded';
}

/** MIME 이 image kind 인지. */
export function isImageMime(mime: string): boolean {
  return IMAGE_MIME_TYPES.includes(mime);
}

/** MIME 이 pdf kind 인지. */
export function isPdfMime(mime: string): boolean {
  return mime === PDF_MIME_TYPE;
}

/** Single attachment 의 검증 — kind + size. */
export function checkAttachment(mime: string, sizeBytes: number): MediaSizeCheck {
  if (isImageMime(mime)) {
    if (sizeBytes > IMAGE_MAX_BYTES) return { ok: false, reason: 'too_large' };
    return { ok: true };
  }
  if (isPdfMime(mime)) {
    if (sizeBytes > PDF_MAX_BYTES) return { ok: false, reason: 'too_large' };
    return { ok: true };
  }
  return { ok: false, reason: 'mime_unsupported' };
}

/** Turn 단위 통계 검증 — 합계 / per-kind count. */
export function checkTurnAttachments(
  attachments: ReadonlyArray<{ mime: string; size_bytes: number }>
): MediaSizeCheck {
  let totalBytes = 0;
  let imageCount = 0;
  let pdfCount = 0;
  for (const a of attachments) {
    totalBytes += a.size_bytes;
    if (isImageMime(a.mime)) imageCount += 1;
    else if (isPdfMime(a.mime)) pdfCount += 1;
  }
  if (totalBytes > TURN_MEDIA_TOTAL_MAX_BYTES) {
    return { ok: false, reason: 'turn_total_exceeded' };
  }
  if (imageCount > IMAGE_MAX_PER_TURN || pdfCount > PDF_MAX_PER_TURN) {
    return { ok: false, reason: 'too_many_per_turn' };
  }
  return { ok: true };
}
