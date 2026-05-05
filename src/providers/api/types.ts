/**
 * Direct API provider types (v1.2.1 / P2).
 *
 * Spec: docs/v1.x-roadmap.md (P2 v1.2.x Direct API mode).
 *
 * 본 commit 은 type 정의 + 인프라 stub. 실제 SSE 파싱 / fetch / key handling 은
 * v1.2.2 이후.
 */

import type { StreamingProvider } from '../types';

export type DirectApiVendor = 'anthropic' | 'openai';

export interface DirectApiOptions {
  /** API key — 사용자 settings 에서 읽음. 없으면 detect 단계에서 fallback. */
  apiKey: string;
  /** Optional base URL — proxy / self-host 환경. 미지정 시 default. */
  baseUrl?: string;
  /** Mid-stream abort. */
  signal?: AbortSignal;
}

/**
 * Direct API provider 의 공통 contract — CliProvider 와 동일하게
 * `StreamingProvider` 인터페이스 만족.
 *
 * 본 commit 은 placeholder — instantiate + stream() 호출 시 명시적 'not_implemented'
 * 에러 emit. 실제 fetch/SSE 는 후속.
 */
export interface DirectApiProvider extends StreamingProvider {
  readonly vendor: DirectApiVendor;
}
