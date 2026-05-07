/**
 * PDF text extraction utility (v1.5.4).
 *
 * Spec: docs/v1.x-roadmap.md (P5 v1.5.x Image/PDF — text 추출).
 *
 * pdfjs-dist 의 legacy build 를 사용 — main thread 에서 동기 worker-less 모드
 * 로 동작 + Node test env (jsdom 외) 호환 (modern build 는 DOMMatrix 필요).
 * legacy 의 `require('crypto')` 폴백 코드는 try/catch 내부라 CSP 환경에서도
 * 안전 (실제 throw 시 무시). 추출 결과는 page 별 + 전체 합본 string.
 *
 * 사용:
 *   const result = await extractPdfText(arrayBuffer);
 *   // → { text, pages: [{ index, text }], page_count }
 */

import { getDocument, GlobalWorkerOptions } from 'pdfjs-dist/legacy/build/pdf.mjs';

// pdfjs-dist 가 worker 를 별도 thread 에 로드하려 하면 vite/electron 환경에서
// 까다롭다. main thread 동기 모드: workerSrc 를 빈 string 으로 무력화 → 자동
// fallback (느리지만 안전).
if (typeof GlobalWorkerOptions !== 'undefined' && GlobalWorkerOptions.workerSrc.length === 0) {
  GlobalWorkerOptions.workerSrc = '';
}

export interface PdfPageText {
  /** 1-based page number. */
  index: number;
  text: string;
}

export interface PdfExtractResult {
  /** 페이지 별 텍스트. */
  pages: PdfPageText[];
  /** 모든 페이지의 텍스트를 줄바꿈 2개로 join 한 합본. */
  text: string;
  /** 총 페이지 수. */
  page_count: number;
}

/**
 * PDF 의 raw bytes (ArrayBuffer / Uint8Array / base64-decoded) 를 받아 텍스트
 * 추출. 손상된 PDF / 암호화된 PDF 는 throw.
 *
 * 옵션:
 *  - maxPages: 추출 페이지 상한 (default: 무제한). 대용량 PDF 폭주 방지.
 *  - perPageMaxChars: 한 페이지의 텍스트 길이 cap. 잘라낸 경우 끝에 `…` 표시.
 */
export async function extractPdfText(
  source: ArrayBuffer | Uint8Array | { data: Uint8Array },
  options: { maxPages?: number; perPageMaxChars?: number } = {}
): Promise<PdfExtractResult> {
  const data =
    source instanceof ArrayBuffer
      ? new Uint8Array(source)
      : source instanceof Uint8Array
        ? source
        : source.data;

  const doc = await getDocument({ data, useSystemFonts: false }).promise;
  const totalPages = doc.numPages;
  const limit = options.maxPages ?? totalPages;
  const cap = options.perPageMaxChars ?? Number.POSITIVE_INFINITY;

  const pages: PdfPageText[] = [];
  for (let i = 1; i <= Math.min(totalPages, limit); i += 1) {
    const page = await doc.getPage(i);
    try {
      const content = await page.getTextContent();
      let text = '';
      for (const item of content.items) {
        // pdfjs textContent items 는 보통 { str: string, ... }. 타입 가드.
        const maybeStr = (item as { str?: unknown }).str;
        if (typeof maybeStr === 'string') {
          text += maybeStr;
          // pdfjs 는 white-space 를 별도 항목으로 노출하지 않는 경우가 많음.
          // 단순히 항목 사이를 single space 로 join 해 가독성 확보.
          text += ' ';
        }
      }
      const trimmed = text.trim();
      const finalText = trimmed.length > cap ? `${trimmed.slice(0, cap)}…` : trimmed;
      pages.push({ index: i, text: finalText });
    } finally {
      // pdfjs page 객체는 cleanup 호출이 권장됨 (메모리 회수).
      const c = (page as { cleanup?: () => void }).cleanup;
      if (typeof c === 'function') c.call(page);
    }
  }

  // pdf 도큐먼트 자체 cleanup.
  const docCleanup = (doc as { cleanup?: () => Promise<void> | void }).cleanup;
  if (typeof docCleanup === 'function') {
    try {
      await docCleanup.call(doc);
    } catch {
      // ignore
    }
  }

  return {
    pages,
    text: pages
      .map((p) => p.text)
      .filter((t) => t.length > 0)
      .join('\n\n'),
    page_count: totalPages,
  };
}

/**
 * Base64 PDF 데이터를 받아 추출. `imageInput.ts` 의 결과와 호환 — 사용자가
 * DnD/paste 한 PDF 의 base64 가 그대로 들어옴.
 */
export async function extractPdfTextFromBase64(
  base64: string,
  options?: { maxPages?: number; perPageMaxChars?: number }
): Promise<PdfExtractResult> {
  const binary = base64ToUint8Array(base64);
  return extractPdfText(binary, options);
}

function base64ToUint8Array(base64: string): Uint8Array {
  if (typeof atob === 'function') {
    const binary = atob(base64);
    const out = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) {
      out[i] = binary.charCodeAt(i);
    }
    return out;
  }
  // Node fallback.
  return new Uint8Array(Buffer.from(base64, 'base64'));
}

// ────────────────────────────────────────────────────────────
// v1.5.4 follow-up — chat-injectable formatting
// ────────────────────────────────────────────────────────────

/**
 * 추출된 PDF 텍스트를 ChatInput 에 주입 가능한 단일 string 으로 포맷.
 * Header (filename + page count) + per-page section markers.
 *
 * 예시 결과:
 *   [PDF: report.pdf, 3 pages]
 *
 *   --- Page 1 ---
 *   ...본문...
 *
 *   --- Page 2 ---
 *   ...본문...
 *
 * 빈 페이지는 skip (header 만 있으면 의미 없으므로). page count 는 실제 텍스트
 * 가 추출된 페이지만.
 */
export function formatPdfExtractAsText(
  result: PdfExtractResult,
  options: { filename?: string } = {}
): string {
  const filename = options.filename ?? 'document.pdf';
  const nonEmpty = result.pages.filter((p) => p.text.length > 0);
  if (nonEmpty.length === 0) {
    return `[PDF: ${filename}, ${result.page_count} pages — text 추출 안 됨 (이미지 PDF 일 가능성)]`;
  }
  const header = `[PDF: ${filename}, ${result.page_count} pages]`;
  const body = nonEmpty.map((p) => `--- Page ${p.index} ---\n${p.text}`).join('\n\n');
  return `${header}\n\n${body}`;
}

/**
 * Convenience — base64 PDF 를 받아 추출 + 포맷 한 번에. ChatInput drop handler
 * 가 직접 호출 가능. 옵션은 extractPdfText 와 formatPdfExtractAsText 의 합집합.
 */
export async function pdfBase64ToChatText(
  base64: string,
  options: {
    filename?: string;
    maxPages?: number;
    perPageMaxChars?: number;
  } = {}
): Promise<string> {
  const extractOptions: { maxPages?: number; perPageMaxChars?: number } = {};
  if (options.maxPages !== undefined) extractOptions.maxPages = options.maxPages;
  if (options.perPageMaxChars !== undefined) {
    extractOptions.perPageMaxChars = options.perPageMaxChars;
  }
  const result = await extractPdfTextFromBase64(base64, extractOptions);
  const formatOptions: { filename?: string } = {};
  if (options.filename !== undefined) formatOptions.filename = options.filename;
  return formatPdfExtractAsText(result, formatOptions);
}
