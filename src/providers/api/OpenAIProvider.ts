/**
 * OpenAIProvider — Direct OpenAI Chat Completions API SSE (v1.2.1 stub / P2).
 *
 * Spec: docs/v1.x-roadmap.md (P2 v1.2.x Direct API mode).
 *
 * 본 commit 은 stub. v1.2.2 에서 실제 fetch + SSE.
 */

import type { Provider, Turn } from '../../types';
import type { StreamEvent } from '../types';
import type { DirectApiOptions, DirectApiProvider, DirectApiVendor } from './types';

const DEFAULT_BASE_URL = 'https://api.openai.com';

export class OpenAIProvider implements DirectApiProvider {
  readonly vendor: DirectApiVendor = 'openai';
  readonly provider: Provider = 'codex';
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
    yield {
      type: 'error',
      error:
        'OpenAIProvider direct API mode is not yet implemented (v1.2.1 stub). ' +
        'Use the Codex CLI provider instead (v1.0+).',
    };
  }
}
