/**
 * AnnotationBlock typed block + provider 직렬화 (v1.6.0 follow-up).
 *
 * 검증:
 *  - ContentBlockSchema 가 annotation_block 받음.
 *  - 필수 필드 missing 시 fail.
 *  - 음수 w/h 거절.
 *  - CodexAdapter.formatAnnotationBlockText — bbox + comment + screenshot.
 *  - comment / screenshot_uri 옵셔널 — 없을 때 line skip.
 */

import { describe, it, expect } from 'vitest';
import { ContentBlockSchema, type AnnotationBlock } from '../../src/types';
import { CodexAdapter } from '../../src/providers/CodexAdapter';

describe('v1.6.0 follow-up — AnnotationBlock', () => {
  it('valid annotation_block parse', () => {
    const block = {
      type: 'annotation_block',
      url: 'https://example.com',
      bounding_box: { x: 10, y: 20, w: 100, h: 50 },
      comment: '여기 버그',
      captured_at: '2026-05-06T00:00:00.000Z',
    };
    const r = ContentBlockSchema.safeParse(block);
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.type).toBe('annotation_block');
    }
  });

  it('필수 필드 missing → fail', () => {
    const block = {
      type: 'annotation_block',
      url: 'https://example.com',
      // bounding_box missing
      comment: '',
      captured_at: '2026-05-06T00:00:00.000Z',
    };
    const r = ContentBlockSchema.safeParse(block);
    expect(r.success).toBe(false);
  });

  it('음수 w/h → fail', () => {
    const block = {
      type: 'annotation_block',
      url: 'x',
      bounding_box: { x: 0, y: 0, w: -1, h: 50 },
      comment: '',
      captured_at: '2026-05-06T00:00:00.000Z',
    };
    const r = ContentBlockSchema.safeParse(block);
    expect(r.success).toBe(false);
  });

  it('formatAnnotationBlockText — bbox + comment + screenshot', () => {
    const block: AnnotationBlock = {
      type: 'annotation_block',
      url: 'https://example.com/page',
      bounding_box: { x: 10, y: 20, w: 100, h: 50 },
      comment: '여기 잘못됨',
      screenshot_uri: 'file:///shot.png',
      captured_at: '2026-05-06T00:00:00.000Z',
    };
    const text = CodexAdapter.formatAnnotationBlockText(block);
    expect(text).toContain('[Annotation] https://example.com/page');
    expect(text).toContain('bbox 10,20,100×50');
    expect(text).toContain('주석: 여기 잘못됨');
    expect(text).toContain('스크린샷: file:///shot.png');
  });

  it('formatAnnotationBlockText — comment 빈 string 시 그 line skip', () => {
    const block: AnnotationBlock = {
      type: 'annotation_block',
      url: 'x',
      bounding_box: { x: 0, y: 0, w: 1, h: 1 },
      comment: '',
      captured_at: '2026-05-06T00:00:00.000Z',
    };
    const text = CodexAdapter.formatAnnotationBlockText(block);
    expect(text).not.toContain('주석:');
    expect(text).not.toContain('스크린샷:');
  });

  it('formatAnnotationBlockText — screenshot_uri 미지정 시 그 line skip', () => {
    const block: AnnotationBlock = {
      type: 'annotation_block',
      url: 'x',
      bounding_box: { x: 0, y: 0, w: 1, h: 1 },
      comment: '있음',
      captured_at: '2026-05-06T00:00:00.000Z',
    };
    const text = CodexAdapter.formatAnnotationBlockText(block);
    expect(text).toContain('주석: 있음');
    expect(text).not.toContain('스크린샷:');
  });

  // ──────────────────────────────────────────────────────────
  // v2.10.0 β-2 (F-021 + F-033) — selector field
  // ──────────────────────────────────────────────────────────
  it('selector optional — pick 모드 캡처 시 parse 통과', () => {
    const block = {
      type: 'annotation_block',
      url: 'https://example.com',
      bounding_box: { x: 10, y: 20, w: 100, h: 50 },
      comment: '',
      selector: 'button.primary:nth-of-type(2)',
      captured_at: '2026-05-06T00:00:00.000Z',
    };
    const r = ContentBlockSchema.safeParse(block);
    expect(r.success).toBe(true);
    if (r.success && r.data.type === 'annotation_block') {
      expect(r.data.selector).toBe('button.primary:nth-of-type(2)');
    }
  });

  it('selector 생략 — region 모드 호환', () => {
    const block = {
      type: 'annotation_block',
      url: 'https://example.com',
      bounding_box: { x: 10, y: 20, w: 100, h: 50 },
      comment: '',
      captured_at: '2026-05-06T00:00:00.000Z',
    };
    const r = ContentBlockSchema.safeParse(block);
    expect(r.success).toBe(true);
    if (r.success && r.data.type === 'annotation_block') {
      expect(r.data.selector).toBeUndefined();
    }
  });

  // ──────────────────────────────────────────────────────────
  // v2.10.0 β-4 (F-021 inline panel + voice memo)
  // ──────────────────────────────────────────────────────────
  it('comment_audio_uri + comment_audio_duration_ms optional — 채워진 경우 parse 통과', () => {
    const block = {
      type: 'annotation_block',
      url: 'https://example.com',
      bounding_box: { x: 10, y: 20, w: 100, h: 50 },
      comment: '여기 음성으로 설명',
      comment_audio_uri: 'file:///tmp/audio.webm',
      comment_audio_duration_ms: 4321,
      captured_at: '2026-05-12T00:00:00.000Z',
    };
    const r = ContentBlockSchema.safeParse(block);
    expect(r.success).toBe(true);
    if (r.success && r.data.type === 'annotation_block') {
      expect(r.data.comment_audio_uri).toBe('file:///tmp/audio.webm');
      expect(r.data.comment_audio_duration_ms).toBe(4321);
    }
  });

  it('comment_audio_uri 생략 — backward compat (β-2/β-3 block)', () => {
    const block = {
      type: 'annotation_block',
      url: 'https://example.com',
      bounding_box: { x: 10, y: 20, w: 100, h: 50 },
      comment: '음성 없음',
      captured_at: '2026-05-12T00:00:00.000Z',
    };
    const r = ContentBlockSchema.safeParse(block);
    expect(r.success).toBe(true);
    if (r.success && r.data.type === 'annotation_block') {
      expect(r.data.comment_audio_uri).toBeUndefined();
      expect(r.data.comment_audio_duration_ms).toBeUndefined();
    }
  });

  it('comment_audio_duration_ms 음수 → fail', () => {
    const block = {
      type: 'annotation_block',
      url: 'x',
      bounding_box: { x: 0, y: 0, w: 1, h: 1 },
      comment: '',
      comment_audio_duration_ms: -100,
      captured_at: '2026-05-12T00:00:00.000Z',
    };
    const r = ContentBlockSchema.safeParse(block);
    expect(r.success).toBe(false);
  });
});
