/**
 * Vision routing — image block 을 provider 별 message format 으로 변환 (v1.5.6).
 *
 * Spec:
 *  - Anthropic: { type: 'image', source: { type: 'base64', media_type, data } }.
 *  - OpenAI: { type: 'image_url', image_url: { url: 'data:<mime>;base64,...' } }.
 *
 * 본 util 은 stand-alone 함수 — provider class 가 호출. tool/PDF text
 * extraction 은 별도 util.
 */

export interface ImageInput {
  /** base64 (no `data:` prefix). */
  base64: string;
  /** e.g. 'image/png'. */
  mime: string;
}

export interface AnthropicImageBlock {
  type: 'image';
  source: {
    type: 'base64';
    media_type: string;
    data: string;
  };
}

export interface OpenAIImageBlock {
  type: 'image_url';
  image_url: {
    url: string;
  };
}

/** Anthropic Messages API 의 image block. */
export function toAnthropicImageBlock(input: ImageInput): AnthropicImageBlock {
  return {
    type: 'image',
    source: {
      type: 'base64',
      media_type: input.mime,
      data: input.base64,
    },
  };
}

/** OpenAI Chat Completions 의 image_url block (data: URI 형식). */
export function toOpenAIImageBlock(input: ImageInput): OpenAIImageBlock {
  return {
    type: 'image_url',
    image_url: {
      url: `data:${input.mime};base64,${input.base64}`,
    },
  };
}

/** CLI provider 의 prompt 에 inline 변환 — 이미지는 placeholder + meta 만. */
export function toCliImagePlaceholder(input: ImageInput): string {
  return `[image: ${input.mime}, ${input.base64.length} chars base64]`;
}
