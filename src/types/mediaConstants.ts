/**
 * v1.1.0 — Image / PDF mention 한도 상수.
 *
 * 한 곳에서만 정의해 main IPC handler / renderer guard / 테스트가 모두
 * 같은 숫자를 본다. 한도 변경은 곧 user 경험과 메모리 footprint 트레이드오프
 * 라 임의로 키우지 말 것 — Codex 권고선 (Image 5MB / PDF 20pages) 을 유지.
 *
 * Spec: docs/session/conversation.md (v1.1.0 image/pdf reference blocks)
 */

import { ALLOWED_IMAGE_MIME_VALUES, type AllowedImageMime } from './conversation';

// ────────────────────────────────────────────────────────────
// Image
// ────────────────────────────────────────────────────────────

/**
 * 한 이미지 mention 의 byte 한도. base64 encoded data URL 까지 포함하면 약
 * 6.7MB 정도가 IPC payload 로 흘러간다 — Electron 의 message size 한도와
 * Vision API 의 25MB 한도 양쪽 모두에 안전한 마진.
 */
export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

/**
 * Re-export — `import { ALLOWED_IMAGE_MIMES } from '@/types/mediaConstants'`
 * 형태로 호출 측이 한 모듈에서 모두 가져갈 수 있도록.
 */
export const ALLOWED_IMAGE_MIMES = ALLOWED_IMAGE_MIME_VALUES;

export type { AllowedImageMime };

// ────────────────────────────────────────────────────────────
// PDF
// ────────────────────────────────────────────────────────────

/**
 * 추출할 PDF 최대 페이지 수. 이를 넘으면 truncated=true + 첫 N 페이지 텍스트만
 * 남긴다. 큰 명세서 (50+ 페이지) 는 일부만 들여보내는 게 prompt token /
 * UX 양쪽에 합리적.
 */
export const MAX_PDF_PAGES = 20;

/**
 * 페이지 cap 적용 후에도 텍스트가 너무 길면 byte 단위로 추가 cap.
 * 100KB ≈ 25k token (UTF-8 영문 기준) — Claude/GPT 모두 단일 turn 안에
 * 무리 없이 들어가는 마진.
 */
export const MAX_PDF_TEXT_BYTES = 100 * 1024;

// ────────────────────────────────────────────────────────────
// Magic-byte detection (image MIME)
// ────────────────────────────────────────────────────────────

/**
 * 파일 buffer 의 첫 몇 바이트로 image MIME 감지.
 *
 * 사용자가 확장자만 바꾼 파일 / 위변조 / encoding 오류 등을 조용히 거절하기
 * 위해 magic byte 만 신뢰. 알려진 4종이 아니면 null 반환 — caller 가
 * 거절 응답.
 *
 * Refs:
 *   - PNG : 89 50 4E 47 0D 0A 1A 0A
 *   - JPEG: FF D8 FF
 *   - GIF : 47 49 46 38 (37|39) 61    (GIF87a / GIF89a)
 *   - WEBP: 52 49 46 46 .. .. .. .. 57 45 42 50  (RIFF....WEBP)
 */
export function detectImageMimeByMagicBytes(buf: Buffer): AllowedImageMime | null {
  if (buf.length < 4) return null;
  const b0 = buf[0];
  const b1 = buf[1];
  const b2 = buf[2];
  const b3 = buf[3];
  if (b0 === 0x89 && b1 === 0x50 && b2 === 0x4e && b3 === 0x47) return 'image/png';
  if (b0 === 0xff && b1 === 0xd8 && b2 === 0xff) return 'image/jpeg';
  if (
    b0 === 0x47 &&
    b1 === 0x49 &&
    b2 === 0x46 &&
    b3 === 0x38 &&
    (buf[4] === 0x37 || buf[4] === 0x39) &&
    buf[5] === 0x61
  ) {
    return 'image/gif';
  }
  if (
    buf.length >= 12 &&
    b0 === 0x52 &&
    b1 === 0x49 &&
    b2 === 0x46 &&
    b3 === 0x46 &&
    buf[8] === 0x57 &&
    buf[9] === 0x45 &&
    buf[10] === 0x42 &&
    buf[11] === 0x50
  ) {
    return 'image/webp';
  }
  return null;
}

// ────────────────────────────────────────────────────────────
// Vision-capable models
// ────────────────────────────────────────────────────────────

/**
 * Multimodal vision input 을 지원하는 model id.
 *
 * 이 set 에 없으면 image_reference 는 path placeholder text 로 fallback.
 * Claude / OpenAI 의 모델 명세 확장에 따라 enrichment 가능 — 권장 minimum.
 */
export const VISION_CAPABLE_MODELS: ReadonlySet<string> = new Set([
  // Claude — 3-family 와 그 이상은 vision 기본 지원.
  'claude-3-5-sonnet-20241022',
  'claude-3-5-sonnet-latest',
  'claude-3-5-haiku-20241022',
  'claude-3-5-haiku-latest',
  'claude-3-opus-20240229',
  'claude-3-opus-latest',
  'claude-3-sonnet-20240229',
  'claude-3-haiku-20240307',
  'claude-sonnet-4-20250514',
  'claude-sonnet-4-5',
  'claude-opus-4-1',
  'claude-opus-4-5',
  // OpenAI — vision-capable models.
  'gpt-4o',
  'gpt-4o-mini',
  'gpt-4o-2024-11-20',
  'gpt-4o-2024-08-06',
  'gpt-4-vision-preview',
  'gpt-4-turbo',
  'gpt-4-turbo-2024-04-09',
  'o1',
  'o1-2024-12-17',
  'o3',
  'o3-mini',
  'o4-mini',
  'gpt-4.1',
  'gpt-4.1-mini',
  'gpt-5',
  'gpt-5-mini',
]);

/**
 * 모델이 vision 입력을 처리 가능한지 판정.
 *
 * 단순히 set 에 들어있는지뿐 아니라 prefix 매칭도 지원한다 — 새 minor 버전
 * (예: `claude-sonnet-4-5-20251001`) 가 알려진 base id 로 시작하면 OK.
 * 호출 측이 `model` 을 lower-case 로 정규화할 필요는 없다 (이 함수가 처리).
 */
export function isVisionCapableModel(model: string): boolean {
  if (model.length === 0) return false;
  const m = model.toLowerCase();
  if (VISION_CAPABLE_MODELS.has(model) || VISION_CAPABLE_MODELS.has(m)) return true;
  for (const known of VISION_CAPABLE_MODELS) {
    if (m.startsWith(known.toLowerCase())) return true;
  }
  return false;
}
