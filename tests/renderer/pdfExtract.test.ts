/**
 * PDF text extraction tests (v1.5.4).
 *
 * 검증:
 *  - 정상 PDF 추출 — page 별 텍스트 + 합본.
 *  - 손상된 PDF → throw.
 *  - 빈 페이지 — text 빈 string OR 짧은 trim.
 *  - maxPages 옵션 — 일부만 추출.
 *  - perPageMaxChars 옵션 — 잘림 + … suffix.
 *  - extractPdfTextFromBase64 — base64 → 동일 결과.
 *
 * 테스트는 minimal PDF (단일 페이지, "Hello PDF" 텍스트) 를 hex/base64 hardcode.
 */

import { describe, it, expect } from 'vitest';
import {
  extractPdfText,
  extractPdfTextFromBase64,
  formatPdfExtractAsText,
  pdfBase64ToChatText,
  type PdfExtractResult,
} from '../../src/renderer/utils/pdfExtract';

/**
 * Minimal valid PDF — 한 페이지, "Hello PDF" 텍스트만 포함.
 *
 * 본 base64 는 매우 작은 단순 PDF 의 raw bytes — 실제 pdfjs 가 파싱 가능한
 * 구조. Hex / base64 으로 바로 hardcode 해 외부 의존 없이 단위테스트.
 */
const MINIMAL_PDF_BASE64 =
  'JVBERi0xLjQKJeLjz9MKMSAwIG9iago8PC9UeXBlIC9DYXRhbG9nIC9QYWdlcyAyIDAgUj4+CmVuZG9iagoyIDAgb2JqCjw8L1R5cGUgL1BhZ2VzIC9LaWRzIFszIDAgUl0gL0NvdW50IDE+PgplbmRvYmoKMyAwIG9iago8PC9UeXBlIC9QYWdlIC9QYXJlbnQgMiAwIFIgL01lZGlhQm94IFswIDAgNTk1IDg0Ml0gL0NvbnRlbnRzIDQgMCBSIC9SZXNvdXJjZXMgPDwvRm9udCA8PC9GMSA1IDAgUj4+Pj4+PgplbmRvYmoKNCAwIG9iago8PC9MZW5ndGggNDQ+PgpzdHJlYW0KQlQKL0YxIDI0IFRmCjEwMCA3MDAgVGQKKEhlbGxvIFBERikgVGoKRVQKZW5kc3RyZWFtCmVuZG9iago1IDAgb2JqCjw8L1R5cGUgL0ZvbnQgL1N1YnR5cGUgL1R5cGUxIC9CYXNlRm9udCAvSGVsdmV0aWNhPj4KZW5kb2JqCnhyZWYKMCA2CjAwMDAwMDAwMDAgNjU1MzUgZgowMDAwMDAwMDE1IDAwMDAwIG4KMDAwMDAwMDA2NCAwMDAwMCBuCjAwMDAwMDAxMTMgMDAwMDAgbgowMDAwMDAwMjE5IDAwMDAwIG4KMDAwMDAwMDMxNCAwMDAwMCBuCnRyYWlsZXIKPDwvU2l6ZSA2IC9Sb290IDEgMCBSPj4Kc3RhcnR4cmVmCjM4MgolJUVPRg==';

function pdfBase64ToBytes(b64: string): Uint8Array {
  return new Uint8Array(Buffer.from(b64, 'base64'));
}

