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

import { type ChildProcess } from 'node:child_process';
import { ensureAsciiCwd, spawnSafe } from './spawnSafe';
import type { PermissionLevel, Provider, ToolCallRef, Turn } from '@/types';
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
  /**
   * v1.1.5 (Codex Q10): binary 앞에 prepend 할 args. fake CLI replay 시 사용.
   *
   * 예: `binaryPath = process.execPath` (node), `preArgs = ['fake-cli.js']`
   *   → spawn(node, ['fake-cli.js', ...args])
   *
   * production 에선 unused — `auto.ts` 의 env override 만 set.
   */
  preArgs?: string[];
  /** JSONL 한 줄 → StreamEvent 배열. provider 별로 다른 함수 사용. */
  translate: CliTranslate;
  /** Mid-stream 취소용 (MAIN process 가 IPC 'ai/stop-stream' 에서 사용). */
  signal?: AbortSignal;
  /**
   * v1.9.0 (A3) — 자동 timeout (ms). Set 되면 spawn 후 timeout_ms 경과 시
   * SIGTERM kill + `error` StreamEvent emit. `undefined` = 무제한 (backward-compat).
   *
   * `signal` (user-cancel) 과 분리된 의미:
   *   signal abort → silent return (UI 가 'cancelled' 표시)
   *   timeout      → `error` event ("CLI timeout exceeded (Xms)") + return
   *
   * Production wire: auto.ts 가 DREAMPIA_CLI_TIMEOUT_MS env 로 override 가능.
   * Spec: docs/adr/0001-cli-provider-timeout.md
   */
  timeout_ms?: number;
  /**
   * Session permission level — provider CLI 의 sandbox / tool-policy 옵션으로 매핑된다.
   *
   * Codex: '--sandbox <mode>' 로 전달.
   *   read_only       → read-only
   *   workspace_write → workspace-write
   *   full_access     → danger-full-access
   *   custom          → workspace-write (가장 안전한 default)
   *
   * Claude: '--add-dir <cwd>' (cwd 가 있으면) + tool-policy 매핑.
   *   read_only → '--disallowed-tools "Bash Edit Write"'
   *   그 외     → 기본 (CLI 가 전체 tool 허용)
   *
   * Spec: docs/permission/provider-mapping.md
   * 미설정 시 default = 'workspace_write'.
   */
  permissionLevel?: PermissionLevel;
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
    // v0.13.0 (J) — typed `file_reference` / `session_reference` block 도
    // CLI 가 이해할 수 있는 plain-text 형식으로 펼쳐 prompt 에 포함시킨다.
    const lastUserTurn = [...input.turns].reverse().find((t) => t.role === 'user');
    const userText = lastUserTurn ? CliProvider.renderTurnAsPrompt(lastUserTurn) : '';

    const builtArgs = this.buildArgs({ model: input.model, prompt: userText });
    // v1.1.5 (Codex Q10): preArgs 가 있으면 binary 앞에 prepend — fake CLI
    // replay (binaryPath=node, preArgs=['fake-cli.js']) 시 사용.
    const args =
      this.opts.preArgs !== undefined && this.opts.preArgs.length > 0
        ? [...this.opts.preArgs, ...builtArgs]
        : builtArgs;

    // v1.0.6 — Windows 한국어/비-ASCII 폴더 → 8.3 short path 변환. Codex CLI 가
    // cwd 를 HTTP header (x-codex-turn-metadata) 에 그대로 넣어 server 가 reject
    // 하던 문제 회피. 변환 실패 시 원본 cwd 사용 (best-effort).
    const safeCwd = await ensureAsciiCwd(this.opts.cwd);

    let child: ChildProcess;
    try {
      // v1.0.5 — Windows .cmd / .bat 는 spawnSafe 가 cmd.exe /c 로 wrapping.
      // npm global 의 codex 가 .cmd 라서 직접 spawn 시 Node 22 EINVAL.
      child = spawnSafe(this.opts.binaryPath, args, {
        cwd: safeCwd,
        env: process.env,
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
    // v1.9.0 (A3) — auto timeout. aborted 와 분리된 flag — error event emit
    // 여부가 다르고, close handler 의 exit-code 합성 분기에서 제외 대상.
    let timedOut = false;
    let timeoutHandle: ReturnType<typeof setTimeout> | null = null;

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

    // v1.9.0 (A3) — timeout_ms 설정 시 자동 SIGTERM + error event.
    // signal abort 와 달리 errorState.message 를 set 해 emit 경로를 탄다.
    const onTimeout = (): void => {
      timedOut = true;
      const ms = this.opts.timeout_ms;
      errorState.message =
        `${errorState.message ?? ''}CLI timeout exceeded (${ms}ms)`.trim();
      try {
        child.kill('SIGTERM');
      } catch {
        // ignore — child 가 이미 종료됐을 수 있음.
      }
      ended = true;
      wakeUp();
    };
    if (this.opts.timeout_ms !== undefined && this.opts.timeout_ms > 0) {
      timeoutHandle = setTimeout(onTimeout, this.opts.timeout_ms);
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
      // v1.9.0 (A3): child 에러로 종료될 때도 timer 누수 방지.
      if (timeoutHandle !== null) {
        clearTimeout(timeoutHandle);
        timeoutHandle = null;
      }
      errorState.message = err.message;
      ended = true;
      wakeUp();
    });

    child.on('close', (code) => {
      // child 가 자연 종료했으니 pending timeout 정리.
      if (timeoutHandle !== null) {
        clearTimeout(timeoutHandle);
        timeoutHandle = null;
      }
      // 마지막 라인 flush
      for (const parsed of parser.flush()) {
        for (const ev of this.opts.translate(parsed, ctx)) {
          enqueue(ev);
        }
      }
      // v1.9.0 (A3): timedOut 도 SIGTERM 으로 종료시킨 거라 exit-code 메시지 합성 X.
      if (code !== 0 && code !== null && !aborted && !timedOut) {
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
      // v1.9.0 (A3): 어떤 경로로 빠져나오든 timer leak 방지.
      if (timeoutHandle !== null) {
        clearTimeout(timeoutHandle);
        timeoutHandle = null;
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
    const level: PermissionLevel = this.opts.permissionLevel ?? 'workspace_write';
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
      // workspace 가 있으면 Claude CLI 가 그 디렉토리를 도구 호출 컨텍스트로 인식하도록 명시.
      if (this.opts.cwd !== undefined && this.opts.cwd.length > 0) {
        args.push('--add-dir', this.opts.cwd);
      }
      // read_only 권한은 mutating 도구 차단. 그 외 level (workspace_write / full_access /
      // custom) 은 Claude CLI 의 기본 정책 (전체 허용) 으로 둔다 — 세밀한 grant 제어는
      // hooks (PreToolUse) 단에서 한다. Spec: docs/permission/provider-mapping.md
      if (level === 'read_only') {
        args.push('--disallowed-tools', 'Bash Edit Write');
      }
      if (this.opts.extraArgs !== undefined && this.opts.extraArgs.length > 0) {
        args.push(...this.opts.extraArgs);
      }
      args.push(input.prompt); // positional prompt arg (must be last)
      return args;
    }
    // codex — '--sandbox' 는 top-level 플래그 (exec 서브커맨드 앞에).
    // Spec: docs/permission/provider-mapping.md 33-51
    const args = [
      '--sandbox',
      CliProvider.sandboxModeFor(level),
      'exec',
      '--json',
      '--skip-git-repo-check',
      '--ephemeral',
      '--model',
      input.model,
    ];
    // v1.0.5 — Codex CLI 의 `-C/--cd` 옵션으로 사용자 의도 워킹 폴더 명시. spawn
    // cwd 는 ensureAsciiCwd 가 한국어 → junction 으로 변환했지만, AI 가 인식하는
    // working root 는 -C 가 우선. 사용자가 "내 폴더 이름" 물으면 진짜 폴더명 응답.
    if (this.opts.cwd !== undefined && this.opts.cwd.length > 0) {
      args.push('-C', this.opts.cwd);
    }
    if (this.opts.extraArgs !== undefined && this.opts.extraArgs.length > 0) {
      args.push(...this.opts.extraArgs);
    }
    args.push(input.prompt); // positional prompt arg (must be last)
    return args;
  }

  /**
   * v0.13.0 (J) — user turn 의 ContentBlock[] 을 CLI prompt arg 로 직렬화.
   *
   * 규칙:
   *   - `text` → 그대로
   *   - `file_reference` → "[파일] {path} (line 1-{n}[truncated])\n```{lang}\n{snippet}\n```"
   *   - `session_reference` → "[세션] {title} ({n}턴)\n> {context_text 줄줄이}"
   *   - `mention` → "@{display}"
   *   - 기타 (image / file / embedded_card) → 짧은 placeholder
   *
   * Provider 가 보는 prompt 가 결정성 있도록 모든 turn 에 대해 이 한 곳에서만
   * 직렬화된다. UI chip 와 model-side prompt 는 동일한 의도를 다른 표현으로
   * 보여주는 것이므로, 사용자가 chip 를 펼쳐 본 코드와 model 이 받은 prompt
   * 가 일치한다.
   */
  static renderTurnAsPrompt(turn: Turn): string {
    const parts: string[] = [];
    for (const block of turn.content) {
      if (block.type === 'text') {
        parts.push(block.text);
      } else if (block.type === 'file_reference') {
        const lang = block.language ?? '';
        const trunc = block.truncated ? ', truncated' : '';
        const header = `[파일] ${block.path} (line 1-${block.line_count}${trunc})`;
        parts.push(`${header}\n\`\`\`${lang}\n${block.snippet}\n\`\`\``);
      } else if (block.type === 'session_reference') {
        const title = block.title.length > 0 ? block.title : block.session_id;
        const header = `[세션] ${title} (${block.turn_count}턴)`;
        const body = block.context_text
          .split('\n')
          .map((l) => `> ${l}`)
          .join('\n');
        parts.push(`${header}\n${body}`);
      } else if (block.type === 'mention') {
        parts.push(`@${block.ref.display}`);
      } else if (block.type === 'embedded_card') {
        parts.push(`[${block.card.title}](${block.card.url ?? ''})`);
      } else if (block.type === 'image') {
        // CLI 는 stdin/이미지 직접 X — 사용자에게 잠재적 의도를 알리는 placeholder.
        parts.push(`[이미지: ${block.alt ?? block.mime}]`);
      } else if (block.type === 'file') {
        parts.push(`[파일: ${block.name} (${block.mime})]`);
      }
    }
    return parts.join('\n');
  }

  /**
   * PermissionLevel → Codex sandbox mode 매핑.
   *
   * Spec: docs/permission/provider-mapping.md (toCodexSandboxMode).
   * INV-1: deterministic 1:1 매핑.
   */
  private static sandboxModeFor(level: PermissionLevel): string {
    switch (level) {
      case 'read_only':
        return 'read-only';
      case 'workspace_write':
        return 'workspace-write';
      case 'full_access':
        return 'danger-full-access';
      case 'custom':
        // Codex 가 custom 을 지원하지 않으므로 가장 가까운 안전 옵션.
        return 'workspace-write';
    }
  }
}
