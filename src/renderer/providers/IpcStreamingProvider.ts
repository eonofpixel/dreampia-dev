/**
 * IpcStreamingProvider — renderer-side adapter wrapping IPC ai/* channels.
 *
 * Spec: docs/session/cross-ai-sync.md
 *
 * 역할:
 *   - StreamingProvider 인터페이스를 그대로 구현하므로 useStreamingTurn 같은
 *     기존 hook 이 변경 없이 사용 가능
 *   - 내부적으로 ai/start-stream IPC 호출 + ai/stream-event 구독
 *   - finally 에서 listener cleanup + ai/stop-stream 호출 (best-effort)
 *
 * 격리 / 안전성:
 *   - subprocess 는 main 에 존재 — 여기서는 IPC bridge 만 사용
 *   - window.dreampia.ai 미존재 시 graceful error (legacy/test 환경)
 *   - 동시 stream 안전: stream_id 로 분리. 다른 stream 의 event 는 무시.
 */

import type { StreamEvent, StreamingProvider } from '@/providers/types';
import type { Turn } from '@/types';

let streamCounter = 0;

function newStreamId(): string {
  streamCounter += 1;
  return `s-${Date.now()}-${streamCounter}-${Math.random().toString(36).slice(2, 8)}`;
}

export interface IpcStreamingProviderOptions {
  /** Provider 식별자. `auto` 시 main 이 모델 기반 자동 선택. */
  provider?: 'claude' | 'codex';
}

export class IpcStreamingProvider implements StreamingProvider {
  readonly provider: 'claude' | 'codex';

  constructor(opts: IpcStreamingProviderOptions = {}) {
    // 라우팅은 main 에서 모델 prefix 로 결정. 이 필드는 StreamingProvider
    // 인터페이스 만족용.
    this.provider = opts.provider ?? 'claude';
  }

  async *stream(input: {
    turns: Turn[];
    model: string;
    config?: Record<string, unknown>;
    signal?: AbortSignal;
  }): AsyncIterable<StreamEvent> {
    const ai = typeof window !== 'undefined' ? window.dreampia?.ai : undefined;
    if (ai === undefined) {
      yield {
        type: 'error',
        error: 'window.dreampia.ai is not available (preload not loaded?)',
      };
      return;
    }

    const streamId = newStreamId();
    const queue: StreamEvent[] = [];
    let ended = false;
    let started = false;
    let stopCalled = false;
    let resolveNext: (() => void) | null = null;

    const wakeUp = (): void => {
      const fn = resolveNext;
      resolveNext = null;
      fn?.();
    };

    const stop = async (): Promise<void> => {
      if (stopCalled) return;
      stopCalled = true;
      try {
        await ai.stopStream(streamId);
      } catch {
        // ignore
      }
    };

    const onAbort = (): void => {
      ended = true;
      if (started) {
        void stop().finally(wakeUp);
      }
      wakeUp();
    };
    input.signal?.addEventListener('abort', onAbort, { once: true });

    const unsubscribeEvent = ai.onStreamEvent((payload) => {
      if (payload.stream_id !== streamId) return;
      // payload.event 는 preload 의 sandbox 호환 타입 — StreamEvent 와 같은
      // 형태이므로 캐스트.
      queue.push(payload.event as StreamEvent);
      wakeUp();
    });
    const unsubscribeEnd = ai.onStreamEnd((payload) => {
      if (payload.stream_id !== streamId) return;
      ended = true;
      wakeUp();
    });

    try {
      const workspaceRoot =
        typeof input.config?.['workspace_root'] === 'string'
          ? input.config['workspace_root']
          : undefined;
      const sessionId =
        typeof input.config?.['session_id'] === 'string'
          ? input.config['session_id']
          : undefined;

      const result = await ai.startStream({
        stream_id: streamId,
        model: input.model,
        turns: input.turns,
        ...(workspaceRoot !== undefined && { workspace_root: workspaceRoot }),
        ...(sessionId !== undefined && { session_id: sessionId }),
      });
      if (!result.ok) {
        yield { type: 'error', error: result.error };
        return;
      }
      started = true;

      if (input.signal?.aborted) {
        ended = true;
        await stop();
        return;
      }

      while (true) {
        while (queue.length > 0) {
          const ev = queue.shift();
          if (ev !== undefined) yield ev;
        }
        if (ended) break;
        await new Promise<void>((resolve) => {
          resolveNext = resolve;
        });
      }
    } finally {
      input.signal?.removeEventListener('abort', onAbort);
      unsubscribeEvent();
      unsubscribeEnd();
      // Best-effort cancel — 이미 끝났으면 main 에서 no-op.
      if (started) await stop();
    }
  }
}