describe('v1.5.4 — pdfExtract', () => {
  it('extractPdfText — single page PDF 의 텍스트 추출', async () => {
    const bytes = pdfBase64ToBytes(MINIMAL_PDF_BASE64);
    const result = await extractPdfText(bytes);
    expect(result.page_count).toBe(1);
    expect(result.pages.length).toBe(1);
    // pdfjs 파싱 결과는 "Hello PDF" 또는 인코딩에 따라 띄어쓰기 포함 변형 가능.
    expect(result.pages[0]!.text.toLowerCase()).toContain('hello');
    expect(result.pages[0]!.text.toLowerCase()).toContain('pdf');
    // 합본 text 도 동일.
    expect(result.text.toLowerCase()).toContain('hello');
  });

  it('extractPdfTextFromBase64 — base64 input 동일 결과', async () => {
    const result = await extractPdfTextFromBase64(MINIMAL_PDF_BASE64);
    expect(result.page_count).toBe(1);
    expect(result.text.toLowerCase()).toContain('hello');
  });

  it('손상된 PDF → throw', async () => {
    const bogus = new Uint8Array([0x00, 0x01, 0x02, 0x03]);
    await expect(extractPdfText(bogus)).rejects.toThrow();
  });

  it('maxPages 옵션 — 추출 페이지 제한', async () => {
    const result = await extractPdfTextFromBase64(MINIMAL_PDF_BASE64, {
      maxPages: 0,
    });
    // page_count 는 전체, pages 배열은 0.
    expect(result.page_count).toBe(1);
    expect(result.pages.length).toBe(0);
    expect(result.text).toBe('');
  });

  it('perPageMaxChars 옵션 — 잘림 + … suffix', async () => {
    const result = await extractPdfTextFromBase64(MINIMAL_PDF_BASE64, {
      perPageMaxChars: 3,
    });
    expect(result.pages[0]!.text.length).toBeLessThanOrEqual(4); // 3 chars + …
    expect(result.pages[0]!.text.endsWith('…')).toBe(true);
  });

  it('Uint8Array / { data } input 모두 받음', async () => {
    const bytes = pdfBase64ToBytes(MINIMAL_PDF_BASE64);
    const r2 = await extractPdfText(bytes);
    const bytes2 = pdfBase64ToBytes(MINIMAL_PDF_BASE64);
    const r3 = await extractPdfText({ data: bytes2 });
    expect(r2.page_count).toBe(1);
    expect(r3.page_count).toBe(1);
  });
});

describe('v1.5.4 follow-up — formatPdfExtractAsText / pdfBase64ToChatText', () => {
  it('formatPdfExtractAsText — header + per-page sections', () => {
    const result: PdfExtractResult = {
      page_count: 2,
      pages: [
        { index: 1, text: '안녕' },
        { index: 2, text: '두번째 페이지' },
      ],
      text: '안녕\n\n두번째 페이지',
    };
    const text = formatPdfExtractAsText(result, { filename: 'doc.pdf' });
    expect(text).toContain('[PDF: doc.pdf, 2 pages]');
    expect(text).toContain('--- Page 1 ---');
    expect(text).toContain('--- Page 2 ---');
    expect(text).toContain('안녕');
    expect(text).toContain('두번째 페이지');
  });

  it('formatPdfExtractAsText — filename 미지정 → default', () => {
    const result: PdfExtractResult = {
      page_count: 1,
      pages: [{ index: 1, text: 'x' }],
      text: 'x',
    };
    const text = formatPdfExtractAsText(result);
    expect(text).toContain('document.pdf');
  });

  it('formatPdfExtractAsText — 모든 페이지 빈 텍스트 → 안내 message', () => {
    const result: PdfExtractResult = {
      page_count: 3,
      pages: [
        { index: 1, text: '' },
        { index: 2, text: '' },
        { index: 3, text: '' },
      ],
      text: '',
    };
    const text = formatPdfExtractAsText(result, { filename: 'scan.pdf' });
    expect(text).toContain('이미지 PDF');
    expect(text).toContain('scan.pdf');
    expect(text).toContain('3 pages');
  });

  it('formatPdfExtractAsText — 일부 페이지만 빈 텍스트 → skip', () => {
    const result: PdfExtractResult = {
      page_count: 3,
      pages: [
        { index: 1, text: 'first' },
        { index: 2, text: '' },
        { index: 3, text: 'third' },
      ],
      text: 'first\n\nthird',
    };
    const text = formatPdfExtractAsText(result);
    expect(text).toContain('--- Page 1 ---');
    expect(text).not.toContain('--- Page 2 ---'); // 빈 페이지 skip
    expect(text).toContain('--- Page 3 ---');
  });

  it('pdfBase64ToChatText — 라운드트립', async () => {
    const text = await pdfBase64ToChatText(MINIMAL_PDF_BASE64, {
      filename: 'minimal.pdf',
    });
    expect(text).toContain('[PDF: minimal.pdf');
    expect(text).toContain('--- Page 1 ---');
    expect(text.toLowerCase()).toContain('hello');
  });
});
