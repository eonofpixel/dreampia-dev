/**
 * MockProvider — 결정적 streaming provider (dev/test 용).
 *
 * Spec: docs/session/cross-ai-sync.md (Phase 1 P0 MVP — end-to-end pipeline foundation)
 *
 * 목적:
 *   - API key 없이 UI streaming + tool call display 검증
 *   - 통합 테스트에서 deterministic 한 stream 시퀀스 발생
 *   - TO-4 (Tool Queue) + ChatPanel 등 후속 task 의 빌딩블록
 *
 * 동작:
 *   - 마지막 user turn 의 텍스트를 echo (또는 사용자 지정 응답)
 *   - 한 글자씩 text_delta 로 emit
 *   - injectToolCall 옵션으로 임의 tool call 삽입 가능
 *   - 항상 message_complete 로 종료 (finite stream guarantee)
 */

import type { Turn, ToolCallId, ToolCallRef } from '@/types';
import { newTurnId, newToolCallId, nowIso } from '@/types';
import { priceUsage } from './pricing';
import type { StreamEvent, StreamingProvider, UsageEventData } from './types';

// ────────────────────────────────────────────────────────────
// Options
// ────────────────────────────────────────────────────────────

export interface MockProviderOptions {
  /** 청크 사이 지연 (ms). 0 또는 생략 시 즉시. */
  delayMs?: number;

  /** 응답 텍스트 override. 미지정 시 마지막 user 메시지 echo. */
  responseText?: string;

  /** 응답 중간에 tool call 1개 삽입. */
  injectToolCall?: {
    tool_id: string;
    input: Record<string, unknown>;
  };

  /**
   * Test-only hook. When enabled, the last user message may contain:
   *   __DREAMPIA_TOOL_CALL__ {"tool_id":"shell.run","input":{"cmd":"echo hi"}}
   *
   * This is intentionally opt-in so production/dev MockProvider usage cannot
   * be steered by prompt text.
   */
  testToolTrigger?: boolean;

  /** Provider 식별자 (테스트 격리용). 기본 'claude'. */
  provider?: 'claude' | 'codex';
}

export const TEST_TOOL_CALL_MARKER = '__DREAMPIA_TOOL_CALL__';

// ────────────────────────────────────────────────────────────
// MockProvider
// ────────────────────────────────────────────────────────────

export class MockProvider implements StreamingProvider {
  readonly provider: 'claude' | 'codex';
  private readonly opts: MockProviderOptions;

  constructor(opts: MockProviderOptions = {}) {
    this.opts = opts;
    this.provider = opts.provider ?? 'claude';
  }

