/**
 * ExecutionContext factory — Queue 가 매 call 마다 만드는 환경 객체.
 *
 * Spec: docs/tools/interface.md (ExecutionContext)
 *
 * P0 minimum:
 *  - log 함수 — sink 콜백으로 LogEntry 발행
 *  - signal — Queue 가 만든 AbortController 의 signal 그대로 전달
 *  - cwd — workspace.root 또는 process.cwd() (호출자 제공)
 *
 * v1.0.11 SEC-4:
 *  - record_side_effect — Tool 이 file/process/network 부작용 보고
 *
 * sub-resources (fs/net/shell adapters) 는 후속 phase 에서 추가.
 */

import type { ExecutionContext, LogEntry, LogLevel, SideEffect } from './types';
import type { SessionId, TurnId, ToolCallId, AbsolutePath } from '@/types';

interface CreateContextArgs {
  session_id: SessionId;
  turn_id: TurnId;
  call_id: ToolCallId;
  cwd: AbsolutePath;
  signal: AbortSignal;
  /** Queue 가 누적 로그 저장 위해 제공하는 sink. */
  logSink: (entry: LogEntry) => void;
  /** Queue 가 side_effects 누적 위해 제공하는 sink. v1.0.11 SEC-4. */
  sideEffectSink: (effect: SideEffect) => void;
  /** 부모 call 추적용 (sub-call). */
  parent_call_id?: ToolCallId;
  /** Optional progress reporter. */
  progress?: (percent: number, message?: string) => void;
}

export function createContext(args: CreateContextArgs): ExecutionContext {
  const ctx: ExecutionContext = {
    session_id: args.session_id,
    turn_id: args.turn_id,
    call_id: args.call_id,
    cwd: args.cwd,
    signal: args.signal,
    log: (level: LogLevel, message: string, data?: Record<string, unknown>) => {
      const entry: LogEntry = {
        level,
        timestamp: new Date().toISOString(),
        message,
        ...(data !== undefined ? { data } : {}),
      };
      args.logSink(entry);
    },
    record_side_effect: (effect: SideEffect) => {
      args.sideEffectSink(effect);
    },
    ...(args.parent_call_id !== undefined && { parent_call_id: args.parent_call_id }),
    ...(args.progress !== undefined && { progress: args.progress }),
  };
  return ctx;
}
