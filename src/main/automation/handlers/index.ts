/**
 * v1.7.23 — Builtin handler registration.
 *
 * 부팅 시 module 첫 import 시점에 모든 builtin handler 가 registry 에 등록.
 * 외부 (plugin / test) 에서 추가 handler 등록은 `handlerRegistry.register()`.
 */

import { handlerRegistry, noopLogHandler, NOOP_LOG_HANDLER_NAME } from './HandlerRegistry';
import { llmPromptHandler, LLM_PROMPT_HANDLER_NAME } from './llmPromptHandler';
import { shellExecHandler, SHELL_EXEC_HANDLER_NAME } from './shellExecHandler';
import { ipcTriggerHandler, IPC_TRIGGER_HANDLER_NAME } from './ipcTriggerHandler';

let registered = false;

/**
 * Idempotent. 부팅 시 + 매 IPC handler 등록 시 호출 가능.
 * 첫 호출에서만 실제 등록.
 */
export function registerBuiltinHandlers(): void {
  if (registered) return;
  handlerRegistry.register(NOOP_LOG_HANDLER_NAME, noopLogHandler);
  handlerRegistry.register(LLM_PROMPT_HANDLER_NAME, llmPromptHandler);
  handlerRegistry.register(SHELL_EXEC_HANDLER_NAME, shellExecHandler);
  handlerRegistry.register(IPC_TRIGGER_HANDLER_NAME, ipcTriggerHandler);
  registered = true;
}

/** Test 전용 — registry 초기화 + 다음 register 시 builtin 재등록 가능. */
export function resetBuiltinHandlersForTesting(): void {
  registered = false;
  handlerRegistry.clearForTesting();
}

export {
  handlerRegistry,
  noopLogHandler,
  NOOP_LOG_HANDLER_NAME,
  LLM_PROMPT_HANDLER_NAME,
  SHELL_EXEC_HANDLER_NAME,
  IPC_TRIGGER_HANDLER_NAME,
};
export { setIpcTriggerEmitter } from './ipcTriggerHandler';
export type { AutomationHandler, HandlerContext, HandlerResult } from './HandlerRegistry';