  async *stream(input: {
    turns: Turn[];
    model: string;
    config?: Record<string, unknown>;
    signal?: AbortSignal;
  }): AsyncIterable<StreamEvent> {
    const turnId = newTurnId();
    const userText = this.extractLastUserText(input.turns);
    const triggeredToolCall = this.opts.testToolTrigger
      ? this.extractTriggeredToolCall(userText)
      : null;
    const toolCallToInject = this.opts.injectToolCall ?? triggeredToolCall ?? undefined;
    const responseText =
      this.opts.responseText ??
      (triggeredToolCall
        ? `Mock tool call requested: ${triggeredToolCall.tool_id}`
        : (this.buildGuidedResponse(userText) ??
          `Mock response. You said: "${userText.slice(0, 80)}"`));

    yield { type: 'message_start', turn_id: turnId, model: input.model };

    // 한 글자씩 streaming. Iterator 는 code-point 단위 (이모지 안전).
    for (const ch of responseText) {
      if (input.signal?.aborted) return;
      if (this.opts.delayMs && this.opts.delayMs > 0) {
        await this.sleep(this.opts.delayMs, input.signal);
      }
      if (input.signal?.aborted) return;
      yield { type: 'text_delta', text: ch };
    }

    if (input.signal?.aborted) return;

    const toolCalls: ToolCallRef[] = [];
    if (toolCallToInject) {
      const toolCallId = newToolCallId();
      const tc = toolCallToInject;

      yield {
        type: 'tool_call_start',
        tool_call: { id: toolCallId, tool_id: tc.tool_id, input: tc.input },
      };

      const fullCall: ToolCallRef = {
        id: toolCallId as ToolCallId,
        tool_id: tc.tool_id,
        input: tc.input,
      };

      yield { type: 'tool_call_complete', tool_call: fullCall };
      toolCalls.push(fullCall);
    }

    const finalTurn: Turn = {
      id: turnId,
      role: 'assistant',
      timestamp: nowIso(),
      status: 'completed',
      content: [{ type: 'text', text: responseText }],
      ...(toolCalls.length > 0 && { tool_calls: toolCalls }),
      model: input.model,
    };

    // v0.4.0 — synthetic usage event so dev / e2e 가 cost tracking 도 검증.
    // Token 카운트는 응답 길이 기반 추정 (4 chars ≈ 1 token, OpenAI 권장).
    const synthOutput = Math.max(1, Math.ceil(responseText.length / 4));
    const synthInput = Math.max(1, Math.ceil(userText.length / 4));
    const priced = priceUsage(input.model, {
      input_tokens: synthInput,
      output_tokens: synthOutput,
    });
    const usageData: UsageEventData = {
      provider: 'mock',
      model: input.model,
      turn_id: turnId,
      input_tokens: synthInput,
      output_tokens: synthOutput,
      cache_creation_input_tokens: 0,
      cache_read_input_tokens: 0,
      reasoning_output_tokens: 0,
      total_cost_usd: priced.usd,
      recorded_at: new Date().toISOString(),
      unknown_pricing: !priced.found,
    };
    yield { type: 'usage', data: usageData };

    yield { type: 'message_complete', turn: finalTurn };
  }

  // ─────────── helpers ───────────

  private extractLastUserText(turns: Turn[]): string {
    for (let i = turns.length - 1; i >= 0; i -= 1) {
      const t = turns[i];
      if (t && t.role === 'user') {
        return t.content
          .filter((b) => b.type === 'text')
          .map((b) => (b as { type: 'text'; text: string }).text)
          .join(' ');
      }
    }
    return '';
  }

  private extractTriggeredToolCall(
    userText: string
  ): { tool_id: string; input: Record<string, unknown> } | null {
    const markerIndex = userText.indexOf(TEST_TOOL_CALL_MARKER);
    if (markerIndex < 0) return null;

    const rawJson = userText.slice(markerIndex + TEST_TOOL_CALL_MARKER.length).trim();
    if (rawJson.length === 0) return null;

    try {
      const parsed = JSON.parse(rawJson) as unknown;
      if (
        typeof parsed !== 'object' ||
        parsed === null ||
        !('tool_id' in parsed) ||
        typeof (parsed as { tool_id?: unknown }).tool_id !== 'string'
      ) {
        return null;
      }
      const inputValue = (parsed as { input?: unknown }).input;
      const input =
        typeof inputValue === 'object' && inputValue !== null && !Array.isArray(inputValue)
          ? (inputValue as Record<string, unknown>)
          : {};
      return {
        tool_id: (parsed as { tool_id: string }).tool_id,
        input,
      };
    } catch {
      return null;
    }
  }

