/**
 * AnthropicProvider — Direct Anthropic Messages API SSE (v1.2.1 stub / P2).
 *
 * Spec: docs/v1.x-roadmap.md (P2 v1.2.x Direct API mode).
 *
 * 본 commit 은 stub:
 *   - 인스턴스 생성 OK.
 *   - stream() 호출 시 'not_implemented' error event 즉시 emit + 종료.
 *
 * 후속 (v1.2.2):
 *   - fetch + SSE 파싱.
 *   - tool_use / tool_result / usage 이벤트 변환.
 *   - prompt caching.
 *   - 401 / 429 / 5xx retry policy.
 */

import type { Provider, Turn } from '../../types';
import type { StreamEvent } from '../types';
import type { DirectApiOptions, DirectApiProvider, DirectApiVendor } from './types';

const DEFAULT_BASE_URL = 'https://api.anthropic.com';

export class AnthropicProvider implements DirectApiProvider {
  readonly vendor: DirectApiVendor = 'anthropic';
  readonly provider: Provider = 'claude';
  private readonly opts: DirectApiOptions;
  private readonly baseUrl: string;

  constructor(opts: DirectApiOptions) {
    this.opts = opts;
    this.baseUrl = opts.baseUrl ?? DEFAULT_BASE_URL;
  }

  async *stream(input: {
    turns: Turn[];
    model: string;
    config?: Record<string, unknown>;
    signal?: AbortSignal;
  }): AsyncIterable<StreamEvent> {
    void this.opts;
    void this.baseUrl;
    void input;
    // v1.2.1 stub — 실제 SSE 는 v1.2.2.
    yield {
      type: 'error',
      error:
        'AnthropicProvider direct API mode is not yet implemented (v1.2.1 stub). ' +
        'Use the Claude CLI provider instead (v1.0+).',
    };
  }
}
