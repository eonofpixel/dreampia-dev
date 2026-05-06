/**
 * Image input utility — DnD / paste / file input → ImageBlock (v1.5.3).
 *
 * Spec: docs/v1.x-roadmap.md (P5 v1.5.x Image/PDF — DnD/paste).
 *
 * Helpers:
 *  - filesFromDataTransfer(dt): DnD 의 File 만 (image/* + application/pdf).
 *  - filesFromClipboard(items): paste 의 File 만.
 *  - readFileAsBase64(file): base64 + meta.
 *  - validateImageFile(file): size / mime check (mediaConstants).
 */

import {
  IMAGE_MAX_BYTES,
  PDF_MIME_TYPE,
  PDF_MAX_BYTES,
  isImageMime,
  isPdfMime,
} from '../../types/mediaConstants';

export interface ReadFileResult {
  /** Base64 (data: URI 의 base64 영역만 — `data:mime;base64,` prefix 제외). */
  base64: string;
  mime: string;
  name: string;
  size_bytes: number;
}

export type FileValidationError =
  | { ok: false; reason: 'mime_unsupported'; mime: string }
  | { ok: false; reason: 'too_large'; size_bytes: number; limit: number };

export type FileValidation = { ok: true } | FileValidationError;

export function validateImageFile(file: File): FileValidation {
  if (!isImageMime(file.type) && !isPdfMime(file.type)) {
    return { ok: false, reason: 'mime_unsupported', mime: file.type };
  }
  const limit = isImageMime(file.type) ? IMAGE_MAX_BYTES : PDF_MAX_BYTES;
  if (file.size > limit) {
    return { ok: false, reason: 'too_large', size_bytes: file.size, limit };
  }
  return { ok: true };
}

/**
 * DataTransfer (drop event 의 dataTransfer) 에서 image/pdf File 들만 추출.
 */
export function filesFromDataTransfer(dt: DataTransfer): File[] {
  const out: File[] = [];
  // dt.files 우선, 없으면 dt.items.
  if (dt.files.length > 0) {
    for (let i = 0; i < dt.files.length; i += 1) {
      const f = dt.files.item(i);
      if (f === null) continue;
      if (isImageMime(f.type) || f.type === PDF_MIME_TYPE) out.push(f);
    }
    return out;
  }
  for (let i = 0; i < dt.items.length; i += 1) {
    const item = dt.items[i];
    if (item === undefined || item.kind !== 'file') continue;
    const f = item.getAsFile();
    if (f === null) continue;
    if (isImageMime(f.type) || f.type === PDF_MIME_TYPE) out.push(f);
  }
  return out;
}

/**
 * Clipboard items 에서 image File 추출 (paste 흐름). PDF 는 보통 paste 에
 * 안 들어옴.
 */
export function filesFromClipboard(items: DataTransferItemList): File[] {
  const out: File[] = [];
  for (let i = 0; i < items.length; i += 1) {
    const item = items[i];
    if (item === undefined || item.kind !== 'file') continue;
    if (!isImageMime(item.type)) continue;
    const f = item.getAsFile();
    if (f === null) continue;
    out.push(f);
  }
  return out;
}

/**
 * File → base64 (URI 형식의 base64 부분만 — `data:` prefix 제외).
 *
 * jsdom 환경에서도 작동하도록 FileReader fallback.
 */
export async function readFileAsBase64(file: File): Promise<ReadFileResult> {
  const buf = await fileToArrayBuffer(file);
  const bytes = new Uint8Array(buf);
  let binary = '';
  for (let i = 0; i < bytes.length; i += 1) {
    binary += String.fromCharCode(bytes[i] as number);
  }
  const base64 =
    typeof btoa === 'function'
      ? btoa(binary)
      : Buffer.from(binary, 'binary').toString('base64');
  return {
    base64,
    mime: file.type,
    name: file.name,
    size_bytes: file.size,
  };
}

function fileToArrayBuffer(file: File): Promise<ArrayBuffer> {
  if (typeof (file as { arrayBuffer?: () => Promise<ArrayBuffer> }).arrayBuffer === 'function') {
    return file.arrayBuffer();
  }
  if (typeof FileReader !== 'undefined') {
    return new Promise<ArrayBuffer>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (): void => {
        if (reader.result instanceof ArrayBuffer) resolve(reader.result);
        else reject(new Error('FileReader returned non-ArrayBuffer'));
      };
      reader.onerror = (): void => reject(reader.error ?? new Error('FileReader error'));
      reader.readAsArrayBuffer(file);
    });
  }
  return Promise.resolve(new ArrayBuffer(0));
}
