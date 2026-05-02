/**
 * CliProvider — Claude / Codex CLI subprocess wrapper.
 *
 * Spec: docs/session/cross-ai-sync.md (P0: CLI 인증 위임)
 *
 * 역할:
 *   - Provider CLI binary 를 spawn 하고 prompt 를 positional arg 로 전달
 *   - stdout 의 JSONL 청크를 누적 → translate → StreamEvent emit
 *   - stderr 의 에러성 출력 캡처
 *   - close 시 누락된 message_complete 를 누적 텍스트로 합성
 *
 * 격리 / 안전성:
 *   - 반드시 main process 에서만 인스턴스화 (subprocess 는 sandbox 불가)
 *   - shell:false 로 spawn → 인젝션 방지
 *   - AbortSignal 으로 mid-stream 종료 시 SIGTERM 전송
 *   - stdin 은 즉시 end() — prompt 는 positional arg 로 전달 (stdin X)
 *
 * Verified CLI flags (2026-05-02):
 *   claude: --print --output-format stream-json --bare --verbose --model M "PROMPT"
 *   codex:  exec --json --skip-git-repo-check --ephemeral --model M "PROMPT"
 */

import { spawn, type ChildProcess } from 'node:child_process';
import type { Provider, ToolCallRef, Turn } from '@/types';
import { newTurnId, nowIso } from '@/types';
import type { StreamEvent, StreamingProvider } from '../types';
import { JsonlParser } from './jsonlParser';

// ────────────────────────────────────────────────────────────
// Options
// ────────────────────────────────────────────────────────────

export type CliTranslate = (
  parsed: unknown,
  ctx: { turnId: string; model: string }
) => StreamEvent[];

export interface CliProviderOptions {
  /** CLI binary 절대경로. */
  binaryPath: string;
  /** Provider 식별자. */
  provider: Provider;
  /** subprocess cwd (default: 현재 process cwd). */
  cwd?: string;
  /** CLI 추가 인자. */
  extraArgs?: string[];
  /** JSONL 한 줄 → StreamEvent 배열. provider 별로 다른 함수 사용. */
  translate: CliTranslate;
  /** Mid-stream 취소용 (MAIN process 가 IPC 'ai/stop-stream' 에서 사용). */
  signal?: AbortSignal;
}

// ────────────────────────────────────────────────────────────
// CliProvider
// ────────────────────────────────────────────────────────────

/**
 * CLI subprocess 기반 streaming provider.
 *
 * MAIN process 전용 — preload / renderer 에서 import 금지.
 *
 * 사용:
 *   const p = new CliProvider({ binaryPath, provider: 'claude', translate, signal });
 *   for await (const ev of p.stream({ turns, model })) ...
 */
export class CliProvider implements StreamingProvider {
  readonly provider: Provider;
  private readonly opts: CliProviderOptions;

  constructor(opts: CliProviderOptions) {
    this.opts = opts;
    this.provider = opts.provider;
  }

