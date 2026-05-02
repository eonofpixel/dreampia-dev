/**
 * CLI subprocess provider barrel — MAIN process only.
 *
 * Spec: docs/session/cross-ai-sync.md (P0 — CLI 인증 위임)
 *
 * 보안 / 격리:
 *   이 디렉터리의 모듈은 node:child_process / node:fs / node:os 를 import 한다.
 *   Renderer 와 preload 는 이 모듈들을 절대 import 해서는 안 된다 — 대신
 *   `src/providers` 의 안전한 surface (MockProvider / types / routing) 만
 *   사용하고, CLI 호출은 `ai/*` IPC 채널을 통해 main 으로 위임한다.
 *
 * Re-export 는 main process / 테스트 코드 만을 위한 단일 import 경로.
 */

export { CliProvider } from './CliProvider';
export type { CliProviderOptions, CliTranslate } from './CliProvider';
export { JsonlParser } from './jsonlParser';
export {
  detectCli,
  detectOne,
  expandHome,
  execLine,
  getVersion,
} from './detect';
export type { CliInfo, CliDetectionResult } from './detect';
export { translateClaudeJsonl } from './translateClaudeJsonl';
export { translateCodexJsonl } from './translateCodexJsonl';
