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
 * sub-resources (fs/net/shell adapters) 는 후속 phase 에서 추가.
 */

import type { ExecutionContext, LogEntry, LogLevel } from './types';
import type {
  SessionId,
  TurnId,
  ToolCallId,
  AbsolutePath,
} from '@/types';

interface CreateContextArgs {
  session_id: SessionId;
  turn_id: TurnId;
  call_id: ToolCallId;
  cwd: AbsolutePath;
  signal: AbortSignal;
  /** Queue 가 누적 로그 저장 위해 제공하는 sink. */
  logSink: (entry: LogEntry) => void;
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
    ...(args.parent_call_id !== undefined && { parent_call_id: args.parent_call_id }),
    ...(args.progress !== undefined && { progress: args.progress }),
  };
  return ctx;
}