  async *stream(input: {
    turns: Turn[];
    model: string;
    config?: Record<string, unknown>;
    signal?: AbortSignal;
  }): AsyncIterable<StreamEvent> {
    const turnId = newTurnId();
    const ctx = { turnId, model: input.model };
    yield { type: 'message_start', turn_id: turnId, model: input.model };

    // 마지막 user turn 텍스트를 positional arg 로 전달.
    const lastUserTurn = [...input.turns].reverse().find((t) => t.role === 'user');
    const userText = lastUserTurn
      ? lastUserTurn.content
          .filter((b) => b.type === 'text')
          .map((b) => (b as { type: 'text'; text: string }).text)
          .join('\n')
      : '';

    const args = this.buildArgs({ model: input.model, prompt: userText });

    let child: ChildProcess;
    try {
      child = spawn(this.opts.binaryPath, args, {
        cwd: this.opts.cwd,
        env: process.env,
        shell: false,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      yield { type: 'error', error: `spawn failed: ${msg}` };
      return;
    }

    // prompt 는 args 에 포함 — stdin 에는 아무것도 쓰지 않고 즉시 EOF.
    try {
      child.stdin?.end();
    } catch {
      // stdin end 실패 — child.error 이벤트로 잡힘
    }

    const parser = new JsonlParser();
    const queue: StreamEvent[] = [];
    const accumulatedDeltas: string[] = [];
    const accumulatedToolCalls = new Map<string, ToolCallRef>();
    let resolveNext: (() => void) | null = null;
    let ended = false;
    // 명시적 union type — TS 가 closure 안 mutation 을 추적 못해 narrowing
    // 결과를 잃어버리는 경우가 있어, 여기서 type annotation 을 강제.
    const errorState: { message: string | null } = { message: null };
    let receivedComplete = false;
    let aborted = false;

    const wakeUp = (): void => {
      const fn = resolveNext;
      resolveNext = null;
      fn?.();
    };

    const enqueue = (ev: StreamEvent): void => {
      if (ev.type === 'text_delta') accumulatedDeltas.push(ev.text);
      if (ev.type === 'tool_call_start') {
        accumulatedToolCalls.set(ev.tool_call.id, {
          id: ev.tool_call.id as ToolCallRef['id'],
          tool_id: ev.tool_call.tool_id,
          input: ev.tool_call.input,
        });
      }
      if (ev.type === 'tool_call_input_delta') {
        const existing = accumulatedToolCalls.get(ev.tool_call_id);
        if (existing !== undefined) {
          const previousInput = typeof existing.input === 'string' ? existing.input : '';
          accumulatedToolCalls.set(ev.tool_call_id, {
            ...existing,
            input: `${previousInput}${ev.partial_input}`,
          });
        }
      }
      if (ev.type === 'tool_call_complete') {
        accumulatedToolCalls.set(ev.tool_call.id, ev.tool_call);
      }
      if (ev.type === 'message_complete') receivedComplete = true;
      queue.push(ev);
    };

    // AbortSignal 이 fire 되면 child kill.
    const onAbort = (): void => {
      aborted = true;
      try {
        child.kill('SIGTERM');
      } catch {
        // ignore
      }
      ended = true;
      wakeUp();
    };
    if (this.opts.signal !== undefined) {
      if (this.opts.signal.aborted) {
        onAbort();
      } else {
        this.opts.signal.addEventListener('abort', onAbort, { once: true });
      }
    }

    child.stdout?.on('data', (chunk: Buffer) => {
      const lines = parser.push(chunk.toString());
      for (const parsed of lines) {
        for (const ev of this.opts.translate(parsed, ctx)) {
          enqueue(ev);
        }
      }
      wakeUp();
    });

    child.stderr?.on('data', (chunk: Buffer) => {
      const text = chunk.toString();
      // 모든 stderr 을 에러로 볼 수는 없다 (CLI 들이 progress / debug 출력에
      // stderr 을 쓰는 경우 있음). 강한 에러 키워드만 캡처.
      if (/error|failed|denied|exception|panic/i.test(text)) {
        errorState.message = (errorState.message ?? '') + text;
      }
    });

    child.on('error', (err) => {
      errorState.message = err.message;
      ended = true;
      wakeUp();
    });

    child.on('close', (code) => {
      // 마지막 라인 flush
      for (const parsed of parser.flush()) {
        for (const ev of this.opts.translate(parsed, ctx)) {
          enqueue(ev);
        }
      }
      if (code !== 0 && code !== null && !aborted) {
        errorState.message = `${errorState.message ?? ''} (exit code ${code})`.trim();
      }
      ended = true;
      wakeUp();
    });

    // Drain loop.
    try {
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
      if (this.opts.signal !== undefined) {
        this.opts.signal.removeEventListener('abort', onAbort);
      }
    }

    if (errorState.message !== null && errorState.message.length > 0) {
      yield { type: 'error', error: errorState.message };
      return;
    }

    if (aborted) {
      // abort 됐으면 message_complete 합성 X — 호출자 (useStreamingTurn) 가
      // cancelled status 를 표시한다.
      return;
    }

    // CLI 가 명시적 message_complete 를 안 보낸 경우 누적 텍스트로 합성.
    if (!receivedComplete) {
      const accumulatedText = accumulatedDeltas.join('');
      const finalTurn: Turn = {
        id: turnId,
        role: 'assistant',
        timestamp: nowIso(),
        status: 'completed',
        content: [{ type: 'text', text: accumulatedText }],
        ...(accumulatedToolCalls.size > 0 && {
          tool_calls: Array.from(accumulatedToolCalls.values()),
        }),
        model: input.model,
      };
      yield { type: 'message_complete', turn: finalTurn };
    }
  }

  // ─────────── helpers ───────────

  private buildArgs(input: { model: string; prompt: string }): string[] {
    if (this.opts.provider === 'claude') {
      const args = [
        '--print',
        '--output-format',
        'stream-json',
        '--bare',
        '--verbose',
        '--model',
        input.model,
      ];
      if (this.opts.extraArgs !== undefined && this.opts.extraArgs.length > 0) {
        args.push(...this.opts.extraArgs);
      }
      args.push(input.prompt); // positional prompt arg (must be last)
      return args;
    }
    // codex
    const args = ['exec', '--json', '--skip-git-repo-check', '--ephemeral', '--model', input.model];
    if (this.opts.extraArgs !== undefined && this.opts.extraArgs.length > 0) {
      args.push(...this.opts.extraArgs);
    }
    args.push(input.prompt); // positional prompt arg (must be last)
    return args;
  }
}