  private buildGuidedResponse(userText: string): string | null {
    const normalized = userText.toLowerCase();
    const mentionsReadme = /readme|설치|install|quick start/.test(normalized);
    const mentionsA11y = /접근성|accessibility|aria|a11y|컴포넌트/.test(normalized);
    const mentionsTests = /테스트|test|typecheck|lint/.test(normalized);
    const mentionsRisk = /삭제|delete|remove|rm |git |commit|위험|승인/.test(normalized);

    if (mentionsRisk) {
      return [
        '## 작업 계획',
        '- 요청한 작업이 파일 삭제, git 조작, 또는 위험 명령인지 먼저 분류합니다.',
        '## 변경 후보',
        '- 자동 변경 없음: 승인 전에는 디스크와 git 상태를 건드리지 않습니다.',
        '## Diff / Review',
        '- 실행 전 diff 또는 명령 preview를 먼저 보여줘야 합니다.',
        '## 테스트 명령',
        '- 필요 시 npm run typecheck, npm run lint, npm test를 권장합니다.',
        '## 위험/권한',
        '- 위험 작업은 자동 실행하지 않습니다. 사용자의 명시 승인 지점이 필요합니다.',
        '## 다음 행동',
        '- Provider/CLI 연결 후 승인 가능한 명령과 되돌리기 계획을 확인하세요.',
      ].join('\n');
    }

    if (mentionsTests) {
      return [
        '## 작업 계획',
        '- 관련 테스트 명령을 먼저 제안하고 실행 가능 상태를 확인합니다.',
        '## 변경 후보',
        '- 파일 변경 없음: 검증 요청은 결과 요약이 먼저입니다.',
        '## Diff / Review',
        '- 테스트 실패 후 코드 변경이 필요하면 별도 diff로 검토해야 합니다.',
        '## 테스트 명령',
        '- npm run typecheck',
        '- npm run lint',
        '- npm test',
        '## 실행 결과',
        '- Mock/dry-run 응답은 명령을 실제 실행하지 않습니다. CLI 또는 Direct API 연결 후 결과와 exit code를 표시합니다.',
        '## 위험/권한',
        '- 테스트 명령은 읽기 중심이지만 장시간 실행될 수 있어 실행 상태를 표시해야 합니다.',
        '## 다음 행동',
        '- 설정에서 provider를 연결한 뒤 같은 요청을 다시 보내거나 터미널에서 위 명령을 실행하세요.',
      ].join('\n');
    }

    if (mentionsA11y) {
      return [
        '## 작업 계획',
        '- 컴포넌트의 label, focus, keyboard, overflow 문제를 점검합니다.',
        '## 변경 후보',
        '- 대상 컴포넌트 파일: aria-label/title, focus ring, 버튼 상태 개선 후보',
        '## Diff / Review',
        '- 실제 수정 전 변경 범위와 접근성 의도를 diff로 검토합니다.',
        '## 테스트 명령',
        '- npm run typecheck',
        '- npm run lint',
        '- npm run test:e2e -- --grep axe',
        '## 위험/권한',
        '- 접근성 수정은 UI 동작을 바꿀 수 있으므로 키보드 smoke가 필요합니다.',
        '## 다음 행동',
        '- 문제 컴포넌트를 지정하거나 Code 모드에서 파일을 연 뒤 수정 후보를 적용하세요.',
      ].join('\n');
    }

    if (mentionsReadme) {
      return [
        '## 작업 계획',
        '- README 설치 안내를 새 사용자가 따라 할 수 있는 순서로 정리합니다.',
        '## 변경 후보',
        '- README.md: 설치, 개발 서버 실행, 검증 명령, provider 설정 안내',
        '## Diff / Review',
        '- 아래 Markdown 블록을 현재 열린 README.md에 적용하기 전 diff로 검토하세요.',
        '## 테스트 명령',
        '- npm run typecheck',
        '- npm run lint',
        '- npm test',
        '## 위험/권한',
        '- 문서 파일만 변경합니다. Mock/dry-run 안내는 적용 버튼 전에는 디스크에 쓰지 않습니다.',
        '## 다음 행동',
        '- Code 모드에서 README.md를 열고 코드 블록의 파일에 적용을 눌러 diff를 확인하세요.',
        '```md',
        '# Dreampia-Dev',
        '',
        '## Quick start',
        '1. npm install',
        '2. npm run dev',
        '3. Open a workspace folder.',
        '4. Ask for a small change, review the diff, then run tests.',
        '',
        '## Verify',
        '- npm run typecheck',
        '- npm run lint',
        '- npm test',
        '```',
      ].join('\n');
    }

    return null;
  }

  private sleep(ms: number, signal?: AbortSignal): Promise<void> {
    return new Promise((resolve) => {
      if (signal?.aborted) {
        resolve();
        return;
      }
      const timer = setTimeout(resolve, ms);
      signal?.addEventListener(
        'abort',
        () => {
          clearTimeout(timer);
          resolve();
        },
        { once: true }
      );
    });
  }
}
