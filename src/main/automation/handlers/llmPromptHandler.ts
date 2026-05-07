/**
 * v1.7.23 — LLM prompt handler.
 *
 * Config schema:
 *   - prompt: string  (required) — user turn 으로 보낼 본문.
 *   - model?: string  (default 'claude-sonnet-4-5') — provider routing 용.
 *   - cwd?:   string  (default process.cwd()) — CLI subprocess 작업 디렉토리.
 *
 * 동작:
 *   1. getDefaultProvider 로 활성 provider 획득.
 *   2. 단일 user turn 만든 후 provider.stream 으로 호출.
 *   3. text_delta 누적 → 최종 text 를 audit 결과로 반환.
 *   4. stream 중 'error' 이벤트 → 즉시 ok=false 반환.
 *
 * 실패 모드:
 *   - prompt 누락 → ok=false (validation).
 *   - provider 미존재 / CLI 미설치 → throw → ok=false.
 *   - test 환경 (DREAMPIA_TEST=1) → MockProvider 가 응답 → 정상 동작.
 *
 * Note: 본 handler 는 짧은 단발 prompt 용. 긴 multi-turn 대화는 UI session 사용.
 */

import type { Turn, TurnId } from '@/types';
import { getDefaultProvider } from '@/providers/auto';
import type { AutomationHandler } from './HandlerRegistry';
import { truncateOutput } from './HandlerRegistry';

export const LLM_PROMPT_HANDLER_NAME = 'llm-prompt';

const DEFAULT_MODEL = 'claude-sonnet-4-5';

export const llmPromptHandler: AutomationHandler = async (ctx) => {
  const cfg = ctx.config;
  const prompt = typeof cfg['prompt'] === 'string' ? cfg['prompt'].trim() : '';
  if (prompt.length === 0) {
    return { ok: false, error: 'prompt required (config.prompt: string)' };
  }
  const model =
    typeof cfg['model'] === 'string' && cfg['model'].length > 0 ? cfg['model'] : DEFAULT_MODEL;
  const cwd = typeof cfg['cwd'] === 'string' && cfg['cwd'].length > 0 ? cfg['cwd'] : process.cwd();

  const turn: Turn = {
    id: `auto-${ctx.rule_name}-${Date.now()}` as TurnId,
    role: 'user',
    status: 'completed',
    content: [{ type: 'text', text: prompt }],
    timestamp: new Date().toISOString(),
  };

  try {
    const { provider } = await getDefaultProvider(model, undefined, cwd, 'workspace_write', 'auto');

    let text = '';
    let errored: string | null = null;
    for await (const ev of provider.stream({ turns: [turn], model })) {
      if (ev.type === 'text_delta') {
        text += ev.text;
      } else if (ev.type === 'error') {
        errored = ev.error;
        break;
      } else if (ev.type === 'message_complete') {
        break;
      }
    }

    if (errored !== null) {
      return { ok: false, error: errored };
    }
    return { ok: true, output: truncateOutput(text) };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { ok: false, error: msg };
  }
};
