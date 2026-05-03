/**
 * Tools 모듈 — public API.
 *
 * Spec: docs/tools/_index.md
 *
 * 단일 import 경로:
 *   import { ToolQueue, ToolRegistry, ShellRunTool } from '@/tools';
 *
 * Phase 1 P0 surface (TO-1/2/3/4 + shell.run).
 */

// ── Types ──
export type {
  ActiveExecution,
  ExecutionContext,
  LogEntry,
  LogLevel,
  PermissionTarget,
  PermissionTargetKind,
  QueueStats,
  SideEffect,
  Tool,
  ToolCall,
  ToolCallOrigin,
  ToolCallPriority,
  ToolError,
  ToolId,
  ToolResult,
  ToolResultStatus,
} from './types';

// ── Errors ──
export {
  AbortError,
  ToolErrorCode,
  abortedError,
  buildFailedResult,
  buildSuccessResult,
  dangerousPatternError,
  executionError,
  invalidInputError,
  isAbortError,
  permissionDeniedError,
  sessionNotFoundError,
  timeoutError,
  toolNotFoundError,
  type ToolErrorCodeValue,
} from './errors';

// ── Registry ──
export { ToolRegistry } from './Registry';

// ── Context factory ──
export { createContext } from './Context';

// ── Queue ──
export { ToolQueue, type ToolQueueOptions } from './Queue';

// ── Built-in tools ──
export { ShellRunTool, type ShellRunInput, type ShellRunOutput } from './builtin/shellRun';
