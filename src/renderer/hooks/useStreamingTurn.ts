/**
 * useStreamingTurn — streaming provider 를 React state 에 연결.
 *
 * MockProvider.stream() 의 AsyncIterable<StreamEvent> 를 소비하여
 * 실시간으로 Turn 을 누적·업데이트한다.
 *
 * Spec: docs/ia/chat-flow.md
 */

import { useState, useCallback, useRef } from 'react';
import type { StreamEvent, StreamingProvider } from '@/providers/types';
import type { Turn, TurnId, ToolCallRef, ToolCallId } from '@/types';
import { newTurnId, nowIso } from '@/types';

export interface UseStreamingTurnArgs {
  provider: StreamingProvider;
  onTurnUpdate: (turn: Turn) => void;
  onComplete: (turn: Turn) => void;
  onError?: (error: string) => void;
}

export interface UseStreamingTurnReturn {
  isStreaming: boolean;
  start: (input: { turns: Turn[]; model: string }) => Promise<void>;
  cancel: () => void;
}

export function useStreamingTurn({
  provider,
  onTurnUpdate,
  onComplete,
  onError,
}: UseStreamingTurnArgs): UseStreamingTurnReturn {
  const [isStreaming, setIsStreaming] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  const onTurnUpdateRef = useRef(onTurnUpdate);
  onTurnUpdateRef.current = onTurnUpdate;

  const onCompleteRef = useRef(onComplete);
  onCompleteRef.current = onComplete;

  const onErrorRef = useRef(onError);
  onErrorRef.current = onError;

  const start = useCallback(
    async (input: { turns: Turn[]; model: string }): Promise<void> => {
      if (isStreaming) return;

      setIsStreaming(true);
      const controller = new AbortController();
      abortRef.current = controller;

      let turn: Turn = {
        id: newTurnId(),
        role: 'assistant',
        timestamp: nowIso(),
        status: 'streaming',
        content: [{ type: 'text', text: '' }],
        model: input.model,
      };

      try {
        for await (const ev of provider.stream(input)) {
          if (controller.signal.aborted) break;

          turn = applyEvent(turn, ev);
          onTurnUpdateRef.current(turn);

          if (ev.type === 'message_complete') {
            onCompleteRef.current(turn);
            break;
          }
          if (ev.type === 'error') {
            onErrorRef.current?.(ev.error);
            break;
          }
        }

        if (controller.signal.aborted) {
          const cancelledTurn: Turn = { ...turn, status: 'cancelled' };
          onTurnUpdateRef.current(cancelledTurn);
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        onErrorRef.current?.(msg);
      } finally {
        setIsStreaming(false);
        abortRef.current = null;
      }
    },
    [isStreaming, provider]
  );

  const cancel = useCallback(() => {
    abortRef.current?.abort();
  }, []);

  return { isStreaming, start, cancel };
}

function applyEvent(turn: Turn, ev: StreamEvent): Turn {
  switch (ev.type) {
    case 'message_start':
      return { ...turn, id: ev.turn_id as TurnId, model: ev.model };

    case 'text_delta': {
      const blocks = [...turn.content];
      const lastIdx = blocks.length - 1;
      const last = blocks[lastIdx];
      if (last !== undefined && last.type === 'text') {
        blocks[lastIdx] = { ...last, text: last.text + ev.text };
      } else {
        blocks.push({ type: 'text', text: ev.text });
      }
      return { ...turn, content: blocks };
    }

    case 'tool_call_start': {
      const partial: ToolCallRef = {
        id: ev.tool_call.id as ToolCallId,
        tool_id: ev.tool_call.tool_id,
        input: ev.tool_call.input,
      };
      return { ...turn, tool_calls: [...(turn.tool_calls ?? []), partial] };
    }

    case 'tool_call_complete': {
      const completed: ToolCallRef = {
        id: ev.tool_call.id as ToolCallId,
        tool_id: ev.tool_call.tool_id,
        input: ev.tool_call.input,
      };
      const existing = turn.tool_calls ?? [];
      const idx = existing.findIndex((c) => c.id === completed.id);
      const next = [...existing];
      if (idx >= 0) {
        next[idx] = completed;
      } else {
        next.push(completed);
      }
      return { ...turn, tool_calls: next };
    }

    case 'message_complete':
      return { ...ev.turn, status: 'completed' };

    case 'error':
      return { ...turn, status: 'failed' };

    default:
      return turn;
  }
}
